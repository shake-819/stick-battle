import { useState } from 'react';
import { load, equipWeapon, equipArmor } from '@/store/playerStore';
import {
  WEAPONS, ARMORS, EQUIP_RARITY_COLOR, EQUIP_RARITY_LABEL,
  type WeaponDef, type ArmorDef, type WeaponType, type ArmorSlot, type EquipRarity,
} from '@/data/equipment';

interface Props { onBack: () => void; }
type Tab = 'weapon' | 'armor';

const WEAPON_TYPE_LABEL: Record<WeaponType, string> = {
  sword: '⚔ 剣', axe: '🪓 斧', spear: '🔱 槍', hammer: '🔨 槌', staff: '🪄 杖', bow: '🏹 弓', fighting: '🥊 格闘',
};
const ARMOR_SLOT_LABEL: Record<ArmorSlot, string> = {
  helmet: '⛑ 兜', armor: '🛡 鎧', shield: '🔵 盾', gloves: '🧤 手袋', boots: '👢 靴', cloak: '🌀 マント',
};
const RARITY_ORDER: EquipRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic', 'transcend', 'divine', 'primordial'];

function WeaponStatBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.abs(value) / max * 100);
  const neg = value < 0;
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-gray-400 w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: neg ? '#ef4444' : '#34d399' }} />
      </div>
      <span className={`w-10 text-right font-bold ${neg ? 'text-red-400' : 'text-green-400'}`}>
        {value > 0 ? '+' : ''}{Math.round(value * 100)}%
      </span>
    </div>
  );
}

function WeaponCard({ w, equipped, onClick }: { w: WeaponDef; equipped: boolean; onClick: () => void }) {
  const col = EQUIP_RARITY_COLOR[w.rarity];
  return (
    <button onClick={onClick}
      className="text-left rounded-2xl border-2 p-3 transition-all hover:scale-[1.02] active:scale-100 w-full"
      style={{ borderColor: equipped ? col : '#374151', background: equipped ? col + '22' : '#111827', boxShadow: equipped ? `0 0 14px ${col}44` : 'none' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{w.emoji}</span>
        <div className="flex-1">
          <div className="font-black text-sm text-white">{w.nameJa}</div>
          <div className="text-[10px]" style={{ color: col }}>{EQUIP_RARITY_LABEL[w.rarity]} · {WEAPON_TYPE_LABEL[w.type]}</div>
        </div>
        {equipped && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: col + '33', color: col }}>装備中</span>}
      </div>
      <WeaponStatBar label="攻撃力" value={w.attackBonus} max={0.6} />
      {w.speedBonus !== 0 && <WeaponStatBar label="速度" value={w.speedBonus} max={0.15} />}
      {w.knockbackBonus > 0 && <WeaponStatBar label="吹飛ばし" value={w.knockbackBonus} max={3} />}
      {w.specialCDReduction > 0 && <WeaponStatBar label="必殺CD短縮" value={w.specialCDReduction} max={0.5} />}
    </button>
  );
}

function ArmorCard({ a, equipped, onClick }: { a: ArmorDef; equipped: boolean; onClick: () => void }) {
  const col = EQUIP_RARITY_COLOR[a.rarity];
  return (
    <button onClick={onClick}
      className="text-left rounded-2xl border-2 p-3 transition-all hover:scale-[1.02] active:scale-100 w-full"
      style={{ borderColor: equipped ? col : '#374151', background: equipped ? col + '22' : '#111827', boxShadow: equipped ? `0 0 14px ${col}44` : 'none' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{a.emoji}</span>
        <div className="flex-1">
          <div className="font-black text-sm text-white">{a.nameJa}</div>
          <div className="text-[10px]" style={{ color: col }}>{EQUIP_RARITY_LABEL[a.rarity]} · {ARMOR_SLOT_LABEL[a.slot]}</div>
        </div>
        {equipped && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: col + '33', color: col }}>装備中</span>}
      </div>
      {a.defenseBonus > 0 && <WeaponStatBar label="防御力" value={a.defenseBonus} max={0.55} />}
      {a.attackBonus  > 0 && <WeaponStatBar label="攻撃力" value={a.attackBonus}  max={0.2} />}
      {a.speedBonus   !== 0 && <WeaponStatBar label="速度"  value={a.speedBonus}  max={0.25} />}
      {a.jumpBonus    > 0 && <WeaponStatBar label="ジャンプ" value={a.jumpBonus}  max={0.25} />}
    </button>
  );
}

