import { useState } from 'react';
import {
  load, spendCoins, addWeapons, addArmors, incrementWeaponPity, incrementArmorPity, spendTicket,
} from '@/store/playerStore';
import {
  WEAPONS, ARMORS, pullWeapon, pullArmor,
  EQUIP_PULL_COST, EQUIP_PULL_COST10,
  EQUIP_RARITY_COLOR, EQUIP_RARITY_LABEL,
  type WeaponDef, type ArmorDef,
} from '@/data/equipment';

type Tab = 'weapon' | 'armor';
type PullResult = { item: WeaponDef | ArmorDef };

interface Props { onBack: () => void; }

function ItemCard({ res }: { res: PullResult }) {
  const item = res.item;
  const col = EQUIP_RARITY_COLOR[item.rarity];
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 p-3 w-28 transition-all"
      style={{ borderColor: col, background: col + '18', boxShadow: `0 0 14px ${col}44` }}>
      <div className="text-3xl mb-1">{item.emoji}</div>
      <div className="text-[11px] font-black text-white text-center leading-tight">{item.nameJa}</div>
      <div className="mt-1 text-[9px] font-bold rounded-full px-1.5 py-0.5" style={{ background: col + '33', color: col }}>
        {EQUIP_RARITY_LABEL[item.rarity]}
      </div>
      {'type' in item && <div className="text-[9px] text-gray-400 mt-0.5">ATK+{Math.round(item.attackBonus * 100)}%</div>}
      {'slot' in item && <div className="text-[9px] text-gray-400 mt-0.5">DEF+{Math.round(item.defenseBonus * 100)}%</div>}
    </div>
  );
}

