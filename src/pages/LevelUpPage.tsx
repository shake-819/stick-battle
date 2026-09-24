import { useState, useEffect } from 'react';
import { load, applyLevelUpChoice, type LevelChoices } from '@/store/playerStore';

interface LevelUpPageProps {
  onDone: () => void;
}

type ChoiceKey = keyof LevelChoices;

const OPTIONS: { key: ChoiceKey; emoji: string; label: string; desc: string; color: string }[] = [
  { key: 'attack',  emoji: '⚔️',  label: '攻撃力アップ',  desc: 'ダメージと吹き飛ばし +10%', color: 'from-red-700 to-orange-700 border-red-500 hover:from-red-600 hover:to-orange-600' },
  { key: 'defense', emoji: '🛡️',  label: '防御力アップ',  desc: 'のけぞり耐性 +8%',         color: 'from-blue-700 to-cyan-700 border-blue-500 hover:from-blue-600 hover:to-cyan-600' },
  { key: 'speed',   emoji: '💨',  label: '移動速度アップ', desc: '移動速度 +8%',            color: 'from-green-700 to-emerald-700 border-green-500 hover:from-green-600 hover:to-emerald-600' },
  { key: 'jump',    emoji: '🦘',  label: 'ジャンプ力アップ', desc: 'ジャンプ力 +8%',        color: 'from-yellow-700 to-amber-700 border-yellow-500 hover:from-yellow-600 hover:to-amber-600' },
  { key: 'stocks',  emoji: '❤️',  label: 'ストックアップ',  desc: '開始ストック数 +1',      color: 'from-pink-700 to-rose-700 border-pink-500 hover:from-pink-600 hover:to-rose-600' },
];

export default function LevelUpPage({ onDone }: LevelUpPageProps) {
  const [level, setLevel] = useState(1);
  const [pending, setPending] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    const data = load();
    setLevel(data.level);
    setPending(data.pendingLevelUps);
  }, []);

  const choose = (key: ChoiceKey) => {
    if (chosen || pending <= 0) return;
    setChosen(key);
    applyLevelUpChoice(key);

    setTimeout(() => {
      const data = load();
      if (data.pendingLevelUps > 0) {
        setPending(data.pendingLevelUps);
        setLevel(data.level);
        setChosen(null);
      } else {
        setAllDone(true);
      }
    }, 700);
  };

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center justify-center select-none py-8">
      {/* Flash banner */}
      <div className="mb-6 text-center">
        <div className="text-yellow-400 font-black text-5xl mb-1 animate-bounce">⬆ LEVEL UP!</div>
        <div className="text-white text-xl font-bold">レベル {level} に到達！</div>
        {pending > 1 && (
          <div className="text-gray-400 text-sm mt-1">あと {pending} 回選択できます</div>
        )}
      </div>

      {!allDone ? (
        <>
          <p className="text-gray-400 text-sm mb-5">強化する能力を1つ選んでください</p>
          <div className="flex flex-col gap-3 w-80">
            {OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => choose(opt.key)}
                disabled={chosen !== null}
                className={`w-full bg-gradient-to-r border text-left px-5 py-4 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${opt.color} ${chosen === opt.key ? 'scale-105 ring-2 ring-white/40' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{opt.emoji}</span>
                  <div>
                    <div className="text-white font-black text-base">{opt.label}</div>
                    <div className="text-white/70 text-xs">{opt.desc}</div>
                  </div>
                  {chosen === opt.key && <span className="ml-auto text-white font-black">✓</span>}
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="text-center">
          <p className="text-green-400 text-2xl font-black mb-2">✓ 強化完了！</p>
          <p className="text-gray-400 text-sm mb-6">新しいステータスでバトルに挑もう</p>
          <button
            onClick={onDone}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xl px-12 py-4 rounded-2xl transition-all active:scale-95"
          >
            メニューへ戻る
          </button>
        </div>
      )}
    </div>
  );
}
