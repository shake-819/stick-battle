import { drawFighter, FW, FH, type Fighter } from '@/lib/gameEngine';
import { GUN_COLOR, GUN_MODES, type GunMode } from '@/data/lionelGun';

// ─── Player-as-Lionel renderer ────────────────────────────────────────────────
export function drawPlayerAsLionel(
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  frame: number,
  mode: GunMode = 'pistol',
) {
  const { pos } = fighter;
  const cx = pos.x, cy = pos.y;

  const wingAngles = [
    -Math.PI * 0.22, -Math.PI * 0.40, -Math.PI * 0.58, -Math.PI * 0.72, -Math.PI * 0.88,
  ];
  const wingLen = [30, 36, 42, 38, 32];

  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 5; i++) {
      const gmode = GUN_MODES[i];
      const isActive = gmode === mode;
      const angle = wingAngles[i] * side;
      const len   = wingLen[i] + (isActive ? Math.sin(frame * 0.12) * 3 : 0);
      const ex    = cx + Math.cos(angle) * len * side;
      const ey    = cy - 38 + Math.sin(angle) * len;
      const col   = GUN_COLOR[gmode];

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth   = isActive ? 4 : 2;
      ctx.globalAlpha = isActive ? 1 : 0.4;
      if (isActive) { ctx.shadowColor = col; ctx.shadowBlur = 12; }

      const bx = cx + Math.cos(angle) * 15 * side;
      const by = cy - 38 + Math.sin(angle) * 15;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();

      const nx = -Math.sin(angle) * side * 4;
      const ny =  Math.cos(angle) * 4;
      ctx.lineWidth = isActive ? 6 : 3;
      ctx.beginPath();
      ctx.moveTo(bx + nx, by + ny);
      ctx.lineTo(bx - nx, by - ny);
      ctx.stroke();

      if (isActive) {
        ctx.globalAlpha = 0.55 + Math.sin(frame * 0.3) * 0.3;
        ctx.fillStyle   = col;
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }

  drawFighter(ctx, fighter, frame);
}

