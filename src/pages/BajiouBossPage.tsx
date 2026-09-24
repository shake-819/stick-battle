import { useRef, useEffect, useState, useCallback } from 'react';
import { computeEffectiveStats, load, recordBattleResult, addBossFragments, recordBossDefeat } from '@/store/playerStore';
import { STAGES } from '@/data/stages';
import { WEAPONS } from '@/data/equipment';
import { drawPlayerAsBoss } from '@/lib/bossRenderer';
import {
  W, H, FW, FH, BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP, BASE_WALK,
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
const BAJIOU_MAX_HP   = 4500;
const BASE_ATK        = 2.0;
const COUNTER_CHANCE  = 0.10;
const RECOMMENDED_LV  = 150;
const BAJIOU_COLOR    = '#92400e';

const BAJIOU_CFG: BotConfig = {
  label: 'バジオウ', sub: '山賊の王', levelEq: 150,
  speedMult: 1.6, attackMult: BASE_ATK,
  decisionMin: 2, decisionMax: 8,
  attackRange: 110, missChance: 0.02,
  usesSpecial: true, edgeGuard: true,
};

// Use chaos axe for max bleed
const BAJIOU_AXE = WEAPONS.find(w => w.id === 'w_chaos_axe') ?? WEAPONS.find(w => w.type === 'axe')!;

// ─── State ────────────────────────────────────────────────────────────────────
interface BajiouState {
  player: Fighter;
  boss: Fighter;
  parts: Particle[];
  playerProjs: Projectile[];
  bossProjs: Projectile[];
  frame: number;
  over: boolean;
  bossHp: number;
  spFlash: { text: string; timer: number };
  counterFlash: { timer: number };
  auraFlash: { timer: number };
  playerDmgDealt: number;
  playerBleedDmg: number;   // player 流血 DOT damage per tick
  playerBleedTicks: number; // player 流血 remaining ticks
  playerBleedTimer: number; // player 流血 frames until next tick
  playerCounterFlash: { timer: number }; // player 反撃 flash
}

// ─── Boss renderer ────────────────────────────────────────────────────────────
function drawBajiou(ctx: CanvasRenderingContext2D, boss: Fighter, frame: number, bossHp: number) {
  const { pos, dir } = boss;
  const cx = pos.x, cy = pos.y;
  const hpPct     = Math.max(0, bossHp / BAJIOU_MAX_HP);
  const enraged   = hpPct < 0.5;
  const intensity = enraged ? (0.5 - hpPct) / 0.5 : 0;

  // ── King's Aura glow (HP < 50%) ─────────────────────────────────────────
  if (enraged) {
    ctx.save();
    const pulse = Math.sin(frame * 0.18) * 0.4 + 0.6;
    ctx.shadowColor  = '#ef4444';
    ctx.shadowBlur   = 24 + intensity * 28;
    ctx.globalAlpha  = (0.2 + intensity * 0.35) * pulse;
    ctx.strokeStyle  = '#ef4444';
    ctx.lineWidth    = 4 + intensity * 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy - FH * 0.45, FW * 1.5 + intensity * 8, FH * 0.6 + intensity * 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ── Base fighter (draws axe automatically via drawWeapon) ───────────────
  drawFighter(ctx, boss, frame);

  // ── Horned helmet overlay ────────────────────────────────────────────────
  const hx = cx, hy = cy - 55;
  ctx.save();
  ctx.lineCap = 'round';
  // Helmet bowl
  ctx.fillStyle = '#78350f'; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(hx, hy + 2, 15, 9, 0, Math.PI, 0);
  ctx.fill();
  // Left horn
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 4; ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(hx - 10, hy - 4);
  ctx.quadraticCurveTo(hx - 24, hy - 24, hx - 16, hy - 38);
  ctx.stroke();
  // Right horn
  ctx.beginPath();
  ctx.moveTo(hx + 10, hy - 4);
  ctx.quadraticCurveTo(hx + 24, hy - 24, hx + 16, hy - 38);
  ctx.stroke();
  // Horn tips (glowing orange when enraged)
  const tipCol = enraged ? '#ef4444' : '#92400e';
  ctx.fillStyle = tipCol;
  ctx.globalAlpha = enraged ? 0.9 : 0.7;
  ctx.beginPath(); ctx.arc(hx - 16, hy - 38, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + 16, hy - 38, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── HP % label ───────────────────────────────────────────────────────────
  const pct = Math.ceil(hpPct * 100);
  ctx.save();
  ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = enraged ? '#fca5a5' : '#d97706';
  ctx.fillText(`${pct}%`, cx, cy - FH - 14);
  if (enraged) {
    ctx.fillStyle = '#ef4444'; ctx.font = 'bold 8px monospace';
    ctx.fillText('激怒', cx, cy - FH - 24);
  }
  ctx.restore();
  void dir;
}

// ─── Scene draw ───────────────────────────────────────────────────────────────
function drawBajiouScene(
  ctx: CanvasRenderingContext2D,
  s: BajiouState,
  frame: number,
  bossId: string | undefined,
) {
  const platforms = STAGES[0].platforms;

  // Background — earthy/rocky
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1c0a00'); bg.addColorStop(1, '#2d1a00');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Atmospheric dust particles
  ctx.save();
  for (let i = 0; i < 25; i++) {
    const sx = (i * 183 + frame * 0.4) % W;
    const sy = (i * 107 + 40) % H;
    ctx.globalAlpha = 0.08 + Math.sin(i * 0.9) * 0.04;
    ctx.fillStyle   = '#92400e';
    ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Platforms
  platforms.forEach((p, i) => {
    const isMain = i === 0;
    ctx.save();
    ctx.shadowColor = isMain ? '#78350f' : '#451a03';
    ctx.shadowBlur  = isMain ? 14 : 8;
    const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
    g.addColorStop(0, isMain ? '#78350f' : '#451a03');
    g.addColorStop(1, isMain ? '#451a03' : '#1c0700');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, isMain ? 6 : 4); ctx.fill();
    ctx.strokeStyle = isMain ? '#92400e' : '#78350f'; ctx.lineWidth = isMain ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, isMain ? 6 : 4); ctx.stroke();
    ctx.restore();
  });

  // Particles
  s.parts.forEach(p => {
    ctx.save(); ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });

  // Projectiles (player specials)
  s.playerProjs.concat(s.bossProjs).forEach(p => {
    for (let i = 0; i < p.trail.length; i++) {
      const tp = p.trail[i];
      ctx.save(); ctx.globalAlpha = (i / p.trail.length) * 0.4; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(tp.x, tp.y, p.size * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.shadowColor = p.color; ctx.shadowBlur = 14;
    const gd = ctx.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, p.size * 1.5);
    gd.addColorStop(0, '#fff'); gd.addColorStop(0.4, p.color); gd.addColorStop(1, p.color + '00');
    ctx.fillStyle = gd;
    ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });

  if (!drawPlayerAsBoss(ctx, s.player, frame, bossId)) {
    drawFighter(ctx, s.player, frame);
  }
  drawBajiou(ctx, s.boss, frame, s.bossHp);
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function drawBajiouHUD(ctx: CanvasRenderingContext2D, s: BajiouState, stats: EffectiveStats) {
  const { player, bossHp, counterFlash, auraFlash, spFlash } = s;
  const hpPct   = Math.max(0, bossHp / BAJIOU_MAX_HP);
  const enraged = hpPct < 0.5;

  // ── Boss HP bar ────────────────────────────────────────────────────────────
  const bw = 360, bh = 22, bx = W / 2 - bw / 2, by = 10;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.beginPath(); ctx.roundRect(bx - 8, by - 6, bw + 16, bh + 28, 8); ctx.fill();
  ctx.fillStyle = '#374151'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
  const hpCol = enraged ? '#ef4444' : hpPct > 0.5 ? '#d97706' : '#f97316';
  ctx.fillStyle = hpCol; ctx.beginPath(); ctx.roundRect(bx, by, bw * hpPct, bh, 6); ctx.fill();
  if (enraged) {
    const pulse = Math.sin(s.frame * 0.2) * 0.5 + 0.5;
    ctx.fillStyle = `rgba(239,68,68,${pulse * 0.25})`;
    ctx.beginPath(); ctx.roundRect(bx, by, bw * hpPct, bh, 6); ctx.fill();
  }
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.stroke();
  ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`🪓 荒ぶる山賊の王　バジオウ  ${Math.max(0, Math.ceil(bossHp))} / ${BAJIOU_MAX_HP}`, W / 2, by + bh + 13);
  ctx.restore();

  // ── King's Aura power meter (top right) ───────────────────────────────────
  const atkBoost = 1 + (1 - hpPct) * 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.roundRect(W - 168, 6, 160, 62, 8); ctx.fill();
  ctx.fillStyle = enraged ? '#ef4444' : '#d97706'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`👑 王の覇気  ×${atkBoost.toFixed(1)}`, W - 88, 24);
  ctx.fillStyle = '#374151'; ctx.beginPath(); ctx.roundRect(W - 158, 30, 140, 8, 4); ctx.fill();
  ctx.fillStyle = enraged ? '#ef4444' : '#f97316';
  ctx.beginPath(); ctx.roundRect(W - 158, 30, 140 * Math.min(1, (1 - hpPct) / 1), 8, 4); ctx.fill();
  ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText(enraged ? '⚠ 激怒状態！' : 'ダメージで攻撃力上昇', W - 88, 52);
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

  // ── Skill legend ──────────────────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(W - 196, H - 115, 188, 103, 8); ctx.fill();
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = '#d97706'; ctx.fillText('🪓 ボス スキル', W - 186, H - 98);
  ctx.fillStyle = '#f87171'; ctx.fillText('流血：攻撃ヒットで裂傷付与', W - 186, H - 80);
  ctx.fillStyle = '#60a5fa'; ctx.fillText('反撃：10%で吹き飛ばし無効＋反撃', W - 186, H - 63);
  ctx.fillStyle = '#fbbf24'; ctx.fillText('王の覇気：被ダメで攻撃力上昇', W - 186, H - 46);
  ctx.fillStyle = '#4ade80'; ctx.fillText(`推奨レベル：${RECOMMENDED_LV}`, W - 186, H - 29);
  ctx.restore();

  // ── Counter flash ─────────────────────────────────────────────────────────
  if (counterFlash.timer > 0) {
    counterFlash.timer--;
    ctx.save();
    ctx.globalAlpha = Math.min(1, counterFlash.timer / 15);
    ctx.font = 'bold 32px sans-serif'; ctx.fillStyle = '#60a5fa';
    ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 20;
    ctx.textAlign = 'center';
    ctx.fillText('⚡ 反撃！', W / 2, H / 2 - 40);
    ctx.restore();
  }

  // ── King's Aura activation flash ─────────────────────────────────────────
  if (auraFlash.timer > 0) {
    auraFlash.timer--;
    ctx.save();
    ctx.globalAlpha = Math.min(1, auraFlash.timer / 18);
    ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 18;
    ctx.textAlign = 'center';
    ctx.fillText('👑 王の覇気　激怒！', W / 2, 115);
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

// ─── BajiouBossPage ───────────────────────────────────────────────────────────
interface BajiouBossPageProps { onBack: () => void; }

export default function BajiouBossPage({ onBack }: BajiouBossPageProps) {
  const playerData = load();
  const stats      = computeEffectiveStats(playerData);
  const bajiouStars = stats.selectedCharacter === 'bajiou' ? ((playerData.bossUnlockLv ?? {})['bajiou'] ?? 0) : 0;
  const stage      = STAGES[0];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef   = useRef<Set<string>>(new Set());
  const gsRef     = useRef<BajiouState | null>(null);
  const rafRef    = useRef<number>(0);

  const [overlay, setOverlay] = useState<{
    type: 'win' | 'lose';
    reward: { xpGained: number; coinsGained: number; leveledUp: boolean };
    fragments?: number;
  } | null>(null);

  const initGame = useCallback(() => {
    const [px, bx] = stage.spawnX;
    const player = makeFighter(px, false, stats, stats.startingStocks);
    const boss   = makeFighter(bx, true, stats, 99, BAJIOU_CFG, BAJIOU_AXE, null);
    boss.color       = BAJIOU_COLOR;
    boss.attackMult  = BASE_ATK;
    boss.defenseMult = 4;   // tough but hittable
    boss.speedMult   = 1.6;
    boss.botAI       = true;
    gsRef.current = {
      player, boss,
      parts: [], playerProjs: [], bossProjs: [],
      frame: 0, over: false,
      bossHp: BAJIOU_MAX_HP,
      spFlash: { text: '', timer: 0 },
      counterFlash: { timer: 0 },
      auraFlash: { timer: 0 },
      playerDmgDealt: 0,
      playerBleedDmg: 0,
      playerBleedTicks: 0,
      playerBleedTimer: 0,
      playerCounterFlash: { timer: 0 },
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
  }, []);
  const handleKeyUp = useCallback((e: KeyboardEvent) => { keysRef.current.delete(e.key); }, []);

  const runLoop = useCallback((ctx: CanvasRenderingContext2D) => {
    const platforms = stage.platforms;
    const [px] = stage.spawnX;
    let wasEnraged = false;

    const loop = () => {
      const s = gsRef.current; if (!s || s.over) return;
      s.frame++;
      const { player, boss, parts, playerProjs, bossProjs } = s;

      // ── Player 王の覇気: scale player attack with own damage% (★3) ────────
      if (bajiouStars >= 3) {
        player.attackMult = stats.attackMult * (1 + Math.min(player.damage, 150) / 75);
      } else {
        player.attackMult = stats.attackMult;
      }

      // ── Player 流血 DOT timer (★1) ────────────────────────────────────────
      if (bajiouStars >= 1 && s.playerBleedTicks > 0) {
        s.playerBleedTimer--;
        if (s.playerBleedTimer <= 0) {
          s.bossHp -= s.playerBleedDmg;
          s.playerBleedTicks--;
          s.playerBleedTimer = s.playerBleedTicks > 0 ? 20 : 0;
          spawn(parts, boss.pos.x + (Math.random() - 0.5) * 30, boss.pos.y - 20, ['#ef4444', '#f87171', '#fca5a5'], 8);
        }
      }

      // ── 王の覇気: scale boss attack with HP loss ─────────────────────────
      const hpPct    = Math.max(0, s.bossHp / BAJIOU_MAX_HP);
      const atkBoost = 1 + (1 - hpPct) * 2;
      boss.attackMult = BASE_ATK * atkBoost;
      const nowEnraged = hpPct < 0.5;
      if (nowEnraged && !wasEnraged) { s.auraFlash = { timer: 90 }; }
      wasEnraged = nowEnraged;

      // ── Boss AI ───────────────────────────────────────────────────────────
      updateBot(boss, player, { ...BAJIOU_CFG, attackMult: boss.attackMult }, bossProjs, platforms);
      updateFighter(boss, new Set(), platforms);
      boss.vel.x = Math.max(-12, Math.min(12, boss.vel.x));

      // ── Player physics ────────────────────────────────────────────────────
      updateFighter(player, keysRef.current, platforms);
      player.vel.x = Math.max(-15, Math.min(15, player.vel.x));

      // ── Boss melee → player ───────────────────────────────────────────────
      {
        const bossR = applyMeleeHit(boss, player, parts, bossProjs);
        // ── Player 反撃 counter (★2) ───────────────────────────────────────
        if (bossR.hit && bajiouStars >= 2 && Math.random() < COUNTER_CHANCE) {
          knockback(boss, player.pos, 1.0, 6, 0.3, 10);
          boss.vel.y = Math.min(boss.vel.y, -2);
          spawn(parts, (player.pos.x + boss.pos.x) / 2, player.pos.y - 30, ['#f59e0b', '#fbbf24', '#ffffff'], 22);
          s.playerCounterFlash = { timer: 50 };
        }
      }

      // ── Player → boss ─────────────────────────────────────────────────────
      {
        const r = applyMeleeHit(player, boss, parts, playerProjs);
        if (r.hit) {
          s.bossHp -= r.dmgDealt * 10;
          s.playerDmgDealt += r.dmgDealt;
          boss.invincible = Math.max(boss.invincible, 28);
          boss.vel.x = Math.max(-4, Math.min(4, boss.vel.x));
          boss.vel.y = Math.max(-6, boss.vel.y);

          // ── 反撃 counter ─────────────────────────────────────────────────
          if (Math.random() < COUNTER_CHANCE && player.state !== 'dead') {
            // negate knockback on boss
            boss.vel.x *= 0.1; boss.vel.y *= 0.1; boss.state = 'idle';
            // slam player back
            knockback(player, boss.pos, boss.attackMult, 8, 0.4, 20);
            spawn(parts, (player.pos.x + boss.pos.x) / 2, player.pos.y - 30,
              ['#3b82f6', '#60a5fa', '#ffffff'], 20);
            s.counterFlash = { timer: 50 };
          }
          // ── Player 流血 (★1): apply bleed DOT on melee hit ─────────────
          if (bajiouStars >= 1) {
            s.playerBleedDmg = 25;
            s.playerBleedTicks = Math.max(s.playerBleedTicks, 5);
            if (s.playerBleedTimer <= 0) s.playerBleedTimer = 20;
          }
        }
      }

      // ── Player projectiles → boss ─────────────────────────────────────────
      for (let i = playerProjs.length - 1; i >= 0; i--) {
        const proj = playerProjs[i];
        const bb   = { x: boss.pos.x - FW / 2, y: boss.pos.y - FH, w: FW, h: FH };
        if (!overlap(proj, bb)) continue;
        s.bossHp -= proj.damage * proj.atkMult * 8;
        s.playerDmgDealt += proj.damage * proj.atkMult;
        spawn(parts, boss.pos.x, boss.pos.y - 30, SP_COLS['specialNeutral'], 14);
        playerProjs.splice(i, 1);
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

      // ── Win / lose ────────────────────────────────────────────────────────
      if (s.bossHp <= 0) {
        s.over = true;
        spawn(parts, boss.pos.x, boss.pos.y - 30, ['#f97316', '#fbbf24', '#22c55e', '#ffffff', '#d97706'], 60);
        const fragDrop = addBossFragments('bajiou', Math.floor(Math.random() * 5) + 1);
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
      drawBajiouScene(ctx, s, s.frame, stats.selectedCharacter);
      drawBajiouHUD(ctx, s, stats);
      // ── Player 反撃 flash ──────────────────────────────────────────────────
      if (s.playerCounterFlash.timer > 0) {
        s.playerCounterFlash.timer--;
        ctx.save();
        ctx.globalAlpha = Math.min(1, s.playerCounterFlash.timer / 15);
        ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 20;
        ctx.textAlign = 'center';
        ctx.fillText('🔱 反撃！', W / 2, H / 2 + 45);
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    return loop;
  }, [stage, stats, bajiouStars]);

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
          className="rounded-xl border shadow-2xl border-amber-900/50"
          style={{ display: 'block', maxWidth: '100vw', maxHeight: '80vh', aspectRatio: `${W}/${H}`, boxShadow: '0 0 40px #92400e22' }}
        />
        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl">
            <div className="text-center px-8">
              {overlay.type === 'win'
                ? <>
                    <div className="text-5xl font-black text-yellow-400 mb-1">撃破！🏆</div>
                    <div className="text-2xl text-white mt-1">バジオウを打ち倒した！</div>
                  </>
                : <>
                    <div className="text-5xl font-black text-red-400 mb-1">GAME OVER 💀</div>
                    <div className="text-xl text-white mt-1">山賊の王に敗れた…</div>
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
                  <div className="text-white font-black text-xl">🪓 ×{overlay.fragments}個</div>
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
        <div className="text-amber-600 font-black text-sm mb-1">🪓 ボス戦  荒ぶる山賊の王　バジオウ  推奨Lv.{RECOMMENDED_LV}</div>
        <div className="flex gap-4 text-xs text-gray-500 flex-wrap justify-center">
          <span>AD/←→: 移動</span><span>W/↑: ジャンプ</span>
          <span>Z/J: 通常攻撃</span><span>X/K: 強攻撃</span><span>↓+Z: 下攻撃</span>
          <span>V/U: アッパー</span><span>空中Z/J: 空中攻撃</span>
          <span className="text-purple-400 font-bold">Space: 必殺技</span>
        </div>
      </div>
    </div>
  );
}

// ─── Overlap helper (local, no proj owner check) ─────────────────────────────
function overlap(proj: Projectile, bb: { x: number; y: number; w: number; h: number }) {
  return proj.pos.x - proj.size < bb.x + bb.w &&
         proj.pos.x + proj.size > bb.x &&
         proj.pos.y - proj.size < bb.y + bb.h &&
         proj.pos.y + proj.size > bb.y;
}
