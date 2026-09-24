import { useRef, useEffect, useState, useCallback } from 'react';
import { computeEffectiveStats, load } from '@/store/playerStore';
import { FEATURES } from '@/lib/backend';
import { submitEventScore } from '@/lib/eventService';
import { STAGES } from '@/data/stages';
import { drawPlayerAsBoss } from '@/lib/bossRenderer';
import {
  W, H, FW, FH,
  BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP,
  LOCKED_STATES, ACTION_STATES,
  makeFighter, respawnFighter, knockback,
  getAttackFrames, applyMeleeHit,
  updateFighter, updateBot, updateProjectiles, updateParticles,
  drawFighter, spawn, overlap,
  startSpecial, mkProj, SP_COLS,
  type Fighter, type Particle, type Projectile,
} from '@/lib/gameEngine';
import type { BotConfig } from '@/types/game';

interface Props { onBack: () => void; }

const EVENT_ID            = 'shinigami-dps';
const TIMER_FRAMES        = 60 * 60;      // 60 seconds × 60 fps
const DISPLAY_HP_MAX      = 1500;         // visual HP bar (cycles for feedback)
const SHINIGAMI_COLOR     = '#7c3aed';
const BASE_ATK            = 2.2;
const SCYTHE_COOLDOWN_MAX = 160;
const SCYTHE_DMG          = 52;
const SCYTHE_KB           = 8;
const SCYTHE_SPEED        = 12;

// ─── Constants ─────────────────────────────────────────────────────────────
const EMPTY_KEYS = new Set<string>();

const SHINIGAMI_CFG: BotConfig = {
  label: 'シニガミ', sub: '冥界からの死者', levelEq: 350,
  speedMult: 1.5, attackMult: BASE_ATK,
  decisionMin: 2, decisionMax: 7,
  attackRange: 115, missChance: 0.01,
  usesSpecial: true, edgeGuard: true,
};

interface EvState {
  player: Fighter; boss: Fighter;
  parts: Particle[]; playerProjs: Projectile[]; bossProjs: Projectile[];
  frame: number; timerFrames: number;
  totalDamage: number; displayHp: number;
  scytheCooldown: number;
  over: boolean;
}

