import { useEffect, useRef, useState, useCallback } from 'react';
import { load, computeEffectiveStats } from '@/store/playerStore';
import { FEATURES } from '@/lib/backend';
import { submitEventScore } from '@/lib/eventService';
import { WEAPONS, ARMORS } from '@/data/equipment';
import { BOSSES } from '@/data/bosses';
import {
  drawFighter, FH,
  type Fighter, type FighterState,
} from '@/lib/gameEngine';
import { drawPlayerAsBoss } from '@/lib/bossRenderer';

interface Props { onBack: () => void; }

// ── Canvas constants ──────────────────────────────────────────
const W = 800, H = 340, GROUND_Y = 298;
const GRAVITY = 0.52;
const LEFT_B = 16, RIGHT_B = W - 16;

// ── Types ─────────────────────────────────────────────────────
interface Enemy {
  id: number; x: number; y: number; vx: number; dir: -1 | 1;
  hp: number; maxHp: number; dmg: number; spd: number;
  state: 'walk' | 'attack' | 'hit' | 'dead';
  atkCd: number; atkTimer: number; color: string; flash: number;
}
interface Pt { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }

type PState = 'idle' | 'walk' | 'jump' | 'attack' | 'strongAttack' | 'hit' | 'dead';
interface GS {
  px: number; py: number; pvx: number; pvy: number;
  pdir: -1 | 1; pstate: PState; pTimer: number; pAtkCd: number; pInv: number;
  php: number; pmaxHp: number;
  stocks: number; respawnTimer: number;
  enemies: Enemy[]; pts: Pt[];
  frame: number; phase: 'playing' | 'gameover';
  nextSpawnIn: number; nextId: number; kills: number;
}

const ENEMY_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#6366f1', '#ec4899'];

function addPts(pts: Pt[], x: number, y: number, color: string, n: number) {
  for (let i = 0; i < n; i++)
    pts.push({ x, y, vx: (Math.random()-0.5)*6, vy: Math.random()*-5-1, life: 28+Math.random()*18, color, size: 2+Math.random()*3 });
}

function makeEnemy(id: number, side: 'left'|'right', frame: number): Enemy {
  const mins = frame / 3600;
  const hp = Math.round(55 * (1 + mins * 0.35));
  return {
    id, x: side === 'left' ? LEFT_B + 8 : RIGHT_B - 8, y: GROUND_Y,
    vx: 0, dir: side === 'left' ? 1 : -1,
    hp, maxHp: hp, dmg: Math.round(14 * (1 + mins * 0.22)),
    spd: Math.min(3.2, 1.4 * (1 + mins * 0.18)),
    state: 'walk', atkCd: 0, atkTimer: 0,
    color: ENEMY_COLORS[id % ENEMY_COLORS.length], flash: 0,
  };
}

// ── Fighter adapters for drawFighter ─────────────────────────
const P_STATE_MAP: Record<PState, FighterState> = {
  idle: 'idle', walk: 'walk', jump: 'jump',
  attack: 'attack', strongAttack: 'strongAttack',
  hit: 'hit', dead: 'dead',
};
const E_STATE_MAP: Record<Enemy['state'], FighterState> = {
  walk: 'walk', attack: 'attack', hit: 'hit', dead: 'dead',
};

function makeBlankFighterBase(): Omit<Fighter,
  'pos'|'vel'|'dir'|'damage'|'stocks'|'onGround'|'jumpsLeft'|'maxJumps'|
  'state'|'stateTimer'|'attackActive'|'invincible'|'color'|
  'attackMult'|'defenseMult'|'speedMult'|'jumpMult'|'berserker'|
  'specialCooldown'|'maxSPCooldown'|'multiHitTimer'|
  'weapon'|'armor'|'botAI'|'botBehav'|'botDecisionTimer'|'botJumpCooldown'> {
  return {
    bowFired: false,
    bleedDamage: 0, bleedTicks: 0, bleedTickTimer: 0,
    guardGauge: 100, maxGuardGauge: 100, counterCooldown: 0, botGuardTimer: 0,
    stunTimer: 0, divineHitCount: 0,
    primordialRageStacks: 0, primordialComboCount: 0,
  };
}

