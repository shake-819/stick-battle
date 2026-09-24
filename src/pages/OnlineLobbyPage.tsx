import { useState, useEffect, useRef } from 'react';
import { load, computeEffectiveStats, type PlayerData } from '@/store/playerStore';
import { STAGES, type StageDef } from '@/data/stages';
import type { OnlinePlayerData } from '@/types/online';
import { WS_URL } from '@/lib/backend';
import type { EffectiveStats } from '@/lib/gameEngine';
import { GameTransport, negotiateWebRTC } from '@/lib/gameTransport';
import type { OnlineGameParams } from '@/App';

interface OnlineLobbyPageProps {
  onGameStart: (params: OnlineGameParams) => void;
  onBack: () => void;
}

type Phase =
  | 'start'
  | 'select-stage'
  | 'waiting'
  | 'joining'
  | 'connecting'
  | 'p2p'
  | 'error';

function statsToPlayerData(s: EffectiveStats): OnlinePlayerData {
  return {
    attackMult: s.attackMult,
    defenseMult: s.defenseMult,
    speedMult: s.speedMult,
    jumpMult: s.jumpMult,
    startingStocks: s.startingStocks,
    maxJumps: s.maxJumps,
    berserker: s.berserker,
    playerColor: s.playerColor,
    equippedWeapon: s.equippedWeapon,
    equippedArmor: s.equippedArmor,
    effectiveSPCooldown: s.effectiveSPCooldown,
    selectedCharacter: s.selectedCharacter,
    bossUnlockLv: s.bossUnlockLv ?? {},
  };
}

function playerDataToStats(d: OnlinePlayerData): EffectiveStats {
  return {
    attackMult: d.attackMult,
    defenseMult: d.defenseMult,
    speedMult: d.speedMult,
    jumpMult: d.jumpMult,
    startingStocks: d.startingStocks,
    maxJumps: d.maxJumps,
    berserker: d.berserker,
    playerColor: d.playerColor,
    equippedWeapon: d.equippedWeapon,
    equippedArmor: d.equippedArmor,
    effectiveSPCooldown: d.effectiveSPCooldown,
    selectedCharacter: d.selectedCharacter,
    bossUnlockLv: d.bossUnlockLv ?? {},
  };
}

function makeWsUrl(): string {
  // 静的ホスティングでは同一オリジンにサーバーが無いため、VITE_WS_URL / VITE_API_BASE から決まる URL を使う
  return WS_URL;
}

function applyRules(
  stats: ReturnType<typeof computeEffectiveStats>,
  data: PlayerData,
  lockStats: boolean,
  ignoreItems: boolean,
  reduceDamage: boolean,
): ReturnType<typeof computeEffectiveStats> {
  let s = { ...stats };
  if (lockStats) {
    const base = computeEffectiveStats({ ...data, levelChoices: { attack: 0, defense: 0, speed: 0, jump: 0, stocks: 0 } });
    s = { ...s, attackMult: base.attackMult, defenseMult: base.defenseMult, speedMult: base.speedMult, jumpMult: base.jumpMult, startingStocks: base.startingStocks };
  }
  if (ignoreItems) {
    const base = computeEffectiveStats({ ...data, ownedItems: [] });
    s = { ...s, attackMult: base.attackMult, defenseMult: base.defenseMult, speedMult: base.speedMult, startingStocks: base.startingStocks };
  }
  if (reduceDamage) {
    s = { ...s, attackMult: s.attackMult * 0.1 };
  }
  return s;
}

