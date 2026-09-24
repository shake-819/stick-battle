import { useRef, useEffect, useState, useCallback } from 'react';
import { computeEffectiveStats, load, recordBattleResult, addBossFragments, recordBossDefeat } from '@/store/playerStore';
import { STAGES } from '@/data/stages';
import { drawPlayerAsBoss } from '@/lib/bossRenderer';
import {
  W, H, FW, FH, BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP,
  LOCKED_STATES, ACTION_STATES, SPECIAL_NAMES, SP_COLS,
  makeFighter, respawnFighter, knockback, spawn,
  startSpecial, mkProj,
  getAttackFrames, applyMeleeHit,
  updateFighter, updateBot, updateProjectiles, updateParticles,
  drawFighter, drawGuardGauge, COUNTER_CD,
  type Fighter, type Particle, type Projectile,
  type EffectiveStats,
} from '@/lib/gameEngine';
import type { BotConfig } from '@/types/game';

// ─── Constants ────────────────────────────────────────────────────────────────
const SHINIGAMI_MAX_HP        = 20000;
const BASE_ATK                = 2.2;
const RECOMMENDED_LV          = 350;
const SHINIGAMI_COLOR         = '#7c3aed';

const REGEN_INTERVAL          = 45;   // frames between HP regen ticks
const REGEN_AMOUNT            = 240;  // HP restored per tick (不死身の体) ×3
const LIFESTEAL_RATIO         = 0.35; // fraction of melee damage that heals boss (吸血)
const SCYTHE_COOLDOWN_MAX     = 160;  // boss blood scythe cooldown frames
const SCYTHE_SELF_COST        = 280;  // boss HP cost per blood scythe (飛び血鎌)
const SCYTHE_DMG              = 52;
const SCYTHE_KB               = 8;
const SCYTHE_SPEED            = 12;
const SCYTHE_SIZE             = 10;

const PLAYER_SCYTHE_COOLDOWN  = 90;   // player blood scythe cooldown frames
const PLAYER_SCYTHE_SELF_DMG  = 6;    // player damage % added per use
const PLAYER_SCYTHE_DMG       = 45;
const PLAYER_SCYTHE_KB        = 7;
const PLAYER_SCYTHE_SPEED     = 13;

const SHINIGAMI_CFG: BotConfig = {
  label: 'シニガミ', sub: '冥界からの死者', levelEq: 350,
  speedMult: 1.5, attackMult: BASE_ATK,
  decisionMin: 2, decisionMax: 7,
  attackRange: 115, missChance: 0.01,
  usesSpecial: true, edgeGuard: true,
};

// ─── State ────────────────────────────────────────────────────────────────────
interface ShinigamiState {
  player: Fighter;
  boss: Fighter;
  parts: Particle[];
  playerProjs: Projectile[];
  bossProjs: Projectile[];
  frame: number;
  over: boolean;
  bossHp: number;
  regenTimer: number;
  regenFlash: { timer: number };
  scytheCooldown: number;          // boss blood scythe
  playerScytheCooldown: number;    // player blood scythe
  playerRegenTimer: number;        // player 不死身の体 passive regen timer
  absorbFlash: { timer: number };  // lifesteal indicator
  spFlash: { text: string; timer: number };
  playerDmgDealt: number;
  bossOrbitingScythes: { angle: number; addedAt: number }[]; // ★5 orbiting scythes
}