function gsToFighter(gs: GS, stats: ReturnType<typeof computeEffectiveStats>): Fighter {
  return {
    ...makeBlankFighterBase(),
    pos: { x: gs.px, y: gs.py },
    vel: { x: gs.pvx, y: gs.pvy },
    dir: gs.pdir,
    damage: 0,
    stocks: gs.stocks,
    onGround: gs.py >= GROUND_Y,
    jumpsLeft: 1,
    maxJumps: 2,
    state: P_STATE_MAP[gs.pstate],
    stateTimer: gs.pTimer,
    attackActive: (gs.pstate === 'attack' && gs.pTimer <= 14) ||
                  (gs.pstate === 'strongAttack' && gs.pTimer <= 22),
    invincible: gs.pInv,
    color: stats.playerColor,
    botAI: false, botBehav: 'approach', botDecisionTimer: 0, botJumpCooldown: 0,
    attackMult: stats.attackMult,
    defenseMult: stats.defenseMult,
    speedMult: stats.speedMult,
    jumpMult: stats.jumpMult,
    berserker: stats.berserker,
    specialCooldown: 0,
    maxSPCooldown: 200,
    multiHitTimer: 0,
    weapon: stats.equippedWeapon,
    armor: stats.equippedArmor,
  };
}

function enemyToFighter(e: Enemy): Fighter {
  return {
    ...makeBlankFighterBase(),
    pos: { x: e.x, y: e.y },
    vel: { x: e.vx, y: 0 },
    dir: e.dir,
    damage: 0,
    stocks: 1,
    onGround: true,
    jumpsLeft: 0,
    maxJumps: 1,
    state: E_STATE_MAP[e.state],
    stateTimer: e.atkTimer,
    attackActive: e.state === 'attack' && e.atkTimer <= 12,
    invincible: e.flash > 0 ? 1 : 0,
    color: e.flash > 0 ? '#ffffff' : e.color,
    botAI: true, botBehav: 'approach', botDecisionTimer: 0, botJumpCooldown: 0,
    attackMult: 1, defenseMult: 0, speedMult: 1, jumpMult: 1,
    berserker: false,
    specialCooldown: 0,
    maxSPCooldown: 200,
    multiHitTimer: 0,
    weapon: null,
    armor: null,
  };
}

