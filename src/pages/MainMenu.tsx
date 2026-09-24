import { useEffect, useState } from 'react';
import { FEATURES } from '@/lib/backend';
import {
  load, computeEffectiveStats, xpForLevel, setSelectedCharacter,
  type PlayerData,
} from '@/store/playerStore';
import { GACHA_ITEMS, CHARACTER_COLORS } from '@/data/gachaItems';
import { BOSSES } from '@/data/bosses';
import { BOT_CONFIGS, type Difficulty } from '@/types/game';
import { WEAPONS, ARMORS } from '@/data/equipment';

interface MainMenuProps {
  username: string;
  onPlay: (difficulty: Difficulty) => void;
  onHyaku: () => void;
  onBoss: () => void;
  onOnline: () => void;
  onGacha: () => void;
  onCollection: () => void;
  onLevelUp: () => void;
  onEquipGacha: () => void;
  onEquipment: () => void;
  onLegendGacha: () => void;
  onDefense: () => void;
  onItemBox: () => void;
  onEvent: () => void;
  onLogout: () => void;
  onNewGame: () => void;
  onDeleteAccount: () => void;
}

const DIFF_ORDER: Difficulty[] = ['easy', 'normal', 'hard', 'vhard', 'oni'];
const DIFF_STYLE: Record<Difficulty, string> = {
  easy:   'border-green-500 bg-green-900/40 text-green-300',
  normal: 'border-blue-500 bg-blue-900/40 text-blue-300',
  hard:   'border-yellow-500 bg-yellow-900/40 text-yellow-300',
  vhard:  'border-red-500 bg-red-900/40 text-red-300',
  oni:    'border-rose-900 bg-rose-950/60 text-rose-400',
};