export default function OnlineLobbyPage({ onGameStart, onBack }: OnlineLobbyPageProps) {
  const [phase, setPhase] = useState<Phase>('start');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [selectedStage, setSelectedStage] = useState<StageDef>(STAGES[0]);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [lockStats, setLockStats] = useState(false);
  const [ignoreItems, setIgnoreItems] = useState(false);
  const [reduceDamage, setReduceDamage] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const rawData = load();
  const myStats = computeEffectiveStats(rawData);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(makeWsUrl());
      wsRef.current = ws;
      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error('接続に失敗しました'));
    });
  }

  async function createRoom() {
    setPhase('select-stage');
  }

  async function confirmCreateRoom() {
    try {
      const ws = await connect();
      const myData = statsToPlayerData(myStats);
      ws.send(JSON.stringify({ type: 'create_room', playerData: myData, stageId: selectedStage.id }));

      const keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);

      ws.onclose = () => clearInterval(keepAlive);

      ws.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (msg['type'] === 'pong') return;
        if (msg['type'] === 'room_created') {
          setRoomCode(msg['code'] as string);
          setPhase('waiting');
        }
        if (msg['type'] === 'guest_joined') {
          clearInterval(keepAlive);
          const guestData = msg['guestData'] as OnlinePlayerData;
          wsRef.current = null;
          setPhase('p2p');
          const transport = await negotiateWebRTC(ws, 'host');
          const finalStats = applyRules(myStats, rawData, lockStats, ignoreItems, reduceDamage);
          onGameStart({
            role: 'host',
            myStats: finalStats,
            opponentStats: playerDataToStats(guestData),
            stage: selectedStage,
            transport,
          });
        }
        if (msg['type'] === 'opponent_disconnected') {
          clearInterval(keepAlive);
          setErrorMsg('相手が切断しました');
          setPhase('error');
        }
        if (msg['type'] === 'error') {
          clearInterval(keepAlive);
          setErrorMsg(msg['message'] as string);
          setPhase('error');
        }
      };
    } catch (e) {
      setErrorMsg((e as Error).message);
      setPhase('error');
    }
  }

  async function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) { setErrorMsg('4文字のコードを入力してください'); setPhase('error'); return; }
    setPhase('connecting');
    try {
      const ws = await connect();
      const myData = statsToPlayerData(myStats);
      ws.send(JSON.stringify({ type: 'join_room', code, playerData: myData }));

      ws.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        if (msg['type'] === 'room_joined') {
          const hostData = msg['hostData'] as OnlinePlayerData;
          const stageId = msg['stageId'] as string;
          const stage = STAGES.find(s => s.id === stageId) ?? STAGES[0];
          wsRef.current = null;
          setPhase('p2p');
          const transport = await negotiateWebRTC(ws, 'guest');
          const finalStats = applyRules(myStats, rawData, lockStats, ignoreItems, reduceDamage);
          onGameStart({
            role: 'guest',
            myStats: finalStats,
            opponentStats: playerDataToStats(hostData),
            stage,
            transport,
          });
        }
        if (msg['type'] === 'opponent_disconnected') {
          setErrorMsg('ホストが切断しました');
          setPhase('error');
        }
        if (msg['type'] === 'error') {
          setErrorMsg(msg['message'] as string);
          setPhase('error');
        }
      };
    } catch (e) {
      setErrorMsg((e as Error).message);
      setPhase('error');
    }
  }

  function copyCode() {
    navigator.clipboard.writeText(roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyUrl() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    });
  }

  function reset() {
    wsRef.current?.close();
    wsRef.current = null;
    setPhase('start');
    setRoomCode('');
    setJoinCode('');
    setErrorMsg('');
  }

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center justify-center select-none px-4">
      <h1 className="text-4xl font-black mb-1 tracking-tight">
        <span className="text-blue-400">STICK</span><span className="text-red-400"> SMASH</span>
      </h1>
      <p className="text-gray-400 text-sm mb-6">🌐 オンライン対戦</p>

      {phase === 'start' && (
        <div className="flex flex-col gap-3 w-72">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 text-center mb-2">
            <p className="text-xs text-gray-400 mb-1">あなたのステータス</p>
            <p className="font-bold text-lg" style={{ color: myStats.playerColor }}>Lv.{load().level}</p>
            <div className="text-xs text-gray-500 flex gap-3 justify-center mt-1">
              <span>⚔ {Math.round(myStats.attackMult * 100)}%</span>
              <span>🛡 {Math.round(myStats.defenseMult * 100)}%</span>
              <span>💨 {Math.round(myStats.speedMult * 100)}%</span>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 flex flex-col gap-2.5">
            <p className="text-xs text-gray-400 font-bold mb-0.5">⚙️ 対戦ルール（双方が同じ設定にしてください）</p>
            {([
              { key: 'lockStats', label: '📊 ステータス固定', desc: 'レベル振り分けなし（装備効果は残る）', val: lockStats, set: setLockStats },
              { key: 'ignoreItems', label: '🎁 アイテム無視', desc: 'ガチャアイテム効果を除外', val: ignoreItems, set: setIgnoreItems },
              { key: 'reduceDamage', label: '🛡️ ダメージ激減', desc: '自分の与ダメージを10%に削減', val: reduceDamage, set: setReduceDamage },
            ] as const).map(opt => (
              <label key={opt.key} className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={opt.val}
                  onChange={e => opt.set(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-blue-500 cursor-pointer flex-shrink-0"
                />
                <span>
                  <span className="text-sm font-bold text-white">{opt.label}</span>
                  <span className="block text-xs text-gray-500">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>

          <button
            onClick={createRoom}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-lg py-4 rounded-2xl transition-all active:scale-95 shadow-lg"
          >
            🏠 ルームを作成
            <div className="text-xs font-normal opacity-75 mt-0.5">コードを発行して友達を招待</div>
          </button>

          <button
            onClick={() => setPhase('joining')}
            className="w-full bg-green-700 hover:bg-green-600 text-white font-black text-lg py-4 rounded-2xl transition-all active:scale-95 shadow-lg"
          >
            🚪 ルームに参加
            <div className="text-xs font-normal opacity-75 mt-0.5">コードを入力して参加</div>
          </button>

          <button
            onClick={onBack}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5 rounded-xl transition-all active:scale-95"
          >
            ← 戻る
          </button>
        </div>
      )}

      {phase === 'select-stage' && (
        <div className="flex flex-col gap-3 w-80">
          <p className="text-gray-300 font-bold text-center mb-1">ステージを選択</p>
          {STAGES.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedStage(s)}
              className={`border-2 rounded-xl p-3 text-left transition-all ${selectedStage.id === s.id ? 'ring-2 ring-white/30 scale-[1.02]' : 'opacity-60 hover:opacity-80'}`}
              style={{ borderColor: s.glowColor + '99', background: s.bgTop + 'cc' }}
            >
              <div className="font-black text-base" style={{ color: s.accentColor }}>{s.emoji} {s.nameJa}</div>
              <div className="text-xs text-gray-400 mt-0.5">{s.descJa}</div>
            </button>
          ))}
          <div className="flex gap-2">
            <button onClick={() => setPhase('start')} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5 rounded-xl transition-all">← 戻る</button>
            <button onClick={confirmCreateRoom} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl transition-all active:scale-95">
              ルームを作成 →
            </button>
          </div>
        </div>
      )}

      {phase === 'waiting' && (
        <div className="flex flex-col items-center gap-4 w-72">
          <div className="bg-gray-900 border-2 border-blue-500/60 rounded-2xl p-6 text-center w-full">
            <p className="text-gray-400 text-sm mb-2">ルームコード</p>
            <p className="text-5xl font-black text-white tracking-widest mb-3">{roomCode}</p>
            <button
              onClick={copyCode}
              className={`text-sm px-4 py-1.5 rounded-full font-bold transition-all ${copied ? 'bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
            >
              {copied ? '✓ コピー済み' : '📋 コードをコピー'}
            </button>
          </div>

          <div className="bg-yellow-900/30 border border-yellow-600/40 rounded-xl p-3 w-full text-center">
            <p className="text-yellow-300 text-xs font-bold mb-1.5">⚠️ 相手も同じURLで開いてください</p>
            <button
              onClick={copyUrl}
              className={`text-xs px-3 py-1 rounded-full font-bold transition-all ${copiedUrl ? 'bg-green-600 text-white' : 'bg-yellow-700/60 hover:bg-yellow-700 text-yellow-200'}`}
            >
              {copiedUrl ? '✓ URLコピー済み' : '🔗 このURLをコピー'}
            </button>
          </div>

          <div className="text-center">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
              <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              相手の参加を待っています…
            </div>
            <p className="text-gray-600 text-xs">ステージ: {selectedStage.emoji} {selectedStage.nameJa}</p>
          </div>

          <button onClick={reset} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5 rounded-xl transition-all">
            ← キャンセル
          </button>
        </div>
      )}

      {phase === 'joining' && (
        <div className="flex flex-col items-center gap-4 w-72">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full">
            <p className="text-gray-400 text-sm mb-3 text-center">ルームコードを入力</p>
            <input
              type="text"
              value={joinCode}
              onChange={e => {
                const normalized = e.target.value.replace(/[Ａ-Ｚａ-ｚ０-９]/g, c =>
                  String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
                );
                setJoinCode(normalized.toUpperCase().slice(0, 4));
              }}
              maxLength={4}
              placeholder="XXXX"
              className="w-full bg-gray-800 border border-gray-600 rounded-xl text-center text-3xl font-black text-white py-3 tracking-widest focus:outline-none focus:border-blue-500"
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
              autoFocus
            />
          </div>
          <div className="flex gap-2 w-full">
            <button onClick={reset} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5 rounded-xl transition-all">← 戻る</button>
            <button onClick={joinRoom} disabled={joinCode.length !== 4} className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-black py-2.5 rounded-xl transition-all active:scale-95">
              参加する →
            </button>
          </div>
        </div>
      )}

      {phase === 'connecting' && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">接続中…</p>
        </div>
      )}

      {phase === 'p2p' && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-300 font-bold">P2P接続を確立中…</p>
          <p className="text-gray-500 text-xs text-center max-w-xs">
            直接接続に失敗した場合は自動的にサーバー経由に切り替わります
          </p>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col items-center gap-4 w-72">
          <div className="bg-red-900/40 border border-red-600 rounded-2xl p-5 text-center w-full">
            <p className="text-red-300 font-bold text-lg mb-1">エラー</p>
            <p className="text-red-200 text-sm">{errorMsg}</p>
          </div>
          <button onClick={reset} className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-2.5 rounded-xl transition-all">← 戻る</button>
        </div>
      )}
    </div>
  );
}
