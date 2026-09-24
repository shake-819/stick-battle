import { useRef, useEffect, useState, useCallback } from 'react';
import { recordBattleResult } from '@/store/playerStore';
import { drawPlayerAsBoss } from '@/lib/bossRenderer';
import {
  GUN_MODES, GUN_COLOR, GUN_INTERVAL, GUN_DMG, GUN_SPEED, GUN_KB, drawLionelGauge, getEffectiveReload,
  type GunMode,
} from '@/data/lionelGun';
import { STAGES, type StageDef } from '@/data/stages';
import {
  W, H, FW, FH, BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP, SP_COLS, LOCKED_STATES, ACTION_STATES, SPECIAL_NAMES, COUNTER_CD,
  makeFighter, respawnFighter, overlap,
  startSpecial, mkProj,
  getAttackFrames, applyMeleeHit,
  updateFighter, updateProjectiles, knockback, spawn, updateParticles,
  drawScene, drawGuardGauge,
  type Fighter, type Particle, type Projectile,
  type EffectiveStats,
} from '@/lib/gameEngine';
import type { FighterSnap, ProjSnap } from '@/types/online';
import type { GameTransport } from '@/lib/gameTransport';

interface OnlineGamePageProps {
  role: 'host' | 'guest';
  myStats: EffectiveStats;
  opponentStats: EffectiveStats;
  stage: StageDef;
  transport: GameTransport;
  onBack: () => void;
}

let _spFlash = { text: '', timer: 0 };

// Compact serialisation — short keys + rounded numbers reduce payload ~60%
function snapFighter(f: Fighter): FighterSnap {
  return {
    x:  Math.round(f.pos.x * 10) / 10,
    y:  Math.round(f.pos.y * 10) / 10,
    vx: Math.round(f.vel.x * 100) / 100,
    vy: Math.round(f.vel.y * 100) / 100,
    st:  f.state,
    ti:  f.stateTimer,
    dir: f.dir,
    d:   Math.round(f.damage),
    s:   f.stocks,
    aa:  f.attackActive,
    inv: f.invincible,
    gc:  Math.round(f.guardGauge),
    sc:  f.specialCooldown,
    og:  f.onGround,
  };
}

function applySnap(f: Fighter, snap: FighterSnap) {
  f.pos.x      = snap.x;
  f.pos.y      = snap.y;
  f.vel.x      = snap.vx;
  f.vel.y      = snap.vy;
  f.state      = snap.st as Fighter['state'];
  f.stateTimer = snap.ti;
  f.dir        = snap.dir as 1 | -1;
  f.damage     = snap.d;
  f.stocks     = snap.s;
  f.attackActive = snap.aa;
  f.invincible = snap.inv;
  f.guardGauge = snap.gc;
  f.specialCooldown = snap.sc;
  f.onGround   = snap.og;
}