export default function EventSurvivalPage({ onBack }: Props) {
  const data       = load();
  const stats      = computeEffectiveStats(data);
  const weapon     = stats.equippedWeapon;
  const armor      = stats.equippedArmor;
  const isBow      = weapon?.type === 'bow';
  const isBossChar = BOSSES.some(b => b.id === data.selectedCharacter);
  const canPlay    = !isBow && !isBossChar;

  const bossId = ['lionel', 'bajiou', 'shinigami'].includes(stats.selectedCharacter ?? '')
    ? (stats.selectedCharacter as string)
    : undefined;

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const gsRef      = useRef<GS | null>(null);
  const keysRef    = useRef<Set<string>>(new Set());
  const rafRef     = useRef<number>(0);
  const touchRef   = useRef({ left: false, right: false, jump: false, atk: false, satk: false });

  const [phase, setPhase]         = useState<'pre' | 'playing' | 'gameover'>('pre');
  const [score, setScore]         = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  // HUD state — updated from the game loop so React re-renders correctly
  const [hudHp, setHudHp]         = useState(120);
  const [hudMaxHp, setHudMaxHp]   = useState(120);
  const [hudStocks, setHudStocks] = useState(3);
  const [hudKills, setHudKills]   = useState(0);
  const [hudTime, setHudTime]     = useState(0);

  const initGS = useCallback((): GS => {
    const maxHp = 120;
    return {
      px: W / 2, py: GROUND_Y, pvx: 0, pvy: 0,
      pdir: 1, pstate: 'idle', pTimer: 0, pAtkCd: 0, pInv: 0,
      php: maxHp, pmaxHp: maxHp,
      stocks: 3, respawnTimer: 0,
      enemies: [], pts: [], frame: 0,
      phase: 'playing', nextSpawnIn: 120, nextId: 1, kills: 0,
    };
  }, []);

  const tick = useCallback(() => {
    const gs = gsRef.current;
    const canvas = canvasRef.current;
    if (!gs || !canvas) return;
    const ctx = canvas.getContext('2d')!;

    const keys = keysRef.current;
    const t    = touchRef.current;
    const left  = keys.has('ArrowLeft') || keys.has('a') || keys.has('A') || t.left;
    const right = keys.has('ArrowRight') || keys.has('d') || keys.has('D') || t.right;
    const jump  = keys.has('ArrowUp') || keys.has('w') || keys.has('W') || keys.has(' ') || t.jump;
    const atk   = keys.has('z') || keys.has('Z') || keys.has('j') || keys.has('J') || t.atk;
    const satk  = keys.has('x') || keys.has('X') || keys.has('k') || keys.has('K') || t.satk;

    gs.frame++;
    const atkMult = stats.attackMult;
    const spdMult = Math.min(2.0, stats.speedMult);
    const defMult = Math.min(0.75, stats.defenseMult);

    // ── Respawn ──
    if (gs.respawnTimer > 0) {
      gs.respawnTimer--;
      if (gs.respawnTimer === 0 && gs.phase === 'playing') {
        gs.php = gs.pmaxHp; gs.px = W / 2; gs.py = GROUND_Y;
        gs.pvx = 0; gs.pvy = 0; gs.pstate = 'idle'; gs.pInv = 120;
      }
    }

    // ── Player input / physics ──
    if (gs.pstate !== 'dead' && gs.respawnTimer === 0) {
      if (gs.pTimer > 0) gs.pTimer--;
      if (gs.pAtkCd > 0) gs.pAtkCd--;
      if (gs.pInv > 0) gs.pInv--;

      if (gs.pstate === 'attack' || gs.pstate === 'strongAttack') {
        if (gs.pTimer <= 0) gs.pstate = 'idle';
      } else if (gs.pstate === 'hit') {
        if (gs.pTimer <= 0) gs.pstate = 'idle';
      } else {
        if (atk && gs.pAtkCd <= 0) {
          gs.pstate = 'attack'; gs.pTimer = 18;
          gs.pAtkCd = Math.max(10, 42 - Math.round((stats.equippedWeapon?.attackSpeedMult ?? 1) * -8));
        } else if (satk && gs.pAtkCd <= 0) {
          gs.pstate = 'strongAttack'; gs.pTimer = 28; gs.pAtkCd = 55;
        } else {
          if (left) { gs.pvx = -3.5 * spdMult; gs.pdir = -1; gs.pstate = gs.py < GROUND_Y ? 'jump' : 'walk'; }
          else if (right) { gs.pvx = 3.5 * spdMult; gs.pdir = 1; gs.pstate = gs.py < GROUND_Y ? 'jump' : 'walk'; }
          else { gs.pvx *= 0.6; if (gs.py >= GROUND_Y) gs.pstate = 'idle'; }
          if (jump && gs.py >= GROUND_Y) { gs.pvy = -11; gs.pstate = 'jump'; }
        }
      }

      gs.pvy += GRAVITY;
      gs.px += gs.pvx; gs.py += gs.pvy;
      if (gs.py >= GROUND_Y) { gs.py = GROUND_Y; gs.pvy = 0; }
      gs.px = Math.max(LEFT_B + 14, Math.min(RIGHT_B - 14, gs.px));

      // ── Player attack hitbox ──
      if (gs.pstate === 'attack' && gs.pTimer === 14) {
        const dmg = Math.round(20 * atkMult);
        const range = 52, hy = 18;
        gs.enemies.forEach(e => {
          if (e.state === 'dead') return;
          const ax = gs.px + gs.pdir * range / 2;
          if (Math.abs(e.x - ax) < range && Math.abs((e.y - FH/2) - (gs.py - FH/2)) < hy + FH) {
            e.hp -= dmg; e.flash = 8;
            e.vx = gs.pdir * 4; e.state = 'hit'; e.atkTimer = 8;
            addPts(gs.pts, e.x, e.y - FH/2, e.color, 7);
            if (e.hp <= 0) { e.state = 'dead'; addPts(gs.pts, e.x, e.y - FH/2, e.color, 14); gs.kills++; }
          }
        });
      } else if (gs.pstate === 'strongAttack' && gs.pTimer === 22) {
        const dmg = Math.round(38 * atkMult);
        const range = 68, hy = 26;
        gs.enemies.forEach(e => {
          if (e.state === 'dead') return;
          const ax = gs.px + gs.pdir * range / 2;
          if (Math.abs(e.x - ax) < range && Math.abs((e.y - FH/2) - (gs.py - FH/2)) < hy + FH) {
            e.hp -= dmg; e.flash = 10;
            e.vx = gs.pdir * 6.5; e.state = 'hit'; e.atkTimer = 10;
            addPts(gs.pts, e.x, e.y - FH/2, e.color, 12);
            if (e.hp <= 0) { e.state = 'dead'; addPts(gs.pts, e.x, e.y - FH/2, e.color, 16); gs.kills++; }
          }
        });
      }
    }

    // ── Enemies ──
    gs.enemies = gs.enemies.filter(e => !(e.state === 'dead' && e.flash <= 0));
    gs.enemies.forEach(e => {
      if (e.flash > 0) e.flash--;
      if (e.state === 'dead') return;
      if (e.state === 'hit') { e.atkTimer--; e.vx *= 0.7; e.x += e.vx; if (e.atkTimer <= 0) e.state = 'walk'; return; }
      if (e.atkCd > 0) e.atkCd--;
      const dx = gs.px - e.x;
      e.dir = dx > 0 ? 1 : -1;
      const dist = Math.abs(dx);
      if (dist < 36 && e.atkCd <= 0 && gs.pstate !== 'dead' && gs.respawnTimer === 0) {
        e.state = 'attack'; e.atkTimer = 20; e.atkCd = 80;
      } else if (e.state !== 'attack') {
        e.vx = e.dir * e.spd; e.x += e.vx; e.state = 'walk';
      }
      if (e.state === 'attack') {
        e.atkTimer--;
        if (e.atkTimer === 12 && gs.pInv <= 0 && gs.pstate !== 'dead' && gs.respawnTimer === 0) {
          const dmg = Math.round(e.dmg * (1 - defMult));
          gs.php -= dmg;
          gs.pInv = 45; gs.pstate = 'hit'; gs.pTimer = 14;
          gs.pvx = -e.dir * 3.5; gs.pvy = -3.5;
          addPts(gs.pts, gs.px, gs.py - FH/2, '#ef4444', 8);
          if (gs.php <= 0) {
            gs.php = 0; gs.stocks--;
            gs.pstate = 'dead';
            addPts(gs.pts, gs.px, gs.py, '#ef4444', 16);
            if (gs.stocks <= 0) {
              gs.phase = 'gameover';
              setScore(Math.floor(gs.frame / 60));
              setPhase('gameover');
            } else {
              gs.respawnTimer = 90;
            }
          }
        }
        if (e.atkTimer <= 0) { e.state = 'walk'; }
      }
      e.x = Math.max(LEFT_B + 14, Math.min(RIGHT_B - 14, e.x));
    });

    // ── Spawn ──
    if (gs.phase === 'playing') {
      gs.nextSpawnIn--;
      if (gs.nextSpawnIn <= 0) {
        const mins = gs.frame / 3600;
        const interval = Math.max(50, 120 - mins * 20);
        gs.nextSpawnIn = interval;
        const side = gs.enemies.filter(e => e.state !== 'dead').length % 2 === 0 ? (Math.random() < 0.5 ? 'left' : 'right') : (gs.px > W / 2 ? 'left' : 'right');
        gs.enemies.push(makeEnemy(gs.nextId++, side, gs.frame));
        if (gs.frame > 600 && Math.random() < 0.4) {
          const s2: 'left'|'right' = side === 'left' ? 'right' : 'left';
          gs.enemies.push(makeEnemy(gs.nextId++, s2, gs.frame));
        }
      }
    }

    // ── Particles ──
    gs.pts = gs.pts.filter(p => p.life > 0);
    gs.pts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life--; });

    // ── Draw ──────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H);

    // Background
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a0a1a');
    sky.addColorStop(0.6, '#0f172a');
    sky.addColorStop(1, '#1e293b');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Atmospheric particles
    ctx.save();
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 173 + gs.frame * 0.25) % W);
      const sy = ((i * 97 + 20) % (GROUND_Y - 20));
      ctx.globalAlpha = 0.06 + Math.sin(i * 0.9 + gs.frame * 0.02) * 0.04;
      ctx.fillStyle = '#60a5fa';
      ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // Ground platform
    ctx.save();
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 12;
    const grd = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    grd.addColorStop(0, '#1e3a5f');
    grd.addColorStop(1, '#0f1e35');
    ctx.fillStyle = grd;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
    ctx.restore();

    // Particles
    gs.pts.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / 40);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    });

    // Enemies (using drawFighter for consistent rendering)
    gs.enemies.forEach(e => {
      if (e.state === 'dead' && e.flash <= 0) return;
      const ef = enemyToFighter(e);
      ctx.save();
      if (e.state === 'dead') ctx.globalAlpha = 0.3;
      drawFighter(ctx, ef, gs.frame);
      ctx.restore();
      // HP bar above head
      if (e.state !== 'dead' && e.hp < e.maxHp) {
        const barY = e.y - FH - 12;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath(); ctx.roundRect(e.x - 22, barY - 2, 44, 7, 3); ctx.fill();
        ctx.fillStyle = e.hp / e.maxHp > 0.5 ? '#22c55e' : e.hp / e.maxHp > 0.25 ? '#f59e0b' : '#ef4444';
        ctx.beginPath(); ctx.roundRect(e.x - 22, barY - 2, 44 * (e.hp / e.maxHp), 7, 3); ctx.fill();
      }
    });

    // Player
    if (gs.respawnTimer === 0) {
      const pf = gsToFighter(gs, stats);
      if (bossId) {
        if (gs.pstate !== 'dead') {
          drawPlayerAsBoss(ctx, pf, gs.frame, bossId, 'pistol');
        }
      } else {
        if (gs.pstate !== 'dead') {
          drawFighter(ctx, pf, gs.frame);
        }
      }
    }

    // Respawn countdown
    if (gs.respawnTimer > 0 && gs.stocks > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath(); ctx.roundRect(gs.px - 38, GROUND_Y - 50, 76, 34, 8); ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 8;
      ctx.fillText(`復活 ${(gs.respawnTimer/60).toFixed(1)}s`, gs.px, GROUND_Y - 27);
      ctx.restore();
    }

    // ── Canvas HUD (HP bar + stocks + timer) drawn every frame ──
    const hudBarW = 180, hudBarH = 12, hudX = 14, hudY = 14;
    // HP background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(hudX, hudY, hudBarW, hudBarH, 4); ctx.fill();
    // HP fill
    const hpRatio = Math.max(0, gs.php / gs.pmaxHp);
    ctx.fillStyle = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
    if (hpRatio > 0) { ctx.beginPath(); ctx.roundRect(hudX, hudY, hudBarW * hpRatio, hudBarH, 4); ctx.fill(); }
    // HP label
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`HP ${gs.php}/${gs.pmaxHp}`, hudX, hudY - 2);
    // Stocks
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px monospace';
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < gs.stocks ? '#ef4444' : 'rgba(255,255,255,0.15)';
      ctx.fillText('♥', hudX + i * 18, hudY + hudBarH + 16);
    }
    // Timer + kills
    const elapsed = Math.floor(gs.frame / 60);
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'right';
    ctx.fillText(`⏱ ${elapsed}s  💀${gs.kills}`, W - 14, hudY + 10);

    // ── Sync HUD React state every 4 frames ──
    if (gs.frame % 4 === 0) {
      setHudHp(gs.php);
      setHudMaxHp(gs.pmaxHp);
      setHudStocks(gs.stocks);
      setHudKills(gs.kills);
      setHudTime(Math.floor(gs.frame / 60));
    }

    if (gs.phase === 'playing') rafRef.current = requestAnimationFrame(tick);
  }, [stats, bossId, setHudHp, setHudMaxHp, setHudStocks, setHudKills, setHudTime]);

  const startGame = useCallback(() => {
    const newGs = initGS();
    gsRef.current = newGs;
    setPhase('playing');
    setSubmitted(false);
    setSubmitErr('');
    setHudHp(newGs.pmaxHp);
    setHudMaxHp(newGs.pmaxHp);
    setHudStocks(newGs.stocks);
    setHudKills(0);
    setHudTime(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [initGS, tick, setHudHp, setHudMaxHp, setHudStocks, setHudKills, setHudTime]);

  useEffect(() => {
    if (phase !== 'playing') return;
    const onKey = (e: KeyboardEvent) => { keysRef.current.add(e.key); e.preventDefault(); };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [phase]);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  const submitScore = async () => {
    setSubmitting(true);
    try {
      // 静的モード: 端末内に保存 / サーバー設定時: API へ送信（lib/eventService.ts）
      await submitEventScore('survival', score, weapon?.nameJa ?? null, armor?.nameJa ?? null);
      setSubmitted(true);
    } catch {
      setSubmitErr('送信に失敗しました。再試行してください。');
    } finally {
      setSubmitting(false);
    }
  };

  const gs = gsRef.current;
  const hpPct = Math.max(0, hudHp / hudMaxHp * 100);

  // ── Pre-game screen ──────────────────────────────────────────────
  if (phase === 'pre') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 select-none">
        <div className="w-full max-w-md">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm mb-4">← 戻る</button>
          <h1 className="text-3xl font-black text-white mb-1">⏱ エンドレスサバイバル</h1>
          <p className="text-gray-400 text-sm mb-4">無限に押し寄せる敵を倒し続け、生存時間（秒）を競う</p>

          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 mb-4 space-y-2 text-sm">
            <div className="font-bold text-yellow-400 mb-2">📋 ルール</div>
            <div className="text-gray-300">• ストック 3（ゼロになったら終了）</div>
            <div className="text-gray-300">• 敵は時間経過で強くなる</div>
            <div className="text-red-400 font-bold">• 弓武器・ボスキャラ使用禁止</div>
            <div className="text-gray-300">• 操作: 矢印/WASD移動 ・ Z攻撃 ・ X強攻撃</div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 mb-4">
            <div className="font-bold text-gray-300 mb-2 text-sm">現在の装備</div>
            <div className="flex gap-3 flex-wrap">
              {weapon ? (
                <div className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border ${isBow ? 'bg-red-950 border-red-700 text-red-300' : 'bg-gray-800 border-gray-600 text-amber-300'}`}>
                  <span>{weapon.emoji}</span><span>{weapon.nameJa}</span>
                  {isBow && <span className="text-red-400 font-bold">⛔ 禁止</span>}
                </div>
              ) : <span className="text-gray-500 text-sm">武器なし</span>}
              {armor ? (
                <div className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border bg-gray-800 border-gray-600 text-cyan-300">
                  <span>{armor.emoji}</span><span>{armor.nameJa}</span>
                </div>
              ) : <span className="text-gray-500 text-sm">防具なし</span>}
            </div>
            {isBossChar && (
              <div className="mt-2 text-red-400 text-sm font-bold">⛔ ボスキャラは使用禁止です。キャラ選択でデフォルトか通常キャラを選んでください。</div>
            )}
          </div>

          {canPlay ? (
            <button onClick={startGame}
              className="w-full bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white font-black text-xl py-4 rounded-2xl transition-all active:scale-95 shadow-lg">
              ⚔ 挑戦開始
            </button>
          ) : (
            <div className="w-full bg-gray-800 text-gray-500 font-black text-xl py-4 rounded-2xl text-center">
              装備を変更してください
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Game over screen ──────────────────────────────────────────────
  if (phase === 'gameover') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 select-none">
        <div className="w-full max-w-md text-center">
          <div className="text-6xl mb-3">💀</div>
          <h2 className="text-3xl font-black text-white mb-1">ゲームオーバー</h2>
          <div className="text-5xl font-black text-yellow-400 mb-1">{score}<span className="text-2xl text-yellow-300"> 秒</span></div>
          <div className="text-gray-400 text-sm mb-4">{gs?.kills ?? 0} 体撃破</div>

          <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 mb-4 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>武器</span><span className="text-amber-300">{weapon?.nameJa ?? 'なし'}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>防具</span><span className="text-cyan-300">{armor?.nameJa ?? 'なし'}</span>
            </div>
          </div>

          {!submitted ? (
            <button onClick={submitScore} disabled={submitting}
              className={`w-full font-black text-lg py-3.5 rounded-2xl mb-3 transition-all active:scale-95 ${submitting ? 'bg-gray-700 text-gray-400' : 'bg-gradient-to-r from-green-700 to-emerald-700 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg'}`}>
              {submitting ? (FEATURES.rankings ? '送信中...' : '保存中...') : (FEATURES.rankings ? '📊 スコアを登録' : '📊 記録を保存')}
            </button>
          ) : (
            <div className="w-full bg-green-900/40 border border-green-700 text-green-300 font-bold text-lg py-3.5 rounded-2xl mb-3 text-center">
              ✅ {FEATURES.rankings ? '登録完了！' : '記録を保存しました！'}
            </div>
          )}
          {submitErr && <p className="text-red-400 text-sm mb-3">{submitErr}</p>}
          <div className="flex gap-3">
            <button onClick={startGame}
              className="flex-1 bg-blue-800 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all active:scale-95">
              🔄 もう一度
            </button>
            <button onClick={onBack}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-3 rounded-xl transition-all active:scale-95">
              ← 戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Playing ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center select-none">
      {/* HUD — HP/stocks/timer are drawn inside the canvas; React shows a minimal bar */}
      <div className="w-full max-w-3xl px-3 mb-1.5 flex items-center justify-between">
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={`text-lg ${i < hudStocks ? 'text-red-500' : 'text-gray-700'}`}>♥</span>
          ))}
        </div>
        <span className="text-white font-black text-xl">⏱ {hudTime}<span className="text-gray-400 text-sm ml-1">秒</span></span>
        <span className="text-gray-400 text-sm">{hudKills}体</span>
      </div>

      {/* Canvas */}
      <div className="w-full max-w-3xl px-2">
        <canvas ref={canvasRef} width={W} height={H}
          className="w-full rounded-2xl border border-blue-900/50"
          style={{ imageRendering: 'pixelated', aspectRatio: `${W}/${H}`, boxShadow: '0 0 30px #1d4ed822' }} />
      </div>

      {/* Mobile controls */}
      <div className="mt-3 w-full max-w-3xl px-3 flex justify-between items-end">
        <div className="flex gap-2">
          <button
            onPointerDown={() => { touchRef.current.left = true; }} onPointerUp={() => { touchRef.current.left = false; }} onPointerLeave={() => { touchRef.current.left = false; }}
            className="w-14 h-14 bg-gray-800 border border-gray-600 rounded-xl text-white text-2xl flex items-center justify-center active:bg-gray-600">◀</button>
          <button
            onPointerDown={() => { touchRef.current.right = true; }} onPointerUp={() => { touchRef.current.right = false; }} onPointerLeave={() => { touchRef.current.right = false; }}
            className="w-14 h-14 bg-gray-800 border border-gray-600 rounded-xl text-white text-2xl flex items-center justify-center active:bg-gray-600">▶</button>
        </div>
        <div className="flex gap-2">
          <button
            onPointerDown={() => { touchRef.current.jump = true; }} onPointerUp={() => { touchRef.current.jump = false; }} onPointerLeave={() => { touchRef.current.jump = false; }}
            className="w-14 h-14 bg-blue-900 border border-blue-700 rounded-xl text-white font-black text-lg flex items-center justify-center active:bg-blue-700">▲</button>
          <button
            onPointerDown={() => { touchRef.current.atk = true; }} onPointerUp={() => { touchRef.current.atk = false; }} onPointerLeave={() => { touchRef.current.atk = false; }}
            className="w-14 h-14 bg-red-900 border border-red-700 rounded-xl text-white font-black text-lg flex items-center justify-center active:bg-red-700">Z</button>
          <button
            onPointerDown={() => { touchRef.current.satk = true; }} onPointerUp={() => { touchRef.current.satk = false; }} onPointerLeave={() => { touchRef.current.satk = false; }}
            className="w-14 h-14 bg-orange-900 border border-orange-700 rounded-xl text-white font-black text-lg flex items-center justify-center active:bg-orange-700">X</button>
        </div>
      </div>
    </div>
  );
}