function FilterChip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-full text-xs font-bold border transition-all whitespace-nowrap"
      style={active
        ? { borderColor: color ?? '#a855f7', background: (color ?? '#a855f7') + '33', color: color ?? '#c084fc' }
        : { borderColor: '#374151', background: '#111827', color: '#6b7280' }
      }>
      {label}
    </button>
  );
}

export default function EquipmentPage({ onBack }: Props) {
  const [tab, setTab]             = useState<Tab>('weapon');
  const [data, setData]           = useState(() => load());
  const [weaponTypeFilter, setWeaponTypeFilter] = useState<WeaponType | 'all'>('all');
  const [weaponRarityFilter, setWeaponRarityFilter] = useState<EquipRarity | 'all'>('all');
  const [armorSlotFilter, setArmorSlotFilter]   = useState<ArmorSlot | 'all'>('all');
  const [armorRarityFilter, setArmorRarityFilter] = useState<EquipRarity | 'all'>('all');

  const refresh = () => setData(load());

  const ownedWeapons = data.weaponInventory.map(o => WEAPONS.find(w => w.id === o.id)).filter(Boolean) as WeaponDef[];
  const ownedArmors  = data.armorInventory .map(o => ARMORS .find(a => a.id === o.id)).filter(Boolean) as ArmorDef[];

  const equippedWeapon = data.equippedWeaponId ? WEAPONS.find(w => w.id === data.equippedWeaponId) ?? null : null;
  const equippedArmor  = data.equippedArmorId  ? ARMORS .find(a => a.id === data.equippedArmorId)  ?? null : null;

  const handleWeapon = (id: string) => { equipWeapon(data.equippedWeaponId === id ? null : id); refresh(); };
  const handleArmor  = (id: string) => { equipArmor (data.equippedArmorId  === id ? null : id); refresh(); };

  // Derived weapon type options that the player actually owns
  const ownedWeaponTypes = Array.from(new Set(ownedWeapons.map(w => w.type))) as WeaponType[];
  const ownedArmorSlots  = Array.from(new Set(ownedArmors .map(a => a.slot))) as ArmorSlot[];

  // Rarity options actually owned
  const ownedWeaponRarities = RARITY_ORDER.filter(r => ownedWeapons.some(w => w.rarity === r));
  const ownedArmorRarities  = RARITY_ORDER.filter(r => ownedArmors .some(a => a.rarity === r));

  // Apply filters
  const filteredWeapons = ownedWeapons.filter(w =>
    (weaponTypeFilter   === 'all' || w.type   === weaponTypeFilter) &&
    (weaponRarityFilter === 'all' || w.rarity === weaponRarityFilter)
  );
  const filteredArmors = ownedArmors.filter(a =>
    (armorSlotFilter   === 'all' || a.slot   === armorSlotFilter) &&
    (armorRarityFilter === 'all' || a.rarity === armorRarityFilter)
  );

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center py-6 px-4 select-none">
      <button onClick={onBack} className="absolute top-4 left-4 text-gray-500 hover:text-gray-300 text-sm transition-colors">
        ← メニューへ
      </button>

      <h2 className="text-3xl font-black text-white mb-1">装備管理</h2>

      {/* Current equipment summary */}
      <div className="flex gap-3 mb-4">
        <div className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-2 text-center">
          <div className="text-xs text-gray-500 mb-0.5">武具</div>
          {equippedWeapon
            ? <div className="flex items-center gap-1.5"><span className="text-lg">{equippedWeapon.emoji}</span><span className="text-sm font-bold text-white">{equippedWeapon.nameJa}</span></div>
            : <div className="text-gray-600 text-sm">未装備</div>}
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-900 px-4 py-2 text-center">
          <div className="text-xs text-gray-500 mb-0.5">防具</div>
          {equippedArmor
            ? <div className="flex items-center gap-1.5"><span className="text-lg">{equippedArmor.emoji}</span><span className="text-sm font-bold text-white">{equippedArmor.nameJa}</span></div>
            : <div className="text-gray-600 text-sm">未装備</div>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['weapon', 'armor'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-6 py-2 rounded-xl font-black text-sm border-2 transition-all ${tab === t ? 'border-purple-500 bg-purple-900/50 text-purple-300' : 'border-gray-700 bg-gray-900 text-gray-500 hover:text-gray-300'}`}>
            {t === 'weapon' ? `⚔ 武具 (${ownedWeapons.length})` : `🛡 防具 (${ownedArmors.length})`}
          </button>
        ))}
      </div>

      {/* ── Weapon tab ─────────────────────────────────────────────── */}
      {tab === 'weapon' && (
        ownedWeapons.length === 0
          ? <p className="text-gray-600 text-sm mt-8">武具なし — 装備ガチャで入手しよう！</p>
          : <div className="w-full max-w-2xl">
              {/* Type filter */}
              {ownedWeaponTypes.length > 1 && (
                <div className="mb-2">
                  <p className="text-xs text-gray-500 mb-1.5 font-bold">武器タイプ</p>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterChip label="すべて" active={weaponTypeFilter === 'all'} onClick={() => setWeaponTypeFilter('all')} />
                    {ownedWeaponTypes.map(t => (
                      <FilterChip key={t} label={WEAPON_TYPE_LABEL[t]} active={weaponTypeFilter === t} onClick={() => setWeaponTypeFilter(t)} />
                    ))}
                  </div>
                </div>
              )}
              {/* Rarity filter */}
              {ownedWeaponRarities.length > 1 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5 font-bold">レアリティ</p>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterChip label="すべて" active={weaponRarityFilter === 'all'} onClick={() => setWeaponRarityFilter('all')} />
                    {ownedWeaponRarities.map(r => (
                      <FilterChip key={r} label={EQUIP_RARITY_LABEL[r]} active={weaponRarityFilter === r} onClick={() => setWeaponRarityFilter(r)} color={EQUIP_RARITY_COLOR[r]} />
                    ))}
                  </div>
                </div>
              )}
              {/* Results count */}
              <p className="text-xs text-gray-500 mb-2">
                {filteredWeapons.length}/{ownedWeapons.length} 件表示
                {(weaponTypeFilter !== 'all' || weaponRarityFilter !== 'all') && (
                  <button className="ml-2 text-purple-400 hover:text-purple-300 transition-colors" onClick={() => { setWeaponTypeFilter('all'); setWeaponRarityFilter('all'); }}>
                    フィルタをリセット ✕
                  </button>
                )}
              </p>
              {filteredWeapons.length === 0
                ? <p className="text-gray-600 text-sm mt-4 text-center">該当する武具がありません</p>
                : <div className="grid grid-cols-2 gap-3">
                    {filteredWeapons.map(w => (
                      <WeaponCard key={w.id} w={w} equipped={data.equippedWeaponId === w.id} onClick={() => handleWeapon(w.id)} />
                    ))}
                  </div>
              }
            </div>
      )}

      {/* ── Armor tab ──────────────────────────────────────────────── */}
      {tab === 'armor' && (
        ownedArmors.length === 0
          ? <p className="text-gray-600 text-sm mt-8">防具なし — 装備ガチャで入手しよう！</p>
          : <div className="w-full max-w-2xl">
              {/* Slot filter */}
              {ownedArmorSlots.length > 1 && (
                <div className="mb-2">
                  <p className="text-xs text-gray-500 mb-1.5 font-bold">スロット</p>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterChip label="すべて" active={armorSlotFilter === 'all'} onClick={() => setArmorSlotFilter('all')} />
                    {ownedArmorSlots.map(s => (
                      <FilterChip key={s} label={ARMOR_SLOT_LABEL[s]} active={armorSlotFilter === s} onClick={() => setArmorSlotFilter(s)} />
                    ))}
                  </div>
                </div>
              )}
              {/* Rarity filter */}
              {ownedArmorRarities.length > 1 && (
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5 font-bold">レアリティ</p>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterChip label="すべて" active={armorRarityFilter === 'all'} onClick={() => setArmorRarityFilter('all')} />
                    {ownedArmorRarities.map(r => (
                      <FilterChip key={r} label={EQUIP_RARITY_LABEL[r]} active={armorRarityFilter === r} onClick={() => setArmorRarityFilter(r)} color={EQUIP_RARITY_COLOR[r]} />
                    ))}
                  </div>
                </div>
              )}
              {/* Results count */}
              <p className="text-xs text-gray-500 mb-2">
                {filteredArmors.length}/{ownedArmors.length} 件表示
                {(armorSlotFilter !== 'all' || armorRarityFilter !== 'all') && (
                  <button className="ml-2 text-purple-400 hover:text-purple-300 transition-colors" onClick={() => { setArmorSlotFilter('all'); setArmorRarityFilter('all'); }}>
                    フィルタをリセット ✕
                  </button>
                )}
              </p>
              {filteredArmors.length === 0
                ? <p className="text-gray-600 text-sm mt-4 text-center">該当する防具がありません</p>
                : <div className="grid grid-cols-2 gap-3">
                    {filteredArmors.map(a => (
                      <ArmorCard key={a.id} a={a} equipped={data.equippedArmorId === a.id} onClick={() => handleArmor(a.id)} />
                    ))}
                  </div>
              }
            </div>
      )}

      <p className="mt-4 text-gray-600 text-xs">クリックで装備 / もう一度クリックで外す</p>
    </div>
  );
}
