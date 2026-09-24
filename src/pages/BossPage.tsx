import { useRef, useEffect, useState, useCallback } from 'react';
import { computeEffectiveStats, load, recordBattleResult, addBossFragments, recordBossDefeat, getBossCooldownRemaining } from '@/store/playerStore';
import { STAGES } from '@/data/stages';
import { BOSSES } from '@/data/bosses';
import BajiouBossPage from '@/pages/BajiouBossPage';
import ShinigamiBossPage from '@/pages/ShinigamiBossPage';
import {
  W, H, FW, FH, BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP, BASE_WALK, SP_COOLDOWN,
  LOCKED_STATES, ACTION_STATES, SPECIAL_NAMES, SP_COLS,
  makeFighter, respawnFighter, overlap, knockback, spawn, applyProjHit,
  startSpecial, mkProj,
  getAttackFrames, applyMeleeHit,
  updateFighter, updateParticles, drawFighter, drawGuardGauge, COUNTER_CD,
  type Fighter, type Particle, type Projectile,
  type EffectiveStats,
} from '@/lib/gameEngine';
import type { StagePlatform } from '@/data/stages';

import { drawLionelGauge, getEffectiveReload } from '@/data/lionelGun';
import { drawPlayerAsBoss } from '@/lib/bossRenderer';

// ─── Gun system ───────────────────────────────────────────────────────────────
type GunMode = 'pistol' | 'machinegun' | 'rocket' | 'rifle' | 'dual';

const GUN_MODES: GunMode[] = ['pistol', 'machinegun', 'rocket', 'rifle', 'dual'];
const GUN_NAME: Record<GunMode, string> = {
  pistol:      'ピストル',
  machinegun:  'マシンガン',
  rocket:      'ロケットランチャー',
  rifle:       'ライフル',
  dual:        '双銃',
};
const GUN_COLOR: Record<GunMode, string> = {
  pistol:      '#94a3b8',
  machinegun:  '#f97316',
  rocket:      '#ef4444',
  rifle:       '#22d3ee',
  dual:        '#a78bfa',
};
const GUN_EMOJI: Record<GunMode, string> = {
  pistol: '🔫', machinegun: '💥', rocket: '🚀', rifle: '🎯', dual: '✨',
};
// Fire interval per mode (frames)
const GUN_INTERVAL: Record<GunMode, number> = {
  pistol: 80, machinegun: 12, rocket: 130, rifle: 95, dual: 50,
};
// Damage per bullet
const GUN_DMG: Record<GunMode, number> = {
  pistol: 18, machinegun: 6, rocket: 52, rifle: 30, dual: 13,
};
// Bullet speed
const GUN_SPEED: Record<GunMode, number> = {
  pistol: 8, machinegun: 13, rocket: 4.5, rifle: 16, dual: 9,
};
// Bullet size
const GUN_SIZE: Record<GunMode, number> = {
  pistol: 8, machinegun: 5, rocket: 14, rifle: 7, dual: 8,
};
// Knockback per bullet
const GUN_KB: Record<GunMode, number> = {
  pistol: 4, machinegun: 1.5, rocket: 12, rifle: 5, dual: 3.5,
};

// HP dealt to boss per player attack unit (scales boss to feel like a tanky fight)
const BOSS_MAX_HP    = 6000;
const MODE_DURATION  = 360; // frames between gun mode switches
const RICOCHET_CHANCE = 0.30;
const HEADSHOT_MULT   = 5;
const RECOMMENDED_LV  = 250;

// Extended boss projectile
interface BossProj extends Projectile {
  ricochetable: boolean;
  bounced: boolean;
  isRocket: boolean;
  mode: GunMode;
}