export default function EquipGachaPage({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('weapon');
  const [coins, setCoins] = useState(() => load().coins);
  const [tickets, setTickets] = useState(() => load().gachaTickets ?? 0);
  const [results, setResults] = useState<PullResult[] | null>(null);
  const [pulling, setPulling] = useState(false);

  const refresh = () => {
    const d = load();
    setCoins(d.coins);
    setTickets(d.gachaTickets ?? 0);
  };

  const executePull = (count: number, pityFn: () => number, pullFn: (pity: boolean, ownedIds: string[]) => WeaponDef | ArmorDef, addFn: (ids: string[]) => { bonusCoins: number; pity: number }, invFn: () => OwnedItem[]) => {
    const ids: string[] = [];
    const pulled: (WeaponDef | ArmorDef)[] = [];
    const inv = invFn();
    const accumulated = inv.map((o: OwnedItem) => o.id);
    for (let i = 0; i < count; i++) {
      const pity = pityFn();
      const item = pullFn(pity >= 10, accumulated);
      ids.push(item.id);
      accumulated.push(item.id);
      pulled.push(item);
    }
    addFn(ids);
    setResults(pulled.map(item => ({ item })));
  };

  const doPull = (count: 1 | 10, useTicket = false) => {
    if (useTicket) {
      if (!spendTicket()) return;
    } else {
      const cost = count === 1 ? EQUIP_PULL_COST : EQUIP_PULL_COST10;
      if (!spendCoins(cost)) return;
    }
    setPulling(true);

    if (tab === 'weapon') {
      executePull(
        count,
        incrementWeaponPity,
        pullWeapon,
        addWeapons,
        () => load().weaponInventory,
      );
    } else {
      executePull(
        count,
        incrementArmorPity,
        pullArmor,
        addArmors,
        () => load().armorInventory,
      );
    }

    refresh();
    setPulling(false);
  };

  const tabLabel = tab === 'weapon' ? '武具' : '防具';
  const totalWeapons = WEAPONS.length;
  const totalArmors  = ARMORS.length;
  const invW = load().weaponInventory.length;
  const invA = load().armorInventory.length;

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center py-6 px-4 select-none">
      <button onClick={onBack} className="absolute top-4 left-4 text-gray-500 hover:text-gray-300 text-sm transition-colors">
        ← メニューへ
      </button>

      <h2 className="text-3xl font-black text-white mb-1">装備ガチャ</h2>

      {/* Coins + Tickets */}
      <div className="flex items-center gap-4 mb-4">
        <p className="text-gray-400 text-sm">💰 <span className="text-yellow-400 font-bold">{coins}</span> コイン</p>
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-bold transition-all ${tickets > 0 ? 'border-emerald-500 bg-emerald-900/30 text-emerald-300' : 'border-gray-700 bg-gray-900 text-gray-500'}`}>
          🎫 チケット <span className={tickets > 0 ? 'text-emerald-400' : 'text-gray-600'}>{tickets}</span> 枚
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {(['weapon', 'armor'] as Tab[]).map(t => (
          <button key={t} onClick={() => { setTab(t); setResults(null); }}
            className={`px-6 py-2 rounded-xl font-black text-sm border-2 transition-all ${tab === t ? 'border-purple-500 bg-purple-900/50 text-purple-300' : 'border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-300'}`}>
            {t === 'weapon' ? `⚔ 武具 (${invW}/${totalWeapons})` : `🛡 防具 (${invA}/${totalArmors})`}
          </button>
        ))}
      </div>

      {/* Rates */}
      <div className="mb-4 flex gap-3 text-xs">
        {(['legendary','epic','rare','common'] as const).map(r => (
          <div key={r} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: EQUIP_RARITY_COLOR[r] }} />
            <span style={{ color: EQUIP_RARITY_COLOR[r] }}>{EQUIP_RARITY_LABEL[r]}</span>
            <span className="text-gray-500">
              {r === 'legendary' ? '3%' : r === 'epic' ? '12%' : r === 'rare' ? '35%' : '50%'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-gray-600 text-xs mb-5">10連は1体以上がエピック以上確定</p>

      {/* Pull buttons */}
      <div className="flex flex-wrap gap-3 mb-6 justify-center">
        <button
          disabled={coins < EQUIP_PULL_COST || pulling}
          onClick={() => doPull(1)}
          className="px-8 py-3 rounded-2xl font-black text-base transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', boxShadow: '0 4px 20px #7c3aed55' }}>
          1回引く<br /><span className="text-xs font-normal opacity-80">{EQUIP_PULL_COST}コイン</span>
        </button>
        <button
          disabled={coins < EQUIP_PULL_COST10 || pulling}
          onClick={() => doPull(10)}
          className="px-8 py-3 rounded-2xl font-black text-base transition-all active:scale-95 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg,#be185d,#f43f5e)', color: '#fff', boxShadow: '0 4px 20px #be185d55' }}>
          10連引く<br /><span className="text-xs font-normal opacity-80">{EQUIP_PULL_COST10}コイン</span>
        </button>
        <button
          disabled={tickets <= 0 || pulling}
          onClick={() => doPull(1, true)}
          className="px-8 py-3 rounded-2xl font-black text-base transition-all active:scale-95 disabled:opacity-40"
          style={{
            background: tickets > 0 ? 'linear-gradient(135deg,#059669,#10b981)' : '#1f2937',
            color: '#fff',
            boxShadow: tickets > 0 ? '0 4px 20px #05966955' : 'none',
            border: '2px solid #10b981',
          }}>
          🎫 チケットで引く<br /><span className="text-xs font-normal opacity-80">チケット1枚消費</span>
        </button>
      </div>

      {/* Ticket info */}
      <p className="text-gray-600 text-xs mb-4">🎫 チケットはレベル5・10・15到達時に1枚ずつ獲得</p>

      {/* Results */}
      {results && (
        <div className="w-full max-w-2xl">
          <div className="flex flex-wrap gap-3 justify-center">
            {results.map((r, i) => <ItemCard key={i} res={r} />)}
          </div>
          <button onClick={() => setResults(null)}
            className="mt-4 w-full text-gray-400 hover:text-gray-200 text-sm transition-colors">
            閉じる
          </button>
        </div>
      )}

      {/* Preview of items */}
      {!results && (
        <div className="w-full max-w-2xl mt-2">
          <p className="text-gray-600 text-xs text-center mb-3">
            {tabLabel}ラインナップ（全{tab === 'weapon' ? totalWeapons : totalArmors}種類）
          </p>
          <div className="grid grid-cols-4 gap-2">
            {(tab === 'weapon' ? WEAPONS : ARMORS).map(item => {
              const col = EQUIP_RARITY_COLOR[item.rarity];
              const owned = tab === 'weapon'
                ? load().weaponInventory.find(o => o.id === item.id)
                : load().armorInventory.find(o => o.id === item.id);
              return (
                <div key={item.id} className="flex items-center gap-2 rounded-xl p-2 border"
                  style={{ borderColor: owned ? col : '#374151', background: owned ? col + '11' : '#111827' }}>
                  <span className="text-lg">{item.emoji}</span>
                  <div>
                    <div className="text-[10px] font-bold text-white leading-tight">{item.nameJa}</div>
                    <div className="text-[9px]" style={{ color: col }}>{EQUIP_RARITY_LABEL[item.rarity]}</div>
                  </div>
                  {owned && <span className="ml-auto text-[9px] text-green-400">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface OwnedItem { id: string; count: number; }
