import { useState } from 'react';
import { load, spendTicket, spendCoins, addWeapons, addArmors, getCompletionStatus } from '@/store/playerStore';
import {
  WEAPONS, ARMORS,
  pullLegendWeapon, pullLegendArmor,
  EQUIP_RARITY_COLOR, EQUIP_RARITY_LABEL,
  type WeaponDef, type ArmorDef, type EquipRarity,
} from '@/data/equipment';

const LEGEND_COIN_COST = 1000;

interface Props { onBack: () => void; }

type ItemTab = 'weapon' | 'armor';
type PullResult = { item: WeaponDef | ArmorDef };

// 昇順ランク: mythic < 超越(transcend) < 神降(divine) < 原初(primordial)
const LEGEND_RARITIES: EquipRarity[] = ['mythic', 'transcend', 'divine', 'primordial'];
// ソート用 — 表示は強い順（原初が上）
const RARITY_ORDER: EquipRarity[] = ['primordial', 'divine', 'transcend', 'mythic'];

function ResultCard({ res }: { res: PullResult }) {
  const item = res.item;
  const col = EQUIP_RARITY_COLOR[item.rarity];
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 p-3 w-32"
      style={{ borderColor: col, background: col + '22', boxShadow: `0 0 20px ${col}66` }}>
      <div className="text-4xl mb-1">{item.emoji}</div>
      <div className="text-[11px] font-black text-white text-center leading-tight">{item.nameJa}</div>
      <div className="mt-1 text-[9px] font-bold rounded-full px-2 py-0.5" style={{ background: col + '33', color: col }}>
        {EQUIP_RARITY_LABEL[item.rarity]}
      </div>
      {'type' in item && <div className="text-[9px] text-red-400 mt-0.5 font-bold">ATK+{Math.round(item.attackBonus * 100)}%</div>}
      {'slot' in item && <div className="text-[9px] text-blue-400 mt-0.5 font-bold">DEF+{Math.round(item.defenseBonus * 100)}%</div>}
    </div>
  );
}

