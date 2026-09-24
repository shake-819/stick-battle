export type GunMode = 'pistol' | 'machinegun' | 'rocket' | 'rifle' | 'dual';

export const GUN_MODES: GunMode[] = ['pistol', 'machinegun', 'rocket', 'rifle', 'dual'];

export const GUN_NAME: Record<GunMode, string> = {
  pistol: 'ピストル', machinegun: 'マシンガン', rocket: 'ロケット', rifle: 'ライフル', dual: '双銃',
};
export const GUN_COLOR: Record<GunMode, string> = {
  pistol: '#94a3b8', machinegun: '#f97316', rocket: '#ef4444', rifle: '#22d3ee', dual: '#a78bfa',
};
export const GUN_EMOJI: Record<GunMode, string> = {
  pistol: '🔫', machinegun: '💥', rocket: '🚀', rifle: '🎯', dual: '✨',
};
export const GUN_INTERVAL: Record<GunMode, number> = {
  pistol: 80, machinegun: 12, rocket: 130, rifle: 95, dual: 50,
};
export const GUN_DMG: Record<GunMode, number> = {
  pistol: 18, machinegun: 6, rocket: 52, rifle: 30, dual: 13,
};
export const GUN_SPEED: Record<GunMode, number> = {
  pistol: 8, machinegun: 13, rocket: 4.5, rifle: 16, dual: 9,
};
export const GUN_SIZE: Record<GunMode, number> = {
  pistol: 8, machinegun: 5, rocket: 14, rifle: 7, dual: 8,
};
export const GUN_KB: Record<GunMode, number> = {
  pistol: 4, machinegun: 1.5, rocket: 12, rifle: 5, dual: 3.5,
};

export function getEffectiveReload(mode: GunMode, lionelStars: number): number {
  const base = GUN_INTERVAL[mode];
  if (lionelStars >= 4 && (mode === 'rocket' || mode === 'rifle')) {
    return Math.floor(base * 0.75);
  }
  return base;
}

export function drawLionelGauge(
  ctx: CanvasRenderingContext2D,
  reload: number,
  maxReload: number,
  mode: GunMode,
  x = 8,
  y = 0,
  w = 196,
) {
  const h = 22;
  const col = GUN_COLOR[mode];
  const pct = maxReload > 0 ? 1 - reload / maxReload : 1;
  const ready = reload <= 0;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = col + '88'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#1f2937';
  ctx.beginPath(); ctx.roundRect(x + 92, y + 7, w - 100, 8, 3); ctx.fill();
  ctx.fillStyle = ready ? col : col + '77';
  ctx.beginPath(); ctx.roundRect(x + 92, y + 7, (w - 100) * pct, 8, 3); ctx.fill();
  ctx.fillStyle = col; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`${GUN_EMOJI[mode]} ${GUN_NAME[mode]}`, x + 5, y + 15);
  if (ready) {
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'right';
    ctx.fillText('READY!', x + w - 4, y + 15);
  }
  ctx.restore();
}