// ─── Boss renderer ────────────────────────────────────────────────────────────
function drawShinigami(ctx: CanvasRenderingContext2D, boss: Fighter, frame: number, bossHp: number) {
  const { pos, dir, state } = boss;
  const cx = pos.x, cy = pos.y;
  const hpPct = Math.max(0, bossHp / SHINIGAMI_MAX_HP);
  const isDying = hpPct < 0.25;

  // ── Underworld aura (rings) ────────────────────────────────────────────────
  const ringPulse = Math.sin(frame * 0.08) * 0.3 + 0.7;
  for (let r = 0; r < 3; r++) {
    ctx.save();
    ctx.globalAlpha = (0.06 + r * 0.04) * ringPulse * (isDying ? 1.5 : 1);
    ctx.strokeStyle = isDying ? '#ef4444' : '#7c3aed';
    ctx.lineWidth = 1.5 + r;
    ctx.shadowColor = isDying ? '#ef4444' : '#7c3aed';
    ctx.shadowBlur = 10 + r * 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy - FH * 0.45, FW * (1.2 + r * 0.35), FH * (0.5 + r * 0.12), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Flowing robe (behind body) ────────────────────────────────────────────
  const wave = Math.sin(frame * 0.07) * 5;
  ctx.save();
  ctx.fillStyle = '#0f0a2e';
  ctx.globalAlpha = 0.82;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 45);
  ctx.quadraticCurveTo(cx - 40, cy - 15 + wave, cx - 32, cy + 10);
  ctx.quadraticCurveTo(cx - 14, cy + 22, cx, cy + 4);
  ctx.quadraticCurveTo(cx + 14, cy + 22, cx + 32, cy + 10);
  ctx.quadraticCurveTo(cx + 40, cy - 15 + wave, cx, cy - 45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── Fighter body ──────────────────────────────────────────────────────────
  drawFighter(ctx, boss, frame);

  // ── Skull face overlay ────────────────────────────────────────────────────
  const hx = cx, hy = cy - 55;
  ctx.save();
  // Shadow glow around head
  ctx.shadowColor = isDying ? '#ef4444' : '#7c3aed';
  ctx.shadowBlur = 14;
  ctx.fillStyle = isDying ? '#220a00' : '#1e1b4b';
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(hx, hy, 16, 0, Math.PI * 2);
  ctx.fill();
  // Eye sockets (glowing)
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = isDying ? '#ef4444' : '#a78bfa';
  ctx.shadowColor = isDying ? '#ef4444' : '#a78bfa';
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.ellipse(hx - 5, hy - 1, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + 5, hy - 1, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  // Teeth
  ctx.fillStyle = '#e2e8f0'; ctx.globalAlpha = 0.55; ctx.shadowBlur = 0;
  for (let t = -2; t <= 2; t++) {
    ctx.fillRect(hx + t * 3.5 - 1, hy + 5.5, 2.5, 3);
  }
  ctx.restore();

  // ── Large scythe ──────────────────────────────────────────────────────────
  const inAtk = ['attack', 'strongAttack'].includes(state);
  const isStrong = state === 'strongAttack';

  let swingAngle: number;
  let scytheAnchorX: number;
  let scytheAnchorY: number;

  if (inAtk) {
    const maxT = isStrong ? 34 : 26;
    const prog = Math.max(0, Math.min(1, 1 - boss.stateTimer / maxT));
    // Windup → slash → follow-through arc
    const ease = Math.sin(prog * Math.PI);              // peaks at mid-swing
    const swingStart = dir * (isStrong ? -1.1 : -0.85); // raised back behind boss
    const swingEnd   = dir * (isStrong ?  1.0 :  0.75); // swept forward
    swingAngle = swingStart + (swingEnd - swingStart) * prog;
    // Arm extends outward at mid-swing
    const armExtend = ease * (isStrong ? 22 : 16);
    scytheAnchorX = cx + dir * (30 + armExtend);
    scytheAnchorY = cy - (44 + ease * 12);
  } else {
    swingAngle = 0;
    scytheAnchorX = cx + dir * 26;
    scytheAnchorY = cy - 32;
  }

  ctx.save();
  ctx.translate(scytheAnchorX, scytheAnchorY);
  ctx.rotate(swingAngle + (inAtk ? 0 : Math.sin(frame * 0.04) * 0.06));
  if (inAtk) { ctx.shadowColor = '#a78bfa'; ctx.shadowBlur = 18; }
  // Pole
  ctx.strokeStyle = '#2e1065'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(dir * 22, -30); ctx.stroke();
  // Crossguard
  ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(dir * 12, -14); ctx.lineTo(dir * 18, -20); ctx.stroke();
  // Blade (large crescent)
  const bladeCol = inAtk ? '#c4b5fd' : '#7c3aed';
  ctx.strokeStyle = bladeCol; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(dir * 18, -32, 20, Math.PI * 0.55, Math.PI * 1.45, dir < 0);
  ctx.stroke();
  // Blade inner edge (thinner)
  ctx.strokeStyle = bladeCol + '77'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(dir * 18, -32, 14, Math.PI * 0.65, Math.PI * 1.35, dir < 0);
  ctx.stroke();
  ctx.restore();

  // ── HP % label ────────────────────────────────────────────────────────────
  ctx.save();
  ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = isDying ? '#fca5a5' : '#c4b5fd';
  ctx.fillText(`${Math.ceil(hpPct * 100)}%`, cx, cy - FH - 14);
  if (isDying) {
    ctx.fillStyle = '#ef4444'; ctx.font = 'bold 8px monospace';
    ctx.fillText('瀕死', cx, cy - FH - 24);
  }
  ctx.restore();
  void dir;
}

// ─── Blood scythe projectile renderer ─────────────────────────────────────────
function drawBloodScythe(ctx: CanvasRenderingContext2D, proj: Projectile, frame: number) {
  const { pos, vel, size } = proj;
  const angle = Math.atan2(vel.y, vel.x) + (frame * 0.2);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);
  ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 14;
  // Crescent blade
  ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, size, Math.PI * 0.4, Math.PI * 1.6, false);
  ctx.stroke();
  ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.6, Math.PI * 0.5, Math.PI * 1.5, false);
  ctx.stroke();
  // Pole
  ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-size, 0); ctx.lineTo(size * 0.4, 0); ctx.stroke();
  ctx.restore();

  // Trail
  for (let i = 0; i < proj.trail.length; i++) {
    const tp = proj.trail[i];
    ctx.save();
    ctx.globalAlpha = (i / proj.trail.length) * 0.4;
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath(); ctx.arc(tp.x, tp.y, size * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ─── Orbiting scythe draw helper ─────────────────────────────────────────────
function drawOrbitingScythe(ctx: CanvasRenderingContext2D, cx: number, cy: number, angle: number) {
  const r = 62;
  const sx = cx + Math.cos(angle) * r;
  const sy = (cy - 35) + Math.sin(angle) * r;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle + Math.PI);
  ctx.shadowColor = '#dc2626'; ctx.shadowBlur = 18;
  ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.arc(0, 0, 9, Math.PI * 0.4, Math.PI * 1.6, false); ctx.stroke();
  ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 6, Math.PI * 0.5, Math.PI * 1.5, false); ctx.stroke();
  ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(4, 0); ctx.stroke();
  ctx.restore();
}