// ─── Scythe projectile renderer ────────────────────────────────────────────
function drawBloodScythe(ctx: CanvasRenderingContext2D, proj: Projectile, frame: number) {
  const { pos, vel, size } = proj;
  const angle = Math.atan2(vel.y, vel.x) + frame * 0.2;
  ctx.save();
  ctx.translate(pos.x, pos.y); ctx.rotate(angle);
  ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 14;
  ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(0, 0, size, Math.PI * 0.4, Math.PI * 1.6, false); ctx.stroke();
  ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, size * 0.6, Math.PI * 0.5, Math.PI * 1.5, false); ctx.stroke();
  ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size * 0.4, 0); ctx.stroke();
  for (let i = 0; i < proj.trail.length; i++) {
    ctx.globalAlpha = (i / proj.trail.length) * 0.35;
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath(); ctx.arc(proj.trail[i].x - pos.x, proj.trail[i].y - pos.y, size * 0.45, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ─── Boss visual (same as ShinigamiBossPage) ───────────────────────────────
function drawShinigamiBoss(ctx: CanvasRenderingContext2D, boss: Fighter, frame: number) {
  const { pos, dir, state } = boss;
  const cx = pos.x, cy = pos.y;

  const ringPulse = Math.sin(frame * 0.08) * 0.3 + 0.7;
  for (let r = 0; r < 3; r++) {
    ctx.save();
    ctx.globalAlpha = (0.06 + r * 0.04) * ringPulse;
    ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 1.5 + r;
    ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 10 + r * 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy - FH * 0.45, FW * (1.2 + r * 0.35), FH * (0.5 + r * 0.12), 0, 0, Math.PI * 2);
    ctx.stroke(); ctx.restore();
  }

  const wave = Math.sin(frame * 0.07) * 5;
  ctx.save();
  ctx.fillStyle = '#0f0a2e'; ctx.globalAlpha = 0.82;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 45);
  ctx.quadraticCurveTo(cx - 40, cy - 15 + wave, cx - 32, cy + 10);
  ctx.quadraticCurveTo(cx - 14, cy + 22, cx, cy + 4);
  ctx.quadraticCurveTo(cx + 14, cy + 22, cx + 32, cy + 10);
  ctx.quadraticCurveTo(cx + 40, cy - 15 + wave, cx, cy - 45);
  ctx.closePath(); ctx.fill(); ctx.restore();

  drawFighter(ctx, boss, frame);

  const hx = cx, hy = cy - 55;
  ctx.save();
  ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 14;
  ctx.fillStyle = '#1e1b4b'; ctx.globalAlpha = 0.45;
  ctx.beginPath(); ctx.arc(hx, hy, 16, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#a78bfa'; ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.ellipse(hx - 5, hy - 1, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + 5, hy - 1, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e2e8f0'; ctx.globalAlpha = 0.55; ctx.shadowBlur = 0;
  for (const t of [-2, -1, 0, 1, 2]) ctx.fillRect(hx + t * 3.5 - 1, hy + 5.5, 2.5, 3);
  ctx.restore();

  const inAtk = state === 'attack' || state === 'strongAttack';
  const isStrong = state === 'strongAttack';
  let swingAngle = 0, anchorX = cx + dir * 26, anchorY = cy - 32;
  if (inAtk) {
    const prog = Math.max(0, Math.min(1, 1 - boss.stateTimer / (isStrong ? 34 : 26)));
    const ease = Math.sin(prog * Math.PI);
    swingAngle = dir * (isStrong ? -1.1 : -0.85) + dir * (isStrong ? 2.1 : 1.6) * prog;
    anchorX = cx + dir * (30 + ease * (isStrong ? 22 : 16));
    anchorY = cy - (44 + ease * 12);
  }
  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.rotate(swingAngle + (inAtk ? 0 : Math.sin(frame * 0.04) * 0.06));
  if (inAtk) { ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 18; }
  ctx.strokeStyle = '#2e1065'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(dir * 22, -30); ctx.stroke();
  ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(dir * 12, -14); ctx.lineTo(dir * 18, -20); ctx.stroke();
  const bladeCol = inAtk ? '#c4b5fd' : '#7c3aed';
  ctx.strokeStyle = bladeCol; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(dir * 18, -32, 20, Math.PI * 0.55, Math.PI * 1.45, dir < 0); ctx.stroke();
  ctx.strokeStyle = bladeCol + '77'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(dir * 18, -32, 14, Math.PI * 0.65, Math.PI * 1.35, dir < 0); ctx.stroke();
  ctx.restore();
}

function projOverlap(proj: Projectile, box: { x: number; y: number; w: number; h: number }) {
  return overlap(proj.pos.x - proj.size, proj.pos.y - proj.size, proj.size * 2, proj.size * 2,
                 box.x, box.y, box.w, box.h);
}

// ─── Main component ────────────────────────────────────────────────────────
export default function EventShinigamiPage({ onBack }: Props) {
  const data      = load();
  const stats     = computeEffectiveStats(data);
  const weapon    = stats.equippedWeapon;
  const armor     = stats.equippedArmor;
  const bossId    = ['lionel', 'bajiou', 'shinigami'].includes(stats.selectedCharacter ?? '')
                      ? (stats.selectedCharacter as string) : undefined;
  const platforms = STAGES[0].platforms;
  const spawnX    = STAGES[0].spawnX;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stRef     = useRef<EvState | null>(null);
  const keysRef   = useRef<Set<string>>(new Set());
  const rafRef    = useRef<number>(0);

  const [phase,      setPhase]      = useState<'pre' | 'playing' | 'gameover'>('pre');
  const [score,      setScore]      = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [submitErr,  setSubmitErr]  = useState('');
  const [hudTimer,   setHudTimer]   = useState(60);
  const [hudDmg,     setHudDmg]     = useState(0);
  const [hudStocks,  setHudStocks]  = useState(3);

  const initState = useCallback((): EvState => {
    const [px, bx] = spawnX;
    const player = makeFighter(px, false, stats, 3);
    const boss   = makeFighter(bx, true, stats, 99, SHINIGAMI_CFG, null, null);
    boss.color       = SHINIGAMI_COLOR;
    boss.attackMult  = BASE_ATK;
    boss.defenseMult = 4.5;
    boss.speedMult   = 1.5;
    boss.botAI       = true;
    return {
      player, boss,
      parts: [], playerProjs: [], bossProjs: [],
      frame: 0, timerFrames: TIMER_FRAMES,
      totalDamage: 0, displayHp: DISPLAY_HP_MAX,
      scytheCooldown: SCYTHE_COOLDOWN_MAX,
      over: false,
    };
  }, [stats, spawnX]);

  // ── Attack helper (used by keyboard + touch) ────────────────────────────
  const triggerAttack = useCallback((type: 'attack' | 'strongAttack' | 'upAttack' | 'downAttack' | 'airAttack' | 'special') => {
    const st = stRef.current;
    if (!st || st.over) return;
    const { player } = st;
    if (ACTION_STATES.includes(player.state) || player.state === 'dead') return;
    if (LOCKED_STATES.includes(player.state)) return;

    if (type === 'special') {
      if (player.specialCooldown > 0) return;
      const kind = startSpecial(player, keysRef.current);
      if (kind === 'specialNeutral') {
        st.playerProjs.push(mkProj('player', player.pos.x + player.dir * 22, player.pos.y - 40, player.dir * 9.5, 12, 4, player.attackMult, '#818cf8'));
      }
      return;
    }

    const inAir = player.state === 'jump' || player.state === 'fall';
    const actualType = (type === 'attack' && inAir) ? 'airAttack' : type;
    player.state       = actualType;
    player.stateTimer  = getAttackFrames(player.weapon, actualType);
    player.attackActive = false;
  }, []);

  // ── Key handlers (same pattern as ShinigamiBossPage) ───────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keysRef.current.add(e.key);
    const st = stRef.current;
    if (!st || st.over) return;
    const { player } = st;

    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
      e.preventDefault();
      if (player.jumpsLeft > 0 && !LOCKED_STATES.includes(player.state) && player.state !== 'dead') {
        const jv = player.jumpsLeft === player.maxJumps ? BASE_JUMP : BASE_DJUMP;
        player.vel.y = jv * player.jumpMult;
        player.jumpsLeft--;
        player.state = 'jump';
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); return; }

    if (e.key === 'z' || e.key === 'Z' || e.key === 'j' || e.key === 'J') {
      const dn = keysRef.current.has('ArrowDown') || keysRef.current.has('s') || keysRef.current.has('S');
      const inAir = player.state === 'jump' || player.state === 'fall';
      triggerAttack(inAir ? 'airAttack' : dn ? 'downAttack' : 'attack');
    }
    if (e.key === 'x' || e.key === 'X' || e.key === 'k' || e.key === 'K') {
      triggerAttack('strongAttack');
    }
    if (e.key === 'v' || e.key === 'V' || e.key === 'u' || e.key === 'U') {
      triggerAttack('upAttack');
    }
    if (e.key === 'c' || e.key === 'C' || e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      triggerAttack('special');
    }
  }, [triggerAttack]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    keysRef.current.delete(e.key);
  }, []);

  // ── Game loop ──────────────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const [px] = spawnX;

    const loop = () => {
      const st = stRef.current;
      if (!st || st.over) return;
      st.frame++;
      const { player, boss, parts, playerProjs, bossProjs } = st;

      // ── Timer ─────────────────────────────────────────────────────────
      st.timerFrames--;
      if (st.timerFrames <= 0) {
        st.over = true;
        setScore(Math.floor(st.totalDamage));
        setPhase('gameover');
        return;
      }

      // ── Scythe cooldown ───────────────────────────────────────────────
      if (st.scytheCooldown > 0) st.scytheCooldown--;

      // ── Boss AI (same as ShinigamiBossPage) ───────────────────────────
      updateBot(boss, player, SHINIGAMI_CFG, bossProjs, platforms);
      updateFighter(boss, EMPTY_KEYS, platforms);
      boss.vel.x = Math.max(-12, Math.min(12, boss.vel.x));

      // ── Boss blood scythe (same timing as boss fight) ─────────────────
      if (st.scytheCooldown <= 0) {
        const spd = SCYTHE_SPEED * (player.pos.x > boss.pos.x ? 1 : -1);
        bossProjs.push(mkProj('bot', boss.pos.x + boss.dir * 20, boss.pos.y - 35, spd, SCYTHE_DMG, SCYTHE_KB, 1, '#7c3aed'));
        st.scytheCooldown = SCYTHE_COOLDOWN_MAX;
      }

      // ── Player physics (pass live keysRef — same as ShinigamiBossPage) ─
      updateFighter(player, keysRef.current, platforms);
      player.vel.x = Math.max(-15, Math.min(15, player.vel.x));

      // ── Boss melee → player ───────────────────────────────────────────
      applyMeleeHit(boss, player, parts, bossProjs);

      // ── Player melee → boss ───────────────────────────────────────────
      {
        const r = applyMeleeHit(player, boss, parts, playerProjs);
        if (r.hit) {
          st.totalDamage += r.dmgDealt;
          st.displayHp   -= r.dmgDealt;
          if (st.displayHp <= 0) st.displayHp = DISPLAY_HP_MAX;
          boss.invincible = Math.max(boss.invincible, 28);
          boss.vel.x = Math.max(-4, Math.min(4, boss.vel.x));
          boss.vel.y = Math.max(-6, boss.vel.y);
          if (r.spawnProj) playerProjs.push(r.spawnProj);
        }
      }

      // ── Player projectiles → boss ─────────────────────────────────────
      for (let i = playerProjs.length - 1; i >= 0; i--) {
        const proj = playerProjs[i];
        const bb = { x: boss.pos.x - FW / 2, y: boss.pos.y - FH, w: FW, h: FH };
        if (!projOverlap(proj, bb)) continue;
        const dmg = proj.damage * proj.atkMult;
        st.totalDamage += dmg;
        st.displayHp   -= dmg;
        if (st.displayHp <= 0) st.displayHp = DISPLAY_HP_MAX;
        spawn(parts, boss.pos.x, boss.pos.y - 30, SP_COLS['specialNeutral'], 14);
        playerProjs.splice(i, 1);
      }

      // ── Boss projectiles → player ─────────────────────────────────────
      for (let i = bossProjs.length - 1; i >= 0; i--) {
        const proj = bossProjs[i];
        if (player.invincible > 0 || player.state === 'dead') continue;
        const pb = { x: player.pos.x - FW / 2, y: player.pos.y - FH, w: FW, h: FH };
        if (!projOverlap(proj, pb)) continue;
        knockback(player, proj.pos, proj.atkMult, proj.knockback, 0.5, proj.damage);
        player.invincible = 40;
        spawn(parts, player.pos.x, player.pos.y - 30, ['#7c3aed', '#a78bfa', '#fff'], 16);
        bossProjs.splice(i, 1);
      }

      updateProjectiles(playerProjs);
      updateProjectiles(bossProjs);
      updateParticles(parts);

      // ── Blast zones ───────────────────────────────────────────────────
      if (player.state !== 'dead') {
        if (player.pos.x < BLAST_L || player.pos.x > BLAST_R || player.pos.y < BLAST_T || player.pos.y > BLAST_B) {
          player.stocks--;
          player.state = 'dead'; player.stateTimer = 90; player.attackActive = false;
          if (player.stocks > 0) {
            setTimeout(() => { if (stRef.current && !stRef.current.over) respawnFighter(player, px); }, 1500);
          } else {
            st.over = true;
            setScore(Math.floor(st.totalDamage));
            setPhase('gameover');
            return;
          }
        }
      }
      // Boss blast zone — respawn without stock loss
      if (boss.pos.x < BLAST_L || boss.pos.x > BLAST_R || boss.pos.y < BLAST_T || boss.pos.y > BLAST_B) {
        respawnFighter(boss, spawnX[1]);
        boss.damage = 0;
      }

      // ── Draw scene ────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);

      // Background
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#050010'); bg.addColorStop(1, '#100018');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // Floating ambient particles
      ctx.save();
      for (let i = 0; i < 38; i++) {
        const sx = (i * 213 + st.frame * 0.3) % W;
        const sy = (i * 137 + st.frame * 0.15 + i * 20) % H;
        ctx.globalAlpha = 0.05 + Math.sin(i * 1.1 + st.frame * 0.02) * 0.04;
        ctx.fillStyle = i % 3 === 0 ? '#7c3aed' : '#4c1d95';
        ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore(); ctx.globalAlpha = 1;

      // Platforms
      platforms.forEach((p, i) => {
        const isMain = i === 0;
        ctx.save();
        ctx.shadowColor = isMain ? '#4c1d95' : '#2e1065';
        ctx.shadowBlur  = isMain ? 14 : 8;
        const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
        g.addColorStop(0, isMain ? '#2e1065' : '#1e0a40');
        g.addColorStop(1, isMain ? '#1e0a40' : '#0f051f');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, isMain ? 6 : 4); ctx.fill();
        ctx.strokeStyle = isMain ? '#7c3aed' : '#4c1d95';
        ctx.lineWidth   = isMain ? 2 : 1;
        ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, isMain ? 6 : 4); ctx.stroke();
        ctx.restore();
      });

      // Particles
      parts.forEach(par => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, par.life / par.maxLife);
        ctx.fillStyle = par.color;
        ctx.beginPath(); ctx.arc(par.x, par.y, par.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      // Projectiles — draw as blood scythes
      playerProjs.forEach(p => drawBloodScythe(ctx, p, st.frame));
      bossProjs.forEach(p  => drawBloodScythe(ctx, p, st.frame));

      // Player
      if (!drawPlayerAsBoss(ctx, player, st.frame, bossId)) {
        drawFighter(ctx, player, st.frame);
      }

      // Boss (Shinigami)
      drawShinigamiBoss(ctx, boss, st.frame);

      // ── Canvas HUD ────────────────────────────────────────────────────
      // Boss HP display
      const hpPct = Math.max(0, st.displayHp / DISPLAY_HP_MAX);
      const bw = 320, bh = 18, bx = W / 2 - bw / 2, by = 10;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath(); ctx.roundRect(bx - 8, by - 4, bw + 16, bh + 26, 8); ctx.fill();
      ctx.fillStyle = '#1e1b4b';
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.fill();
      ctx.fillStyle = '#7c3aed';
      if (hpPct > 0) { ctx.beginPath(); ctx.roundRect(bx, by, bw * hpPct, bh, 5); ctx.fill(); }
      ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.stroke();
      ctx.fillStyle = '#c4b5fd'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('💀 シニガミ（無限）', W / 2, by + bh + 14);
      ctx.restore();

      // Timer (top-right)
      const secLeft  = Math.ceil(st.timerFrames / 60);
      const timerPct = st.timerFrames / TIMER_FRAMES;
      const timerCol = timerPct > 0.5 ? '#22c55e' : timerPct > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath(); ctx.roundRect(W - 90, 10, 76, 28, 6); ctx.fill();
      ctx.fillStyle = timerCol; ctx.shadowColor = timerCol; ctx.shadowBlur = 8;
      ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${secLeft}秒`, W - 52, 33);
      ctx.restore();

      // Total damage (top-left panel)
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath(); ctx.roundRect(8, 10, 180, 42, 6); ctx.fill();
      ctx.fillStyle = '#a78bfa'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
      ctx.fillText('累計ダメージ', 16, 25);
      ctx.fillStyle = '#c4b5fd'; ctx.font = 'bold 18px monospace';
      ctx.fillText(`${Math.floor(st.totalDamage).toLocaleString()}`, 16, 46);
      ctx.restore();

      // Player panel (bottom-left, same as ShinigamiBossPage)
      const dc = player.damage < 30 ? '#22c55e' : player.damage < 80 ? '#facc15' : '#ef4444';
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath(); ctx.roundRect(8, H - 110, 184, 98, 10); ctx.fill();
      ctx.fillStyle = player.color; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
      ctx.fillText('プレイヤー', 8 + 92, H - 92);
      ctx.fillStyle = dc;
      ctx.font = `bold ${Math.min(40, 28 + player.damage * 0.07)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(player.damage)}%`, 8 + 92, H - 56);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(8 + 36 + i * 23, H - 34, 9, 0, Math.PI * 2);
        ctx.fillStyle = i < player.stocks ? player.color : '#374151'; ctx.fill();
      }
      ctx.restore();

      // Sync React HUD
      if (st.frame % 4 === 0) {
        setHudTimer(secLeft);
        setHudDmg(Math.floor(st.totalDamage));
        setHudStocks(player.stocks);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [stats, bossId, platforms, spawnX, triggerAttack]);

  const startGame = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    keysRef.current.clear();
    const st = initState();
    stRef.current = st;
    setPhase('playing');
    setSubmitted(false);
    setSubmitErr('');
    setHudTimer(60);
    setHudDmg(0);
    setHudStocks(3);
    // runLoop is called from the useEffect watching phase
  }, [initState]);

  // Start RAF when phase becomes 'playing'
  useEffect(() => {
    if (phase !== 'playing') return;
    runLoop();
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, runLoop]);

  // Keyboard listeners
  useEffect(() => {
    if (phase !== 'playing') return;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup',   handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',   handleKeyUp);
    };
  }, [phase, handleKeyDown, handleKeyUp]);

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); }, []);

  const submitScore = async () => {
    setSubmitting(true);
    try {
      // 静的モード: 端末内に保存 / サーバー設定時: API へ送信（lib/eventService.ts）
      await submitEventScore(EVENT_ID, score, weapon?.nameJa ?? null, armor?.nameJa ?? null);
      setSubmitted(true);
    } catch {
      setSubmitErr('送信に失敗しました。再試行してください。');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Pre-game screen ───────────────────────────────────────────────────
  if (phase === 'pre') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 select-none"
           style={{ background: 'linear-gradient(to bottom, #050010, #180028)' }}>
        <div className="w-full max-w-md">
          <button onClick={onBack} className="text-purple-700 hover:text-purple-400 text-sm mb-4">← 戻る</button>
          <h1 className="text-3xl font-black text-white mb-1">💀 戦神チャレンジ</h1>
          <p className="text-purple-300 text-sm mb-4">不死のシニガミに1分間でどれだけダメージを与えられるか</p>

          <div className="bg-black/50 border border-purple-900 rounded-2xl p-4 mb-4 space-y-1.5 text-sm">
            <div className="font-bold text-purple-400 mb-2">📋 ルール</div>
            <div className="text-gray-300">• 制限時間 <span className="text-yellow-400 font-bold">60 秒</span></div>
            <div className="text-gray-300">• シニガミのHPは <span className="text-purple-300 font-bold">無限</span>（倒せない）</div>
            <div className="text-gray-300">• 累計ダメージ量でスコアを競う</div>
            <div className="text-gray-300">• ストック 3 ― 全滅すると時間切れ前に終了</div>
            <div className="text-gray-400 text-xs mt-2">
              操作: 矢印/WASD移動 ・ Z攻撃 ・ X強攻撃 ・ V上攻撃 ・ C/Q必殺技
            </div>
          </div>

          <div className="bg-black/50 border border-purple-900 rounded-2xl p-3 mb-4 text-sm">
            <div className="font-bold text-gray-400 mb-2">装備</div>
            <div className="flex gap-2 flex-wrap">
              {weapon
                ? <span className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-600 text-amber-300 text-xs">{weapon.emoji} {weapon.nameJa}</span>
                : <span className="text-gray-600 text-xs">武器なし</span>}
              {armor
                ? <span className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-600 text-cyan-300 text-xs">{armor.emoji} {armor.nameJa}</span>
                : <span className="text-gray-600 text-xs">防具なし</span>}
            </div>
          </div>

          <button onClick={startGame}
            className="w-full font-black text-xl py-4 rounded-2xl transition-all active:scale-95 shadow-xl text-white border border-purple-600"
            style={{ background: 'linear-gradient(135deg, #4c1d95, #1e1b4b)' }}>
            ⚔ 挑戦開始
          </button>
        </div>
      </div>
    );
  }

  // ── Game over screen ──────────────────────────────────────────────────
  if (phase === 'gameover') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 select-none"
           style={{ background: 'linear-gradient(to bottom, #050010, #180028)' }}>
        <div className="w-full max-w-md text-center">
          <div className="text-6xl mb-3">💀</div>
          <h2 className="text-3xl font-black text-white mb-1">終了！</h2>
          <div className="text-6xl font-black text-purple-400 mb-0">{score.toLocaleString()}</div>
          <div className="text-purple-300 text-base mb-4">累計ダメージ</div>

          <div className="bg-black/50 border border-purple-900 rounded-xl p-3 mb-4 text-sm">
            <div className="flex justify-between text-gray-400 mb-1">
              <span>武器</span><span className="text-amber-300">{weapon?.nameJa ?? 'なし'}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>防具</span><span className="text-cyan-300">{armor?.nameJa ?? 'なし'}</span>
            </div>
          </div>

          {!submitted ? (
            <button onClick={submitScore} disabled={submitting}
              className={`w-full font-black text-lg py-3.5 rounded-2xl mb-3 transition-all active:scale-95 border ${
                submitting ? 'bg-gray-800 border-gray-700 text-gray-400'
                           : 'border-purple-600 text-white'}`}
              style={!submitting ? { background: 'linear-gradient(135deg, #4c1d95, #1e1b4b)' } : {}}>
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
              className="flex-1 border border-purple-700 text-purple-200 font-bold py-3 rounded-xl transition-all active:scale-95"
              style={{ background: '#1e0a3c' }}>
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

  // ── Playing screen ────────────────────────────────────────────────────
  const onTouchAtk = (type: 'attack' | 'strongAttack' | 'upAttack' | 'special') => () => triggerAttack(type);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center select-none" style={{ background: '#050010' }}>
      {/* Minimal React HUD */}
      <div className="w-full max-w-3xl px-3 mb-1.5 flex items-center justify-between">
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={`text-lg ${i < hudStocks ? 'text-red-500' : 'text-gray-700'}`}>♥</span>
          ))}
        </div>
        <span className="text-white font-black text-xl">{hudTimer}<span className="text-gray-400 text-sm ml-1">秒</span></span>
        <span className="text-purple-400 font-black text-sm">{hudDmg.toLocaleString()} DMG</span>
      </div>

      <div className="w-full max-w-3xl px-2">
        <canvas ref={canvasRef} width={W} height={H}
          className="w-full rounded-2xl border border-purple-900/50"
          style={{ aspectRatio: `${W}/${H}`, boxShadow: '0 0 40px #7c3aed28' }} />
      </div>

      {/* Mobile controls */}
      <div className="mt-2 w-full max-w-3xl px-3 flex justify-between items-end">
        {/* Move */}
        <div className="flex gap-1.5">
          <button
            onPointerDown={() => keysRef.current.add('ArrowLeft')}
            onPointerUp={() => keysRef.current.delete('ArrowLeft')}
            onPointerLeave={() => keysRef.current.delete('ArrowLeft')}
            className="w-12 h-12 bg-gray-800 border border-gray-600 rounded-xl text-white text-xl flex items-center justify-center active:bg-gray-600">◀</button>
          <button
            onPointerDown={() => keysRef.current.add('ArrowRight')}
            onPointerUp={() => keysRef.current.delete('ArrowRight')}
            onPointerLeave={() => keysRef.current.delete('ArrowRight')}
            className="w-12 h-12 bg-gray-800 border border-gray-600 rounded-xl text-white text-xl flex items-center justify-center active:bg-gray-600">▶</button>
          <button
            onPointerDown={() => {
              const st = stRef.current;
              if (!st) return;
              const { player } = st;
              if (player.jumpsLeft > 0 && !LOCKED_STATES.includes(player.state) && player.state !== 'dead') {
                const jv = player.jumpsLeft === player.maxJumps ? BASE_JUMP : BASE_DJUMP;
                player.vel.y = jv * player.jumpMult;
                player.jumpsLeft--;
                player.state = 'jump';
              }
            }}
            className="w-12 h-12 bg-blue-900 border border-blue-700 rounded-xl text-white font-black flex items-center justify-center active:bg-blue-700">▲</button>
        </div>
        {/* Attack */}
        <div className="flex gap-1.5">
          <button onPointerDown={onTouchAtk('attack')}
            className="w-12 h-12 bg-red-900 border border-red-700 rounded-xl text-white font-black flex items-center justify-center active:bg-red-700 text-sm">攻</button>
          <button onPointerDown={onTouchAtk('strongAttack')}
            className="w-12 h-12 bg-orange-900 border border-orange-700 rounded-xl text-white font-black flex items-center justify-center active:bg-orange-700 text-sm">強</button>
          <button onPointerDown={onTouchAtk('upAttack')}
            className="w-12 h-12 bg-yellow-900 border border-yellow-700 rounded-xl text-white font-black flex items-center justify-center active:bg-yellow-700 text-sm">上</button>
          <button onPointerDown={onTouchAtk('special')}
            className="w-12 h-12 border border-purple-700 text-white font-black flex items-center justify-center rounded-xl active:opacity-70 text-sm"
            style={{ background: '#1e0a3c' }}>必</button>
        </div>
      </div>
    </div>
  );
}