// ─── Player-as-Bajiou renderer ────────────────────────────────────────────────
export function drawPlayerAsBajiou(
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  frame: number,
) {
  const { pos, state } = fighter;
  const dir = fighter.dir;
  const cx = pos.x, cy = pos.y;
  const enraged   = fighter.damage >= 80;
  const intensity = enraged ? Math.min((fighter.damage - 80) / 80, 1) : 0;

  if (enraged) {
    ctx.save();
    const pulse = Math.sin(frame * 0.18) * 0.4 + 0.6;
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur  = 20 + intensity * 24;
    ctx.globalAlpha = (0.15 + intensity * 0.3) * pulse;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth   = 3 + intensity * 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy - FH * 0.45, FW * 1.4 + intensity * 6, FH * 0.55 + intensity * 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawFighter(ctx, fighter, frame);

  // ── Boss axe swing overlay (attack states) ────────────────────────────────
  const inAtkAxe = state === 'attack' || state === 'strongAttack' || state === 'airAttack';
  if (inAtkAxe) {
    const armY = cy - 37;
    const isStrong = state === 'strongAttack';
    const maxT = isStrong ? 34 : 26;
    const phase = Math.max(0, Math.min(1, 1 - fighter.stateTimer / maxT));
    const baseAngle = -Math.PI * 0.65;
    const swingRange = Math.PI * 0.72;
    const swingAngle = baseAngle + phase * swingRange;
    const armLen = 42;
    const domArmX = cx + Math.cos(swingAngle) * armLen * dir;
    const domArmY = armY + Math.sin(swingAngle) * armLen;

    // Axe handle
    const perpDx = domArmX - cx;
    const perpDy = domArmY - armY;
    const plen = Math.sqrt(perpDx * perpDx + perpDy * perpDy) || 1;
    const px = -perpDy / plen;
    const py = perpDx / plen;

    const axeCol = enraged ? '#ef4444' : '#d97706';
    const axeActive = fighter.attackActive;

    ctx.save();
    ctx.lineCap = 'round';
    if (axeActive) { ctx.shadowColor = axeCol; ctx.shadowBlur = 22; }

    // Handle line from shoulder to axe head
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, armY);
    ctx.lineTo(domArmX, domArmY);
    ctx.stroke();

    // Axe head (perpendicular thick stroke)
    ctx.strokeStyle = axeActive ? '#fbbf24' : axeCol;
    ctx.lineWidth = axeActive ? 12 : 10;
    ctx.beginPath();
    ctx.moveTo(domArmX + px * 20, domArmY + py * 20);
    ctx.lineTo(domArmX - px * 20, domArmY - py * 20);
    ctx.stroke();

    // Axe bit (blade edge arc)
    ctx.strokeStyle = axeActive ? '#fef08a' : '#fbbf24';
    ctx.lineWidth = axeActive ? 4 : 2.5;
    const bitAngle = Math.atan2(py, px);
    ctx.beginPath();
    ctx.arc(domArmX + px * 20, domArmY + py * 20, 8, bitAngle - Math.PI * 0.4, bitAngle + Math.PI * 0.4);
    ctx.stroke();

    if (axeActive) {
      ctx.fillStyle = '#f59e0b';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(domArmX, domArmY, 24, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Horned helmet overlay ────────────────────────────────────────────────
  const hx = cx, hy = cy - 55;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.fillStyle = '#78350f'; ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.ellipse(hx, hy + 2, 15, 9, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 4; ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(hx - 10, hy - 4);
  ctx.quadraticCurveTo(hx - 24, hy - 24, hx - 16, hy - 38);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(hx + 10, hy - 4);
  ctx.quadraticCurveTo(hx + 24, hy - 24, hx + 16, hy - 38);
  ctx.stroke();
  const tipCol = enraged ? '#ef4444' : '#92400e';
  ctx.fillStyle = tipCol; ctx.globalAlpha = enraged ? 0.9 : 0.7;
  ctx.beginPath(); ctx.arc(hx - 16, hy - 38, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(hx + 16, hy - 38, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ─── Player-as-Shinigami renderer ─────────────────────────────────────────────
export function drawPlayerAsShinigami(
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  frame: number,
) {
  const { pos, dir, state } = fighter;
  const cx = pos.x, cy = pos.y;

  // Flowing dark robe (cloak behind body)
  const wave = Math.sin(frame * 0.06) * 4;
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

  drawFighter(ctx, fighter, frame);

  // ── Skull face overlay ─────────────────────────────────────────────────────
  const hx = cx, hy = cy - 55;
  ctx.save();
  ctx.shadowColor = '#7c3aed';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#1e1b4b';
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(hx, hy, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#a78bfa';
  ctx.shadowColor = '#a78bfa';
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.ellipse(hx - 5, hy - 1, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx + 5, hy - 1, 4, 3.5, 0, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#e2e8f0'; ctx.globalAlpha = 0.55; ctx.shadowBlur = 0;
  for (const t of [-1, 0, 1]) {
    ctx.fillRect(hx + t * 3.5 - 1, hy + 5.5, 2.5, 3);
  }
  ctx.restore();

  // ── Boss-quality scythe swing ──────────────────────────────────────────────
  const inAtk = state === 'attack' || state === 'strongAttack';
  const isStrong = state === 'strongAttack';

  let swingAngle: number;
  let scytheAnchorX: number;
  let scytheAnchorY: number;

  if (inAtk) {
    const maxT = isStrong ? 34 : 26;
    const prog = Math.max(0, Math.min(1, 1 - fighter.stateTimer / maxT));
    const ease = Math.sin(prog * Math.PI);
    const swingStart = dir * (isStrong ? -1.1 : -0.85);
    const swingEnd   = dir * (isStrong ?  1.0 :  0.75);
    swingAngle = swingStart + (swingEnd - swingStart) * prog;
    const armExtend = ease * (isStrong ? 22 : 16);
    scytheAnchorX = cx + dir * (30 + armExtend);
    scytheAnchorY = cy - (44 + ease * 12);
  } else if (state === 'upAttack' || state === 'airAttack') {
    // Upward / aerial: scythe raised above head
    const maxT = state === 'upAttack' ? 28 : 22;
    const prog = Math.max(0, Math.min(1, 1 - fighter.stateTimer / maxT));
    swingAngle = dir * (-Math.PI * 0.6 + prog * Math.PI * 0.9);
    scytheAnchorX = cx + dir * 24;
    scytheAnchorY = cy - (50 + prog * 10);
  } else {
    // Idle / walking — gentle float
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

  // Inner edge (thinner)
  ctx.strokeStyle = bladeCol + '77'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(dir * 18, -32, 14, Math.PI * 0.65, Math.PI * 1.35, dir < 0);
  ctx.stroke();

  ctx.restore();
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
export function drawPlayerAsBoss(
  ctx: CanvasRenderingContext2D,
  fighter: Fighter,
  frame: number,
  bossId: string | undefined,
  lionelMode: GunMode = 'pistol',
): boolean {
  if (bossId === 'lionel')    { drawPlayerAsLionel(ctx, fighter, frame, lionelMode); return true; }
  if (bossId === 'bajiou')    { drawPlayerAsBajiou(ctx, fighter, frame); return true; }
  if (bossId === 'shinigami') { drawPlayerAsShinigami(ctx, fighter, frame); return true; }
  return false;
}
