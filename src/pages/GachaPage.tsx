import { useState, useEffect } from 'react';
import { pullItems, PULL_RATES, type GachaItemDef, RARITY_COLORS, RARITY_LABEL } from '@/data/gachaItems';
import { load, spendCoins, addItems } from '@/store/playerStore';

interface GachaPageProps {
  onBack: () => void;
}

type Phase = 'lobby' | 'pulling' | 'result';

const SINGLE_COST = 100;
const MULTI_COST = 900;

function ItemCard({ item, revealed, delay }: { item: GachaItemDef; revealed: boolean; delay: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (revealed) {
      const t = setTimeout(() => setShow(true), delay);
      return () => clearTimeout(t);
    }
    setShow(false);
    return undefined;
  }, [revealed, delay]);

  const rc = RARITY_COLORS[item.rarity];

  return (
    <div
      className="relative w-24 h-32 rounded-xl border-2 flex flex-col items-center justify-center gap-1 transition-all duration-500 overflow-hidden"
      style={{
        borderColor: show ? rc.glow : '#374151',
        boxShadow: show ? `0 0 18px ${rc.glow}88` : 'none',
        transform: show ? 'scale(1)' : 'scale(0.85)',
        opacity: show ? 1 : 0.4,
        background: show ? `radial-gradient(ellipse at 50% 30%, ${rc.glow}22, #111827)` : '#111827',
      }}
    >
      {show ? (
        <>
          <span className="text-4xl">{item.emoji}</span>
          <span className={`text-xs font-black ${rc.text}`}>{RARITY_LABEL[item.rarity]}</span>
          <span className="text-white text-[10px] font-bold text-center leading-tight px-1">{item.nameJa}</span>
          <span className="text-gray-400 text-[9px] text-center px-1">{item.descJa}</span>
        </>
      ) : (
        <span className="text-5xl opacity-50">?</span>
      )}
    </div>
  );
}

export default function GachaPage({ onBack }: GachaPageProps) {
  const [coins, setCoins] = useState(0);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [pulled, setPulled] = useState<GachaItemDef[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [bonusCoins, setBonusCoins] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    setCoins(load().coins);
  }, [phase]);

  const doPull = (count: 1 | 10) => {
    const cost = count === 1 ? SINGLE_COST : MULTI_COST;
    if (!spendCoins(cost)) {
      setError(`コインが足りません（${cost}コイン必要）`);
      return;
    }
    setError('');
    setPhase('pulling');
    setRevealed(false);
    const items = pullItems(count, load().ownedItems.map(o => o.id));
    setPulled(items);

    // Short animation delay then reveal
    setTimeout(() => {
      const bonus = addItems(items.map(i => i.id));
      setBonusCoins(bonus);
      setRevealed(true);
      setPhase('result');
      setCoins(load().coins);
    }, 600);
  };

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center justify-center select-none py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-5">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
          ← 戻る
        </button>
        <h2 className="text-3xl font-black text-white">🎲 ガチャ</h2>
        <div className="bg-yellow-900/60 border border-yellow-700 rounded-full px-3 py-1 text-yellow-300 font-bold text-sm">
          💰 {coins} コイン
        </div>
      </div>

      {/* Rates info */}
      <div className="flex gap-2 mb-5 text-xs flex-wrap justify-center">
        <span className="bg-gray-800 px-3 py-1 rounded-full text-gray-300">コモン {PULL_RATES.common}%</span>
        <span className="bg-blue-950 px-3 py-1 rounded-full text-blue-300">レア {PULL_RATES.rare}%</span>
        <span className="bg-yellow-950 px-3 py-1 rounded-full text-yellow-300">エピック {PULL_RATES.epic}%</span>
        <span className="bg-rose-950 px-3 py-1 rounded-full text-rose-300">キャラクター {PULL_RATES.character}%（各1%）</span>
      </div>

      {/* Result area */}
      <div className="min-h-48 flex items-center justify-center mb-6">
        {phase === 'lobby' && (
          <div className="text-center">
            <p className="text-6xl mb-4">🎰</p>
            <p className="text-gray-400 text-sm">ガチャを引いてキャラを強化しよう！</p>
            <p className="text-gray-600 text-xs mt-1">重複アイテムはボーナスコインに変換</p>
          </div>
        )}

        {phase === 'pulling' && (
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl bg-purple-900/50 border-2 border-purple-500 flex items-center justify-center animate-spin">
              <span className="text-4xl">✨</span>
            </div>
          </div>
        )}

        {phase === 'result' && pulled.length > 0 && (
          <div className="flex flex-col items-center gap-4">
            {/* 1-pull: big card */}
            {pulled.length === 1 && (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-36 h-48 rounded-2xl border-2 flex flex-col items-center justify-center gap-2 transition-all duration-700"
                  style={{
                    borderColor: revealed ? RARITY_COLORS[pulled[0].rarity].glow : '#374151',
                    boxShadow: revealed ? `0 0 40px ${RARITY_COLORS[pulled[0].rarity].glow}66` : 'none',
                    background: revealed ? `radial-gradient(ellipse at 50% 30%, ${RARITY_COLORS[pulled[0].rarity].glow}33, #111827)` : '#111827',
                    transform: revealed ? 'scale(1)' : 'scale(0.8)',
                    opacity: revealed ? 1 : 0,
                  }}
                >
                  <span className="text-6xl">{pulled[0].emoji}</span>
                  <span className={`text-sm font-black ${RARITY_COLORS[pulled[0].rarity].text}`}>
                    {RARITY_LABEL[pulled[0].rarity]}
                  </span>
                  <span className="text-white font-bold text-center text-sm px-2">{pulled[0].nameJa}</span>
                  <span className="text-gray-400 text-xs text-center px-2">{pulled[0].descJa}</span>
                </div>
              </div>
            )}

            {/* 10-pull: grid */}
            {pulled.length === 10 && (
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {pulled.map((item, i) => (
                  <ItemCard key={i} item={item} revealed={revealed} delay={i * 120} />
                ))}
              </div>
            )}

            {bonusCoins > 0 && revealed && (
              <div className="bg-yellow-900/40 border border-yellow-600 rounded-lg px-4 py-2 text-yellow-300 text-sm font-bold">
                重複ボーナス: +{bonusCoins} コイン 💰
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

      {/* Pull buttons */}
      <div className="flex gap-4">
        <button
          onClick={() => doPull(1)}
          disabled={phase === 'pulling' || coins < SINGLE_COST}
          className="bg-gradient-to-br from-purple-700 to-indigo-700 hover:from-purple-600 hover:to-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-8 py-4 rounded-2xl transition-all active:scale-95 shadow-lg text-lg"
        >
          <div>1回引く</div>
          <div className="text-sm font-normal opacity-80">💰 {SINGLE_COST}コイン</div>
        </button>
        <button
          onClick={() => doPull(10)}
          disabled={phase === 'pulling' || coins < MULTI_COST}
          className="bg-gradient-to-br from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-8 py-4 rounded-2xl transition-all active:scale-95 shadow-lg text-lg"
        >
          <div>10回引く</div>
          <div className="text-sm font-normal opacity-80">💰 {MULTI_COST}コイン</div>
        </button>
      </div>

      {phase === 'result' && (
        <button
          onClick={() => setPhase('lobby')}
          className="mt-4 text-gray-400 hover:text-gray-200 text-sm underline transition-colors"
        >
          もう一度引く
        </button>
      )}
    </div>
  );
}
