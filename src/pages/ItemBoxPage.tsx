import { useState } from 'react';
import { load, upgradeBossUnlock, BOSS_UNLOCK_COSTS, type PlayerData } from '@/store/playerStore';
import { BOSSES } from '@/data/bosses';

interface Props { onBack: () => void; }

const MAX_LV = BOSS_UNLOCK_COSTS.length;

const STAR_SKILL_LABELS = [
  'スキル1解放',
  'スキル2解放',
  'スキル3解放',
  '★4（近日実装）',
  '★5（近日実装）',
];

function StarRow({ lv }: { lv: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={`text-lg leading-none ${i < lv ? 'text-yellow-400' : 'text-gray-700'}`}>
          {i < lv ? '★' : '☆'}
        </span>
      ))}
    </div>
  );
}

export default function ItemBoxPage({ onBack }: Props) {
  const [data, setData] = useState<PlayerData>(() => load());

  const reload = () => setData(load());

  const handleUpgrade = (bossId: string) => {
    upgradeBossUnlock(bossId);
    reload();
  };

  const totalFrags = Object.values(data.bossFragments ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center pb-10 px-4 select-none">

      {/* Header */}
      <div className="w-full max-w-sm pt-5 mb-2">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm mb-4 block">
          ← メニューへ
        </button>
        <div className="text-center">
          <h1 className="text-4xl font-black text-purple-400">📦 アイテムボックス</h1>
          <p className="text-gray-500 text-xs mt-1">
            ボス撃破で欠片を獲得。集めてキャラを解放しよう！
          </p>
          <div className="mt-2 inline-flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 rounded-xl px-4 py-1.5">
            <span className="text-purple-300 text-xs">💠 所持欠片合計</span>
            <span className="text-white font-black">{totalFrags}個</span>
          </div>
        </div>
      </div>

      {/* Boss cards */}
      <div className="w-full max-w-sm flex flex-col gap-4">
        {BOSSES.map(boss => {
          const frags   = (data.bossFragments ?? {})[boss.id] ?? 0;
          const lv      = (data.bossUnlockLv  ?? {})[boss.id] ?? 0;
          const nextCost = lv < MAX_LV ? BOSS_UNLOCK_COSTS[lv] : null;
          const bossMaxLv = boss.skills.length;
          const canUpgrade = nextCost !== null && frags >= nextCost && lv < bossMaxLv;
          const isFutureTier = nextCost !== null && lv >= bossMaxLv;

          return (
            <div key={boss.id}
              className="bg-gray-900 rounded-2xl p-4 border"
              style={{ borderColor: boss.color + '66' }}>

              {/* Boss header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="text-4xl">{boss.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-white text-sm leading-tight truncate">{boss.nameJa}</div>
                  <StarRow lv={lv} />
                  {lv > 0 && (
                    <div className="text-[10px] text-green-400 font-bold mt-0.5">
                      ✓ キャラクター解放済み
                    </div>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] text-gray-500 leading-none">欠片</div>
                  <div className="text-2xl font-black text-purple-300 leading-none mt-0.5">
                    {frags}
                  </div>
                  <div className="text-[10px] text-gray-500">個</div>
                </div>
              </div>

              {/* Skills list */}
              <div className="flex flex-col gap-1 mb-3">
                {boss.skills.map((sk, i) => (
                  <div key={i}
                    className={`flex items-start gap-2 text-xs px-2.5 py-1.5 rounded-lg transition-colors
                      ${i < lv
                        ? 'bg-yellow-900/30 border border-yellow-700/30 text-yellow-100'
                        : 'bg-gray-800/50 text-gray-500'}`}>
                    <span className="font-black mt-0.5 flex-shrink-0">
                      {i < lv ? '★' : '☆'}
                    </span>
                    <div>
                      <span className="font-bold">{sk.name}</span>
                      <span className="ml-1 opacity-70">{sk.desc}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Upgrade section */}
              {lv === 0 ? (
                /* Not yet unlocked */
                <div className="bg-gray-800/60 rounded-xl p-3">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-400">キャラ解放まで</span>
                    <span className={`font-bold ${frags >= BOSS_UNLOCK_COSTS[0] ? 'text-green-400' : 'text-gray-400'}`}>
                      {frags} / {BOSS_UNLOCK_COSTS[0]}個
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
                    <div className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (frags / BOSS_UNLOCK_COSTS[0]) * 100)}%` }} />
                  </div>
                  <button
                    onClick={() => handleUpgrade(boss.id)}
                    disabled={frags < BOSS_UNLOCK_COSTS[0]}
                    className={`w-full font-black text-sm py-2.5 rounded-xl transition-all active:scale-95
                      ${frags >= BOSS_UNLOCK_COSTS[0]
                        ? 'bg-purple-700 hover:bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                    {frags >= BOSS_UNLOCK_COSTS[0]
                      ? `🔓 ${boss.nameJa}を解放！`
                      : `欠片があと${BOSS_UNLOCK_COSTS[0] - frags}個必要`}
                  </button>
                </div>

              ) : lv < MAX_LV ? (
                /* Unlocked, upgradeable */
                <div className="bg-gray-800/60 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-400">
                      次の強化：★{lv + 1} — {boss.skills[lv]?.name ?? '近日実装'}
                    </span>
                    {isFutureTier && (
                      <span className="text-[10px] bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
                        近日実装
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">必要欠片</span>
                    <span className={`font-bold ${canUpgrade ? 'text-green-400' : 'text-gray-400'}`}>
                      {frags} / {nextCost}個
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
                    <div
                      className={`h-2 rounded-full transition-all ${isFutureTier ? 'bg-gray-600' : 'bg-yellow-500'}`}
                      style={{ width: `${Math.min(100, (frags / (nextCost ?? 1)) * 100)}%` }} />
                  </div>
                  {isFutureTier ? (
                    <div className="text-center text-xs text-gray-600 py-1">
                      このランクは近日実装予定です
                    </div>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(boss.id)}
                      disabled={!canUpgrade}
                      className={`w-full font-black text-sm py-2.5 rounded-xl transition-all active:scale-95
                        ${canUpgrade
                          ? 'bg-yellow-700 hover:bg-yellow-600 text-white shadow-lg shadow-yellow-900/30'
                          : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                      {canUpgrade
                        ? `⬆ ★${lv + 1}に強化`
                        : `欠片があと${(nextCost ?? 0) - frags}個必要`}
                    </button>
                  )}
                </div>

              ) : (
                /* Fully unlocked */
                <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl px-4 py-2 text-center">
                  <span className="text-yellow-400 font-black text-sm">★★★★★ 完全解放！</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Guide */}
      <div className="mt-5 w-full max-w-sm bg-gray-900/60 border border-gray-700 rounded-xl p-3 text-xs text-gray-400">
        <p className="text-gray-300 font-bold mb-1.5">💠 欠片の集め方</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>ボスを撃破すると<span className="text-white font-bold">1〜5個</span>ランダムドロップ</li>
          <li>欠片はボスごとに個別管理</li>
          <li>装備不可（ボスキャラ固有の装備を使用）</li>
          <li>ボス追加に合わせてキャラも順次実装</li>
        </ul>
        <div className="mt-2 pt-2 border-t border-gray-700">
          <p className="text-gray-400 font-bold mb-1">★レベルと必要欠片</p>
          <div className="grid grid-cols-5 gap-1 text-center">
            {BOSS_UNLOCK_COSTS.map((cost, i) => (
              <div key={i} className="rounded-lg px-1 py-1 bg-yellow-900/30 text-yellow-300">
                <div className="text-[10px] font-black">★{i + 1}</div>
                <div className="text-[10px]">{cost}個</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
