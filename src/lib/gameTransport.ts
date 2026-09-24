/**
 * GameTransport — unified wrapper for WebSocket or dual RTCDataChannels.
 *
 * P2P mode uses two separate DataChannels:
 *   - _dcInput : ordered + reliable   → input_event messages (key presses)
 *   - _dcState : unordered + unreliable → game_state messages (latest wins)
 *
 * This prevents a dropped game-state packet from blocking subsequent state
 * updates (the TCP head-of-line blocking problem that caused guest lag).
 */
export class GameTransport {
  private _ws: WebSocket | null;
  private _dcInput: RTCDataChannel | null;
  private _dcState: RTCDataChannel | null;
  private _pc: RTCPeerConnection | null;
  readonly usingP2P: boolean;

  constructor(
    opts:
      | { ws: WebSocket }
      | { dcInput: RTCDataChannel; dcState: RTCDataChannel; pc: RTCPeerConnection }
  ) {
    if ('ws' in opts) {
      this._ws = opts.ws;
      this._dcInput = null;
      this._dcState = null;
      this._pc = null;
      this.usingP2P = false;
    } else {
      this._ws = null;
      this._dcInput = opts.dcInput;
      this._dcState = opts.dcState;
      this._pc = opts.pc;
      this.usingP2P = true;
    }
  }

  /** Mirrors WebSocket.readyState: 1 = OPEN, 3 = CLOSED */
  get readyState(): number {
    if (this._dcInput) {
      return this._dcInput.readyState === 'open' ? 1 : 3;
    }
    return this._ws?.readyState ?? 3;
  }

  set onmessage(handler: ((ev: { data: string }) => void) | null) {
    if (this._ws) {
      this._ws.onmessage = handler
        ? (ev) => handler({ data: ev.data as string })
        : null;
    }
    if (this._dcInput) {
      this._dcInput.onmessage = handler
        ? (ev) => handler({ data: ev.data as string })
        : null;
    }
    if (this._dcState) {
      this._dcState.onmessage = handler
        ? (ev) => handler({ data: ev.data as string })
        : null;
    }
  }

  set onclose(handler: (() => void) | null) {
    if (this._ws) this._ws.onclose = handler;
    if (this._dcInput) this._dcInput.onclose = handler;
    if (this._pc) {
      this._pc.onconnectionstatechange = handler
        ? () => {
            const s = this._pc?.connectionState;
            if (s === 'disconnected' || s === 'failed' || s === 'closed') {
              handler();
            }
          }
        : null;
    }
  }

  /**
   * Send a message. If P2P is active, game_state messages go over the
   * unreliable state channel; everything else over the reliable input channel.
   */
  send(data: string): void {
    try {
      if (this._dcInput && this._dcState) {
        const isStateMsg = data.startsWith('{"type":"game_state"');
        const dc = isStateMsg ? this._dcState : this._dcInput;
        if (dc.readyState === 'open') {
          dc.send(data);
        }
        return;
      }
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send(data);
      }
    } catch {
      // ignore send errors
    }
  }

  close(): void {
    try { this._dcInput?.close(); } catch { /**/ }
    try { this._dcState?.close(); } catch { /**/ }
    try { this._pc?.close(); } catch { /**/ }
    try { this._ws?.close(); } catch { /**/ }
  }
}

// ─── WebRTC P2P negotiation ───────────────────────────────────────────────────

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const P2P_TIMEOUT_MS = 9000;

/**
 * Attempt to establish a WebRTC DataChannel P2P connection using `ws` for
 * signaling. Resolves with a GameTransport backed by dual DataChannels on
 * success, or by the original WebSocket on timeout / failure (fallback).
 *
 * The caller must NOT touch ws.onmessage / ws.onclose after calling this
 * until the returned Promise resolves — this function owns them temporarily.
 */
export function negotiateWebRTC(
  ws: WebSocket,
  role: 'host' | 'guest'
): Promise<GameTransport> {
  return new Promise((resolve) => {
    const pc = new RTCPeerConnection(STUN_CONFIG);
    let settled = false;
    const iceCandidateBuffer: RTCIceCandidateInit[] = [];
    let remoteDescSet = false;

    const settle = (transport: GameTransport) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.onclose = null;
      resolve(transport);
    };

    const fallback = () => {
      try { pc.close(); } catch { /**/ }
      settle(new GameTransport({ ws }));
    };

    const succeed = (dcInput: RTCDataChannel, dcState: RTCDataChannel) => {
      settle(new GameTransport({ dcInput, dcState, pc }));
    };

    const timer = setTimeout(fallback, P2P_TIMEOUT_MS);

    // If the WebSocket closes during signaling, fall back immediately
    ws.onclose = fallback;

    const applyBuffered = async () => {
      for (const c of iceCandidateBuffer) {
        try { await pc.addIceCandidate(c); } catch { /**/ }
      }
      iceCandidateBuffer.length = 0;
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'rtc_ice', candidate: e.candidate }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') fallback();
    };

    ws.onmessage = async (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(ev.data as string) as Record<string, unknown>; }
      catch { return; }

      if (msg['type'] === 'rtc_offer' && role === 'guest') {
        try {
          await pc.setRemoteDescription(msg['sdp'] as RTCSessionDescriptionInit);
          remoteDescSet = true;
          await applyBuffered();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'rtc_answer', sdp: answer }));
          }
        } catch { fallback(); }
        return;
      }

      if (msg['type'] === 'rtc_answer' && role === 'host') {
        try {
          await pc.setRemoteDescription(msg['sdp'] as RTCSessionDescriptionInit);
          remoteDescSet = true;
          await applyBuffered();
        } catch { fallback(); }
        return;
      }

      if (msg['type'] === 'rtc_ice') {
        const candidate = msg['candidate'] as RTCIceCandidateInit;
        if (remoteDescSet) {
          try { await pc.addIceCandidate(candidate); } catch { /**/ }
        } else {
          iceCandidateBuffer.push(candidate);
        }
        return;
      }

      if (msg['type'] === 'opponent_disconnected') {
        fallback();
      }
    };

    if (role === 'host') {
      // Two channels:
      // - 'input': ordered + reliable   for input_event messages
      // - 'state': unordered + unreliable for game_state (latest frame wins)
      const dcInput = pc.createDataChannel('input', { ordered: true });
      const dcState = pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
      let inputOpen = false, stateOpen = false;
      const trySucceed = () => { if (inputOpen && stateOpen) succeed(dcInput, dcState); };
      dcInput.onopen = () => { inputOpen = true; trySucceed(); };
      dcState.onopen = () => { stateOpen = true; trySucceed(); };
      pc.createOffer()
        .then((offer) =>
          pc.setLocalDescription(offer).then(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'rtc_offer', sdp: offer }));
            }
          })
        )
        .catch(fallback);
    } else {
      // Guest receives channels created by host
      const channels: Record<string, RTCDataChannel> = {};
      let dcInput: RTCDataChannel | null = null;
      let dcState: RTCDataChannel | null = null;

      const trySucceed = () => {
        if (dcInput && dcState) succeed(dcInput, dcState);
      };

      pc.ondatachannel = (e) => {
        const dc = e.channel;
        channels[dc.label] = dc;
        dc.onopen = () => {
          if (dc.label === 'input') { dcInput = dc; trySucceed(); }
          if (dc.label === 'state') { dcState = dc; trySucceed(); }
        };
      };
    }
  });
}
