import { useEffect, useRef, useState, useCallback } from 'react';
import { FEATURES } from '@/lib/backend';
import { submitEventScore } from '@/lib/eventService';
import { drawFighter, type Fighter, type FighterState } from '@/lib/gameEngine';

interface Props { onBack: () => void; }

// ── Canvas & Perspective constants ───────────────────────────────────────────
const W = 800, H = 430;
const VP_X = W / 2;          // vanishing point X
const VP_Y = 118;             // vanishing point Y (horizon)
const NEAR_Y = H - 32;       // player stands here (z=0)
const NEAR_LANE_OFF = 192;    // lane center offset from canvas center at near
const NEAR_ROAD_HALF = 285;   // road half-width at near
const DEPTH = 920;            // z-depth: enemies spawn here, player at z=0

// Lane center X at near (z=0)
const LANE_XS = [W / 2 - NEAR_LANE_OFF, W / 2, W / 2 + NEAR_LANE_OFF] as const;

/** Project world (z, lane) → canvas {x, y, scale} */
function proj(z: number, lane: 0 | 1 | 2) {
  const t = Math.min(0.995, z / DEPTH);
  const lx = LANE_XS[lane];
  return {
    x: lx + (VP_X - lx) * t,
    y: NEAR_Y + (VP_Y - NEAR_Y) * t,
    scale: Math.max(0.04, 1 - t * 0.92),
  };
}

// ── Gate modifier pool ───────────────────────────────────────────────────────
const MODS_POS = [
  { label: '+1',  color: '#86efac', bg: '#14532d', fn: (s: number) => s + 1 },
  { label: '+3',  color: '#4ade80', bg: '#166534', fn: (s: number) => s + 3 },
  { label: '+5',  color: '#22c55e', bg: '#15803d', fn: (s: number) => s + 5 },
  { label: '+10', color: '#16a34a', bg: '#14532d', fn: (s: number) => s + 10 },
  { label: '+20', color: '#15803d', bg: '#052e16', fn: (s: number) => s + 20 },
  { label: '×2',  color: '#fbbf24', bg: '#78350f', fn: (s: number) => s * 2 },
  { label: '×3',  color: '#f59e0b', bg: '#451a03', fn: (s: number) => s * 3 },
];
const MODS_NEG = [
  { label: '-1',  color: '#fca5a5', bg: '#450a0a', fn: (s: number) => Math.max(1, s - 1) },
  { label: '-3',  color: '#f87171', bg: '#450a0a', fn: (s: number) => Math.max(1, s - 3) },
  { label: '-5',  color: '#ef4444', bg: '#450a0a', fn: (s: number) => Math.max(1, s - 5) },
  { label: '÷2',  color: '#dc2626', bg: '#450a0a', fn: (s: number) => Math.max(1, Math.floor(s / 2)) },
];
type Mod = typeof MODS_POS[0];
const pick = (pos: boolean): Mod => {
  const p = pos ? MODS_POS : MODS_NEG;
  return p[Math.floor(Math.random() * p.length)];
};

// ── Types ────────────────────────────────────────────────────────────────────
interface Bullet { id: number; lane: 0|1|2; z: number; }
interface Enemy  { id: number; lane: 0|1|2; z: number; hp: number; maxHp: number; spd: number; flash: number; color: string; isBoss: boolean; state: 'walk'|'hit'|'dead'; }
interface Gate   { id: number; z: number; mods: [Mod, Mod, Mod]; passed: boolean; }
interface Pt     { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }

interface GS {
  lane: 0|1|2;         // current committed lane
  targetLane: 0|1|2;   // destination lane
  laneT: number;        // 0→1 animation progress
  laneAnim: boolean;
  soldiers: number;
  bullets: Bullet[];
  enemies: Enemy[];
  gates: Gate[];
  pts: Pt[];
  frame: number;
  distance: number;     // meters
  speed: number;        // z units / frame that enemies approach
  fireCd: number;
  nextId: number;
  nextEnemy: number;
  nextGate: number;
  nextBoss: number;
  phase: 'playing' | 'gameover';
  bossKills: number;
}

