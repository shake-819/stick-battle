import { useEffect, useState } from 'react';
import { load } from '@/store/playerStore';
import { FEATURES } from '@/lib/backend';
import { fetchEventRanking, fetchMyBest, type RankRow } from '@/lib/eventService';
import { WEAPONS, ARMORS } from '@/data/equipment';
import { BOSSES } from '@/data/bosses';

interface Props {
  onBack: () => void;
  onEvent: (eventId: string) => void;
}

const EVENTS = [
  {
    id: 'survival',
    nameJa: 'エンドレスサバイバル',
    icon: '⏱',
    desc: '無限に押し寄せる敵を倒し続け、生存時間（秒）を競う。ストック3制。',
    scoreLabel: '生存時間',
    scoreUnit: '秒',
    color: 'from-blue-900 to-indigo-900',
    border: 'border-blue-700',
    rankColor: '#60a5fa',
    higherIsBetter: true,
  },
  {
    id: 'shinigami-dps',
    nameJa: '戦神チャレンジ',
    icon: '💀',
    desc: '不死のシニガミに60秒間で最大ダメージを叩き込め。シニガミのHPは無限。',
    scoreLabel: '累計ダメージ',
    scoreUnit: 'DMG',
    color: 'from-purple-950 to-indigo-950',
    border: 'border-purple-800',
    rankColor: '#a78bfa',
    higherIsBetter: true,
  },
  {
    id: 'gunner-master',
    nameJa: 'ガンナーマスター',
    icon: '🔫',
    desc: 'ゲートで兵力を増強しながら敵を突破。エンドレスで距離（m）を競う。バフ・装備の影響なし。',
    scoreLabel: '到達距離',
    scoreUnit: 'm',
    color: 'from-blue-950 to-cyan-950',
    border: 'border-cyan-800',
    rankColor: '#22d3ee',
    higherIsBetter: true,
  },
];

const RANK_MEDAL = ['🥇', '🥈', '🥉'];