// Boss doesn't get knocked out; its "health" is tracked separately
interface BossState {
  player: Fighter;
  boss: Fighter;
  parts: Particle[];
  playerProjs: Projectile[];   // player projectiles
  bossProjs: BossProj[];       // boss projectiles (with ricochet)
  frame: number;
  over: boolean;
  bossHp: number;
  gunMode: GunMode;
  modeTimer: number;
  fireTimer: number;
  modeFlash: { text: string; timer: number };
  spFlash: { text: string; timer: number };
  playerDmgDealt: number;
  // player Lionel gun (when player selected Lionel as character)
  playerLionelReload: number;
  playerLionelMode: GunMode;
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────

function drawBossBackground(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a1a');
  bg.addColorStop(1, '#1a0a0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // blood-red atmospheric particles
  ctx.save();
  ctx.fillStyle = '#ff2200';
  for (let i = 0; i < 30; i++) {
    const sx = (i * 173 + 60) % W;
    const sy = (i * 97  + 30) % H;
    ctx.globalAlpha = 0.12 + Math.sin(i * 0.7) * 0.06;
    ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawPlatforms(ctx: CanvasRenderingContext2D, platforms: StagePlatform[]) {
  platforms.forEach((p, i) => {
    const isMain = i === 0;
    ctx.save();
    ctx.shadowColor = isMain ? '#dc2626' : '#7f1d1d';
    ctx.shadowBlur  = isMain ? 14 : 8;
    const g = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
    g.addColorStop(0, isMain ? '#7f1d1d' : '#450a0a');
    g.addColorStop(1, isMain ? '#450a0a' : '#1c0404');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, isMain ? 6 : 4); ctx.fill();
    ctx.strokeStyle = isMain ? '#dc2626' : '#7f1d1d'; ctx.lineWidth = isMain ? 2 : 1;
    ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, isMain ? 6 : 4); ctx.stroke();
    ctx.restore();
  });
}

// Draw 銃神ライオネル — body + 5 pairs of gun wings
function drawBoss(ctx: CanvasRenderingContext2D, boss: Fighter, frame: number, mode: GunMode, bossHp: number) {
  const { pos, dir } = boss;
  const cx = pos.x, cy = pos.y;

  // ── Gun wings (behind body) ────────────────────────────────────────────────
  const wingAngles = [
    -Math.PI * 0.22,
    -Math.PI * 0.40,
    -Math.PI * 0.58,
    -Math.PI * 0.72,
    -Math.PI * 0.88,
  ];
  const wingLen = [38, 46, 52, 48, 40];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 5; i++) {
      const gmode = GUN_MODES[i];
      const isActive = gmode === mode;
      const angle = wingAngles[i] * side;
      const len   = wingLen[i] + (isActive ? Math.sin(frame * 0.12) * 4 : 0);
      const ex    = cx + Math.cos(angle) * len * side;
      const ey    = cy - 38 + Math.sin(angle) * len;
      const col   = GUN_COLOR[gmode];

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth   = isActive ? 4.5 : 2.5;
      ctx.globalAlpha = isActive ? 1 : 0.45;
      if (isActive) { ctx.shadowColor = col; ctx.shadowBlur = 14; }

      // barrel (line from body center toward tip)
      const bx = cx + Math.cos(angle) * 18 * side;
      const by = cy - 38 + Math.sin(angle) * 18;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();

      // grip (small perpendicular rect)
      const nx = -Math.sin(angle) * side * 5;
      const ny =  Math.cos(angle) * 5;
      ctx.lineWidth = isActive ? 7 : 4;
      ctx.beginPath();
      ctx.moveTo(bx + nx, by + ny);
      ctx.lineTo(bx - nx, by - ny);
      ctx.stroke();

      // muzzle flash when active
      if (isActive) {
        ctx.globalAlpha = 0.55 + Math.sin(frame * 0.3) * 0.3;
        ctx.fillStyle   = col;
        ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ── Fighter body (reuse engine renderer) ──────────────────────────────────
  drawFighter(ctx, boss, frame);

  // ── HP % label above head ─────────────────────────────────────────────────
  const pct = Math.ceil((bossHp / BOSS_MAX_HP) * 100);
  ctx.save();
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fca5a5';
  ctx.fillText(`${pct}%`, cx, cy - FH - 14);
  ctx.restore();
}

function drawBossProj(ctx: CanvasRenderingContext2D, proj: BossProj) {
  const col = GUN_COLOR[proj.mode];
  // trail
  for (let i = 0; i < proj.trail.length; i++) {
    const tp = proj.trail[i];
    ctx.save();
    ctx.globalAlpha = (i / proj.trail.length) * 0.45;
    ctx.fillStyle   = col;
    ctx.beginPath(); ctx.arc(tp.x, tp.y, proj.size * 0.55, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = col; ctx.shadowBlur = proj.isRocket ? 26 : 18;
  const g = ctx.createRadialGradient(proj.pos.x, proj.pos.y, 0, proj.pos.x, proj.pos.y, proj.size * 1.6);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, col + '00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(proj.pos.x, proj.pos.y, proj.size * 1.6, 0, Math.PI * 2); ctx.fill();
  if (proj.isRocket) {
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(proj.pos.x, proj.pos.y, proj.size * 2.4, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawPlayerProj(ctx: CanvasRenderingContext2D, proj: Projectile) {
  for (let i = 0; i < proj.trail.length; i++) {
    const tp = proj.trail[i];
    ctx.save(); ctx.globalAlpha = (i / proj.trail.length) * 0.45;
    ctx.fillStyle = proj.color;
    ctx.beginPath(); ctx.arc(tp.x, tp.y, proj.size * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.save();
  ctx.shadowColor = proj.color; ctx.shadowBlur = 18;
  const g = ctx.createRadialGradient(proj.pos.x, proj.pos.y, 0, proj.pos.x, proj.pos.y, proj.size * 1.6);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, proj.color); g.addColorStop(1, proj.color + '00');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(proj.pos.x, proj.pos.y, proj.size * 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function drawHUD(ctx: CanvasRenderingContext2D, s: BossState, stats: EffectiveStats) {
  const { player, bossHp, gunMode, modeTimer, modeFlash, spFlash } = s;

  // ── Boss HP bar (top center) ────────────────────────────────────────────────
  const bw = 360, bh = 22, bx = W / 2 - bw / 2, by = 10;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.beginPath(); ctx.roundRect(bx - 8, by - 6, bw + 16, bh + 28, 8); ctx.fill();
  ctx.fillStyle = '#374151'; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill();
  const hpPct = Math.max(0, bossHp / BOSS_MAX_HP);
  const hpCol = hpPct > 0.5 ? '#dc2626' : hpPct > 0.25 ? '#f97316' : '#fbbf24';
  ctx.fillStyle = hpCol; ctx.beginPath(); ctx.roundRect(bx, by, bw * hpPct, bh, 6); ctx.fill();
  ctx.shadowColor = hpCol; ctx.shadowBlur = 10;
  ctx.strokeStyle = '#7f1d1d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.stroke();
  ctx.fillStyle = '#f1f5f9'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`👹 銃神ライオネル  ${Math.max(0, Math.ceil(bossHp))} / ${BOSS_MAX_HP}`, W / 2, by + bh + 13); // nameJa via component
  ctx.restore();

  // ── Gun mode indicator (top right) ─────────────────────────────────────────
  const modeBarW = 150, modePct = modeTimer / MODE_DURATION;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); ctx.roundRect(W - 168, 6, 160, 62, 8); ctx.fill();
  ctx.fillStyle = GUN_COLOR[gunMode]; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`${GUN_EMOJI[gunMode]} ${GUN_NAME[gunMode]}`, W - 88, 28);
  ctx.fillStyle = '#374151'; ctx.beginPath(); ctx.roundRect(W - 158, 34, modeBarW, 8, 4); ctx.fill();
  ctx.fillStyle = GUN_COLOR[gunMode]; ctx.beginPath(); ctx.roundRect(W - 158, 34, modeBarW * modePct, 8, 4); ctx.fill();
  ctx.fillStyle = '#9ca3af'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
  ctx.fillText('臨機応変 切替まで', W - 88, 56);
  ctx.restore();

  // ── Player panel (bottom left) ─────────────────────────────────────────────
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

  // ── Mode switch flash ───────────────────────────────────────────────────────
  if (modeFlash.timer > 0) {
    modeFlash.timer--;
    ctx.save();
    ctx.globalAlpha = Math.min(1, modeFlash.timer / 20);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = GUN_COLOR[gunMode];
    ctx.shadowColor = GUN_COLOR[gunMode]; ctx.shadowBlur = 18;
    ctx.textAlign = 'center';
    ctx.fillText(modeFlash.text, W / 2, 100);
    ctx.restore();
  }

  // ── SP flash ────────────────────────────────────────────────────────────────
  if (spFlash.timer > 0) {
    spFlash.timer--;
    ctx.save();
    ctx.globalAlpha = Math.min(1, spFlash.timer / 20);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#c4b5fd';
    ctx.shadowColor = '#818cf8'; ctx.shadowBlur = 16;
    ctx.textAlign = 'center';
    ctx.fillText(spFlash.text, W / 2, 140);
    ctx.restore();
  }

  // ── Skill legend (bottom right) ─────────────────────────────────────────────
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.roundRect(W - 196, H - 115, 188, 103, 8); ctx.fill();
  ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
  ctx.fillStyle = '#f87171'; ctx.fillText('👹 ボス スキル', W - 186, H - 98);
  ctx.fillStyle = '#fbbf24'; ctx.fillText('臨機応変：5種の銃を切り替え', W - 186, H - 80);
  ctx.fillStyle = '#60a5fa'; ctx.fillText('跳弾：30%で弾が跳ね返る', W - 186, H - 63);
  ctx.fillStyle = '#f97316'; ctx.fillText('ヘッドショット：頭に当たると5倍', W - 186, H - 46);
  ctx.fillStyle = '#4ade80'; ctx.fillText(`推奨レベル：${RECOMMENDED_LV}`, W - 186, H - 29);
  ctx.restore();
}

// ─── Boss-projectile physics (with ricochet) ──────────────────────────────────
function updateBossProjs(projs: BossProj[], platforms: StagePlatform[]) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.trail.push({ x: p.pos.x, y: p.pos.y });
    if (p.trail.length > 7) p.trail.shift();
    const prevY = p.pos.y;
    p.pos.x += p.vel.x;
    p.pos.y += p.vel.y;
    p.life--;

    // Platform collision — check top surface crossing
    let destroyed = false;
    for (const pl of platforms) {
      const inX = p.pos.x > pl.x + 4 && p.pos.x < pl.x + pl.w - 4;
      if (inX && prevY <= pl.y && p.pos.y >= pl.y) {
        if (p.ricochetable && !p.bounced && Math.random() < RICOCHET_CHANCE) {
          p.vel.y = -Math.abs(p.vel.y) * 0.75;
          p.vel.x *= 0.85;
          p.bounced = true;
          p.life   += 60;
          p.pos.y   = pl.y - 1;
        } else {
          p.life = 0; // destroy on platform
          destroyed = true;
        }
        break;
      }
    }

    if (destroyed || p.life <= 0 || p.pos.x < -150 || p.pos.x > W + 150 || p.pos.y < -250 || p.pos.y > H + 150) {
      projs.splice(i, 1);
    }
  }
}

function updatePlayerProjs(projs: Projectile[]) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.trail.push({ x: p.pos.x, y: p.pos.y });
    if (p.trail.length > 7) p.trail.shift();
    p.pos.x += p.vel.x; p.pos.y += p.vel.y; p.life--;
    if (p.life <= 0 || p.pos.x < -120 || p.pos.x > W + 120 || p.pos.y < -250 || p.pos.y > H + 120)
      projs.splice(i, 1);
  }
}

// Fire a boss projectile at the player
let _bpid = 10000;
function fireBossProj(boss: Fighter, player: Fighter, mode: GunMode, offset = 0): BossProj {
  const dx  = player.pos.x - boss.pos.x;
  const dy  = (player.pos.y - 30) - (boss.pos.y - 40);
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const spd = GUN_SPEED[mode];
  const vx  = (dx / len) * spd + (offset !== 0 ? Math.cos(offset) * spd * 0.3 : 0);
  const vy  = (dy / len) * spd + (offset !== 0 ? Math.sin(offset) * spd * 0.3 : 0);
  const canRicochet = mode === 'pistol' || mode === 'dual' || mode === 'rifle';
  return {
    id: _bpid++,
    pos: { x: boss.pos.x + boss.dir * 24, y: boss.pos.y - 40 },
    vel: { x: vx, y: vy },
    owner: 'bot',
    damage: GUN_DMG[mode],
    knockback: GUN_KB[mode],
    atkMult: 1,
    size: GUN_SIZE[mode],
    life: 150,
    color: GUN_COLOR[mode],
    trail: [],
    ricochetable: canRicochet,
    bounced: false,
    isRocket: mode === 'rocket',
    mode,
  };
}

// ─── BossPage ──────────────────────────────────────────────────────────────────
interface BossPageProps { bossId: string; onBack: () => void; }

function LionelBossPage({ bossId, onBack }: BossPageProps) {
  const bossDef    = BOSSES.find(b => b.id === bossId) ?? BOSSES[0];
  const playerData = load();
  const stats      = computeEffectiveStats(playerData);
  const lionelStars = (playerData.bossUnlockLv ?? {})['lionel'] ?? 0;
  const stage      = STAGES[0]; // 戦場
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef   = useRef<Set<string>>(new Set());
  const gsRef     = useRef<BossState | null>(null);
  const rafRef    = useRef<number>(0);

  const [overlay, setOverlay] = useState<{
    type: 'win' | 'lose';
    reward: { xpGained: number; coinsGained: number; leveledUp: boolean };
    fragments?: number;
  } | null>(null);

  const initGame = useCallback(() => {
    const [px, bx] = stage.spawnX;
    const player = makeFighter(px, false, stats, stats.startingStocks);
    // Boss: high defense so knockback barely moves it; stocks = 99 so it never dies from blast zone
    const boss   = makeFighter(bx, true, stats, 99);
    boss.color        = '#dc2626';
    boss.attackMult   = 0;   // boss uses only projectiles
    boss.defenseMult  = 6;   // resistant but not immune to knockback
    boss.speedMult    = 1.6; // moves around
    boss.botAI        = true; // updateFighter handles state/animation

    gsRef.current = {
      player, boss,
      parts: [], playerProjs: [], bossProjs: [],
      frame: 0, over: false,
      bossHp: BOSS_MAX_HP,
      gunMode: 'pistol',
      modeTimer: MODE_DURATION,
      fireTimer: 40,
      modeFlash: { text: '', timer: 0 },
      spFlash:   { text: '', timer: 0 },
      playerDmgDealt: 0,
      playerLionelReload: 0,
      playerLionelMode: 'pistol',
    };
  }, [stats, stage]);

  const isLionelPlayer = stats.selectedCharacter === 'lionel';

  const fireLionelPlayerGun = (s: NonNullable<typeof gsRef.current>) => {
    const mode = s.playerLionelMode;
    const player = s.player;
    const spd = GUN_SPEED[mode] * player.dir;
    s.playerProjs.push(mkProj('player', player.pos.x + player.dir*22, player.pos.y-35, spd, GUN_DMG[mode], GUN_KB[mode], stats.attackMult, GUN_COLOR[mode]));
    if (mode === 'dual') {
      s.playerProjs.push(mkProj('player', player.pos.x + player.dir*22, player.pos.y-50, spd, GUN_DMG[mode], GUN_KB[mode], stats.attackMult, GUN_COLOR[mode]));
    }
    s.playerLionelReload = getEffectiveReload(mode, lionelStars);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keysRef.current.add(e.key);
    const s = gsRef.current; if (!s || s.over) return;
    const { player } = s;
    const inAction = ACTION_STATES.includes(player.state);

    // 1-5: player Lionel gun mode switch
    if (isLionelPlayer && e.key >= '1' && e.key <= '5') {
      const idx = parseInt(e.key) - 1;
      if (GUN_MODES[idx]) { s.playerLionelMode = GUN_MODES[idx]; s.playerLionelReload = 0; }
    }

    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
      e.preventDefault();
      if (player.jumpsLeft > 0 && !LOCKED_STATES.includes(player.state)) {
        const jv = player.jumpsLeft === player.maxJumps ? BASE_JUMP : BASE_DJUMP;
        player.vel.y = jv * player.jumpMult; player.jumpsLeft--; player.state = 'jump';
      }
    }
    if (e.key === 'z' || e.key === 'Z' || e.key === 'j' || e.key === 'J') {
      if (isLionelPlayer && s.playerLionelReload <= 0) {
        fireLionelPlayerGun(s);
      } else if (!inAction && player.state !== 'dead') {
        const dn = keysRef.current.has('ArrowDown') || keysRef.current.has('s') || keysRef.current.has('S');
        const inAir = player.state === 'jump' || player.state === 'fall';
        const t = inAir ? 'airAttack' : dn ? 'downAttack' : 'attack';
        player.state = t; player.stateTimer = getAttackFrames(player.weapon, t); player.attackActive = false;
      }
    }
    if (e.key === 'x' || e.key === 'X' || e.key === 'k' || e.key === 'K') {
      if (isLionelPlayer && s.playerLionelReload <= 0) {
        fireLionelPlayerGun(s);
      } else if (!inAction && player.state !== 'dead') {
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
  }, [isLionelPlayer, stats.attackMult]);
  const handleKeyUp = useCallback((e: KeyboardEvent) => { keysRef.current.delete(e.key); }, []);

  const runLoop = useCallback((ctx: CanvasRenderingContext2D) => {
    const platforms = stage.platforms;
    const [px]      = stage.spawnX;

    const loop = () => {
      const s = gsRef.current; if (!s || s.over) return;
      s.frame++;
      if (s.playerLionelReload > 0) s.playerLionelReload--;
      const { player, boss, parts, playerProjs, bossProjs } = s;

      // ── Boss face player ──────────────────────────────────────────────────
      boss.dir = player.pos.x < boss.pos.x ? -1 : 1;

      // ── Gun mode switch ───────────────────────────────────────────────────
      s.modeTimer--;
      if (s.modeTimer <= 0) {
        const cur = GUN_MODES.indexOf(s.gunMode);
        s.gunMode   = GUN_MODES[(cur + 1) % GUN_MODES.length];
        s.modeTimer = MODE_DURATION;
        s.fireTimer = GUN_INTERVAL[s.gunMode];
        s.modeFlash = { text: `臨機応変！ ${GUN_EMOJI[s.gunMode]} ${GUN_NAME[s.gunMode]}`, timer: 70 };
      }

      // ── Boss firing AI ────────────────────────────────────────────────────
      if (player.state !== 'dead') {
        s.fireTimer--;
        if (s.fireTimer <= 0) {
          const mode = s.gunMode;
          if (mode === 'dual') {
            bossProjs.push(fireBossProj(boss, player, mode, -0.15));
            bossProjs.push(fireBossProj(boss, player, mode,  0.15));
          } else if (mode === 'machinegun') {
            // slight random spread
            const spread = (Math.random() - 0.5) * 0.4;
            const bp = fireBossProj(boss, player, mode, spread);
            bossProjs.push(bp);
          } else {
            bossProjs.push(fireBossProj(boss, player, mode, 0));
          }
          s.fireTimer = GUN_INTERVAL[mode];
        }
      }

      // ── Boss AI movement ─────────────────────────────────────────────────
      if (boss.state !== 'dead') {
        const dx      = player.pos.x - boss.pos.x;
        const dist    = Math.abs(dx);
        const bSpd    = BASE_WALK * 1.8;
        const ideal   = 185;
        boss.dir = dx > 0 ? 1 : -1;
        if (dist > ideal + 60) {
          boss.vel.x = boss.dir * bSpd;
        } else if (dist < ideal - 60) {
          boss.vel.x = -boss.dir * bSpd * 0.6;
        } else {
          boss.vel.x *= 0.65;
        }
        // Jump to follow player to higher platforms
        const dy = player.pos.y - boss.pos.y;
        if (dy < -55 && boss.onGround && boss.jumpsLeft > 0 && s.frame % 80 < 3) {
          boss.vel.y = BASE_JUMP * 1.1; boss.jumpsLeft--;
        }
        if (dy < -110 && !boss.onGround && boss.jumpsLeft > 0 && boss.vel.y > -4 && s.frame % 95 < 3) {
          boss.vel.y = BASE_DJUMP; boss.jumpsLeft--;
        }
        // Stage boundary push
        if (boss.pos.x < 110) boss.vel.x = Math.abs(boss.vel.x) + 0.5;
        if (boss.pos.x > W - 110) boss.vel.x = -(Math.abs(boss.vel.x) + 0.5);
      }

      // ── Player physics ────────────────────────────────────────────────────
      updateFighter(player, keysRef.current, platforms);
      player.vel.x = Math.max(-15, Math.min(15, player.vel.x));
      updateFighter(boss, new Set(), platforms);
      boss.vel.x = Math.max(-10, Math.min(10, boss.vel.x));

      // ── Melee: player → boss (all attack types) ───────────────────────────
      {
        const r = applyMeleeHit(player, boss, parts, s.playerProjs);
        if (r.hit) {
          s.bossHp -= r.dmgDealt * 12;
          s.playerDmgDealt += r.dmgDealt;
          boss.invincible = Math.max(boss.invincible, 28);
          // cap knockback so boss doesn't fly off
          boss.vel.x = Math.max(-5, Math.min(5, boss.vel.x));
          boss.vel.y = Math.max(-8, boss.vel.y);
        }
      }

      // ── Player projectiles → boss ─────────────────────────────────────────
      for (let i = playerProjs.length - 1; i >= 0; i--) {
        const proj = playerProjs[i];
        const bb   = { x: boss.pos.x - FW / 2, y: boss.pos.y - FH, w: FW, h: FH };
        if (!overlap(proj.pos.x - proj.size, proj.pos.y - proj.size, proj.size * 2, proj.size * 2, bb.x, bb.y, bb.w, bb.h)) continue;
        // ── ヘッドショット player (★3) ────────────────────────────────────
        const headTop = boss.pos.y - 67;
        const headBot = boss.pos.y - 43;
        const isPlayerHead = lionelStars >= 3 && proj.pos.y >= headTop && proj.pos.y <= headBot;
        const pHsMult = isPlayerHead ? HEADSHOT_MULT : 1;
        s.bossHp -= proj.damage * proj.atkMult * 10 * pHsMult;
        s.playerDmgDealt += proj.damage * proj.atkMult * pHsMult;
        spawn(parts, boss.pos.x, boss.pos.y - 30, SP_COLS['specialNeutral'], 16);
        if (isPlayerHead) {
          spawn(parts, boss.pos.x, boss.pos.y - 55, ['#a78bfa', '#c4b5fd', '#ffffff'], 20);
          s.modeFlash.text  = `🎯 ヘッドショット！ ×${HEADSHOT_MULT}`;
          s.modeFlash.timer = 55;
        }
        playerProjs.splice(i, 1);
      }

      // ── Boss projectiles → player ─────────────────────────────────────────
      for (let i = bossProjs.length - 1; i >= 0; i--) {
        const proj = bossProjs[i];
        if (player.invincible > 0 || player.state === 'dead') continue;
        const pb = { x: player.pos.x - FW / 2, y: player.pos.y - FH, w: FW, h: FH };
        if (!overlap(proj.pos.x - proj.size, proj.pos.y - proj.size, proj.size * 2, proj.size * 2, pb.x, pb.y, pb.w, pb.h)) continue;

        if (player.state === 'guard') {
          // Blocked — drain gauge, push back, no damage (headshots also blocked)
          applyProjHit(player, proj.pos, proj.vel, 1.0, proj.knockback, proj.damage, parts,
            ['#93c5fd', '#bfdbfe', '#ffffff'], [proj.color, '#ffffff']);
          bossProjs.splice(i, 1);
          continue;
        }

        // Headshot detection: top ~25% of hitbox (head region above body)
        const headTop = player.pos.y - 67;   // top of head circle
        const headBot = player.pos.y - 43;   // bottom of head / top of body
        const isHead  = proj.pos.y >= headTop && proj.pos.y <= headBot;
        const mult    = isHead ? HEADSHOT_MULT : 1;

        const dmg = proj.damage * mult;
        knockback(player, proj.pos, 1.0, proj.knockback * mult, 0.40, dmg);
        if (isHead) {
          spawn(parts, player.pos.x, player.pos.y - 55, ['#f97316', '#fbbf24', '#ffffff'], 22);
          s.modeFlash.text  = `💥 ヘッドショット！  ×${HEADSHOT_MULT}`;
          s.modeFlash.timer = 60;
        } else {
          spawn(parts, proj.pos.x, proj.pos.y, [proj.color, '#ffffff'], 10);
        }
        if (proj.isRocket) {
          // Rocket explosion splash
          spawn(parts, proj.pos.x, proj.pos.y, ['#ef4444', '#f97316', '#fbbf24', '#ffffff'], 32);
        }
        bossProjs.splice(i, 1);
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
        spawn(parts, boss.pos.x, boss.pos.y - 30, ['#f97316', '#fbbf24', '#22c55e', '#ffffff', '#a78bfa'], 60);
        const reward = recordBattleResult(true, s.playerDmgDealt);
        const fragDrop = addBossFragments(bossId, Math.floor(Math.random() * 5) + 1);
        recordBossDefeat();
        setOverlay({ type: 'win', reward, fragments: fragDrop });
        return;
      }
      if (player.stocks <= 0 && player.state === 'dead' && player.stateTimer <= 0) {
        s.over = true;
        const reward = recordBattleResult(false, s.playerDmgDealt);
        setOverlay({ type: 'lose', reward });
        return;
      }

      // ── Projectile updates ────────────────────────────────────────────────
      updateBossProjs(bossProjs, platforms);
      // Player projectile update with 跳弾 ricochet (★2)
      if (lionelStars >= 2) {
        for (let i = playerProjs.length - 1; i >= 0; i--) {
          const p = playerProjs[i];
          p.trail.push({ x: p.pos.x, y: p.pos.y });
          if (p.trail.length > 7) p.trail.shift();
          // ☆5 自動追尾
          if (lionelStars >= 5) {
            const tx = boss.pos.x, ty = boss.pos.y - 40;
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
          if (!(p as any)._bounced) {
            for (const pl of platforms) {
              const inX = p.pos.x > pl.x + 4 && p.pos.x < pl.x + pl.w - 4;
              if (inX && prevY <= pl.y && p.pos.y >= pl.y) {
                if (Math.random() < RICOCHET_CHANCE) {
                  p.vel.y = -Math.abs(p.vel.y) * 0.75;
                  p.vel.x *= 0.85; p.life += 60; p.pos.y = pl.y - 1;
                  (p as any)._bounced = true;
                } else { p.life = 0; }
                break;
              }
            }
          }
          if (p.life <= 0 || p.pos.x < -120 || p.pos.x > W + 120 || p.pos.y < -250 || p.pos.y > H + 120)
            playerProjs.splice(i, 1);
        }
      } else {
        updatePlayerProjs(playerProjs);
      }
      updateParticles(parts);

      // ── Draw ─────────────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);
      drawBossBackground(ctx);
      drawPlatforms(ctx, platforms);

      // particles
      parts.forEach(p => {
        ctx.save(); ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      });

      // player projectiles
      playerProjs.forEach(p => drawPlayerProj(ctx, p));
      // boss projectiles
      bossProjs.forEach(p => drawBossProj(ctx, p));

      // fighters
      if (!drawPlayerAsBoss(ctx, player, s.frame, stats.selectedCharacter, s.playerLionelMode as import('@/data/lionelGun').GunMode)) {
        drawFighter(ctx, player, s.frame);
      }
      drawBoss(ctx, boss, s.frame, s.gunMode, s.bossHp);

      drawHUD(ctx, s, stats);
      if (isLionelPlayer) {
        drawLionelGauge(ctx, s.playerLionelReload, getEffectiveReload(s.playerLionelMode as import('@/data/lionelGun').GunMode, lionelStars), s.playerLionelMode as import('@/data/lionelGun').GunMode, 8, H - 152);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    return loop;
  }, [stage, stats, lionelStars]);

  useEffect(() => {
    initGame();
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    const ctx = canvasRef.current!.getContext('2d')!;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(runLoop(ctx));
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
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
          className="rounded-xl border shadow-2xl border-red-900/50"
          style={{ display: 'block', maxWidth: '100vw', maxHeight: '80vh', aspectRatio: `${W}/${H}`, boxShadow: '0 0 40px #dc262622' }}
        />
        {overlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl">
            <div className="text-center px-8">
              {overlay.type === 'win'
                ? <>
                    <div className="text-5xl font-black text-yellow-400 mb-1">撃破！🏆</div>
                    <div className="text-2xl text-white mt-1">{bossDef.nameJa}を倒した！</div>
                  </>
                : <>
                    <div className="text-5xl font-black text-red-400 mb-1">GAME OVER 💀</div>
                    <div className="text-xl text-white mt-1">{bossDef.nameJa}に敗れた…</div>
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
                  <div className="text-white font-black text-xl">{bossDef.emoji} ×{overlay.fragments}個</div>
                  <div className="text-purple-400 text-[10px] mt-0.5">アイテムボックスで確認できます</div>
                </div>
              )}
              {overlay.reward.leveledUp && (
                <div className="mb-4 bg-yellow-400/20 border border-yellow-400 rounded-xl px-6 py-2 text-yellow-300 font-black text-lg animate-pulse">⬆ LEVEL UP！</div>
              )}
              <div className="flex gap-3 justify-center">
                
                <button onClick={onBack}   className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg px-8 py-3 rounded-xl transition-all active:scale-95">メニューへ</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 text-center">
        <div className="text-red-400 font-black text-sm mb-1">{bossDef.emoji} ボス戦  {bossDef.nameJa}  推奨Lv.{bossDef.recommendedLevel}</div>
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

// ─── Router ───────────────────────────────────────────────────────────────────
export default function BossPage({ bossId, onBack }: BossPageProps) {
  const [cooldownSec, setCooldownSec] = useState(() => Math.ceil(getBossCooldownRemaining()));

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = setInterval(() => {
      const rem = Math.ceil(getBossCooldownRemaining());
      setCooldownSec(rem);
    }, 500);
    return () => clearInterval(id);
  }, [cooldownSec]);

  if (cooldownSec > 0) {
    return (
      <div className="w-full h-screen bg-gray-950 flex flex-col items-center justify-center select-none">
        <div className="text-6xl mb-4">⏳</div>
        <div className="text-white font-black text-2xl mb-2">クールダウン中</div>
        <div className="text-gray-400 text-sm mb-6">ボスを倒した後は1分間の待機が必要です</div>
        <div className="bg-red-900/50 border border-red-600 rounded-2xl px-12 py-6 text-center">
          <div className="text-red-300 text-xs mb-1">残り時間</div>
          <div className="text-white font-black text-5xl tabular-nums">{cooldownSec}秒</div>
        </div>
        <button
          onClick={onBack}
          className="mt-8 bg-gray-700 hover:bg-gray-600 text-white font-bold px-8 py-3 rounded-xl transition-colors"
        >
          もどる
        </button>
      </div>
    );
  }

  if (bossId === 'bajiou')    return <BajiouBossPage onBack={onBack} />;
  if (bossId === 'shinigami') return <ShinigamiBossPage onBack={onBack} />;
  return <LionelBossPage bossId={bossId} onBack={onBack} />;
}