// ── Fighter adapter ──────────────────────────────────────────────────────────
const BLANK: Omit<Fighter,
  'pos'|'vel'|'dir'|'damage'|'stocks'|'onGround'|'jumpsLeft'|'maxJumps'|
  'state'|'stateTimer'|'attackActive'|'invincible'|'color'|
  'attackMult'|'defenseMult'|'speedMult'|'jumpMult'|'berserker'|
  'specialCooldown'|'maxSPCooldown'|'multiHitTimer'|
  'weapon'|'armor'|'botAI'|'botBehav'|'botDecisionTimer'|'botJumpCooldown'
> = {
  bowFired: false, bleedDamage: 0, bleedTicks: 0, bleedTickTimer: 0,
  guardGauge: 100, maxGuardGauge: 100, counterCooldown: 0, botGuardTimer: 0,
  stunTimer: 0, divineHitCount: 0, primordialRageStacks: 0, primordialComboCount: 0,
};

function mkFighter(x: number, y: number, state: FighterState, color: string, frame: number, dir: -1|1 = 1, atk = false): Fighter {
  return {
    ...BLANK,
    pos: { x, y }, vel: { x: 0, y: 0 }, dir,
    damage: 0, stocks: 1, onGround: true, jumpsLeft: 0, maxJumps: 1,
    state, stateTimer: frame % 32, attackActive: atk, invincible: 0, color,
    botAI: false, botBehav: 'approach', botDecisionTimer: 0, botJumpCooldown: 0,
    attackMult: 1, defenseMult: 0, speedMult: 1, jumpMult: 1, berserker: false,
    specialCooldown: 0, maxSPCooldown: 200, multiHitTimer: 0, weapon: null, armor: null,
  };
}

function addPts(pts: Pt[], x: number, y: number, color: string, n = 8) {
  for (let i = 0; i < n; i++)
    pts.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4 - 1, life: 22 + Math.random() * 14, color, size: 2 + Math.random() * 3 });
}

