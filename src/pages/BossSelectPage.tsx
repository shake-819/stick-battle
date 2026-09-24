import { load } from '@/store/playerStore';
import { BOSSES, type BossDef } from '@/data/bosses';

interface BossSelectPageProps {
  onSelect: (bossId: string) => void;
  onBack: () => void;
}

function BossCard({ boss, playerLevel, onSelect }: { boss: BossDef; playerLevel: number; onSelect: () => void }) {
  const recommended = boss.recommendedLevel;
  const diff = playerLevel - recommended;
  const strength =
    diff >= 50 ? { label: '余裕', col: 'text-green-400',  ring: 'border-green-700/60',  bg: 'bg-green-900/20'  } :
    diff >= 0  ? { label: '適正', col: 'text-yellow-400', ring: 'border-yellow-700/60', bg: 'bg-yellow-900/20' } :
    diff >= -50? { label: '難関', col: 'text-orange-400', ring: 'border-orange-700/60', bg: 'bg-orange-900/20' } :
                 { label: '超難', col: 'text-red-400',    ring: 'border-red-700/60',    bg: 'bg-red-900/20'    };

  return (
    <div
      className={`relative rounded-2xl border-2 ${strength.ring} ${strength.bg} p-5 cursor-pointer transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] select-none`}
      style={{ boxShadow: `0 0 24px ${boss.color}22` }}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="text-4xl leading-none">{boss.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-xl text-white leading-tight truncate">{boss.nameJa}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-gray-400 text-xs">推奨Lv.{recommended}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${strength.col} bg-black/30`}>{strength.label}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-gray-500">HP</div>
          <div className="font-bold text-sm" style={{ color: boss.color }}>{(boss.maxHp / 1000).toFixed(0)}k</div>
        </div>
      </div>

      {/* Description */}
      <p className="text-gray-400 text-xs mb-3 leading-relaxed">{boss.descJa}</p>

      {/* Skills */}
      <div className="flex flex-col gap-1">
        {boss.skills.map(sk => (
          <div key={sk.name} className="flex gap-2 items-start">
            <span className="text-yellow-400 font-bold text-xs shrink-0 w-20">【{sk.name}】</span>
            <span className="text-gray-400 text-xs leading-snug">{sk.desc}</span>
          </div>
        ))}
      </div>

      {/* Fight button */}
      <button
        className="mt-4 w-full py-2.5 rounded-xl font-black text-white text-sm transition-all active:scale-95"
        style={{ background: `linear-gradient(to right, ${boss.color}cc, ${boss.color}88)` }}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        挑戦する →
      </button>
    </div>
  );
}

export default function BossSelectPage({ onSelect, onBack }: BossSelectPageProps) {
  const data = load();
  const playerLevel = data.level;

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center py-8 px-4">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="text-5xl mb-2">👹</div>
        <h1 className="text-3xl font-black text-white">ボス戦</h1>
        <p className="text-gray-400 text-sm mt-1">強敵に挑め — あなたのLv.<span className="text-yellow-400 font-bold">{playerLevel}</span></p>
      </div>

      {/* Boss list */}
      <div className="w-full max-w-lg flex flex-col gap-4">
        {BOSSES.map(boss => (
          <BossCard
            key={boss.id}
            boss={boss}
            playerLevel={playerLevel}
            onSelect={() => onSelect(boss.id)}
          />
        ))}

        {/* Coming soon placeholder */}
        <div className="rounded-2xl border-2 border-gray-800/60 bg-gray-900/30 p-5 opacity-50">
          <div className="flex items-center gap-3">
            <div className="text-4xl">🔒</div>
            <div>
              <div className="font-black text-gray-500 text-xl">次のボス</div>
              <div className="text-gray-600 text-xs mt-1">近日公開予定…</div>
            </div>
          </div>
        </div>
      </div>

      {/* Back */}
      <button
        onClick={onBack}
        className="mt-8 px-8 py-3 bg-gray-800 hover:bg-gray-700 rounded-2xl font-bold text-white text-sm transition-all active:scale-95"
      >
        ← もどる
      </button>
    </div>
  );
}