// ─── Scene draw ───────────────────────────────────────────────────────────────
function drawShinigamiScene(
  ctx: CanvasRenderingContext2D,
  s: ShinigamiState,
  frame: number,
  selectedCharacter: string | undefined,
) {
  const platforms = STAGES[0].platforms;

  // Background — underworld
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#050010'); bg.addColorStop(1, '#100018');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Floating dark particles
  ctx.save();
  for (let i = 0; i < 40; i++) {
    const sx = (i * 213 + frame * 0.3) % W;
    const sy = (i * 137 + frame * 0.15 + i * 20) % H;
    ctx.globalAlpha = 0.06 + Math.sin(i * 1.1 + frame * 0.02) * 0.04;
    ctx.fillStyle = i % 3 === 0 ? '#7c3aed' : '#4c1d95';
    ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

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
    ctx.strokeStyle = isMain ? '#7c3aed' : '#4c1d95'; ctx.lineWidth = isMain ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, isMain ? 6 : 4); ctx.stroke();
    ctx.restore();
  });

  // Particles
  s.parts.forEach(p => {
    ctx.save(); ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });

  // Player projectiles
  s.playerProjs.forEach(p => {
    drawBloodScythe(ctx, p, frame);
  });

  // Boss blood scythe projectiles
  s.bossProjs.forEach(p => {
    drawBloodScythe(ctx, p, frame);
  });

  // Player
  if (!drawPlayerAsBoss(ctx, s.player, frame, selectedCharacter)) {
    drawFighter(ctx, s.player, frame);
  }

  // Boss
  drawShinigami(ctx, s.boss, frame, s.bossHp);

  // ── ★5 Orbiting scythes (around boss) ─────────────────────────────────────
  for (const os of s.bossOrbitingScythes) {
    drawOrbitingScythe(ctx, s.boss.pos.x, s.boss.pos.y, os.angle);
  }
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function drawShinigamiHUD(ctx: CanvasRenderingContext2D, s: ShinigamiState, stats: EffectiveStats) {
  const { player, bossHp, regenFlash, absorbFlash, spFlash } = s;
  const hpPct  = Math.max(0, bossHp / SHINIGAMI_MAX_HP);
  const isDying = hpPct < 0.25;

  // ── Boss HP bar ────────────────────────────────────────────────────────────
  const bw = 360, bh = 22, bx = W / 2 - bw / 2, by = 10;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.beginPath(); ctx.roundRect(bx - 8, by - 6, bw + 16, bh + 28, 8); ctx.fill();
  ctx.fillStyle = '#1e1b4b'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
  // HP bar color
  const hpCol = isDying ? '#ef4444' : hpPct > 0.5 ? '#7c3aed' : '#a78bfa';
  ctx.fillStyle = hpCol;
  ctx.beginPath(); ctx.roundRect(bx, by, bw * hpPct, bh, 6); ctx.fill();
  // Regen flash overlay
  if (regenFlash.timer > 0) {
    const alpha = Math.min(1, regenFlash.timer / 15) * 0.45;
    ctx.fillStyle = `rgba(74,222,128,${alpha})`;
    ctx.beginPath(); ctx.roundRect(bx, by, bw * hpPct, bh, 6); ctx.fill();
  }
  ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.stroke();
  ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`💀 冥界からの死者　シニガミ  ${Math.max(0, Math.ceil(bossHp))} / ${SHINIGAMI_MAX_HP}`, W / 2, by + bh + 13);
  ctx.restore();

  // ── Player panel ──────────────────────────────────────────────────────────
  const dc = player.damage < 30 ? '#22c55e' : player.damage < 80 ? '#facc15' : '#ef4444';
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(8, H - 115, 196, 103, 10); ctx.fill();
  ctx.fillStyle = player.color; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('プレイヤー', 8 + 98, H - 97);
  ctx.fillStyle = dc; ctx.font = `bold ${Math.min(42, 30 + player.damage * 0.07)}px monospace`;
  ctx.textAlign = 'center'; ctx.fillText(`${Math.floor(player.damage)}%`, 8 + 98, H - 60);
  for (let i = 0; i < stats.startingStocks; i++) {
    ctx.beginPath(); ctx.arc(8 + 38 + i * 23, H - 38, 9, 0, Math.PI * 2);
    ctx.fillStyle = i < player.stocks ? player.color : '#374151'; ctx.fill();
  }
  const pct2 = 1 - player.specialCooldown / player.maxSPCooldown;
  const ready = player.specialCooldown === 0;
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = ready ? '#a78bfa' : '#6b7280'; ctx.fillText('必殺技 [Q]', 8 + 8, H - 18);
  ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.roundRect(8 + 82, H - 25, 100, 9, 4); ctx.fill();
  ctx.fillStyle = ready ? '#a78bfa' : '#4f46e5'; ctx.beginPath(); ctx.roundRect(8 + 82, H - 25, 100 * pct2, 9, 4); ctx.fill();
  if (ready) { ctx.fillStyle = '#c4b5fd'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'right'; ctx.fillText('READY!', 8 + 185, H - 17); }
  ctx.restore();
  drawGuardGauge(ctx, player, 16, H - 130);

  // ── Player blood scythe gauge (Shinigami ★3 only) ─────────────────────────
  const shinigamiStarsHud = stats.selectedCharacter === 'shinigami' ? (stats.bossUnlockLv?.['shinigami'] ?? 0) : 0;
  if (shinigamiStarsHud >= 3) {
    const scytheMaxCd = shinigamiStarsHud >= 4 ? Math.floor(PLAYER_SCYTHE_COOLDOWN / 2) : PLAYER_SCYTHE_COOLDOWN;
    const scythePct = 1 - s.playerScytheCooldown / scytheMaxCd;
    const scytheReady = s.playerScytheCooldown === 0;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(8, H - 150, 196, 30, 6); ctx.fill();
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = scytheReady ? '#a78bfa' : '#6b7280';
    ctx.fillText('🩸 飛び血鎌 [E]', 16, H - 133);
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.roundRect(96, H - 141, 100, 7, 3); ctx.fill();
    ctx.fillStyle = scytheReady ? '#a78bfa' : '#7c3aed';
    ctx.beginPath(); ctx.roundRect(96, H - 141, 100 * scythePct, 7, 3); ctx.fill();
    if (scytheReady) {
      ctx.fillStyle = '#c4b5fd'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'right';
      ctx.fillText('READY!', 200, H - 127);
    }
    ctx.restore();
  }

  // ── Skill legend (only show player skills when playing as Shinigami) ───────
  if (shinigamiStarsHud >= 1) {
    const hasLifesteal = shinigamiStarsHud >= 2;
    const hasScythe    = shinigamiStarsHud >= 3;
    const legendH = hasScythe ? 86 : hasLifesteal ? 69 : 52;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(W - 196, H - legendH - 12, 188, legendH, 8); ctx.fill();
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#7c3aed'; ctx.fillText('💀 シニガミ スキル', W - 186, H - legendH + 5);
    if (hasLifesteal) { ctx.fillStyle = '#f87171'; ctx.fillText('吸血：攻撃ヒットでHP吸収', W - 186, H - legendH + 22); }
    if (hasScythe)    { ctx.fillStyle = '#a78bfa'; ctx.fillText('飛び血鎌：自HP削って鎌投げ', W - 186, H - legendH + 39); }
    ctx.fillStyle = '#4ade80'; ctx.fillText(`推奨レベル：${RECOMMENDED_LV}`, W - 186, H - legendH + (hasScythe ? 56 : hasLifesteal ? 39 : 22));
    ctx.restore();
  } else {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(W - 196, H - 52, 188, 40, 8); ctx.fill();
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#4ade80'; ctx.fillText(`推奨レベル：${RECOMMENDED_LV}`, W - 186, H - 30);
    ctx.restore();
  }

  // ── Absorb flash ──────────────────────────────────────────────────────────
  if (absorbFlash.timer > 0) {
    absorbFlash.timer--;
    ctx.save();
    ctx.globalAlpha = Math.min(1, absorbFlash.timer / 12);
    ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#4ade80';
    ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 16;
    ctx.textAlign = 'center';
    ctx.fillText('🩸 吸血！', W - 88, 95);
    ctx.restore();
  }

  // ── SP flash ─────────────────────────────────────────────────────────────
  if (spFlash.timer > 0) {
    spFlash.timer--;
    ctx.save();
    ctx.globalAlpha = Math.min(1, spFlash.timer / 20);
    ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#c4b5fd';
    ctx.shadowColor = '#818cf8'; ctx.shadowBlur = 16;
    ctx.textAlign = 'center';
    ctx.fillText(spFlash.text, W / 2, 145);
    ctx.restore();
  }
}