// ── Component ────────────────────────────────────────────────────────────────
export default function GunnerMasterPage({ onBack }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const gsRef       = useRef<GS | null>(null);
  const rafRef      = useRef<number>(0);
  const lkRef       = useRef({ left: false, right: false }); // current key state
  const prevLkRef   = useRef({ left: false, right: false }); // previous frame key state

  const [phase,      setPhase]      = useState<'pre' | 'playing' | 'gameover'>('pre');
  const [finalDist,  setFinalDist]  = useState(0);
  const [hudSol,     setHudSol]     = useState(5);
  const [hudDist,    setHudDist]    = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [submitErr,  setSubmitErr]  = useState('');

  const initGS = useCallback((): GS => ({
    lane: 1, targetLane: 1, laneT: 1, laneAnim: false,
    soldiers: 5,
    bullets: [], enemies: [], gates: [], pts: [],
    frame: 0, distance: 0, speed: 5.0,
    fireCd: 0, nextId: 1,
    nextEnemy: 75, nextGate: 360, nextBoss: 1800,
    phase: 'playing', bossKills: 0,
  }), []);

  const startGame = useCallback(() => {
    gsRef.current = initGS();
    setPhase('playing');
    setSubmitted(false);
    setSubmitErr('');
  }, [initGS]);

  const changeLane = useCallback((dir: -1 | 1) => {
    const gs = gsRef.current;
    if (!gs || gs.laneAnim) return;
    const nl = Math.max(0, Math.min(2, gs.lane + dir)) as 0|1|2;
    if (nl === gs.lane) return;
    gs.targetLane = nl;
    gs.laneAnim = true;
    gs.laneT = 0;
  }, []);

  const tick = useCallback(() => {
    const gs = gsRef.current;
    const canvas = canvasRef.current;
    if (!gs || !canvas || gs.phase === 'gameover') return;
    const ctx = canvas.getContext('2d')!;

    gs.frame++;

    // ── Input: detect key press edges ──────────────────────────────────────
    const lk = lkRef.current, pk = prevLkRef.current;
    if (lk.left  && !pk.left)  changeLane(-1);
    if (lk.right && !pk.right) changeLane(1);
    prevLkRef.current = { ...lk };

    // ── Lane animation ─────────────────────────────────────────────────────
    if (gs.laneAnim) {
      gs.laneT = Math.min(1, gs.laneT + 0.13);
      if (gs.laneT >= 1) { gs.lane = gs.targetLane; gs.laneAnim = false; }
    }

    // ── Distance / speed ramp ──────────────────────────────────────────────
    gs.distance += gs.speed * 0.055;
    gs.speed = Math.min(9, 5.0 + gs.distance * 0.00018);

    // ── Spawn enemies ──────────────────────────────────────────────────────
    gs.nextEnemy--;
    if (gs.nextEnemy <= 0) {
      const mins = gs.distance / 700;
      const lane = Math.floor(Math.random() * 3) as 0|1|2;
      const hp   = Math.round(40 + mins * 55 + gs.bossKills * 25);
      const spd  = Math.min(5, 1.8 + mins * 0.45);
      const COLS = ['#ef4444', '#f97316', '#eab308', '#ec4899', '#6366f1'];
      gs.enemies.push({
        id: gs.nextId++, lane, z: DEPTH - 15,
        hp, maxHp: hp, spd, flash: 0,
        color: COLS[Math.floor(Math.random() * COLS.length)],
        isBoss: false, state: 'walk',
      });
      const gap = Math.max(32, 100 - gs.distance * 0.022);
      gs.nextEnemy = Math.round(gap * (0.7 + Math.random() * 0.6));
    }

    // ── Spawn boss ─────────────────────────────────────────────────────────
    gs.nextBoss--;
    if (gs.nextBoss <= 0) {
      const mult = 1 + gs.bossKills * 0.75;
      gs.enemies.push({
        id: gs.nextId++, lane: 1, z: DEPTH - 15,
        hp: Math.round(420 * mult), maxHp: Math.round(420 * mult),
        spd: 1.2, flash: 0, color: '#7c3aed',
        isBoss: true, state: 'walk',
      });
      gs.nextBoss = 2200 + gs.bossKills * 550;
    }

    // ── Spawn gate ─────────────────────────────────────────────────────────
    gs.nextGate--;
    if (gs.nextGate <= 0 && gs.gates.length === 0) {
      // Guarantee at least one positive modifier
      const posLane = Math.floor(Math.random() * 3) as 0|1|2;
      const mods: [Mod, Mod, Mod] = [
        pick(0 === posLane || Math.random() < 0.45),
        pick(1 === posLane || Math.random() < 0.45),
        pick(2 === posLane || Math.random() < 0.45),
      ];
      gs.gates.push({ id: gs.nextId++, z: DEPTH - 20, mods, passed: false });
      gs.nextGate = Math.round(400 + Math.random() * 380);
    }

    // ── Auto-fire ──────────────────────────────────────────────────────────
    gs.fireCd--;
    if (gs.fireCd <= 0) {
      const shots = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(gs.soldiers * 0.9))));
      const cLane = (gs.laneAnim ? gs.targetLane : gs.lane) as 0|1|2;
      for (let s = 0; s < shots; s++) {
        // Spread bullets across nearby lanes for multi-soldier
        const offset = s === 0 ? 0 : (s % 2 === 0 ? -1 : 1);
        const bl = Math.max(0, Math.min(2, cLane + offset)) as 0|1|2;
        gs.bullets.push({ id: gs.nextId++, lane: bl, z: 10 });
      }
      gs.fireCd = Math.max(7, 25 - Math.floor(Math.sqrt(gs.soldiers) * 2.3));
    }

    // ── Update bullets ─────────────────────────────────────────────────────
    const BSPD = 25 + gs.speed;
    for (let i = gs.bullets.length - 1; i >= 0; i--) {
      const b = gs.bullets[i];
      b.z += BSPD;
      if (b.z >= DEPTH) { gs.bullets.splice(i, 1); continue; }
      let hit = false;
      for (const e of gs.enemies) {
        if (e.state === 'dead') continue;
        const laneDiff = Math.abs(b.lane - e.lane);
        if (Math.abs(b.z - e.z) < 20 && (laneDiff === 0 || (e.isBoss && laneDiff <= 1))) {
          const dmg = 1 + Math.floor(gs.soldiers * 0.18);
          e.hp -= dmg;
          e.flash = 6; e.state = 'hit';
          const p = proj(e.z, e.lane);
          addPts(gs.pts, p.x, p.y, e.isBoss ? '#a78bfa' : '#fbbf24', 4);
          if (e.hp <= 0) {
            e.state = 'dead';
            if (e.isBoss) gs.bossKills++;
            addPts(gs.pts, p.x, p.y, e.color, 14);
          }
          hit = true; break;
        }
      }
      if (hit) gs.bullets.splice(i, 1);
    }

    // ── Update enemies ─────────────────────────────────────────────────────
    for (let i = gs.enemies.length - 1; i >= 0; i--) {
      const e = gs.enemies[i];
      if (e.state === 'dead') { gs.enemies.splice(i, 1); continue; }
      if (e.flash > 0) e.flash--;
      if (e.state === 'hit' && e.flash <= 0) e.state = 'walk';
      e.z -= gs.speed + e.spd;

      if (e.z <= 0) {
        // Hit the player's squad
        const curLane = gs.laneAnim ? gs.targetLane : gs.lane;
        const inLane = e.lane === curLane || (e.isBoss && Math.abs(e.lane - curLane) <= 1);
        if (inLane) {
          const loss = e.isBoss
            ? Math.ceil(gs.soldiers * 0.42)
            : Math.max(1, Math.ceil(gs.soldiers * 0.14));
          gs.soldiers = Math.max(0, gs.soldiers - loss);
          addPts(gs.pts, LANE_XS[curLane], NEAR_Y - 30, '#ef4444', 14);
          if (gs.soldiers <= 0) {
            gs.phase = 'gameover';
            setFinalDist(Math.floor(gs.distance));
            setPhase('gameover');
            return;
          }
        }
        gs.enemies.splice(i, 1);
        continue;
      }
    }

    // ── Update gates ───────────────────────────────────────────────────────
    for (let i = gs.gates.length - 1; i >= 0; i--) {
      const g = gs.gates[i];
      g.z -= gs.speed;
      if (!g.passed && g.z <= 0) {
        const curLane = gs.laneAnim ? gs.targetLane : gs.lane;
        const mod = g.mods[curLane];
        gs.soldiers = Math.min(9999, mod.fn(gs.soldiers));
        const p = proj(0, curLane);
        addPts(gs.pts, p.x, p.y, mod.color, 14);
        g.passed = true;
      }
      if (g.z < -300) gs.gates.splice(i, 1);
    }

    // ── Update particles ───────────────────────────────────────────────────
    for (let i = gs.pts.length - 1; i >= 0; i--) {
      const p = gs.pts[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--;
      if (p.life <= 0) gs.pts.splice(i, 1);
    }

    if (gs.frame % 4 === 0) { setHudSol(gs.soldiers); setHudDist(Math.floor(gs.distance)); }

    // ── Draw scene ────────────────────────────────────────────────────────
    drawScene(ctx, gs);
    rafRef.current = requestAnimationFrame(tick);
  }, [changeLane]);

  // ── Draw function ─────────────────────────────────────────────────────────
  function drawScene(ctx: CanvasRenderingContext2D, gs: GS) {
    // Sky background
    const sky = ctx.createLinearGradient(0, 0, 0, VP_Y + 30);
    sky.addColorStop(0, '#030310');
    sky.addColorStop(1, '#0a1530');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Ground background
    const gnd = ctx.createLinearGradient(0, VP_Y, 0, H);
    gnd.addColorStop(0, '#08111e');
    gnd.addColorStop(1, '#152540');
    ctx.fillStyle = gnd;
    ctx.fillRect(0, VP_Y, W, H - VP_Y);

    // Stars
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 32; i++) {
      const sx = (i * 131.5 + gs.frame * 0.08) % W;
      const sy = 4 + (i * 47 % (VP_Y - 10));
      ctx.fillRect(sx, sy, 1.2, 1.2);
    }
    // Horizon glow
    ctx.save();
    const hgl = ctx.createRadialGradient(VP_X, VP_Y, 0, VP_X, VP_Y, 120);
    hgl.addColorStop(0, 'rgba(29,78,216,0.35)');
    hgl.addColorStop(1, 'rgba(29,78,216,0)');
    ctx.fillStyle = hgl;
    ctx.fillRect(VP_X - 120, VP_Y - 40, 240, 80);
    ctx.restore();

    // ── Road trapezoid ──────────────────────────────────────────────────────
    const roadFill = ctx.createLinearGradient(0, VP_Y, 0, H);
    roadFill.addColorStop(0, '#0b1830');
    roadFill.addColorStop(0.5, '#0f2040');
    roadFill.addColorStop(1, '#1a2d50');
    ctx.fillStyle = roadFill;
    ctx.beginPath();
    ctx.moveTo(VP_X - 3, VP_Y);
    ctx.lineTo(VP_X + 3, VP_Y);
    ctx.lineTo(W / 2 + NEAR_ROAD_HALF, H);
    ctx.lineTo(W / 2 - NEAR_ROAD_HALF, H);
    ctx.closePath();
    ctx.fill();

    // Road edges
    ctx.strokeStyle = 'rgba(59,130,246,0.7)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(VP_X, VP_Y); ctx.lineTo(W / 2 - NEAR_ROAD_HALF, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(VP_X, VP_Y); ctx.lineTo(W / 2 + NEAR_ROAD_HALF, H); ctx.stroke();

    // Lane dividers (scrolling dashes)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 16]);
    ctx.lineDashOffset = -(gs.frame * gs.speed * 0.22) % 26;
    ctx.beginPath(); ctx.moveTo(VP_X, VP_Y); ctx.lineTo(W / 2 - NEAR_LANE_OFF, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(VP_X, VP_Y); ctx.lineTo(W / 2 + NEAR_LANE_OFF, H); ctx.stroke();
    ctx.setLineDash([]);

    // ── Sort & draw depth objects (far → near) ─────────────────────────────
    type DrawObj =
      | { kind: 'gate';   z: number; g: Gate }
      | { kind: 'enemy';  z: number; e: Enemy }
      | { kind: 'bullet'; z: number; b: Bullet };

    const objs: DrawObj[] = [];
    for (const g of gs.gates)   if (!g.passed && g.z > -50)           objs.push({ kind: 'gate',   z: g.z, g });
    for (const e of gs.enemies) if (e.state !== 'dead' && e.z > 0)    objs.push({ kind: 'enemy',  z: e.z, e });
    for (const b of gs.bullets)                                         objs.push({ kind: 'bullet', z: b.z, b });
    objs.sort((a, b) => b.z - a.z); // back to front

    for (const obj of objs) {
      if (obj.kind === 'gate') {
        const { g } = obj;
        const alpha = Math.min(1, (DEPTH - g.z) / 250);
        ctx.globalAlpha = alpha;
        for (let l = 0; l < 3; l++) {
          const mod = g.mods[l];
          const p = proj(g.z, l as 0|1|2);
          const aw = 126 * p.scale;
          const ah = 130 * p.scale;

          // Arch background
          ctx.fillStyle = mod.bg;
          ctx.strokeStyle = mod.color;
          ctx.lineWidth = 2.5 * p.scale;
          ctx.beginPath();
          ctx.roundRect(p.x - aw / 2, p.y - ah, aw, ah, 7 * p.scale);
          ctx.fill();
          ctx.stroke();

          // Label
          const fs = Math.max(8, 30 * p.scale);
          ctx.font = `bold ${fs}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillStyle = mod.color;
          ctx.fillText(mod.label, p.x, p.y - ah * 0.44);

          // Ground shadow
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 2 * p.scale, aw * 0.42, 4 * p.scale, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

      } else if (obj.kind === 'enemy') {
        const { e } = obj;
        const p = proj(e.z, e.lane);
        const sc = e.isBoss ? p.scale * 1.75 : p.scale;
        const eColor = e.flash > 0 ? '#ffffff' : e.color;
        const fState: FighterState = e.state === 'walk' ? 'walk' : 'hit';

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(sc, sc);
        drawFighter(ctx, mkFighter(0, 0, fState, eColor, gs.frame, -1), gs.frame);
        ctx.restore();

        // Boss label
        if (e.isBoss) {
          ctx.font = `bold ${Math.max(8, 11 * p.scale)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#a78bfa';
          ctx.fillText('BOSS', p.x, p.y - 92 * p.scale);
        }

        // HP bar
        if (p.scale > 0.2) {
          const bw = (e.isBoss ? 58 : 38) * p.scale;
          const bh = (e.isBoss ? 6 : 4) * p.scale;
          const bx = p.x - bw / 2;
          const by = p.y - (e.isBoss ? 105 : 70) * p.scale;
          const pct = Math.max(0, e.hp / e.maxHp);
          ctx.fillStyle = '#1f2937'; ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = e.isBoss ? '#a78bfa' : (pct > 0.5 ? '#22c55e' : pct > 0.25 ? '#f59e0b' : '#ef4444');
          ctx.fillRect(bx, by, bw * pct, bh);
        }

      } else {
        // bullet
        const { b } = obj;
        const p = proj(b.z, b.lane);
        const r = Math.max(1.5, 5.5 * p.scale);
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - 36 * p.scale, r * 1.4, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        // trail
        const tp = proj(Math.max(0, b.z - 40), b.lane);
        ctx.strokeStyle = 'rgba(253,230,138,0.22)';
        ctx.lineWidth = r;
        ctx.beginPath();
        ctx.moveTo(tp.x, tp.y - 36 * tp.scale);
        ctx.lineTo(p.x, p.y - 36 * p.scale);
        ctx.stroke();
      }
    }

    // ── Player squad ────────────────────────────────────────────────────────
    const curX = gs.laneAnim
      ? LANE_XS[gs.lane] + (LANE_XS[gs.targetLane] - LANE_XS[gs.lane]) * gs.laneT
      : LANE_XS[gs.lane];

    const drawN = Math.min(7, gs.soldiers);
    for (let i = drawN - 1; i >= 0; i--) {
      const sx = curX + (i - (drawN - 1) / 2) * 16;
      const col = i === 0 ? '#22d3ee' : `hsl(${190 + i * 14}, 75%, 62%)`;
      const st: FighterState = (i === 0 && gs.fireCd <= 3) ? 'attack' : 'walk';
      drawFighter(ctx, mkFighter(sx, NEAR_Y, st, col, gs.frame + i * 9, 1, st === 'attack'), gs.frame + i * 9);
    }
    // Overflow label
    if (gs.soldiers > 7) {
      ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`+${gs.soldiers - 7}`, curX, NEAR_Y - 60);
    }
    // Count badge
    ctx.font = 'bold 21px monospace';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#0c4a6e'; ctx.lineWidth = 4;
    ctx.strokeText(`${gs.soldiers}`, curX, NEAR_Y - 78);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${gs.soldiers}`, curX, NEAR_Y - 78);

    // Muzzle flash
    if (gs.fireCd <= 2) {
      ctx.fillStyle = 'rgba(253,230,138,0.5)';
      ctx.beginPath(); ctx.arc(curX, NEAR_Y - 40, 13, 0, Math.PI * 2); ctx.fill();
    }

    // ── Lane indicator dots ─────────────────────────────────────────────────
    const curLane = gs.laneAnim ? gs.targetLane : gs.lane;
    for (let l = 0; l < 3; l++) {
      ctx.fillStyle = l === curLane ? '#38bdf8' : 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.arc(LANE_XS[l], H - 10, 6, 0, Math.PI * 2); ctx.fill();
    }

    // ── Particles ───────────────────────────────────────────────────────────
    for (const p of gs.pts) {
      ctx.globalAlpha = Math.max(0, p.life / 28);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Gate approach hint ──────────────────────────────────────────────────
    const ng = gs.gates.find(g => !g.passed && g.z < 450);
    if (ng) {
      const m = ng.mods[curLane];
      ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(`← / → でレーン切り替え  現在: ${m.label}`, W / 2, VP_Y + 20);
    }
  }

  // ── RAF ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, tick]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const dn = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') lkRef.current.left  = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') lkRef.current.right = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') lkRef.current.left  = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') lkRef.current.right = false;
    };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [phase]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Canvas tap ────────────────────────────────────────────────────────────
  const handleTap = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = 'touches' in e
      ? (e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0)
      : e.clientX;
    const relX = (cx - rect.left) / rect.width * W;
    if (relX < W / 3)      changeLane(-1);
    else if (relX > W * 2 / 3) changeLane(1);
  }, [changeLane]);

  // ── Score submit ──────────────────────────────────────────────────────────
  const submitScore = async () => {
    setSubmitting(true);
    try {
      // 静的モード: 端末内に保存 / サーバー設定時: API へ送信（lib/eventService.ts）
      await submitEventScore('gunner-master', finalDist, null, null);
      setSubmitted(true);
    } catch { setSubmitErr('送信に失敗しました。再試行してください。'); }
    finally { setSubmitting(false); }
  };

  // ── Pre screen ────────────────────────────────────────────────────────────
  if (phase === 'pre') return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 select-none"
         style={{ background: 'linear-gradient(to bottom, #030310, #0a1220)' }}>
      <div className="w-full max-w-md">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm mb-4">← 戻る</button>
        <h1 className="text-3xl font-black text-white mb-1">🔫 ガンナーマスター</h1>
        <p className="text-gray-400 text-sm mb-4">3レーンを進みながらゲートで兵力を増強し、ボスを撃破せよ</p>
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 mb-4 space-y-2 text-sm">
          <div className="font-bold text-yellow-400 mb-2">📋 ルール</div>
          <div className="text-gray-300">• 3レーンを前進 ── 矢印キー or 左右タップで移動</div>
          <div className="text-gray-300">• ゲートを通過すると人数が増減する</div>
          <div className="text-cyan-400 font-bold">• +5・×2 → 増加 ／ -5・÷2 → 減少</div>
          <div className="text-gray-300">• 敵と同レーンで接触すると兵士が減る（ボスは大打撃）</div>
          <div className="text-gray-300">• 兵士ゼロでゲームオーバー</div>
          <div className="text-purple-400 font-bold">• 距離（m）でランキングを競う ／ バフ・装備の影響なし</div>
        </div>
        <button onClick={startGame}
          className="w-full font-black text-xl py-4 rounded-2xl text-white transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)' }}>
          🔫 挑戦開始
        </button>
      </div>
    </div>
  );

  // ── Gameover screen ───────────────────────────────────────────────────────
  if (phase === 'gameover') return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 select-none"
         style={{ background: 'linear-gradient(to bottom, #030310, #0a1220)' }}>
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-3">💥</div>
        <h2 className="text-3xl font-black text-white mb-1">全滅</h2>
        <p className="text-gray-400 text-sm mb-5">兵士がすべて倒れた</p>
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 mb-5">
          <div className="text-xs text-gray-500 mb-1">最終距離</div>
          <div className="text-5xl font-black text-cyan-400">
            {finalDist.toLocaleString()}
            <span className="text-xl text-gray-400 ml-1">m</span>
          </div>
        </div>
        {!submitted ? (
          <div className="space-y-3">
            <button onClick={submitScore} disabled={submitting}
              className="w-full font-black text-base py-3 rounded-2xl text-white disabled:opacity-50 transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #1d4ed8, #7c3aed)' }}>
              {submitting ? (FEATURES.rankings ? '送信中...' : '保存中...') : (FEATURES.rankings ? '🏅 スコアを送信' : '🏅 記録を保存')}
            </button>
            {submitErr && <p className="text-red-400 text-sm">{submitErr}</p>}
          </div>
        ) : (
          <div className="bg-green-950 border border-green-700 rounded-2xl p-3 mb-3 text-green-400 font-bold text-sm">
            ✅ {FEATURES.rankings ? '記録を送信しました！' : '記録を保存しました！'}
          </div>
        )}
        <div className="flex gap-3 mt-3">
          <button onClick={startGame}
            className="flex-1 font-black text-base py-3 rounded-2xl border border-cyan-700 text-cyan-300 transition-all active:scale-95"
            style={{ background: 'rgba(6,182,212,0.12)' }}>
            🔄 リトライ
          </button>
          <button onClick={onBack}
            className="flex-1 font-black text-base py-3 rounded-2xl border border-gray-600 text-gray-300 transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            ← 戻る
          </button>
        </div>
      </div>
    </div>
  );

  // ── Playing screen ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center select-none"
         style={{ background: 'linear-gradient(to bottom, #030310, #0a1220)' }}>
      {/* HUD */}
      <div className="w-full max-w-[800px] px-3 py-2 flex items-center gap-4">
        <button onClick={onBack} className="text-gray-600 hover:text-gray-400 text-sm flex-shrink-0">← 戻る</button>
        <div className="flex items-center gap-1.5">
          <span className="text-blue-400 text-sm">🔫</span>
          <span className="text-white font-black text-lg">{hudSol.toLocaleString()}</span>
          <span className="text-gray-500 text-xs">人</span>
        </div>
        <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
               style={{ width: `${Math.min(100, (hudSol / 50) * 100)}%` }} />
        </div>
        <div className="flex-shrink-0">
          <span className="text-cyan-400 font-black text-lg">{hudDist.toLocaleString()}</span>
          <span className="text-gray-500 text-xs ml-1">m</span>
        </div>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} width={W} height={H}
        style={{ width: '100%', maxWidth: W, display: 'block', cursor: 'pointer' }}
        onClick={handleTap}
        onTouchStart={handleTap}
      />

      {/* Mobile buttons */}
      <div className="w-full max-w-[800px] flex gap-2 px-3 mt-2">
        <button onPointerDown={() => changeLane(-1)}
          className="flex-1 py-3 rounded-xl text-white font-bold text-lg border border-blue-700/40 transition-all active:scale-95"
          style={{ background: 'rgba(29,78,216,0.2)' }}>
          ← 左
        </button>
        <button onPointerDown={() => changeLane(1)}
          className="flex-1 py-3 rounded-xl text-white font-bold text-lg border border-blue-700/40 transition-all active:scale-95"
          style={{ background: 'rgba(29,78,216,0.2)' }}>
          右 →
        </button>
      </div>
    </div>
  );
}