export default function LegendGachaPage({ onBack }: Props) {
  const [tab, setTab] = useState<ItemTab>('weapon');
  const [tickets, setTickets] = useState(() => load().gachaTickets ?? 0);
  const [coins, setCoins] = useState(() => load().coins);
  const [level] = useState(() => load().level);
  const [results, setResults] = useState<PullResult[] | null>(null);
  const [allCollected, setAllCollected] = useState(false);
  const [pulling, setPulling] = useState(false);

  const canUseCoin = level >= 15;

  const refresh = () => {
    const d = load();
    setTickets(d.gachaTickets ?? 0);
    setCoins(d.coins);
  };

  const executePull = (count: number) => {
    const ids: string[] = [];
    const pulled: (WeaponDef | ArmorDef)[] = [];

    if (tab === 'weapon') {
      const ownedIds = load().weaponInventory.map(o => o.id);
      const accumulated = [...ownedIds];
      for (let i = 0; i < count; i++) {
        const item = pullLegendWeapon(accumulated);
        if (!item) { setAllCollected(true); break; }
        ids.push(item.id);
        pulled.push(item);
        accumulated.push(item.id); // prevent same item twice in multi-pull
      }
      if (ids.length > 0) addWeapons(ids);
    } else {
      const ownedIds = load().armorInventory.map(o => o.id);
      const accumulated = [...ownedIds];
      for (let i = 0; i < count; i++) {
        const item = pullLegendArmor(accumulated);
        if (!item) { setAllCollected(true); break; }
        ids.push(item.id);
        pulled.push(item);
        accumulated.push(item.id);
      }
      if (ids.length > 0) addArmors(ids);
    }

    if (pulled.length > 0) setResults(pulled.map(item => ({ item })));
    refresh();
    setPulling(false);
  };

  const doPullTicket = (count: 1 | 3) => {
    if ((load().gachaTickets ?? 0) < count) return;
    for (let i = 0; i < count; i++) {
      if (!spendTicket()) return;
    }
    setPulling(true);
    executePull(count);
  };

  const doPullCoin = () => {
    if (!spendCoins(LEGEND_COIN_COST)) return;
    setPulling(true);
    executePull(1);
  };

  const player = load();
  const { gachaComplete, weaponComplete, armorComplete } = getCompletionStatus(player);
  const legendWeapons = WEAPONS.filter(w => LEGEND_RARITIES.includes(w.rarity))
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  const legendArmors = ARMORS.filter(a => LEGEND_RARITIES.includes(a.rarity))
    .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  const items = tab === 'weapon' ? legendWeapons : legendArmors;
  const isOwned = (item: WeaponDef | ArmorDef) =>
    'type' in item
      ? player.weaponInventory.some(o => o.id === item.id)
      : player.armorInventory.some(o => o.id === item.id);

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center py-6 px-4 select-none">
      <button onClick={onBack} className="absolute top-4 left-4 text-gray-400 hover:text-white text-sm font-bold transition-all">
        ← 戻る
      </button>

      <h1 className="text-3xl font-black mb-1 text-white">✨ 伝説のガチャ</h1>
      <p className="text-gray-500 text-xs mb-3">ミシック以上の超高レアリティ装備専用ガチャ</p>

      {/* Currency display */}
      <div className="flex items-center gap-3 mb-5">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${tickets > 0 ? 'border-emerald-500 bg-emerald-900/30' : 'border-gray-700 bg-gray-900'}`}>
          <span>🎫</span>
          <span className="text-white font-black">{tickets}</span>
          <span className="text-gray-400 text-xs">枚</span>
        </div>
        {canUseCoin && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-yellow-600 bg-yellow-900/20">
            <span>💰</span>
            <span className="text-yellow-400 font-black">{coins}</span>
            <span className="text-gray-400 text-xs">コイン</span>
          </div>
        )}
      </div>

      {/* Completion bonuses */}
      <div className="flex flex-wrap gap-2 mb-4 justify-center">
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${gachaComplete ? 'border-amber-500 bg-amber-900/30 text-amber-300' : 'border-gray-700 text-gray-600'}`}>
          {gachaComplete ? '✓' : '○'} 図鑑コンプ → ATK+50% DEF+50%
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${weaponComplete ? 'border-red-500 bg-red-900/30 text-red-300' : 'border-gray-700 text-gray-600'}`}>
          {weaponComplete ? '✓' : '○'} 武具コンプ → ATK+150%
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${armorComplete ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-gray-700 text-gray-600'}`}>
          {armorComplete ? '✓' : '○'} 防具コンプ → DEF+100%
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['weapon', 'armor'] as ItemTab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setResults(null); }}
            className={`px-6 py-2 rounded-xl font-black text-sm border-2 transition-all ${tab === t ? 'border-rose-500 bg-rose-900/40 text-rose-300' : 'border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-300'}`}>
            {t === 'weapon' ? `⚔ 武具 (${legendWeapons.length}種)` : `🛡 防具 (${legendArmors.length}種)`}
          </button>
        ))}
      </div>

      {/* Pull buttons */}
      <div className="flex flex-wrap gap-3 mb-2 justify-center">
        <button
          disabled={tickets < 1 || pulling}
          onClick={() => doPullTicket(1)}
          className="px-7 py-3 rounded-2xl font-black text-base transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#be123c,#e11d48)', color: '#fff', boxShadow: '0 4px 24px #e11d4866' }}>
          1回引く<br /><span className="text-xs font-normal opacity-80">🎫 チケット1枚</span>
        </button>
        <button
          disabled={tickets < 3 || pulling}
          onClick={() => doPullTicket(3)}
          className="px-7 py-3 rounded-2xl font-black text-base transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#7c2d12,#c2410c)', color: '#fff', boxShadow: '0 4px 24px #c2410c66' }}>
          3連引く<br /><span className="text-xs font-normal opacity-80">🎫 チケット3枚</span>
        </button>
        {canUseCoin && (
          <button
            disabled={coins < LEGEND_COIN_COST || pulling}
            onClick={doPullCoin}
            className="px-7 py-3 rounded-2xl font-black text-base transition-all active:scale-95 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#a16207,#ca8a04)', color: '#fff', boxShadow: '0 4px 24px #ca8a0466' }}>
            コインで引く<br /><span className="text-xs font-normal opacity-80">💰 {LEGEND_COIN_COST}コイン</span>
          </button>
        )}
      </div>
      <p className="text-gray-600 text-[10px] mb-5">
        🎫 Lv5・10・15で1枚獲得
        {canUseCoin ? ' ／ Lv15到達でコイン払いも解放' : ` ／ Lv15到達でコイン${LEGEND_COIN_COST}枚払いが解放`}
        {' ／ 現在ミシックのみ排出'}
      </p>

      {/* All collected notice */}
      {allCollected && (
        <div className="w-full max-w-2xl mb-4 rounded-2xl border border-amber-500 bg-amber-900/20 p-4 text-center">
          <div className="text-2xl font-black text-amber-400 mb-1">🏆 コンプリート！</div>
          <p className="text-amber-300 text-sm">このカテゴリの伝説装備をすべて所持しています</p>
        </div>
      )}

      {/* Pull results */}
      {results && (
        <div className="w-full max-w-2xl mb-6">
          <div className="flex flex-wrap gap-4 justify-center">
            {results.map((r, i) => <ResultCard key={i} res={r} />)}
          </div>
          <button onClick={() => { setResults(null); setAllCollected(false); }}
            className="mt-4 w-full text-gray-400 hover:text-gray-200 text-sm transition-colors">
            閉じる
          </button>
        </div>
      )}

      {/* Equipment list */}
      {!results && (
        <>
          <p className="text-gray-600 text-xs mb-3">
            排出ラインナップ（{items.filter(i => isOwned(i)).length}/{items.length}種所持）
          </p>
          <div className="w-full max-w-2xl grid grid-cols-4 gap-2">
            {items.map(item => {
              const col = EQUIP_RARITY_COLOR[item.rarity];
              const owned = isOwned(item);
              return (
                <div key={item.id}
                  className="flex items-center gap-2 rounded-xl p-2 border transition-all"
                  style={{
                    borderColor: owned ? col : '#374151',
                    background: owned ? col + '11' : '#111827',
                  }}>
                  <span className="text-lg flex-shrink-0">{item.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-white leading-tight truncate">{item.nameJa}</div>
                    <div className="text-[9px]" style={{ color: col }}>{EQUIP_RARITY_LABEL[item.rarity]}</div>
                  </div>
                  {owned && <span className="ml-auto text-[9px] text-green-400 flex-shrink-0">✓</span>}
                </div>
              );
            })}
          </div>

          {/* Higher tiers notice */}
          <div className="mt-5 w-full max-w-2xl rounded-2xl border border-dashed border-gray-700 p-3 text-center">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ color: EQUIP_RARITY_COLOR['primordial'], background: EQUIP_RARITY_COLOR['primordial'] + '22' }}>
              {EQUIP_RARITY_LABEL['primordial']}
            </span>
            <p className="text-gray-600 text-xs mt-1">原初ランクは近日実装予定</p>
          </div>
        </>
      )}
    </div>
  );
}