// ─── ShinigamiBossPage ────────────────────────────────────────────────────────
interface ShinigamiBossPageProps { onBack: () => void; }

export default function ShinigamiBossPage({ onBack }: ShinigamiBossPageProps) {
  const playerData = load();
  const stats      = computeEffectiveStats(playerData);
  const shinigamiStars = stats.selectedCharacter === 'shinigami' ? ((playerData.bossUnlockLv ?? {})['shinigami'] ?? 0) : 0;
  const stage      = STAGES[0];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef   = useRef<Set<string>>(new Set());
  const gsRef     = useRef<ShinigamiState | null>(null);
  const rafRef    = useRef<number>(0);

  const [overlay, setOverlay] = useState<{
    type: 'win' | 'lose';
    reward: { xpGained: number; coinsGained: number; leveledUp: boolean };
    fragments?: number;
  } | null>(null);

  const initGame = useCallback(() => {
    const [px, bx] = stage.spawnX;
    const player = makeFighter(px, false, stats, stats.startingStocks);
    const boss   = makeFighter(bx, true, stats, 99, SHINIGAMI_CFG, null, null);
    boss.color       = SHINIGAMI_COLOR;
    boss.attackMult  = BASE_ATK;
    boss.defenseMult = 4.5;
    boss.speedMult   = 1.5;
    boss.botAI       = true;
    gsRef.current = {
      player, boss,
      parts: [], playerProjs: [], bossProjs: [],
      frame: 0, over: false,
      bossHp: SHINIGAMI_MAX_HP,
      regenTimer: REGEN_INTERVAL,
      regenFlash: { timer: 0 },
      scytheCooldown: SCYTHE_COOLDOWN_MAX,
      playerScytheCooldown: 0,
      playerRegenTimer: 120,
      absorbFlash: { timer: 0 },
      spFlash: { text: '', timer: 0 },
      playerDmgDealt: 0,
      bossOrbitingScythes: [],
    };
  }, [stats, stage]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keysRef.current.add(e.key);
    const s = gsRef.current; if (!s || s.over) return;
    const { player } = s;
    const inAction = ACTION_STATES.includes(player.state);

    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
      e.preventDefault();
      if (player.jumpsLeft > 0 && !LOCKED_STATES.includes(player.state)) {
        const jv = player.jumpsLeft === player.maxJumps ? BASE_JUMP : BASE_DJUMP;
        player.vel.y = jv * player.jumpMult; player.jumpsLeft--; player.state = 'jump';
      }
    }
    if (e.key === 'z' || e.key === 'Z' || e.key === 'j' || e.key === 'J') {
      if (!inAction && player.state !== 'dead') {
        const dn = keysRef.current.has('ArrowDown') || keysRef.current.has('s') || keysRef.current.has('S');
        const inAir = player.state === 'jump' || player.state === 'fall';
        const t = inAir ? 'airAttack' : dn ? 'downAttack' : 'attack';
        player.state = t; player.stateTimer = getAttackFrames(player.weapon, t); player.attackActive = false;
      }
    }
    if (e.key === 'x' || e.key === 'X' || e.key === 'k' || e.key === 'K') {
      if (!inAction && player.state !== 'dead') {
        player.state = 'strongAttack'; player.stateTimer = getAttackFrames(player.weapon, 'strongAttack'); player.attackActive = false;
      }
    }
    if (e.key === 'v' || e.key === 'V' || e.key === 'u' || e.key === 'U') {
      if (!inAction && player.state !== 'dead') {
        player.state = 'upAttack'; player.stateTimer = getAttackFrames(player.weapon, 'upAttack'); player.attackActive = false;
      }
    }
    // ── 飛び血鎌 (E key) — ★3解放後のみ使用可能 ──────────────────────────────
    if (e.key === 'e' || e.key === 'E') {
      if (shinigamiStars >= 3 && s.playerScytheCooldown <= 0 && player.state !== 'dead') {
        const spd = PLAYER_SCYTHE_SPEED * player.dir;
        s.playerProjs.push(mkProj('player', player.pos.x + player.dir * 20, player.pos.y - 35, spd, PLAYER_SCYTHE_DMG, PLAYER_SCYTHE_KB, stats.attackMult, '#a78bfa'));
        player.damage = Math.min(player.damage + PLAYER_SCYTHE_SELF_DMG, 999);
        s.playerScytheCooldown = shinigamiStars >= 4 ? Math.floor(PLAYER_SCYTHE_COOLDOWN / 2) : PLAYER_SCYTHE_COOLDOWN;
      }
    }
    if (e.key === 'q' || e.key === 'Q') {
      if (!inAction && player.state !== 'dead' && player.specialCooldown === 0) {
        const kind = startSpecial(player, keysRef.current);
        if (kind) {
          s.spFlash = { text: `✨ ${SPECIAL_NAMES[kind] ?? kind}`, timer: 55 };
          if (kind === 'specialNeutral')
            s.playerProjs.push(mkProj('player', player.pos.x + player.dir * 22, player.pos.y - 40, player.dir * 9.5, 12, 4, player.attackMult, '#818cf8'));
        }
      }
    }
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      if (!LOCKED_STATES.includes(player.state) && player.state !== 'dead' && player.counterCooldown === 0 && player.onGround) {
        player.state = 'counter'; player.stateTimer = 22; player.counterCooldown = COUNTER_CD;
      }
    }
  }, [stats.attackMult, shinigamiStars]);

  const handleKeyUp = useCallback((e: KeyboardEvent) => { keysRef.current.delete(e.key); }, []);

  const runLoop = useCallback((ctx: CanvasRenderingContext2D) => {
    const platforms = stage.platforms;
    const [px] = stage.spawnX;

    const loop = () => {
      const s = gsRef.current; if (!s || s.over) return;
      s.frame++;
      const { player, boss, parts, playerProjs, bossProjs } = s;

      // ── Timers ────────────────────────────────────────────────────────────
      if (s.playerScytheCooldown > 0) s.playerScytheCooldown--;
      if (s.scytheCooldown > 0) s.scytheCooldown--;

      // ── Player 不死身の体：passive damage% reduction (★1) ─────────────────
      if (shinigamiStars >= 1 && player.state !== 'dead') {
        s.playerRegenTimer--;
        if (s.playerRegenTimer <= 0) {
          player.damage = Math.max(0, player.damage - 3);
          s.playerRegenTimer = 120;
        }
      }

      // ── 不死身の体：boss HP regen ─────────────────────────────────────────
      s.regenTimer--;
      if (s.regenTimer <= 0) {
        s.bossHp = Math.min(s.bossHp + REGEN_AMOUNT, SHINIGAMI_MAX_HP);
        s.regenTimer = REGEN_INTERVAL;
        s.regenFlash = { timer: 30 };
      }

      // ── Boss AI ───────────────────────────────────────────────────────────
      updateBot(boss, player, SHINIGAMI_CFG, bossProjs, platforms);
      updateFighter(boss, new Set(), platforms);
      boss.vel.x = Math.max(-12, Math.min(12, boss.vel.x));

      // ── 飛び血鎌：boss fires blood scythe ────────────────────────────────
      if (s.scytheCooldown <= 0 && s.bossHp > SCYTHE_SELF_COST) {
        const spd = SCYTHE_SPEED * (player.pos.x > boss.pos.x ? 1 : -1);
        bossProjs.push(mkProj('bot', boss.pos.x + boss.dir * 20, boss.pos.y - 35, spd, SCYTHE_DMG, SCYTHE_KB, 1, '#7c3aed'));
        s.bossHp -= SCYTHE_SELF_COST;
        s.scytheCooldown = SCYTHE_COOLDOWN_MAX;
      }

      // ── Player physics ────────────────────────────────────────────────────
      updateFighter(player, keysRef.current, platforms);
      player.vel.x = Math.max(-15, Math.min(15, player.vel.x));

      // ── Boss melee → player (吸血 lifesteal) ─────────────────────────────
      {
        const r = applyMeleeHit(boss, player, parts, bossProjs);
        if (r.hit) {
          const healed = r.dmgDealt * 10 * LIFESTEAL_RATIO;
          s.bossHp = Math.min(s.bossHp + healed, SHINIGAMI_MAX_HP);
          s.absorbFlash = { timer: 28 };
        }
      }

      // ── Player melee → boss ───────────────────────────────────────────────
      {
        const r = applyMeleeHit(player, boss, parts, playerProjs);
        if (r.hit) {
          s.bossHp -= r.dmgDealt * 10;
          s.playerDmgDealt += r.dmgDealt;
          boss.invincible = Math.max(boss.invincible, 28);
          boss.vel.x = Math.max(-4, Math.min(4, boss.vel.x));
          boss.vel.y = Math.max(-6, boss.vel.y);
          // ── 吸血 lifesteal for player (★2) ─────────────────────────────
          if (shinigamiStars >= 2) {
            player.damage = Math.max(0, player.damage - 5);
            s.absorbFlash = { timer: 25 };
          }
        }
      }

      // ── Player projectiles → boss ─────────────────────────────────────────
      for (let i = playerProjs.length - 1; i >= 0; i--) {
        const proj = playerProjs[i];
        const bb   = { x: boss.pos.x - FW / 2, y: boss.pos.y - FH, w: FW, h: FH };
        if (!projOverlap(proj, bb)) continue;
        s.bossHp -= proj.damage * proj.atkMult * 8;
        s.playerDmgDealt += proj.damage * proj.atkMult;
        // ── ★5 鎌の呪縛: attach orbiting scythe to boss on hit ──────────────
        if (shinigamiStars >= 5) {
          s.bossOrbitingScythes.push({ angle: Math.random() * Math.PI * 2, addedAt: s.frame });
          s.spFlash = { text: `💀 鎌の呪縛 ×${s.bossOrbitingScythes.length}`, timer: 40 };
        }
        spawn(parts, boss.pos.x, boss.pos.y - 30, SP_COLS['specialNeutral'], 14);
        playerProjs.splice(i, 1);
      }

      // ── Boss projectiles → player ─────────────────────────────────────────
      for (let i = bossProjs.length - 1; i >= 0; i--) {
        const proj = bossProjs[i];
        if (player.invincible > 0 || player.state === 'dead') continue;
        const pb   = { x: player.pos.x - FW / 2, y: player.pos.y - FH, w: FW, h: FH };
        if (!projOverlap(proj, pb)) continue;
        knockback(player, proj.pos, proj.atkMult, proj.knockback, 0.5, proj.damage);
        player.invincible = 40;
        spawn(parts, player.pos.x, player.pos.y - 30, ['#7c3aed', '#a78bfa', '#fff'], 16);
        bossProjs.splice(i, 1);
      }

      // ── ★5 Orbiting scythes: rotate & detonate ───────────────────────────
      if (shinigamiStars >= 5 && s.bossOrbitingScythes.length > 0) {
        for (const os of s.bossOrbitingScythes) os.angle += 0.06;
        const lastAdded = Math.max(...s.bossOrbitingScythes.map(os => os.addedAt));
        if (s.frame - lastAdded >= 600) {
          const cnt = s.bossOrbitingScythes.length;
          s.bossHp -= cnt * PLAYER_SCYTHE_DMG * 8;
          s.playerDmgDealt += cnt * PLAYER_SCYTHE_DMG;
          spawn(parts, boss.pos.x, boss.pos.y - 30, ['#dc2626', '#a78bfa', '#c4b5fd', '#fff'], cnt * 12);
          s.spFlash = { text: `💀 鎌の呪縛発動！ ×${cnt}`, timer: 80 };
          s.bossOrbitingScythes = [];
        }
      }

      // ── Blast zones ───────────────────────────────────────────────────────
      if (player.state !== 'dead') {
        if (player.pos.x < BLAST_L || player.pos.x > BLAST_R || player.pos.y < BLAST_T || player.pos.y > BLAST_B) {
          player.stocks--; player.state = 'dead'; player.stateTimer = 90; player.attackActive = false;
          if (player.stocks > 0) setTimeout(() => { if (gsRef.current && !gsRef.current.over) respawnFighter(player, px); }, 1500);
        }
      }
      // ── Boss blast zone: auto-respawn (no stock loss) ─────────────────────
      if (boss.state !== 'dead') {
        if (boss.pos.x < BLAST_L || boss.pos.x > BLAST_R || boss.pos.y < BLAST_T || boss.pos.y > BLAST_B) {
          respawnFighter(boss, stage.spawnX[1]);
          boss.damage = 0;
          boss.invincible = 60;
        }
      }

      // ── Win / Lose ────────────────────────────────────────────────────────
      if (s.bossHp <= 0) {
        s.over = true;
        spawn(parts, boss.pos.x, boss.pos.y - 30, ['#a78bfa', '#7c3aed', '#c4b5fd', '#fff'], 60);
        const fragDrop = addBossFragments('shinigami', Math.floor(Math.random() * 5) + 2);
        recordBossDefeat();
        setOverlay({ type: 'win', reward: recordBattleResult(true, s.playerDmgDealt), fragments: fragDrop });
        return;
      }
      if (player.stocks <= 0 && player.state === 'dead' && player.stateTimer <= 0) {
        s.over = true;
        setOverlay({ type: 'lose', reward: recordBattleResult(false, s.playerDmgDealt) });
        return;
      }

      updateProjectiles(playerProjs); updateProjectiles(bossProjs); updateParticles(parts);

      ctx.clearRect(0, 0, W, H);
      drawShinigamiScene(ctx, s, s.frame, shinigamiStars >= 3 ? stats.selectedCharacter : undefined);
      drawShinigamiHUD(ctx, s, stats);
      rafRef.current = requestAnimationFrame(loop);
    };
    return loop;
  }, [stage, stats, shinigamiStars]);

  useEffect(() => {
    initGame();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup',   handleKeyUp);
    const ctx = canvasRef.current!.getContext('2d')!;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(runLoop(ctx));
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',   handleKeyUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [initGame, handleKeyDown, handleKeyUp, runLoop]);

  const restart = () => {
    setOverlay(null); initGame();
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(runLoop(ctx));
  };

  return (
    <div className="w-full h-screen bg-gray-950 flex flex-col items-center justify-center select-none overflow-hidden">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H}
          className="rounded-xl border shadow-2xl border-purple-900/50"
          style={{ display: 'block', maxWidth: '100vw', maxHeight: '80vh', aspectRatio: `${W}/${H}`, boxShadow: '0 0 40px #7c3aed22' }}
        />
        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl">
            <div className="text-center px-8">
              {overlay.type === 'win'
                ? <>
                    <div className="text-5xl font-black text-purple-400 mb-1">撃破！💀</div>
                    <div className="text-2xl text-white mt-1">死神を冥界へ送り返した！</div>
                  </>
                : <>
                    <div className="text-5xl font-black text-red-400 mb-1">GAME OVER 💀</div>
                    <div className="text-xl text-white mt-1">死神に魂を刈られた…</div>
                  </>
              }
              <div className="mt-4 mb-4 flex gap-4 justify-center">
                <div className="bg-indigo-900/70 border border-indigo-600 rounded-xl px-5 py-3">
                  <div className="text-indigo-300 text-xs">経験値</div>
                  <div className="text-white font-black text-2xl">+{overlay.reward.xpGained} XP</div>
                </div>
                <div className="bg-yellow-900/70 border border-yellow-600 rounded-xl px-5 py-3">
                  <div className="text-yellow-300 text-xs">コイン</div>
                  <div className="text-white font-black text-2xl">+{overlay.reward.coinsGained} 💰</div>
                </div>
              </div>
              {overlay.type === 'win' && overlay.fragments !== undefined && (
                <div className="mb-3 bg-purple-900/60 border border-purple-600/60 rounded-xl px-5 py-2 text-center">
                  <div className="text-purple-300 text-xs mb-0.5">💠 欠片ドロップ</div>
                  <div className="text-white font-black text-xl">💀 ×{overlay.fragments}個</div>
                  <div className="text-purple-400 text-[10px] mt-0.5">アイテムボックスで確認できます</div>
                </div>
              )}
              {overlay.reward.leveledUp && (
                <div className="mb-4 bg-yellow-400/20 border border-yellow-400 rounded-xl px-6 py-2 text-yellow-300 font-black text-lg animate-pulse">⬆ LEVEL UP！</div>
              )}
              <div className="flex gap-3 justify-center">
                
                <button onClick={onBack}  className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg px-8 py-3 rounded-xl transition-all active:scale-95">もどる</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 text-center">
        <div className="text-purple-400 font-black text-sm mb-1">💀 ボス戦  冥界からの死者　シニガミ  推奨Lv.{RECOMMENDED_LV}</div>
        <div className="flex gap-4 text-xs text-gray-500 flex-wrap justify-center">
          <span>AD/←→: 移動</span><span>W/↑: ジャンプ</span>
          <span>Z/J: 通常攻撃</span><span>X/K: 強攻撃</span><span>↓+Z: 下攻撃</span>
          <span>V/U: アッパー</span><span>空中Z/J: 空中攻撃</span>
          <span className="text-purple-400 font-bold">E: 飛び血鎌</span>
          <span className="text-purple-400 font-bold">Q: 必殺技</span>
        </div>
      </div>
    </div>
  );
}

// ─── Overlap helper ───────────────────────────────────────────────────────────
function projOverlap(proj: Projectile, bb: { x: number; y: number; w: number; h: number }) {
  return proj.pos.x - proj.size < bb.x + bb.w &&
         proj.pos.x + proj.size > bb.x &&
         proj.pos.y - proj.size < bb.y + bb.h &&
         proj.pos.y + proj.size > bb.y;
}