export default function MainMenu({
  username, onPlay, onHyaku, onBoss, onOnline, onGacha, onCollection,
  onLevelUp, onEquipGacha, onEquipment, onLegendGacha, onDefense, onItemBox,
  onEvent, onLogout, onNewGame, onDeleteAccount,
}: MainMenuProps) {
  const [data, setData]                 = useState<PlayerData | null>(null);
  const [difficulty, setDiff]           = useState<Difficulty>('normal');
  const [newGamePhase, setNewGamePhase] = useState<'idle' | 'warn'>('idle');
  const [deletePhase, setDeletePhase]   = useState<'idle' | 'confirm'>('idle');

  const reload = () => setData(load());
  useEffect(() => { reload(); }, []);

  if (!data) return null;
  const stats    = computeEffectiveStats(data);
  const xpNeeded = xpForLevel(data.level);
  const xpPct    = Math.min(100, (data.xp / xpNeeded) * 100);
  const isMax    = data.level >= 15;

  const ownedCharIds = data.ownedItems
    .filter(o => GACHA_ITEMS.find(g => g.id === o.id)?.rarity === 'character')
    .map(o => o.id);

  const unlockedBossIds = (data.bossUnlockLv ? Object.keys(data.bossUnlockLv) : [])
    .filter(id => (data.bossUnlockLv[id] ?? 0) >= 1);

  const allChars = [...ownedCharIds, ...unlockedBossIds];

  const selectChar = (id: string) => {
    setSelectedCharacter(data.selectedCharacter === id ? undefined : id);
    reload();
  };

  const getCharLabel = (id: string) => {
    const gacha = GACHA_ITEMS.find(g => g.id === id);
    if (gacha) return { emoji: gacha.emoji, name: gacha.nameJa, color: CHARACTER_COLORS[id] ?? '#fff' };
    const boss = BOSSES.find(b => b.id === id);
    if (boss) return { emoji: boss.emoji, name: boss.nameJa, color: boss.color };
    return { emoji: '🥷', name: 'デフォルト', color: '#3b82f6' };
  };

  const getCharColor = (id: string) => {
    if (CHARACTER_COLORS[id]) return CHARACTER_COLORS[id];
    const boss = BOSSES.find(b => b.id === id);
    if (boss) return boss.color;
    return '#3b82f6';
  };

  const equippedWeapon = data.equippedWeaponId ? WEAPONS.find(w => w.id === data.equippedWeaponId) ?? null : null;
  const equippedArmor  = data.equippedArmorId  ? ARMORS .find(a => a.id === data.equippedArmorId)  ?? null : null;

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center select-none py-6 px-4">

      {/* ── Header ── */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-6">
        <h1 className="text-4xl font-black tracking-tight">
          <span className="text-blue-400">STICK</span><span className="text-red-400"> SMASH</span>
        </h1>
        <div className="flex items-center gap-3">
          {data.pendingLevelUps > 0 && (
            <button onClick={onLevelUp}
              className="bg-yellow-400 text-gray-900 text-sm font-black px-4 py-1.5 rounded-full animate-pulse">
              ⬆ レベルアップ！
            </button>
          )}
          <span className="text-gray-400 text-sm">👤 <span className="text-white font-bold">{username}</span></span>
          {FEATURES.accounts && (
            <button onClick={onLogout}
              className="text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-600 transition-all">
              ログアウト
            </button>
          )}
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-4">

        {/* ════ LEFT COLUMN ════ */}
        <div className="flex flex-col gap-4 lg:w-72 shrink-0">

          {/* Status card */}
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-black text-2xl" style={{ color: stats.playerColor }}>Lv.{data.level}</span>
              {isMax && <span className="text-yellow-400 text-xs font-bold">MAX LEVEL</span>}
            </div>

            {!isMax && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>経験値</span><span>{data.xp} / {xpNeeded}</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full transition-all"
                    style={{ width: `${xpPct}%` }} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-300 mb-3">
              <div className="flex justify-between"><span className="text-gray-500">⚔ 攻撃力</span><span className="text-red-400 font-bold">{Math.round(stats.attackMult * 100)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">🛡 防御</span><span className="text-blue-400 font-bold">{Math.round(stats.defenseMult * 100)}%減</span></div>
              <div className="flex justify-between"><span className="text-gray-500">💨 速度</span><span className="text-green-400 font-bold">{Math.round(stats.speedMult * 100)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">🦘 ジャンプ</span><span className="text-yellow-400 font-bold">{Math.round(stats.jumpMult * 100)}%</span></div>
              <div className="flex justify-between"><span className="text-gray-500">❤ 残機</span><span className="text-pink-400 font-bold">{stats.startingStocks}（上限5）</span></div>
              <div className="flex justify-between"><span className="text-gray-500">🪂 段数</span><span className="text-purple-400 font-bold">{stats.maxJumps}段</span></div>
            </div>

            {(equippedWeapon || equippedArmor) && (
              <div className="flex flex-wrap gap-2 border-t border-gray-700 pt-3 mb-3">
                {equippedWeapon && (
                  <div className="flex items-center gap-1 text-xs bg-amber-900/30 border border-amber-700/40 rounded-lg px-2 py-1">
                    <span>{equippedWeapon.emoji}</span>
                    <span className="text-amber-300 font-bold">{equippedWeapon.nameJa}</span>
                  </div>
                )}
                {equippedArmor && (
                  <div className="flex items-center gap-1 text-xs bg-cyan-900/30 border border-cyan-700/40 rounded-lg px-2 py-1">
                    <span>{equippedArmor.emoji}</span>
                    <span className="text-cyan-300 font-bold">{equippedArmor.nameJa}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between text-xs text-gray-500 border-t border-gray-700 pt-3">
              <span>🏆 {data.wins}勝</span>
              <span>💰 {data.coins}コイン</span>
              <span>💀 {data.losses}敗</span>
            </div>
          </div>

          {/* Character selector */}
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4">
            <p className="text-gray-400 text-xs mb-3 font-bold">キャラクター選択</p>
            {allChars.length === 0 ? (
              <p className="text-gray-600 text-xs text-center py-2">未所持 — ガチャで確率1%で排出！</p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {allChars.map(id => {
                  const label   = getCharLabel(id);
                  const selected = data.selectedCharacter === id;
                  const col      = getCharColor(id);
                  const isBoss   = unlockedBossIds.includes(id);
                  return (
                    <button key={id} onClick={() => selectChar(id)} title={label.name}
                      className={`flex flex-col items-center rounded-xl px-2.5 py-1.5 border-2 transition-all ${selected ? 'scale-110' : 'opacity-60 hover:opacity-90'}`}
                      style={{ borderColor: col, background: col + '22' }}>
                      <span className="text-lg">{label.emoji}</span>
                      <span className="text-[9px] font-bold mt-0.5" style={{ color: col }}>{label.name}</span>
                      {isBoss && <span className="text-[8px] text-yellow-400/70">ボス</span>}
                      {!isBoss && (() => {
                        const gacha = GACHA_ITEMS.find(g => g.id === id);
                        if (!gacha) return null;
                        const { effect } = gacha;
                        const buffs: string[] = [];
                        if (effect.attack)    buffs.push(`⚔+${Math.round(effect.attack * 100)}%`);
                        if (effect.defense)   buffs.push(`🛡+${Math.round(effect.defense * 100)}%`);
                        if (effect.speed)     buffs.push(`💨+${Math.round(effect.speed * 100)}%`);
                        if (effect.berserker) buffs.push('🔥BSK');
                        if (buffs.length === 0) return null;
                        return (
                          <span key="buffs" className="text-[7px] text-gray-300/60 mt-0.5 leading-tight text-center"
                                style={{ maxWidth: '64px', wordBreak: 'break-all' }}>
                            {buffs.join(' ')}
                          </span>
                        );
                      })()}
                      {selected && <span className="text-[8px] text-white/60">使用中</span>}
                    </button>
                  );
                })}
                <button onClick={() => selectChar('')} title="デフォルト"
                  className={`flex flex-col items-center rounded-xl px-2.5 py-1.5 border-2 transition-all ${!data.selectedCharacter ? 'scale-110 border-blue-400 bg-blue-900/30' : 'opacity-60 hover:opacity-90 border-gray-600 bg-gray-800/30'}`}>
                  <span className="text-lg">🥷</span>
                  <span className="text-[9px] font-bold mt-0.5 text-blue-300">デフォルト</span>
                  {!data.selectedCharacter && <span className="text-[8px] text-white/60">使用中</span>}
                </button>
              </div>
            )}
          </div>

          {/* Account management */}
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 flex flex-col gap-2">
            <p className="text-gray-500 text-xs font-bold mb-1">{FEATURES.accounts ? 'アカウント管理' : 'データ管理（この端末）'}</p>
            {newGamePhase === 'idle' ? (
              <button onClick={() => setNewGamePhase('warn')}
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-sm py-2 rounded-xl border border-gray-600 transition-all active:scale-95">
                🆕 新規作成
              </button>
            ) : (
              <div className="bg-yellow-950/60 border border-yellow-700 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-yellow-300 text-xs font-bold text-center">{FEATURES.accounts ? '⚠ リセマラ目的の場合、今のデータを削除してください' : '⚠ この端末のセーブデータをすべて削除して最初からやり直します'}</p>
                <div className="flex gap-2">
                  <button onClick={() => setNewGamePhase('idle')}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold py-1.5 rounded-lg transition-all">
                    キャンセル
                  </button>
                  <button onClick={onNewGame}
                    className="flex-1 bg-yellow-700 hover:bg-yellow-600 text-white text-xs font-bold py-1.5 rounded-lg transition-all">
                    🆕 新規作成
                  </button>
                </div>
              </div>
            )}
            {FEATURES.accounts && (
            <>
            {deletePhase === 'idle' ? (
              <button onClick={() => setDeletePhase('confirm')}
                className="w-full bg-transparent hover:bg-red-950/30 text-gray-600 hover:text-red-400 font-bold text-xs py-1.5 rounded-xl border border-transparent hover:border-red-900 transition-all">
                🗑 アカウント削除
              </button>
            ) : (
              <div className="bg-red-950/50 border border-red-800 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-red-300 text-xs font-bold text-center">本当に削除しますか？この操作は取り消せません</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeletePhase('idle')}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-bold py-1.5 rounded-lg transition-all">
                    キャンセル
                  </button>
                  <button onClick={onDeleteAccount}
                    className="flex-1 bg-red-700 hover:bg-red-600 text-white text-xs font-bold py-1.5 rounded-lg transition-all">
                    削除する
                  </button>
                </div>
              </div>
            )}
            </>
            )}
          </div>
        </div>

        {/* ════ RIGHT COLUMN ════ */}
        <div className="flex flex-col gap-4 flex-1 min-w-0">

          {/* Difficulty + Battle start */}
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
            <p className="text-gray-400 text-xs font-bold mb-3">ボット難易度</p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {DIFF_ORDER.map(d => {
                const cfg = BOT_CONFIGS[d];
                return (
                  <button key={d} onClick={() => setDiff(d)}
                    className={`border-2 rounded-xl py-2 text-center transition-all font-bold text-xs ${DIFF_STYLE[d]} ${difficulty === d ? 'ring-2 ring-white/25 scale-105' : 'opacity-50 hover:opacity-80'}`}>
                    <div className="text-sm">{cfg.label}</div>
                    <div className="text-[9px] font-normal opacity-70">{cfg.sub}</div>
                  </button>
                );
              })}
            </div>

            <button onClick={() => onPlay(difficulty)}
              className="w-full text-white font-black text-2xl py-4 rounded-2xl transition-all active:scale-95 shadow-xl"
              style={{ background: `linear-gradient(135deg,${stats.playerColor}dd,${stats.playerColor}88)`, boxShadow: `0 6px 32px ${stats.playerColor}55` }}>
              ⚔ バトル開始
            </button>
            <p className="text-center text-gray-600 text-[10px] mt-2">V/U: アッパー ／ 空中Z: 空中攻撃 ／ Space: 必殺技</p>
          </div>

          {/* Game modes grid */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onHyaku}
              className="bg-gradient-to-br from-rose-800 to-red-700 hover:from-rose-700 hover:to-red-600 text-white font-black text-base py-5 rounded-2xl transition-all active:scale-95 shadow-lg border border-rose-600/40 flex flex-col items-center gap-1">
              <span className="text-2xl">🔥</span>
              <span>百人組手</span>
              <span className="text-xs font-normal opacity-70">100連戦に挑戦</span>
            </button>
            <button onClick={onBoss}
              className="bg-gradient-to-br from-yellow-900 to-orange-900 hover:from-yellow-800 hover:to-orange-800 text-white font-black text-base py-5 rounded-2xl transition-all active:scale-95 shadow-lg border border-yellow-700/40 flex flex-col items-center gap-1">
              <span className="text-2xl">👹</span>
              <span>ボス戦</span>
              <span className="text-xs font-normal opacity-70">強敵に挑め</span>
            </button>
            {FEATURES.online && (
            <button onClick={onOnline}
              className="bg-gradient-to-br from-cyan-800 to-blue-800 hover:from-cyan-700 hover:to-blue-700 text-white font-black text-base py-5 rounded-2xl transition-all active:scale-95 shadow-lg border border-cyan-600/40 flex flex-col items-center gap-1">
              <span className="text-2xl">🌐</span>
              <span>オンライン対戦</span>
              <span className="text-xs font-normal opacity-70">友達と1v1</span>
            </button>
            )}
            <button onClick={onDefense}
              className={`${FEATURES.online ? '' : 'col-span-2 '}bg-gradient-to-br from-orange-900 to-red-900 hover:from-orange-800 hover:to-red-800 text-white font-black text-base py-5 rounded-2xl transition-all active:scale-95 shadow-lg border border-orange-700/40 flex flex-col items-center gap-1`}>
              <span className="text-2xl">🏰</span>
              <span>防衛戦</span>
              <span className="text-xs font-normal opacity-70">拠点を守れ！</span>
            </button>
          </div>

          {/* Event */}
          <button onClick={onEvent}
            className="w-full bg-gradient-to-r from-violet-900 to-purple-900 hover:from-violet-800 hover:to-purple-800 text-white font-black text-lg py-4 rounded-2xl transition-all active:scale-95 shadow-lg border border-violet-700/40 flex items-center justify-center gap-3">
            <span className="text-2xl">🏆</span>
            <span>限定イベント</span>
            <span className="text-sm font-normal opacity-70">{FEATURES.rankings ? 'ランキングに挑め' : '自己ベストに挑め'}</span>
          </button>

          {/* Gacha & utility row */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onGacha}
              className="bg-gradient-to-br from-purple-700 to-pink-700 hover:from-purple-600 hover:to-pink-600 text-white font-bold text-sm py-3.5 rounded-xl transition-all active:scale-95 flex flex-col items-center gap-0.5">
              <span className="text-xl">🎲</span>
              <span>アイテムガチャ</span>
              <span className="text-xs font-normal opacity-70">{data.coins}コイン</span>
            </button>
            <button onClick={onEquipGacha}
              className="bg-gradient-to-br from-amber-700 to-orange-600 hover:from-amber-600 hover:to-orange-500 text-white font-bold text-sm py-3.5 rounded-xl transition-all active:scale-95 flex flex-col items-center gap-0.5">
              <span className="text-xl">⚔️</span>
              <span>装備ガチャ</span>
              <span className="text-xs font-normal opacity-70">150コイン/回</span>
            </button>
            <button onClick={onEquipment}
              className="bg-gray-800 hover:bg-gray-700 text-white font-bold text-sm py-3.5 rounded-xl transition-all active:scale-95 flex flex-col items-center gap-0.5">
              <span className="text-xl">🗡️</span>
              <span>装備管理</span>
              <span className="text-xs font-normal text-gray-400">{equippedWeapon ? equippedWeapon.nameJa : '武具なし'}</span>
            </button>
            <button onClick={onCollection}
              className="bg-gray-800 hover:bg-gray-700 text-white font-bold text-sm py-3.5 rounded-xl transition-all active:scale-95 flex flex-col items-center gap-0.5">
              <span className="text-xl">📦</span>
              <span>図鑑</span>
              <span className="text-xs font-normal text-gray-400">{data.ownedItems.length}種類</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={onLegendGacha}
              className="bg-gradient-to-r from-rose-950 via-red-900 to-rose-950 hover:from-rose-900 hover:via-red-800 hover:to-rose-900 text-white font-bold text-sm py-3.5 rounded-xl transition-all active:scale-95 border border-red-700/40 flex flex-col items-center gap-0.5">
              <span className="text-xl">🌟</span>
              <span>伝説のガチャ</span>
              <span className="text-xs font-normal opacity-70">ミシック/神降/超越/原初</span>
            </button>
            <button onClick={onItemBox}
              className="bg-gradient-to-r from-purple-900 to-indigo-900 hover:from-purple-800 hover:to-indigo-800 text-white font-bold text-sm py-3.5 rounded-xl transition-all active:scale-95 border border-purple-700/40 flex flex-col items-center gap-0.5">
              <span className="text-xl">📦</span>
              <span>アイテムボックス</span>
              <span className="text-xs font-normal opacity-70">ボス欠片・キャラ解放</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