// ── Ranking screen ──────────────────────────────────────────────────────────
function RankingScreen({
  ev,
  list,
  myBest,
  myRank,
  loading,
  onBack,
}: {
  ev: typeof EVENTS[0];
  list: RankRow[];
  myBest: RankRow | null;
  myRank: number;
  loading: boolean;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center py-6 px-4 select-none"
         style={{ background: 'linear-gradient(to bottom, #0a0a18, #111827)' }}>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">← 戻る</button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{ev.icon}</span>
              <h1 className="text-xl font-black text-white">{ev.nameJa}</h1>
            </div>
            <p className="text-gray-500 text-xs mt-0.5">🏅 {FEATURES.rankings ? 'ランキング' : '自己ベスト記録（この端末のみ）'}</p>
          </div>
        </div>

        {/* My best */}
        {myBest && (
          <div className="mb-4 rounded-2xl border p-4"
               style={{ background: 'rgba(0,0,0,0.5)', borderColor: ev.rankColor + '55' }}>
            <div className="text-xs text-gray-400 mb-1">あなたの自己ベスト</div>
            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-black" style={{ color: ev.rankColor }}>
                  {myBest.score.toLocaleString()}
                </span>
                <span className="text-sm text-gray-400 ml-1">{ev.scoreUnit}</span>
              </div>
              <div className="text-right">
                <div className="text-lg font-black text-yellow-400">#{myRank}</div>
                <div className="text-xs text-gray-500">{myBest.weapon_name ?? '武器なし'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Ranking list */}
        <div className="rounded-2xl overflow-hidden border"
             style={{ borderColor: ev.rankColor + '33', background: 'rgba(0,0,0,0.4)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: ev.rankColor + '22' }}>
            <span className="font-bold text-sm" style={{ color: ev.rankColor }}>TOP 20</span>
            {loading && <span className="text-gray-500 text-xs ml-3">読み込み中...</span>}
          </div>

          {!loading && list.length === 0 ? (
            <div className="py-10 text-center text-gray-500 text-sm">
              まだ記録がありません。<br/>{FEATURES.rankings ? '最初の挑戦者になろう！' : 'イベントに挑戦して記録を残そう！'}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: ev.rankColor + '11' }}>
              {list.slice(0, 20).map((row, i) => (
                <div key={i}
                     className="flex items-center gap-3 px-4 py-2.5"
                     style={{ background: i === 0 ? 'rgba(250,204,21,0.07)' : i === 1 ? 'rgba(156,163,175,0.05)' : i === 2 ? 'rgba(251,146,60,0.06)' : 'transparent' }}>
                  {/* Rank */}
                  <span className="w-7 text-center font-black text-base flex-shrink-0"
                        style={{ color: i === 0 ? '#facc15' : i === 1 ? '#d1d5db' : i === 2 ? '#fb923c' : '#6b7280' }}>
                    {i < 3 ? RANK_MEDAL[i] : `${i + 1}`}
                  </span>
                  {/* Name */}
                  <span className="flex-1 font-bold text-white text-sm truncate">{row.username}</span>
                  {/* Score */}
                  <span className="font-black text-base" style={{ color: ev.rankColor }}>
                    {row.score.toLocaleString()}
                    <span className="text-xs text-gray-500 ml-0.5">{ev.scoreUnit}</span>
                  </span>
                  {/* Weapon */}
                  {row.weapon_name && (
                    <span className="text-gray-500 text-[11px] truncate max-w-[56px] hidden sm:block">{row.weapon_name}</span>
                  )}
                  {/* Date */}
                  <span className="text-gray-600 text-[11px] flex-shrink-0">{row.played_at}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function LimitedEventPage({ onBack, onEvent }: Props) {
  const data   = load();
  const weapon = data.equippedWeaponId ? WEAPONS.find(w => w.id === data.equippedWeaponId) ?? null : null;
  const armor  = data.equippedArmorId  ? ARMORS.find(a => a.id === data.equippedArmorId)   ?? null : null;
  const isBow  = weapon?.type === 'bow';
  const isBoss = BOSSES.some(b => b.id === data.selectedCharacter);

  const [rankings,            setRankings]            = useState<Record<string, RankRow[]>>({});
  const [myBests,             setMyBests]             = useState<Record<string, RankRow | null>>({});
  const [loading,             setLoading]             = useState(true);
  const [rankingEventId,      setRankingEventId]      = useState<string | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      const rMap: Record<string, RankRow[]> = {};
      const bMap: Record<string, RankRow | null> = {};
      for (const ev of EVENTS) {
        // 静的モードでは端末内の記録、サーバー設定時は共有ランキング（lib/eventService.ts）
        try { rMap[ev.id] = await fetchEventRanking(ev.id); } catch { rMap[ev.id] = []; }
        try { bMap[ev.id] = await fetchMyBest(ev.id); } catch { bMap[ev.id] = null; }
      }
      setRankings(rMap);
      setMyBests(bMap);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const getMyRank = (eventId: string, score: number) => {
    const list = rankings[eventId] ?? [];
    const idx = list.findIndex(r => r.score <= score);
    return idx === -1 ? list.length + 1 : idx + 1;
  };

  // ── Show ranking screen ──────────────────────────────────────────────────
  if (rankingEventId) {
    const ev     = EVENTS.find(e => e.id === rankingEventId)!;
    const list   = rankings[rankingEventId] ?? [];
    const myBest = myBests[rankingEventId] ?? null;
    return (
      <RankingScreen
        ev={ev}
        list={list}
        myBest={myBest}
        myRank={myBest ? getMyRank(rankingEventId, myBest.score) : 0}
        loading={loading}
        onBack={() => setRankingEventId(null)}
      />
    );
  }

  // ── Event list ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center py-6 px-4 select-none">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">← 戻る</button>
          <div>
            <h1 className="text-2xl font-black text-white">🏆 限定イベント</h1>
            <p className="text-gray-500 text-xs">弓武器・ボスキャラ使用禁止</p>
          </div>
        </div>

        {/* Equipment status */}
        <div className={`mb-4 rounded-xl p-3 border text-sm ${isBow || isBoss ? 'bg-red-950/40 border-red-800' : 'bg-gray-900 border-gray-700'}`}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-gray-400 text-xs">現在の装備：</span>
            {weapon
              ? <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${isBow ? 'bg-red-900 text-red-300' : 'bg-gray-800 text-amber-300'}`}>{weapon.emoji} {weapon.nameJa}</span>
              : <span className="text-gray-600 text-xs">武器なし</span>}
            {armor
              ? <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-gray-800 text-cyan-300">{armor.emoji} {armor.nameJa}</span>
              : <span className="text-gray-600 text-xs">防具なし</span>}
          </div>
          {(isBow || isBoss) && (
            <div className="mt-1.5 text-red-400 text-xs font-bold">
              ⛔ {isBow ? '弓武器は禁止です。装備を変更してください。' : ''}
              {isBoss ? 'ボスキャラは禁止です。キャラ選択を変更してください。' : ''}
            </div>
          )}
        </div>

        {/* サーバー必須のイベント（テーマ縛り / 魔王討伐 / 最強のプレイヤー）— 静的モードでは非表示 */}
        {FEATURES.serverEvents && (
        <div className="mb-4">
          {/* Theme event card */}
          <div className="rounded-2xl overflow-hidden border border-blue-700/60 mb-3"
               style={{ background: 'linear-gradient(135deg, #0c1a2e, #0a0f1e)' }}>
            <div className="p-4">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">⚔️</span>
                  <div>
                    <span className="text-white font-black text-lg">テーマ縛りランキング</span>
                    <span className="ml-2 text-[10px] text-blue-400 font-bold bg-blue-900/50 border border-blue-700/50 px-1.5 py-0.5 rounded-md">週替わり</span>
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-xs mb-3">
                今週のテーマ武器縛りで連勝数を競え。何体倒せるかがあなたのスコア。
              </p>
              <button
                onClick={() => onEvent('theme')}
                className="w-full font-black text-base py-2.5 rounded-xl transition-all active:scale-95 border border-blue-700/40"
                style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }}>
                ⚔️ 今週のテーマへ挑む
              </button>
            </div>
          </div>

          {/* Raid event card */}
          <div className="rounded-2xl overflow-hidden border border-purple-700/60"
               style={{ background: 'linear-gradient(135deg, #1a0a2e, #0f0520)' }}>
            <div className="p-4">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">👹</span>
                  <div>
                    <span className="text-white font-black text-lg">魔王討伐イベント</span>
                    <span className="ml-2 text-[10px] text-purple-400 font-bold bg-purple-900/50 border border-purple-700/50 px-1.5 py-0.5 rounded-md">協力</span>
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-xs mb-3">
                全プレイヤーで共有ボスを討伐。負けてもダメージは蓄積される。貢献量でランキングを競え。
              </p>
              <button
                onClick={() => onEvent('raid')}
                className="w-full font-black text-base py-2.5 rounded-xl transition-all active:scale-95 border border-purple-700/40"
                style={{ background: 'rgba(124,58,237,0.2)', color: '#a78bfa' }}>
                👹 魔王に挑む
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-950 to-amber-950 border border-yellow-700 rounded-2xl overflow-hidden">
            <div className="p-4">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">👑</span>
                  <div>
                    <span className="text-white font-black text-lg">最強のプレイヤー</span>
                    <span className="ml-2 text-[10px] text-yellow-400 font-bold bg-yellow-900/50 border border-yellow-700/50 px-1.5 py-0.5 rounded-md">限定</span>
                  </div>
                </div>
              </div>
              <p className="text-gray-300 text-xs mb-3">
                他プレイヤーの装備・バフそのままのAIと1対1で対決。勝利すればランクを奪える。弓・ボス制限なし。
              </p>
              <button
                onClick={() => onEvent('strongest')}
                className="w-full font-black text-base py-2.5 rounded-xl transition-all active:scale-95 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-700/40">
                👑 ランキングへ挑戦
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Event cards */}
        <div className="space-y-4">
          {EVENTS.map(ev => {
            const best     = myBests[ev.id];
            const canPlay  = !isBow && !isBoss;
            const rankList = rankings[ev.id] ?? [];
            return (
              <div key={ev.id} className={`bg-gradient-to-br ${ev.color} border ${ev.border} rounded-2xl overflow-hidden`}>
                <div className="p-4">
                  {/* Title row */}
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-3xl">{ev.icon}</span>
                      <span className="text-white font-black text-lg">{ev.nameJa}</span>
                    </div>
                    {best && (
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400">自己ベスト</div>
                        <div className="font-black text-base" style={{ color: ev.rankColor }}>
                          {best.score.toLocaleString()}
                          <span className="text-xs text-gray-400 ml-0.5">{ev.scoreUnit}</span>
                        </div>
                        <div className="text-[10px] text-gray-500">#{getMyRank(ev.id, best.score)}</div>
                      </div>
                    )}
                  </div>

                  <p className="text-gray-300 text-xs mb-3">{ev.desc}</p>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => canPlay && onEvent(ev.id)}
                      disabled={!canPlay}
                      className={`flex-1 font-black text-base py-2.5 rounded-xl transition-all active:scale-95 ${canPlay ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-white/5 text-gray-500 cursor-not-allowed'}`}>
                      {canPlay ? '🎮 挑戦する' : '⛔ 装備変更'}
                    </button>
                    <button
                      onClick={() => setRankingEventId(ev.id)}
                      className="px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 border text-white"
                      style={{ background: 'rgba(0,0,0,0.35)', borderColor: ev.rankColor + '66' }}>
                      🏅 {FEATURES.rankings ? 'ランキング' : '記録'}
                      {!loading && rankList.length > 0 && (
                        <span className="ml-1.5 text-[10px] font-normal opacity-70">TOP{Math.min(rankList.length, 20)}</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-5 text-center text-gray-600 text-xs">種目は今後追加予定です</p>
      </div>
    </div>
  );
}