function drawOnlineHUD(
  ctx: CanvasRenderingContext2D,
  hostFighter: Fighter,
  guestFighter: Fighter,
  role: 'host' | 'guest',
  myStats: EffectiveStats,
  stage: StageDef,
  frame: number,
) {
  ctx.save();

  const panel = (f: Fighter, label: string, hx: number, isMe: boolean, myStatsArg: EffectiveStats) => {
    const dc = f.damage < 30 ? '#22c55e' : f.damage < 80 ? '#facc15' : '#ef4444';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    ctx.roundRect(hx, H - 115, 196, 103, 10);
    ctx.fill();

    ctx.fillStyle = f.color;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, hx + 98, H - 97);

    ctx.fillStyle = dc;
    ctx.font = `bold ${Math.min(42, 30 + f.damage * 0.07)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(f.damage)}%`, hx + 98, H - 60);

    for (let i = 0; i < f.stocks; i++) {
      ctx.beginPath();
      ctx.arc(hx + 38 + i * 23, H - 38, 9, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.fill();
    }
    const ghostStocks = isMe ? myStatsArg.startingStocks : f.stocks + (f.stocks <= 0 ? 0 : 0);
    for (let i = f.stocks; i < (isMe ? myStatsArg.startingStocks : 3); i++) {
      ctx.beginPath();
      ctx.arc(hx + 38 + i * 23, H - 38, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#374151';
      ctx.fill();
    }

    if (isMe) {
      const pct = 1 - f.specialCooldown / f.maxSPCooldown;
      const ready = f.specialCooldown === 0;
      ctx.save();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = ready ? '#a78bfa' : '#6b7280';
      ctx.fillText('必殺技 [Q]', hx + 8, H - 18);
      ctx.fillStyle = '#1f2937';
      ctx.beginPath();
      ctx.roundRect(hx + 82, H - 25, 100, 9, 4);
      ctx.fill();
      ctx.fillStyle = ready ? '#a78bfa' : '#4f46e5';
      ctx.beginPath();
      ctx.roundRect(hx + 82, H - 25, 100 * pct, 9, 4);
      ctx.fill();
      if (ready) {
        ctx.fillStyle = '#c4b5fd';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('READY!', hx + 185, H - 17);
      }
      ctx.restore();
    }

    if (f.weapon) {
      ctx.save();
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9ca3af';
      ctx.fillText(`${f.weapon.emoji}${f.weapon.nameJa}`, hx + 8, H - (isMe ? 8 : 8));
      ctx.restore();
    }
  };

  const hostLabel = role === 'host' ? 'あなた (P1)' : '相手 (P1)';
  const guestLabel = role === 'guest' ? 'あなた (P2)' : '相手 (P2)';
  panel(hostFighter, hostLabel, 8, role === 'host', myStats);
  panel(guestFighter, guestLabel, W - 204, role === 'guest', myStats);
  drawGuardGauge(ctx, hostFighter, 16, H - 130);
  drawGuardGauge(ctx, guestFighter, W - 200, H - 130);

  ctx.fillStyle = stage.glowColor + '22';
  ctx.strokeStyle = stage.glowColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 80, 6, 160, 22, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = stage.accentColor;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${stage.emoji} ${stage.nameJa}　オンライン`, W / 2, 21);

  if (_spFlash.timer > 0) {
    _spFlash.timer--;
    ctx.save();
    ctx.globalAlpha = Math.min(1, _spFlash.timer / 20);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#c4b5fd';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#818cf8';
    ctx.shadowBlur = 16;
    ctx.fillText(_spFlash.text, W / 2, 62);
    ctx.restore();
  }

  ctx.restore();
}

export default function OnlineGamePage({
  role, myStats, opponentStats, stage, transport: ws, onBack,
}: OnlineGamePageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const localKeysRef = useRef<Set<string>>(new Set());
  const remoteKeysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const [overlay, setOverlay] = useState<{
    myWin: boolean;
    reward: { xpGained: number; coinsGained: number; leveledUp: boolean };
  } | null>(null);
  const [disconnectReason, setDisconnectReason] = useState<'opponent' | 'network' | null>(null);
  const [lagWarning, setLagWarning] = useState(false);
  const lagWarningRef = useRef(false);
  const lastStateTimeRef = useRef<number>(Date.now());

  const gsRef = useRef<{
    hostFighter: Fighter;
    guestFighter: Fighter;
    parts: Particle[];
    projs: Projectile[];
    frame: number;
    over: boolean;
    winner: 'host' | 'guest' | null;
    hostDmg: number;
    guestDmg: number;
    myLionelMode: GunMode;
    myLionelReload: number;
    opponentLionelMode: GunMode;
    opponentLionelReload: number;
    // Bajiou bleed — tracks who's being bled
    hostBleedDmg: number; hostBleedTicks: number; hostBleedTimer: number;
    guestBleedDmg: number; guestBleedTicks: number; guestBleedTimer: number;
    // Shinigami regen timers per fighter
    hostRegenTimer: number; guestRegenTimer: number;
    // Shinigami scythe cooldowns per fighter
    hostScytheCooldown: number; guestScytheCooldown: number;
    // Shinigami ★5 orbiting scythes per fighter (indexed by victim)
    hostOrbitingScythes: { angle: number; addedAt: number }[];
    guestOrbitingScythes: { angle: number; addedAt: number }[];
  } | null>(null);

  const latestStateRef = useRef<{
    hostSnap: FighterSnap;
    guestSnap: FighterSnap;
    projSnaps: ProjSnap[] | null;
    frame: number;
    over: boolean;
    winner: 'host' | 'guest' | null;
    guestDmg: number;
  } | null>(null);

  const [px, bx] = stage.spawnX;

  const initGame = useCallback(() => {
    _spFlash = { text: '', timer: 0 };
    const hostFighter = makeFighter(px, false, myStats, myStats.startingStocks);
    const guestFighter = makeFighter(bx, false, opponentStats, opponentStats.startingStocks);
    gsRef.current = {
      hostFighter, guestFighter,
      parts: [], projs: [],
      frame: 0, over: false, winner: null,
      hostDmg: 0, guestDmg: 0,
      myLionelMode: 'pistol', myLionelReload: 0,
      opponentLionelMode: 'pistol', opponentLionelReload: 0,
      hostBleedDmg: 0, hostBleedTicks: 0, hostBleedTimer: 0,
      guestBleedDmg: 0, guestBleedTicks: 0, guestBleedTimer: 0,
      hostRegenTimer: 120, guestRegenTimer: 120,
      hostScytheCooldown: 0, guestScytheCooldown: 0,
      hostOrbitingScythes: [], guestOrbitingScythes: [],
    };
  }, [myStats, opponentStats, stage, px, bx]);

  const initGuestFighters = useCallback(() => {
    const hostFighter = makeFighter(px, false, opponentStats, opponentStats.startingStocks);
    const guestFighter = makeFighter(bx, false, myStats, myStats.startingStocks);
    gsRef.current = {
      hostFighter, guestFighter,
      parts: [], projs: [],
      frame: 0, over: false, winner: null,
      hostDmg: 0, guestDmg: 0,
      myLionelMode: 'pistol', myLionelReload: 0,
      opponentLionelMode: 'pistol', opponentLionelReload: 0,
      hostBleedDmg: 0, hostBleedTicks: 0, hostBleedTimer: 0,
      guestBleedDmg: 0, guestBleedTicks: 0, guestBleedTimer: 0,
      hostRegenTimer: 120, guestRegenTimer: 120,
      hostScytheCooldown: 0, guestScytheCooldown: 0,
      hostOrbitingScythes: [], guestOrbitingScythes: [],
    };
  }, [myStats, opponentStats, stage, px, bx]);

  const handleMyKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip auto-repeated keydown events for held keys — the key is already in localKeysRef
    // and the remote side already received the first press, so repeats just spam WebSocket
    if (e.repeat) {
      localKeysRef.current.add(e.key); // keep the set updated
      return;
    }
    localKeysRef.current.add(e.key);

    const isMyLionel = myStats.selectedCharacter === 'lionel';

    // Apply discrete actions locally immediately for both host and guest (client-side prediction)
    const applyLocalAction = (player: Fighter, projs: Projectile[], projOwner: 'player' | 'bot', _projColor: string) => {
      const s = gsRef.current;
      const inAction = ACTION_STATES.includes(player.state);

      // 1-5: Lionel gun mode switch
      if (isMyLionel && e.key >= '1' && e.key <= '5' && s) {
        const idx = parseInt(e.key) - 1;
        if (GUN_MODES[idx]) { s.myLionelMode = GUN_MODES[idx]; s.myLionelReload = 0; }
      }

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        e.preventDefault();
        if (player.jumpsLeft > 0 && !LOCKED_STATES.includes(player.state)) {
          const jv = player.jumpsLeft === player.maxJumps ? BASE_JUMP : BASE_DJUMP;
          player.vel.y = jv * player.jumpMult;
          player.jumpsLeft--;
          player.state = 'jump';
        }
      }
      if (e.key === 'z' || e.key === 'Z' || e.key === 'j' || e.key === 'J') {
        if (isMyLionel && s && s.myLionelReload <= 0 && player.state !== 'dead') {
          const spd = GUN_SPEED[s.myLionelMode] * player.dir;
          projs.push(mkProj(projOwner, player.pos.x + player.dir*22, player.pos.y-35, spd, GUN_DMG[s.myLionelMode], GUN_KB[s.myLionelMode], myStats.attackMult, GUN_COLOR[s.myLionelMode]));
          if (s.myLionelMode === 'dual') projs.push(mkProj(projOwner, player.pos.x + player.dir*22, player.pos.y-50, spd, GUN_DMG[s.myLionelMode], GUN_KB[s.myLionelMode], myStats.attackMult, GUN_COLOR[s.myLionelMode]));
          s.myLionelReload = getEffectiveReload(s.myLionelMode, myStats.selectedCharacter === 'lionel' ? (myStats.bossUnlockLv?.['lionel'] ?? 0) : 0);
        } else if (!inAction && player.state !== 'dead') {
          const dn = localKeysRef.current.has('ArrowDown') || localKeysRef.current.has('s') || localKeysRef.current.has('S');
          const t = dn ? 'downAttack' : 'attack';
          player.state = t;
          player.stateTimer = getAttackFrames(player.weapon, t);
          player.attackActive = false;
        }
      }
      if (e.key === 'x' || e.key === 'X' || e.key === 'k' || e.key === 'K') {
        if (isMyLionel && s && s.myLionelReload <= 0 && player.state !== 'dead') {
          const spd = GUN_SPEED[s.myLionelMode] * player.dir;
          projs.push(mkProj(projOwner, player.pos.x + player.dir*22, player.pos.y-35, spd, GUN_DMG[s.myLionelMode], GUN_KB[s.myLionelMode], myStats.attackMult, GUN_COLOR[s.myLionelMode]));
          if (s.myLionelMode === 'dual') projs.push(mkProj(projOwner, player.pos.x + player.dir*22, player.pos.y-50, spd, GUN_DMG[s.myLionelMode], GUN_KB[s.myLionelMode], myStats.attackMult, GUN_COLOR[s.myLionelMode]));
          s.myLionelReload = getEffectiveReload(s.myLionelMode, myStats.selectedCharacter === 'lionel' ? (myStats.bossUnlockLv?.['lionel'] ?? 0) : 0);
        } else if (!inAction && player.state !== 'dead') {
          player.state = 'strongAttack';
          player.stateTimer = getAttackFrames(player.weapon, 'strongAttack');
          player.attackActive = false;
        }
      }
      if (e.key === 'v' || e.key === 'V' || e.key === 'u' || e.key === 'U') {
        if (!inAction && player.state !== 'dead') {
          player.state = 'upAttack';
          player.stateTimer = getAttackFrames(player.weapon, 'upAttack');
          player.attackActive = false;
        }
      }
      if (e.key === 'q' || e.key === 'Q') {
        if (!inAction && player.state !== 'dead' && player.specialCooldown === 0) {
          const kind = startSpecial(player, localKeysRef.current);
          if (kind) {
            _spFlash = { text: `✨ ${SPECIAL_NAMES[kind] ?? kind}`, timer: 55 };
            if (kind === 'specialNeutral') {
              projs.push(mkProj(projOwner, player.pos.x + player.dir * 22, player.pos.y - 40, player.dir * 9.5, 12, 4, player.attackMult, _projColor));
            }
          }
        }
      }
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        if (!LOCKED_STATES.includes(player.state) && player.state !== 'dead' && player.counterCooldown === 0 && player.onGround) {
          player.state = 'counter';
          player.stateTimer = 22;
          player.counterCooldown = COUNTER_CD;
        }
      }
      // ── 飛び血鎌 [E] — Shinigami ★3 ───────────────────────────────────────
      if (e.key === 'e' || e.key === 'E') {
        const myUnlockLv = myStats.bossUnlockLv ?? {};
        const myShinigamiStars = myStats.selectedCharacter === 'shinigami' ? (myUnlockLv['shinigami'] ?? 0) : 0;
        const scytheCd = s ? (role === 'host' ? s.hostScytheCooldown : s.guestScytheCooldown) : 1;
        if (myShinigamiStars >= 3 && scytheCd <= 0 && player.state !== 'dead') {
          const spd = 13 * player.dir;
          projs.push(mkProj(projOwner, player.pos.x + player.dir * 20, player.pos.y - 35, spd, 45, 7, player.attackMult, '#a78bfa'));
          player.damage = Math.min(player.damage + 6, 999);
          if (s) {
            const cd = myShinigamiStars >= 4 ? 45 : 90;
            if (role === 'host') s.hostScytheCooldown = cd;
            else s.guestScytheCooldown = cd;
          }
        }
      }
    };

    if (role === 'host') {
      // Forward host's own key inputs to guest so guest can predict opponent movement accurately
      ws.send(JSON.stringify({ type: 'input_event', key: e.key, pressed: true }));
      const s = gsRef.current;
      if (!s || s.over) return;
      applyLocalAction(s.hostFighter, s.projs, 'player', '#818cf8');
    } else {
      ws.send(JSON.stringify({ type: 'input_event', key: e.key, pressed: true }));
      // Apply actions locally for instant feedback — reconciliation will correct any drift
      const s = gsRef.current;
      if (!s || s.over) return;
      applyLocalAction(s.guestFighter, s.projs, 'bot', '#ef4444');
    }
  }, [role, ws]);

  const handleMyKeyUp = useCallback((e: KeyboardEvent) => {
    localKeysRef.current.delete(e.key);
    // Both host and guest always notify the remote side on key release
    ws.send(JSON.stringify({ type: 'input_event', key: e.key, pressed: false }));
  }, [ws]);

  const handleRemoteInput = useCallback((key: string, pressed: boolean) => {
    if (!gsRef.current || gsRef.current.over) return;
    const s = gsRef.current;
    const opponent = s.guestFighter;
    const isOpponentLionel = opponentStats.selectedCharacter === 'lionel';

    if (pressed) {
      remoteKeysRef.current.add(key);
      const inAction = ACTION_STATES.includes(opponent.state);

      // 1-5: sync guest's gun mode on host
      if (isOpponentLionel && key >= '1' && key <= '5') {
        const idx = parseInt(key) - 1;
        if (GUN_MODES[idx]) { s.opponentLionelMode = GUN_MODES[idx]; s.opponentLionelReload = 0; }
      }

      if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ') {
        if (opponent.jumpsLeft > 0 && !LOCKED_STATES.includes(opponent.state)) {
          const jv = opponent.jumpsLeft === opponent.maxJumps ? BASE_JUMP : BASE_DJUMP;
          opponent.vel.y = jv * opponent.jumpMult;
          opponent.jumpsLeft--;
          opponent.state = 'jump';
        }
      }
      if (key === 'z' || key === 'Z' || key === 'j' || key === 'J') {
        if (isOpponentLionel && s.opponentLionelReload <= 0 && opponent.state !== 'dead') {
          const spd = GUN_SPEED[s.opponentLionelMode] * opponent.dir;
          s.projs.push(mkProj('bot', opponent.pos.x + opponent.dir*22, opponent.pos.y-35, spd, GUN_DMG[s.opponentLionelMode], GUN_KB[s.opponentLionelMode], opponentStats.attackMult, GUN_COLOR[s.opponentLionelMode]));
          if (s.opponentLionelMode === 'dual') s.projs.push(mkProj('bot', opponent.pos.x + opponent.dir*22, opponent.pos.y-50, spd, GUN_DMG[s.opponentLionelMode], GUN_KB[s.opponentLionelMode], opponentStats.attackMult, GUN_COLOR[s.opponentLionelMode]));
          s.opponentLionelReload = getEffectiveReload(s.opponentLionelMode, opponentStats.selectedCharacter === 'lionel' ? (opponentStats.bossUnlockLv?.['lionel'] ?? 0) : 0);
        } else if (!inAction && opponent.state !== 'dead') {
          const dn = remoteKeysRef.current.has('ArrowDown') || remoteKeysRef.current.has('s') || remoteKeysRef.current.has('S');
          const t = dn ? 'downAttack' : 'attack';
          opponent.state = t;
          opponent.stateTimer = getAttackFrames(opponent.weapon, t);
          opponent.attackActive = false;
        }
      }
      if (key === 'x' || key === 'X' || key === 'k' || key === 'K') {
        if (isOpponentLionel && s.opponentLionelReload <= 0 && opponent.state !== 'dead') {
          const spd = GUN_SPEED[s.opponentLionelMode] * opponent.dir;
          s.projs.push(mkProj('bot', opponent.pos.x + opponent.dir*22, opponent.pos.y-35, spd, GUN_DMG[s.opponentLionelMode], GUN_KB[s.opponentLionelMode], opponentStats.attackMult, GUN_COLOR[s.opponentLionelMode]));
          if (s.opponentLionelMode === 'dual') s.projs.push(mkProj('bot', opponent.pos.x + opponent.dir*22, opponent.pos.y-50, spd, GUN_DMG[s.opponentLionelMode], GUN_KB[s.opponentLionelMode], opponentStats.attackMult, GUN_COLOR[s.opponentLionelMode]));
          s.opponentLionelReload = getEffectiveReload(s.opponentLionelMode, opponentStats.selectedCharacter === 'lionel' ? (opponentStats.bossUnlockLv?.['lionel'] ?? 0) : 0);
        } else if (!inAction && opponent.state !== 'dead') {
          opponent.state = 'strongAttack';
          opponent.stateTimer = getAttackFrames(opponent.weapon, 'strongAttack');
          opponent.attackActive = false;
        }
      }
      if (key === 'v' || key === 'V' || key === 'u' || key === 'U') {
        if (!inAction && opponent.state !== 'dead') {
          opponent.state = 'upAttack';
          opponent.stateTimer = getAttackFrames(opponent.weapon, 'upAttack');
          opponent.attackActive = false;
        }
      }
      if (key === 'q' || key === 'Q') {
        if (!inAction && opponent.state !== 'dead' && opponent.specialCooldown === 0) {
          const kind = startSpecial(opponent, remoteKeysRef.current);
          if (kind && kind === 'specialNeutral') {
            s.projs.push(mkProj('bot', opponent.pos.x + opponent.dir * 22, opponent.pos.y - 40, opponent.dir * 9.5, 12, 4, opponent.attackMult, '#ef4444'));
          }
        }
      }
      if (key === 'c' || key === 'C') {
        if (!LOCKED_STATES.includes(opponent.state) && opponent.state !== 'dead' && opponent.counterCooldown === 0 && opponent.onGround) {
          opponent.state = 'counter';
          opponent.stateTimer = 22;
          opponent.counterCooldown = COUNTER_CD;
        }
      }
      // ── 飛び血鎌 [E] — guest's Shinigami ★3 received by host ─────────────
      if (key === 'e' || key === 'E') {
        const guestUnlockLv = opponentStats.bossUnlockLv ?? {};
        const guestShinigamiStars = opponentStats.selectedCharacter === 'shinigami' ? (guestUnlockLv['shinigami'] ?? 0) : 0;
        if (guestShinigamiStars >= 3 && s.guestScytheCooldown <= 0 && opponent.state !== 'dead') {
          const spd = 13 * opponent.dir;
          s.projs.push(mkProj('bot', opponent.pos.x + opponent.dir * 20, opponent.pos.y - 35, spd, 45, 7, opponent.attackMult, '#a78bfa'));
          opponent.damage = Math.min(opponent.damage + 6, 999);
          s.guestScytheCooldown = guestShinigamiStars >= 4 ? 45 : 90;
        }
      }
    } else {
      remoteKeysRef.current.delete(key);
    }
  }, [opponentStats]);

  const runHostLoop = useCallback((ctx: CanvasRenderingContext2D) => {
    const platforms = stage.platforms;
    // Host boss unlock levels — only apply skills for the character they actually selected
    const _hLv = myStats.bossUnlockLv ?? {};
    const hostBajiouStars    = myStats.selectedCharacter === 'bajiou'    ? (_hLv['bajiou']    ?? 0) : 0;
    const hostShinigamiStars = myStats.selectedCharacter === 'shinigami' ? (_hLv['shinigami'] ?? 0) : 0;
    const hostLionelStars    = myStats.selectedCharacter === 'lionel'    ? (_hLv['lionel']    ?? 0) : 0;
    // Guest boss unlock levels — same selectedCharacter gate
    const _gLv = opponentStats.bossUnlockLv ?? {};
    const guestBajiouStars    = opponentStats.selectedCharacter === 'bajiou'    ? (_gLv['bajiou']    ?? 0) : 0;
    const guestShinigamiStars = opponentStats.selectedCharacter === 'shinigami' ? (_gLv['shinigami'] ?? 0) : 0;
    const guestLionelStars    = opponentStats.selectedCharacter === 'lionel'    ? (_gLv['lionel']    ?? 0) : 0;

    const loop = () => {
      const s = gsRef.current;
      if (!s || s.over) return;
      s.frame++;
      if (s.myLionelReload > 0) s.myLionelReload--;
      if (s.opponentLionelReload > 0) s.opponentLionelReload--;
      if (s.hostScytheCooldown > 0) s.hostScytheCooldown--;
      if (s.guestScytheCooldown > 0) s.guestScytheCooldown--;
      const { hostFighter, guestFighter, parts, projs } = s;

      // ── Shinigami ★1: passive regen (damage% reduction each 2s) ──────────
      if (hostShinigamiStars >= 1 && hostFighter.state !== 'dead') {
        s.hostRegenTimer--;
        if (s.hostRegenTimer <= 0) { hostFighter.damage = Math.max(0, hostFighter.damage - 3); s.hostRegenTimer = 120; }
      }
      if (guestShinigamiStars >= 1 && guestFighter.state !== 'dead') {
        s.guestRegenTimer--;
        if (s.guestRegenTimer <= 0) { guestFighter.damage = Math.max(0, guestFighter.damage - 3); s.guestRegenTimer = 120; }
      }

      // ── Bajiou ★3: King's Aura — atk scales with own damage% ─────────────
      hostFighter.attackMult = hostBajiouStars >= 3
        ? myStats.attackMult * (1 + Math.min(hostFighter.damage, 150) / 75)
        : myStats.attackMult;
      guestFighter.attackMult = guestBajiouStars >= 3
        ? opponentStats.attackMult * (1 + Math.min(guestFighter.damage, 150) / 75)
        : opponentStats.attackMult;

      // ── Bajiou ★1: bleed DOT tick ─────────────────────────────────────────
      // host bleeds (from guest's bajiou ★1)
      if (s.hostBleedTicks > 0) {
        s.hostBleedTimer--;
        if (s.hostBleedTimer <= 0) {
          hostFighter.damage = Math.min(hostFighter.damage + s.hostBleedDmg, 999);
          s.hostBleedTicks--;
          s.hostBleedTimer = s.hostBleedTicks > 0 ? 20 : 0;
          spawn(parts, hostFighter.pos.x + (Math.random() - 0.5) * 30, hostFighter.pos.y - 20, ['#ef4444', '#f87171', '#fca5a5'], 8);
        }
      }
      // guest bleeds (from host's bajiou ★1)
      if (s.guestBleedTicks > 0) {
        s.guestBleedTimer--;
        if (s.guestBleedTimer <= 0) {
          guestFighter.damage = Math.min(guestFighter.damage + s.guestBleedDmg, 999);
          s.guestBleedTicks--;
          s.guestBleedTimer = s.guestBleedTicks > 0 ? 20 : 0;
          spawn(parts, guestFighter.pos.x + (Math.random() - 0.5) * 30, guestFighter.pos.y - 20, ['#ef4444', '#f87171', '#fca5a5'], 8);
        }
      }

      updateFighter(hostFighter, localKeysRef.current, platforms);
      updateFighter(guestFighter, remoteKeysRef.current, platforms);
      hostFighter.vel.x = Math.max(-15, Math.min(15, hostFighter.vel.x));
      guestFighter.vel.x = Math.max(-15, Math.min(15, guestFighter.vel.x));

      // ── Host → Guest melee ───────────────────────────────────────────────
      const r1 = applyMeleeHit(hostFighter, guestFighter, parts, projs);
      if (r1.hit) {
        s.hostDmg += r1.dmgDealt;
        // Host's bajiou ★1: bleed guest
        if (hostBajiouStars >= 1) {
          s.guestBleedDmg = 5;
          s.guestBleedTicks = Math.max(s.guestBleedTicks, 5);
          if (s.guestBleedTimer <= 0) s.guestBleedTimer = 20;
        }
        // Host's shinigami ★2: lifesteal
        if (hostShinigamiStars >= 2) {
          hostFighter.damage = Math.max(0, hostFighter.damage - 5);
        }
        // Guest's bajiou ★2: counter chance (guest counters host's hit)
        if (guestBajiouStars >= 2 && Math.random() < 0.10) {
          knockback(hostFighter, guestFighter.pos, 1.0, 6, 0.3, 10);
          hostFighter.vel.y = Math.min(hostFighter.vel.y, -2);
          spawn(parts, (hostFighter.pos.x + guestFighter.pos.x) / 2, guestFighter.pos.y - 30, ['#f59e0b', '#fbbf24', '#ffffff'], 22);
        }
      }

      // ── Guest → Host melee ───────────────────────────────────────────────
      const r2 = applyMeleeHit(guestFighter, hostFighter, parts, projs);
      if (r2.hit) {
        s.guestDmg += r2.dmgDealt;
        // Guest's bajiou ★1: bleed host
        if (guestBajiouStars >= 1) {
          s.hostBleedDmg = 5;
          s.hostBleedTicks = Math.max(s.hostBleedTicks, 5);
          if (s.hostBleedTimer <= 0) s.hostBleedTimer = 20;
        }
        // Guest's shinigami ★2: lifesteal
        if (guestShinigamiStars >= 2) {
          guestFighter.damage = Math.max(0, guestFighter.damage - 5);
        }
        // Host's bajiou ★2: counter chance (host counters guest's hit)
        if (hostBajiouStars >= 2 && Math.random() < 0.10) {
          knockback(guestFighter, hostFighter.pos, 1.0, 6, 0.3, 10);
          guestFighter.vel.y = Math.min(guestFighter.vel.y, -2);
          spawn(parts, (hostFighter.pos.x + guestFighter.pos.x) / 2, hostFighter.pos.y - 30, ['#f59e0b', '#fbbf24', '#ffffff'], 22);
        }
      }

      // ── Projectile hits ──────────────────────────────────────────────────
      for (let i = projs.length - 1; i >= 0; i--) {
        const proj = projs[i];
        const vic = proj.owner === 'player' ? guestFighter : hostFighter;
        if (vic.invincible > 0 || vic.state === 'dead') continue;
        const vb = { x: vic.pos.x - FW / 2, y: vic.pos.y - FH, w: FW, h: FH };
        if (!overlap(proj.pos.x - proj.size, proj.pos.y - proj.size, proj.size * 2, proj.size * 2, vb.x, vb.y, vb.w, vb.h)) continue;
        // Lionel ★3 headshot: player proj (host fired) → guestFighter
        //                      bot proj (guest fired) → hostFighter
        const shooterLionelStars = proj.owner === 'player' ? hostLionelStars : guestLionelStars;
        let projDmg = proj.damage, projKB = proj.knockback;
        if (shooterLionelStars >= 3) {
          const headTop = vic.pos.y - 67, headBot = vic.pos.y - 43;
          if (proj.pos.y >= headTop && proj.pos.y <= headBot) {
            projDmg = proj.damage * 5; projKB = proj.knockback * 5;
            spawn(parts, vic.pos.x, vic.pos.y - 55, ['#a78bfa', '#c4b5fd', '#ffffff'], 20);
          }
        }
        knockback(vic, { x: proj.pos.x - proj.vel.x * 8, y: proj.pos.y }, proj.atkMult, projKB, 0.40, projDmg);
        if (proj.owner === 'player') s.hostDmg += projDmg * proj.atkMult;
        else s.guestDmg += projDmg * proj.atkMult;
        // ★5 鎌の呪縛: attach orbiting scythe to victim on blood scythe hit
        if (proj.color === '#a78bfa') {
          if (proj.owner === 'player' && hostShinigamiStars >= 5) {
            s.guestOrbitingScythes.push({ angle: Math.random() * Math.PI * 2, addedAt: s.frame });
          } else if (proj.owner === 'bot' && guestShinigamiStars >= 5) {
            s.hostOrbitingScythes.push({ angle: Math.random() * Math.PI * 2, addedAt: s.frame });
          }
        }
        spawn(parts, proj.pos.x, proj.pos.y, proj.owner === 'player' ? SP_COLS.specialNeutral : ['#ef4444', '#fb923c', '#ffffff'], 16);
        projs.splice(i, 1);
      }

      // ── ★5 Orbiting scythes: rotate & detonate ─────────────────────────────
      if (s.hostOrbitingScythes.length > 0) {
        for (const os of s.hostOrbitingScythes) os.angle += 0.06;
        const lastAdded = Math.max(...s.hostOrbitingScythes.map(os => os.addedAt));
        if (s.frame - lastAdded >= 600) {
          const cnt = s.hostOrbitingScythes.length;
          hostFighter.damage = Math.min(hostFighter.damage + cnt * 45 * opponentStats.attackMult, 999);
          s.guestDmg += cnt * 45;
          spawn(parts, hostFighter.pos.x, hostFighter.pos.y - 30, ['#dc2626', '#a78bfa', '#fff'], cnt * 12);
          s.hostOrbitingScythes = [];
        }
      }
      if (s.guestOrbitingScythes.length > 0) {
        for (const os of s.guestOrbitingScythes) os.angle += 0.06;
        const lastAdded = Math.max(...s.guestOrbitingScythes.map(os => os.addedAt));
        if (s.frame - lastAdded >= 600) {
          const cnt = s.guestOrbitingScythes.length;
          guestFighter.damage = Math.min(guestFighter.damage + cnt * 45 * myStats.attackMult, 999);
          s.hostDmg += cnt * 45;
          spawn(parts, guestFighter.pos.x, guestFighter.pos.y - 30, ['#dc2626', '#a78bfa', '#fff'], cnt * 12);
          s.guestOrbitingScythes = [];
        }
      }

      const checkBlast = (f: Fighter, isHost: boolean) => {
        if (f.state === 'dead') return;
        if (f.pos.x < BLAST_L || f.pos.x > BLAST_R || f.pos.y < BLAST_T || f.pos.y > BLAST_B) {
          f.stocks--;
          f.state = 'dead';
          f.stateTimer = 90;
          f.attackActive = false;
          const spawnX = isHost ? px : bx;
          if (f.stocks > 0) setTimeout(() => { if (gsRef.current && !gsRef.current.over) respawnFighter(f, spawnX); }, 1500);
        }
      };
      checkBlast(hostFighter, true);
      checkBlast(guestFighter, false);

      let over = false;
      let winner: 'host' | 'guest' | null = null;
      if (hostFighter.stocks <= 0 && hostFighter.state === 'dead' && hostFighter.stateTimer <= 0) {
        over = true; winner = 'guest';
      } else if (guestFighter.stocks <= 0 && guestFighter.state === 'dead' && guestFighter.stateTimer <= 0) {
        over = true; winner = 'host';
      }

      // ── Projectile update: Lionel ★2 ricochet ────────────────────────────
      const anyRicochet = hostLionelStars >= 2 || guestLionelStars >= 2;
      if (anyRicochet) {
        for (let i = projs.length - 1; i >= 0; i--) {
          const p = projs[i];
          p.trail.push({ x: p.pos.x, y: p.pos.y });
          if (p.trail.length > 7) p.trail.shift();
          // ☆5 自動追尾
          const shooterStars5 = p.owner === 'player' ? hostLionelStars : guestLionelStars;
          if (shooterStars5 >= 5) {
            const target = p.owner === 'player' ? guestFighter : hostFighter;
            const tx = target.pos.x, ty = target.pos.y - 40;
            const dx = tx - p.pos.x, dy = ty - p.pos.y;
            const dist = Math.sqrt(dx*dx+dy*dy);
            if (dist > 20) {
              p.vel.x += (dx/dist)*0.25; p.vel.y += (dy/dist)*0.25;
              const spd = Math.sqrt(p.vel.x**2+p.vel.y**2);
              if (spd > 18) { p.vel.x = p.vel.x/spd*18; p.vel.y = p.vel.y/spd*18; }
            }
          }
          const prevY = p.pos.y;
          p.pos.x += p.vel.x; p.pos.y += p.vel.y; p.life--;
          const shooterStars = p.owner === 'player' ? hostLionelStars : guestLionelStars;
          if (shooterStars >= 2 && !(p as any)._bounced) {
            for (const pl of platforms) {
              const inX = p.pos.x > pl.x + 4 && p.pos.x < pl.x + pl.w - 4;
              if (inX && prevY <= pl.y && p.pos.y >= pl.y) {
                if (Math.random() < 0.30) {
                  p.vel.y = -Math.abs(p.vel.y) * 0.75; p.vel.x *= 0.85;
                  p.life += 60; p.pos.y = pl.y - 1; (p as any)._bounced = true;
                } else { p.life = 0; }
                break;
              }
            }
          }
          if (p.life <= 0 || p.pos.x < -120 || p.pos.x > W + 120 || p.pos.y < -250 || p.pos.y > H + 120)
            projs.splice(i, 1);
        }
      } else {
        updateProjectiles(projs);
      }

      updateParticles(parts);

      // Send game_state at ~15fps (every 4 frames) — guest has client-side prediction.
      // projs only included every 12 frames to save bandwidth; guest advances them locally.
      // Always send on critical events regardless of throttle.
      {
        if (ws.readyState !== WebSocket.OPEN) {
          cancelAnimationFrame(rafRef.current);
          setDisconnectReason(r => r ?? 'network');
          return;
        }
        const criticalFrame =
          over ||
          hostFighter.state === 'hit' || hostFighter.state === 'dead' ||
          hostFighter.state === 'guardBreak' || hostFighter.state === 'counterHit' ||
          guestFighter.state === 'hit' || guestFighter.state === 'dead' ||
          guestFighter.state === 'guardBreak' || guestFighter.state === 'counterHit';
        if (s.frame % 4 === 0 || criticalFrame) {
          const includeProjs = s.frame % 12 === 0 || criticalFrame;
          const stateMsg: Record<string, unknown> = {
            type: 'game_state',
            frame: s.frame,
            host: snapFighter(hostFighter),
            guest: snapFighter(guestFighter),
            over,
            winner,
            hostDmg: s.hostDmg,
            guestDmg: s.guestDmg,
          };
          if (includeProjs) {
            stateMsg.projs = projs.map(p => ({
              x: Math.round(p.pos.x), y: Math.round(p.pos.y),
              vx: p.vel.x, vy: p.vel.y,
              o: p.owner === 'player' ? 0 : 1,
              c: p.color, sz: p.size,
            }));
          }
          try { ws.send(JSON.stringify(stateMsg)); } catch { /* ignore send errors */ }
        }
      }

      ctx.clearRect(0, 0, W, H);
      {
        const BOSS_IDS = ['lionel', 'bajiou', 'shinigami'];
        const mkSkin = (charId: string | undefined, lionelMode: GunMode) => {
          const id = charId && BOSS_IDS.includes(charId) ? charId : undefined;
          if (!id) return undefined;
          return (c: CanvasRenderingContext2D, f: Fighter, fr: number) => { drawPlayerAsBoss(c, f, fr, id, lionelMode); };
        };
        drawScene(ctx, hostFighter, guestFighter, s.frame, parts, projs, stage,
          mkSkin(myStats.selectedCharacter, s.myLionelMode),
          mkSkin(opponentStats.selectedCharacter, s.opponentLionelMode),
        );
        // Draw ★5 orbiting scythes around fighters
        const drawOrbitScythe = (cx: number, cy: number, angle: number) => {
          const r = 62;
          const sx = cx + Math.cos(angle) * r;
          const sy = (cy - 35) + Math.sin(angle) * r;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(angle + Math.PI);
          ctx.shadowColor = '#dc2626'; ctx.shadowBlur = 18;
          ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3.5;
          ctx.beginPath(); ctx.arc(0, 0, 9, Math.PI * 0.4, Math.PI * 1.6, false); ctx.stroke();
          ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, 6, Math.PI * 0.5, Math.PI * 1.5, false); ctx.stroke();
          ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(4, 0); ctx.stroke();
          ctx.restore();
        };
        for (const os of s.hostOrbitingScythes) drawOrbitScythe(hostFighter.pos.x, hostFighter.pos.y, os.angle);
        for (const os of s.guestOrbitingScythes) drawOrbitScythe(guestFighter.pos.x, guestFighter.pos.y, os.angle);
      }
      drawOnlineHUD(ctx, hostFighter, guestFighter, role, myStats, stage, s.frame);
      if (myStats.selectedCharacter === 'lionel') {
        drawLionelGauge(ctx, s.myLionelReload, getEffectiveReload(s.myLionelMode, role === 'host' ? hostLionelStars : guestLionelStars), s.myLionelMode, 8, H - 152);
      }

      if (over) {
        s.over = true;
        s.winner = winner;
        const myWin = winner === 'host';
        const reward = recordBattleResult(myWin, s.hostDmg);
        setOverlay({ myWin, reward });
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    return loop;
  }, [stage, ws, role, myStats, px, bx]);

  const runGuestLoop = useCallback((ctx: CanvasRenderingContext2D) => {
    const platforms = stage.platforms;
    let lastAppliedFrame = -1;

    const loop = () => {
      const s = gsRef.current;
      const latest = latestStateRef.current;
      if (!s) return;

      s.frame++;
      if (s.myLionelReload > 0) s.myLionelReload--;
      if (s.opponentLionelReload > 0) s.opponentLionelReload--;
      if (s.hostScytheCooldown > 0) s.hostScytheCooldown--;
      if (s.guestScytheCooldown > 0) s.guestScytheCooldown--;

      // ── Passive boss skills for guest-side prediction ─────────────────────
      // Only apply skills for the character each player actually selected
      const gMyUnlockLv = myStats.bossUnlockLv ?? {};
      const gOppUnlockLv = opponentStats.bossUnlockLv ?? {};
      const gMyShinigamiStars = myStats.selectedCharacter === 'shinigami' ? (gMyUnlockLv['shinigami'] ?? 0) : 0;
      const gOppShinigamiStars = opponentStats.selectedCharacter === 'shinigami' ? (gOppUnlockLv['shinigami'] ?? 0) : 0;
      const gMyBajiouStars = myStats.selectedCharacter === 'bajiou' ? (gMyUnlockLv['bajiou'] ?? 0) : 0;
      const gOppBajiouStars = opponentStats.selectedCharacter === 'bajiou' ? (gOppUnlockLv['bajiou'] ?? 0) : 0;
      // Shinigami ★1: passive regen (guest = my fighter as guest)
      if (gMyShinigamiStars >= 1 && s.guestFighter.state !== 'dead') {
        s.guestRegenTimer--;
        if (s.guestRegenTimer <= 0) { s.guestFighter.damage = Math.max(0, s.guestFighter.damage - 3); s.guestRegenTimer = 120; }
      }
      if (gOppShinigamiStars >= 1 && s.hostFighter.state !== 'dead') {
        s.hostRegenTimer--;
        if (s.hostRegenTimer <= 0) { s.hostFighter.damage = Math.max(0, s.hostFighter.damage - 3); s.hostRegenTimer = 120; }
      }
      // Bajiou ★3: King's Aura attackMult scaling (guest = my fighter)
      s.guestFighter.attackMult = gMyBajiouStars >= 3
        ? myStats.attackMult * (1 + Math.min(s.guestFighter.damage, 150) / 75)
        : myStats.attackMult;
      s.hostFighter.attackMult = gOppBajiouStars >= 3
        ? opponentStats.attackMult * (1 + Math.min(s.hostFighter.damage, 150) / 75)
        : opponentStats.attackMult;

      // ── Lag detection (guest side) ─────────────────────────────────────────
      const now = Date.now();
      const msSinceLastState = now - lastStateTimeRef.current;
      const isLagging = msSinceLastState > 800;
      if (isLagging !== lagWarningRef.current) {
        lagWarningRef.current = isLagging;
        setLagWarning(isLagging);
      }

      // --- Client-side prediction: run local physics for own (guest) fighter ---
      // This makes inputs feel instant without waiting for host round-trip
      updateFighter(s.guestFighter, localKeysRef.current, platforms);

      // --- Predict opponent (host) using forwarded host key inputs ---
      // remoteKeysRef has the host's live keys from input_event messages,
      // so prediction uses real movement direction instead of always decelerating
      updateFighter(s.hostFighter, remoteKeysRef.current, platforms);

      // --- Reconcile with authoritative server state when a new frame arrives ---
      if (latest && latest.frame !== lastAppliedFrame) {
        lastAppliedFrame = latest.frame;

        // Host fighter: blend local prediction toward authoritative state smoothly
        {
          const hs = latest.hostSnap;
          const hdx = hs.x - s.hostFighter.pos.x;
          const hdy = hs.y - s.hostFighter.pos.y;
          const hDistSq = hdx * hdx + hdy * hdy;
          if (hDistSq > 8100) {
            // >90px off — snap immediately (knockback / respawn)
            applySnap(s.hostFighter, hs);
          } else {
            // Smooth lerp for opponent so they don't teleport visually
            s.hostFighter.pos.x += hdx * 0.35;
            s.hostFighter.pos.y += hdy * 0.35;
            s.hostFighter.vel.x      = hs.vx;
            s.hostFighter.vel.y      = hs.vy;
            s.hostFighter.state      = hs.st as Fighter['state'];
            s.hostFighter.dir        = hs.dir as 1 | -1;
            s.hostFighter.damage     = hs.d;
            s.hostFighter.stocks     = hs.s;
            s.hostFighter.onGround   = hs.og;
            s.hostFighter.invincible      = hs.inv;
            s.hostFighter.guardGauge      = hs.gc;
            s.hostFighter.specialCooldown = hs.sc;
            s.hostFighter.attackActive    = hs.aa;
          }
        }

        // Guest fighter: trust local prediction for position; only sync game-critical values
        {
          const snap = latest.guestSnap;
          const dx = snap.x - s.guestFighter.pos.x;
          const dy = snap.y - s.guestFighter.pos.y;
          const distSq = dx * dx + dy * dy;
          const stockChange = snap.s !== s.guestFighter.stocks;
          // Server says guest entered a hit/knockback/death state that local prediction can't know about
          const serverHitState = snap.st === 'hit' || snap.st === 'dead' || snap.st === 'guardBreak' || snap.st === 'counterHit';

          if (distSq > 14400 || stockChange) {
            // >120px error or stock change — full snap to server truth
            applySnap(s.guestFighter, snap);
          } else if (serverHitState && snap.st !== s.guestFighter.state) {
            // Got hit: apply authoritative state+velocity+timer so knockback plays correctly,
            // but DON'T snap position (avoids teleporting) — lerp toward server position instead
            s.guestFighter.state      = snap.st as Fighter['state'];
            s.guestFighter.stateTimer = snap.ti;
            s.guestFighter.vel.x      = snap.vx;
            s.guestFighter.vel.y      = snap.vy;
            s.guestFighter.damage     = snap.d;
            s.guestFighter.stocks     = snap.s;
            s.guestFighter.invincible = snap.inv;
            s.guestFighter.guardGauge = snap.gc;
            s.guestFighter.dir        = snap.dir as 1 | -1;
            s.guestFighter.attackActive = snap.aa;
            // Lerp position toward authoritative to avoid snapping
            s.guestFighter.pos.x += dx * 0.5;
            s.guestFighter.pos.y += dy * 0.5;
          } else {
            // Normal play: sync state values only, don't touch position/velocity
            // This prevents the "dragging" feel from fighting against prediction
            s.guestFighter.damage          = snap.d;
            s.guestFighter.stocks          = snap.s;
            s.guestFighter.guardGauge      = snap.gc;
            s.guestFighter.specialCooldown = snap.sc;
            s.guestFighter.invincible      = Math.max(s.guestFighter.invincible, snap.inv);
            s.guestFighter.attackActive    = snap.aa;
            // Gentle velocity nudge only if clearly drifted (50–120px)
            if (distSq > 2500) {
              s.guestFighter.vel.x += dx * 0.04;
              s.guestFighter.vel.y += dy * 0.04;
            }
          }
        }

        // Rebuild projectile list from authoritative snapshot (only sent every 12 frames).
        // When absent, keep local simulation running for smooth rendering.
        if (latest.projSnaps) {
          s.projs = latest.projSnaps.map((p, i) => ({
            id: i,
            pos: { x: p.x, y: p.y },
            vel: { x: p.vx, y: p.vy },
            owner: p.o === 0 ? 'player' as const : 'bot' as const,
            color: p.c,
            size: p.sz,
            atkMult: 1, knockback: 1, damage: 0, life: 60, trail: [],
          }));
        }

        if (latest.over && !s.over) {
          s.over = true;
          ctx.clearRect(0, 0, W, H);
          {
            const BOSS_IDS = ['lionel', 'bajiou', 'shinigami'];
            const mkSkin = (charId: string | undefined, lionelMode: GunMode) => {
              const id = charId && BOSS_IDS.includes(charId) ? charId : undefined;
              if (!id) return undefined;
              return (c: CanvasRenderingContext2D, f: Fighter, fr: number) => { drawPlayerAsBoss(c, f, fr, id, lionelMode); };
            };
            drawScene(ctx, s.hostFighter, s.guestFighter, s.frame, [], s.projs, stage,
              mkSkin(opponentStats.selectedCharacter, s.opponentLionelMode),
              mkSkin(myStats.selectedCharacter, s.myLionelMode),
            );
          }
          const myWin = latest.winner === 'guest';
          const reward = recordBattleResult(myWin, latest.guestDmg);
          setOverlay({ myWin, reward });
          return;
        }
      }

      // --- Advance projectile positions between host updates for smooth rendering ---
      updateProjectiles(s.projs);

      // --- Always render at 60fps ---
      ctx.clearRect(0, 0, W, H);
      {
        const BOSS_IDS = ['lionel', 'bajiou', 'shinigami'];
        const mkSkin = (charId: string | undefined, lionelMode: GunMode) => {
          const id = charId && BOSS_IDS.includes(charId) ? charId : undefined;
          if (!id) return undefined;
          return (c: CanvasRenderingContext2D, f: Fighter, fr: number) => { drawPlayerAsBoss(c, f, fr, id, lionelMode); };
        };
        drawScene(ctx, s.hostFighter, s.guestFighter, s.frame, s.parts, s.projs, stage,
          mkSkin(opponentStats.selectedCharacter, s.opponentLionelMode),
          mkSkin(myStats.selectedCharacter, s.myLionelMode),
        );
      }
      drawOnlineHUD(ctx, s.hostFighter, s.guestFighter, role, myStats, stage, s.frame);
      if (myStats.selectedCharacter === 'lionel') {
        drawLionelGauge(ctx, s.myLionelReload, getEffectiveReload(s.myLionelMode, myStats.selectedCharacter === 'lionel' ? (myStats.bossUnlockLv?.['lionel'] ?? 0) : 0), s.myLionelMode, 8, H - 152);
      }

      if (!s.over) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    return loop;
  }, [stage, role, myStats]);

  const mountedRef = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invocation
    if (mountedRef.current) return;
    mountedRef.current = true;

    // Set disconnect handler IMMEDIATELY — before any async work
    // so we catch closes that happen during the transition from lobby
    ws.onclose = () => {
      cancelAnimationFrame(rafRef.current);
      setDisconnectReason(r => r ?? 'network');
    };

    // If WS was already closed during the lobby→game transition, bail out now
    if (ws.readyState !== WebSocket.OPEN) {
      setDisconnectReason('network');
      return;
    }

    if (role === 'host') {
      initGame();
    } else {
      initGuestFighters();
    }

    window.addEventListener('keydown', handleMyKeyDown);
    window.addEventListener('keyup', handleMyKeyUp);

    const ctx = canvasRef.current!.getContext('2d')!;
    cancelAnimationFrame(rafRef.current);

    if (role === 'host') {
      rafRef.current = requestAnimationFrame(runHostLoop(ctx));
    } else {
      rafRef.current = requestAnimationFrame(runGuestLoop(ctx));
    }

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      if (msg['type'] === 'pong') return;
      if (msg['type'] === 'input_event') {
        if (role === 'host') {
          handleRemoteInput(msg['key'] as string, msg['pressed'] as boolean);
        } else {
          // Guest: remote input is host's own key inputs — apply to hostFighter
          const s = gsRef.current;
          if (s && !s.over) {
            const key = msg['key'] as string;
            const pressed = msg['pressed'] as boolean;
            if (pressed) {
              remoteKeysRef.current.add(key);
              const inAction = ACTION_STATES.includes(s.hostFighter.state);
              if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ') {
                if (s.hostFighter.jumpsLeft > 0 && !LOCKED_STATES.includes(s.hostFighter.state)) {
                  const jv = s.hostFighter.jumpsLeft === s.hostFighter.maxJumps ? BASE_JUMP : BASE_DJUMP;
                  s.hostFighter.vel.y = jv * s.hostFighter.jumpMult;
                  s.hostFighter.jumpsLeft--;
                  s.hostFighter.state = 'jump';
                }
              }
              const isOpponentLionel = opponentStats.selectedCharacter === 'lionel';
              // 1-5: sync host's gun mode on guest
              if (isOpponentLionel && key >= '1' && key <= '5') {
                const idx = parseInt(key) - 1;
                if (GUN_MODES[idx]) { s.opponentLionelMode = GUN_MODES[idx]; s.opponentLionelReload = 0; }
              }
              if (key === 'z' || key === 'Z' || key === 'j' || key === 'J') {
                if (isOpponentLionel && s.opponentLionelReload <= 0 && s.hostFighter.state !== 'dead') {
                  const spd = GUN_SPEED[s.opponentLionelMode] * s.hostFighter.dir;
                  s.projs.push(mkProj('player', s.hostFighter.pos.x + s.hostFighter.dir*22, s.hostFighter.pos.y-35, spd, GUN_DMG[s.opponentLionelMode], GUN_KB[s.opponentLionelMode], s.hostFighter.attackMult, GUN_COLOR[s.opponentLionelMode]));
                  if (s.opponentLionelMode === 'dual') s.projs.push(mkProj('player', s.hostFighter.pos.x + s.hostFighter.dir*22, s.hostFighter.pos.y-50, spd, GUN_DMG[s.opponentLionelMode], GUN_KB[s.opponentLionelMode], s.hostFighter.attackMult, GUN_COLOR[s.opponentLionelMode]));
                  s.opponentLionelReload = getEffectiveReload(s.opponentLionelMode, opponentStats.selectedCharacter === 'lionel' ? (opponentStats.bossUnlockLv?.['lionel'] ?? 0) : 0);
                } else if (!inAction && s.hostFighter.state !== 'dead') {
                  const dn = remoteKeysRef.current.has('ArrowDown') || remoteKeysRef.current.has('s') || remoteKeysRef.current.has('S');
                  const t = dn ? 'downAttack' : 'attack';
                  s.hostFighter.state = t;
                  s.hostFighter.stateTimer = getAttackFrames(s.hostFighter.weapon, t);
                  s.hostFighter.attackActive = false;
                }
              }
              if (key === 'x' || key === 'X' || key === 'k' || key === 'K') {
                if (isOpponentLionel && s.opponentLionelReload <= 0 && s.hostFighter.state !== 'dead') {
                  const spd = GUN_SPEED[s.opponentLionelMode] * s.hostFighter.dir;
                  s.projs.push(mkProj('player', s.hostFighter.pos.x + s.hostFighter.dir*22, s.hostFighter.pos.y-35, spd, GUN_DMG[s.opponentLionelMode], GUN_KB[s.opponentLionelMode], s.hostFighter.attackMult, GUN_COLOR[s.opponentLionelMode]));
                  if (s.opponentLionelMode === 'dual') s.projs.push(mkProj('player', s.hostFighter.pos.x + s.hostFighter.dir*22, s.hostFighter.pos.y-50, spd, GUN_DMG[s.opponentLionelMode], GUN_KB[s.opponentLionelMode], s.hostFighter.attackMult, GUN_COLOR[s.opponentLionelMode]));
                  s.opponentLionelReload = getEffectiveReload(s.opponentLionelMode, opponentStats.selectedCharacter === 'lionel' ? (opponentStats.bossUnlockLv?.['lionel'] ?? 0) : 0);
                } else if (!inAction && s.hostFighter.state !== 'dead') {
                  s.hostFighter.state = 'strongAttack';
                  s.hostFighter.stateTimer = getAttackFrames(s.hostFighter.weapon, 'strongAttack');
                  s.hostFighter.attackActive = false;
                }
              }
              if ((key === 'v' || key === 'V' || key === 'u' || key === 'U') && !inAction && s.hostFighter.state !== 'dead') {
                s.hostFighter.state = 'upAttack';
                s.hostFighter.stateTimer = getAttackFrames(s.hostFighter.weapon, 'upAttack');
                s.hostFighter.attackActive = false;
              }
              if ((key === 'q' || key === 'Q') && !inAction && s.hostFighter.state !== 'dead' && s.hostFighter.specialCooldown === 0) {
                const kind = startSpecial(s.hostFighter, remoteKeysRef.current);
                if (kind && kind === 'specialNeutral') {
                  s.projs.push(mkProj('bot', s.hostFighter.pos.x + s.hostFighter.dir * 22, s.hostFighter.pos.y - 40, s.hostFighter.dir * 9.5, 12, 4, s.hostFighter.attackMult, '#ef4444'));
                }
              }
              if (key === 'c' || key === 'C') {
                if (!LOCKED_STATES.includes(s.hostFighter.state) && s.hostFighter.state !== 'dead' && s.hostFighter.counterCooldown === 0 && s.hostFighter.onGround) {
                  s.hostFighter.state = 'counter';
                  s.hostFighter.stateTimer = 22;
                  s.hostFighter.counterCooldown = COUNTER_CD;
                }
              }
              // ── 飛び血鎌 [E] — host's Shinigami ★3 received by guest (prediction) ─
              if (key === 'e' || key === 'E') {
                const hostUnlockLv = opponentStats.bossUnlockLv ?? {};
                const hostShinigamiStars = opponentStats.selectedCharacter === 'shinigami' ? (hostUnlockLv['shinigami'] ?? 0) : 0;
                if (hostShinigamiStars >= 3 && s.hostScytheCooldown <= 0 && s.hostFighter.state !== 'dead') {
                  const spd = 13 * s.hostFighter.dir;
                  s.projs.push(mkProj('player', s.hostFighter.pos.x + s.hostFighter.dir * 20, s.hostFighter.pos.y - 35, spd, 45, 7, s.hostFighter.attackMult, '#a78bfa'));
                  s.hostFighter.damage = Math.min(s.hostFighter.damage + 6, 999);
                  s.hostScytheCooldown = 90;
                }
              }
            } else {
              remoteKeysRef.current.delete(key);
            }
          }
        }
      }
      if (msg['type'] === 'game_state' && role === 'guest') {
        lastStateTimeRef.current = Date.now();
        const incomingFrame = msg['frame'] as number;
        // Discard stale packets — unreliable channel can deliver out-of-order
        if (!latestStateRef.current || incomingFrame > latestStateRef.current.frame) {
          latestStateRef.current = {
            hostSnap: msg['host'] as FighterSnap,
            guestSnap: msg['guest'] as FighterSnap,
            // projs only sent every 12 frames; null means keep local simulation
            projSnaps: msg['projs'] ? (msg['projs'] as ProjSnap[]) : (latestStateRef.current?.projSnaps ?? null),
            frame: incomingFrame,
            over: msg['over'] as boolean,
            winner: msg['winner'] as 'host' | 'guest' | null,
            guestDmg: msg['guestDmg'] as number,
          };
        }
      }
      if (msg['type'] === 'opponent_disconnected') {
        cancelAnimationFrame(rafRef.current);
        setDisconnectReason('opponent');
      }
    };

    // Keep-alive ping every 10s so proxy doesn't close the idle WS mid-game
    const keepAlive = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ping' })); } catch { /* ignore */ }
      }
    }, 10_000);

    return () => {
      window.removeEventListener('keydown', handleMyKeyDown);
      window.removeEventListener('keyup', handleMyKeyUp);
      cancelAnimationFrame(rafRef.current);
      clearInterval(keepAlive);
    };
  }, []);

  const handleBack = () => {
    cancelAnimationFrame(rafRef.current);
    ws.close();
    onBack();
  };

  return (
    <div className="w-full h-screen bg-gray-950 flex flex-col items-center justify-center select-none overflow-hidden">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-xl border shadow-2xl"
          style={{
            display: 'block',
            maxWidth: '100vw',
            maxHeight: '80vh',
            aspectRatio: `${W}/${H}`,
            borderColor: stage.glowColor + '66',
            boxShadow: `0 0 40px ${stage.glowColor}22`,
          }}
        />

        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-xl">
            <div className="text-center px-6">
              {overlay.myWin
                ? <div className="text-6xl font-black text-yellow-400 mb-1">YOU WIN! 🏆</div>
                : <div className="text-6xl font-black text-red-400 mb-1">GAME OVER 💀</div>}
              <div className="mt-3 mb-4 flex gap-4 justify-center">
                <div className="bg-indigo-900/70 border border-indigo-600 rounded-xl px-5 py-3">
                  <div className="text-indigo-300 text-xs">経験値</div>
                  <div className="text-white font-black text-2xl">+{overlay.reward.xpGained} XP</div>
                </div>
                <div className="bg-yellow-900/70 border border-yellow-600 rounded-xl px-5 py-3">
                  <div className="text-yellow-300 text-xs">コイン</div>
                  <div className="text-white font-black text-2xl">+{overlay.reward.coinsGained} 💰</div>
                </div>
              </div>
              {overlay.reward.leveledUp && (
                <div className="mb-4 bg-yellow-400/20 border border-yellow-400 rounded-xl px-6 py-2 text-yellow-300 font-black text-lg animate-pulse">
                  ⬆ LEVEL UP！メニューで能力を選択
                </div>
              )}
              <button
                onClick={handleBack}
                className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg px-10 py-3 rounded-xl transition-all active:scale-95"
              >
                メニューへ
              </button>
            </div>
          </div>
        )}

        {lagWarning && !overlay && !disconnectReason && role === 'guest' && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-yellow-900/90 border border-yellow-500 text-yellow-300 text-xs font-bold px-3 py-1 rounded-full animate-pulse pointer-events-none">
            <span>📡</span>
            <span>通信遅延中...</span>
          </div>
        )}

        {disconnectReason && !overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-xl">
            <div className="text-center">
              <div className="text-4xl font-black text-red-400 mb-2">
                {disconnectReason === 'opponent' ? '相手が切断しました 👋' : '接続が切れました 📡'}
              </div>
              <p className="text-gray-400 mb-6">
                {disconnectReason === 'opponent'
                  ? '相手プレイヤーが接続を終了しました'
                  : 'ネットワークの問題で接続が中断されました'}
              </p>
              <button
                onClick={handleBack}
                className="bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-lg px-10 py-3 rounded-xl transition-all active:scale-95"
              >
                ロビーへ戻る
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-4 text-xs text-gray-500 flex-wrap justify-center">
        <span>AD/←→: 移動</span>
        <span>W/↑/Space: ジャンプ</span>
        <span>Z/J: 通常攻撃</span>
        <span>X/K: 強攻撃</span>
        <span>↓+Z: 下攻撃</span>
        <span className="text-purple-400 font-bold">Q: 必殺技</span>
        <span>F: ガード</span>
        <span>C: カウンター</span>
      </div>
    </div>
  );
}
