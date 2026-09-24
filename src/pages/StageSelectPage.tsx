import { useState } from 'react';
import { STAGES, type StageDef, type StageGimmick } from '@/data/stages';
import type { Difficulty } from '@/types/game';
import { BOT_CONFIGS } from '@/types/game';

function gimmickBadge(g: StageGimmick) {
  if (g.type === 'moving_platform') return { icon: '↔️', label: '動く足場', color: '#818cf8' };
  if (g.type === 'hazard')          return { icon: '⚠️', label: g.label.replace(/^⚠ /, '').replace(/^⚡ /, ''), color: g.color };
  if (g.type === 'wind')            return { icon: '🌪️', label: '横風', color: g.color };
  if (g.type === 'vanishing_platform') return { icon: '💨', label: '消える足場', color: '#facc15' };
  return null;
}

function getUniqueBadges(gimmicks: StageGimmick[] | undefined) {
  if (!gimmicks) return [];
  const seen = new Set<string>();
  return gimmicks.flatMap(g => {
    const b = gimmickBadge(g);
    if (!b) return [];
    if (seen.has(b.label)) return [];
    seen.add(b.label);
    return [b];
  });
}

interface StageSelectProps {
  difficulty: Difficulty;
  onStart: (stage: StageDef) => void;
  onBack: () => void;
}

const SCALE_X = 200 / 800;
const SCALE_Y = 120 / 500;

function StageMiniPreview({ stage }: { stage: StageDef }) {
  return (
    <svg width="200" height="120" className="rounded-lg block">
      <defs>
        <linearGradient id={`bg-${stage.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={stage.bgTop} />
          <stop offset="100%" stopColor={stage.bgBottom} />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill={`url(#bg-${stage.id})`} rx="8" />
      {stage.platforms.map((p, i) => (
        <rect
          key={i}
          x={p.x * SCALE_X}
          y={p.y * SCALE_Y}
          width={p.w * SCALE_X}
          height={Math.max(p.h * SCALE_Y, 2.5)}
          rx={1.5}
          fill={i === 0 ? stage.platColor1 : stage.platColor2}
          opacity={i === 0 ? 1 : 0.9}
        />
      ))}
      {/* Edge highlight on main platform */}
      <rect
        x={stage.platforms[0].x * SCALE_X}
        y={stage.platforms[0].y * SCALE_Y}
        width={stage.platforms[0].w * SCALE_X}
        height={1.5}
        rx={1}
        fill={stage.platEdge}
        opacity={0.7}
      />
      {/* Player dot */}
      <circle
        cx={stage.spawnX[0] * SCALE_X}
        cy={(stage.mainY - 28) * SCALE_Y}
        r={5}
        fill="#3b82f6"
      />
      {/* Bot dot */}
      <circle
        cx={stage.spawnX[1] * SCALE_X}
        cy={(stage.mainY - 28) * SCALE_Y}
        r={5}
        fill="#ef4444"
      />
    </svg>
  );
}

export default function StageSelectPage({ difficulty, onStart, onBack }: StageSelectProps) {
  const [selected, setSelected] = useState<string>(STAGES[0].id);
  const cfg = BOT_CONFIGS[difficulty];
  const stage = STAGES.find(s => s.id === selected) ?? STAGES[0];

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center justify-center select-none px-4 py-12">
      <button onClick={onBack} className="absolute top-4 left-4 text-gray-500 hover:text-gray-300 text-sm transition-colors">
        ← メニューに戻る
      </button>

      <h2 className="text-3xl font-black mb-1 text-white">ステージ選択</h2>
      <p className="text-gray-400 text-sm mb-6">
        難易度:{' '}
        <span className="font-bold" style={{ color: cfg.label === 'おにむず' ? '#f87171' : '#60a5fa' }}>
          {cfg.label}
        </span>
        　{cfg.sub}
      </p>

      {/* Stage cards */}
      <div className="flex gap-4 flex-wrap justify-center mb-6">
        {STAGES.map(s => {
          const isSel = s.id === selected;
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className="flex flex-col items-center rounded-2xl border-2 transition-all duration-200 p-3 w-56"
              style={{
                borderColor: isSel ? s.glowColor : '#374151',
                background: isSel ? s.glowColor + '18' : '#111827',
                boxShadow: isSel ? `0 0 24px ${s.glowColor}55` : 'none',
                transform: isSel ? 'scale(1.04)' : 'scale(1)',
              }}
            >
              {/* Mini preview */}
              <div className="relative mb-2" style={{ filter: isSel ? `drop-shadow(0 0 8px ${s.glowColor})` : 'none' }}>
                <StageMiniPreview stage={s} />
              </div>

              {/* Name */}
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-lg">{s.emoji}</span>
                <span className="text-white font-black text-base">{s.nameJa}</span>
              </div>

              {/* Description */}
              <p className="text-gray-400 text-xs text-center leading-relaxed">{s.descJa}</p>

              {/* Platform count badge */}
              <div className="mt-2 text-xs rounded-full px-2 py-0.5"
                style={{ background: s.glowColor + '33', color: s.accentColor }}>
                {s.platforms.length}プラットフォーム
              </div>

              {/* Gimmick badges */}
              {getUniqueBadges(s.gimmicks).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1 justify-center">
                  {getUniqueBadges(s.gimmicks).map(b => (
                    <span key={b.label} className="text-xs rounded-full px-1.5 py-0.5 font-bold"
                      style={{ background: b.color + '22', color: b.color, border: `1px solid ${b.color}55` }}>
                      {b.icon} {b.label}
                    </span>
                  ))}
                </div>
              )}

              {isSel && (
                <div className="mt-1 text-xs font-bold" style={{ color: s.accentColor }}>
                  ✓ 選択中
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Start button */}
      <button
        onClick={() => onStart(stage)}
        className="font-black text-xl py-4 px-16 rounded-2xl transition-all active:scale-95 shadow-lg text-white"
        style={{
          background: `linear-gradient(135deg, ${stage.glowColor}cc, ${stage.glowColor}88)`,
          boxShadow: `0 4px 28px ${stage.glowColor}55`,
        }}
      >
        {stage.emoji} バトル開始！
      </button>

      <p className="mt-3 text-gray-600 text-xs">
        青 = プレイヤー　赤 = ボット　（プレビューの点は初期位置）
      </p>
    </div>
  );
}
