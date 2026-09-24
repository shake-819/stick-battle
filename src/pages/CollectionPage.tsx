import { useEffect, useState } from 'react';
import { load, type OwnedItem } from '@/store/playerStore';
import { GACHA_ITEMS, RARITY_COLORS, RARITY_LABEL, type GachaItemDef } from '@/data/gachaItems';

interface CollectionPageProps {
  onBack: () => void;
}

export default function CollectionPage({ onBack }: CollectionPageProps) {
  const [ownedItems, setOwnedItems] = useState<OwnedItem[]>([]);

  useEffect(() => {
    setOwnedItems(load().ownedItems);
  }, []);

  const getOwned = (id: string) => ownedItems.find(o => o.id === id);

  const rarities = ['epic', 'rare', 'common'] as const;

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 pt-6 pb-4 border-b border-gray-800 flex-shrink-0">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
          ← 戻る
        </button>
        <h2 className="text-2xl font-black text-white">📦 図鑑</h2>
        <span className="text-gray-500 text-sm ml-auto">
          {ownedItems.length} / {GACHA_ITEMS.length} 種類入手
        </span>
      </div>

      {/* Item list */}
      <div className="px-6 py-4 space-y-6">
        {rarities.map(rarity => {
          const items = GACHA_ITEMS.filter(i => i.rarity === rarity);
          const rc = RARITY_COLORS[rarity];
          return (
            <div key={rarity}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`font-black text-base ${rc.text}`}>{RARITY_LABEL[rarity]}</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {items.map(item => {
                  const owned = getOwned(item.id);
                  return <ItemCard key={item.id} item={item} owned={owned} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemCard({ item, owned }: { item: GachaItemDef; owned: OwnedItem | undefined }) {
  const rc = RARITY_COLORS[item.rarity];
  const has = !!owned;

  return (
    <div
      className="rounded-xl border p-3 flex flex-col items-center gap-1 transition-all"
      style={{
        borderColor: has ? rc.glow : '#374151',
        background: has ? `radial-gradient(ellipse at 50% 0%, ${rc.glow}18, #111827)` : '#111827',
        opacity: has ? 1 : 0.45,
      }}
    >
      <span className={`text-3xl ${!has ? 'grayscale' : ''}`}>{item.emoji}</span>
      <span className={`text-xs font-black ${rc.text}`}>{RARITY_LABEL[item.rarity]}</span>
      <span className="text-white text-[11px] font-bold text-center leading-tight">{item.nameJa}</span>
      <span className="text-gray-400 text-[10px] text-center">{item.descJa}</span>
      {has && owned && (
        <span className="mt-1 bg-gray-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
          ×{owned.count}
        </span>
      )}
      {!has && (
        <span className="mt-1 text-gray-600 text-[10px]">未入手</span>
      )}
    </div>
  );
}
