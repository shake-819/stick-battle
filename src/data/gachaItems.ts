export type Rarity = 'common' | 'rare' | 'epic' | 'character';

export interface GachaItemEffect {
  attack?: number;
  defense?: number;
  speed?: number;
  stocks?: number;
  berserker?: boolean;
  coinBonus?: number;
  character?: boolean;
}

export interface GachaItemDef {
  id: string;
  nameJa: string;
  descJa: string;
  rarity: Rarity;
  effect: GachaItemEffect;
  emoji: string;
  color: string;
  glowColor: string;
}

// Character body colors used in the game canvas
export const CHARACTER_COLORS: Record<string, string> = {
  char_blazer:  '#f97316',
  char_shadow:  '#a855f7',
  char_titan:   '#94a3b8',
  char_phoenix: '#f59e0b',
  char_specter: '#22d3ee',
  char_thunder: '#fbbf24',
  char_frost:   '#7dd3fc',
  char_dragon:  '#4ade80',
  char_demon:   '#f43f5e',
  char_sage:    '#c084fc',
};

export const GACHA_ITEMS: GachaItemDef[] = [
  // ─── COMMON ──────────────────────────────────────────────────────────────
  { id: 'red_gloves',  nameJa: '赤いグローブ',     descJa: '攻撃力 +8%',              rarity: 'common', effect: { attack: 0.08 },           emoji: '🥊',  color: 'bg-red-800',    glowColor: '#ef4444' },
  { id: 'tough_suit',  nameJa: 'タフスーツ',       descJa: 'のけぞり耐性 +8%',         rarity: 'common', effect: { defense: 0.08 },          emoji: '🛡️', color: 'bg-gray-700',   glowColor: '#6b7280' },
  { id: 'dash_shoes',  nameJa: 'ダッシュシューズ', descJa: '移動速度 +8%',             rarity: 'common', effect: { speed: 0.08 },            emoji: '👟',  color: 'bg-green-800',  glowColor: '#22c55e' },
  { id: 'iron_grip',   nameJa: '鉄の握力',         descJa: '攻撃力 +6% のけぞり耐性 +5%', rarity: 'common', effect: { attack: 0.06, defense: 0.05 }, emoji: '🦵', color: 'bg-yellow-700', glowColor: '#facc15' },
  { id: 'lucky_coin',  nameJa: 'ラッキーコイン',   descJa: 'コイン +50',               rarity: 'common', effect: { coinBonus: 50 },          emoji: '🪙',  color: 'bg-amber-700',  glowColor: '#f59e0b' },
  // ─── RARE ────────────────────────────────────────────────────────────────
  { id: 'power_gloves',nameJa: 'パワーグローブ',   descJa: '攻撃力 +18%',             rarity: 'rare',   effect: { attack: 0.18 },           emoji: '💪',  color: 'bg-orange-700', glowColor: '#f97316' },
  { id: 'hero_cape',   nameJa: 'ヒーローマント',   descJa: 'のけぞり耐性 +15%',        rarity: 'rare',   effect: { defense: 0.15 },          emoji: '🦸',  color: 'bg-blue-700',   glowColor: '#3b82f6' },
  { id: 'turbo_boots', nameJa: 'ターボブーツ',     descJa: '移動速度 +18%',            rarity: 'rare',   effect: { speed: 0.18 },            emoji: '⚡',  color: 'bg-cyan-700',   glowColor: '#06b6d4' },
  { id: 'vital_band',  nameJa: 'バイタルバンド',   descJa: '攻撃力 +10% のけぞり耐性 +12%', rarity: 'rare', effect: { attack: 0.10, defense: 0.12 }, emoji: '🌬️', color: 'bg-sky-700',    glowColor: '#0ea5e9' },
  { id: 'extra_life',  nameJa: 'エクストラライフ', descJa: '開始ストック +1',           rarity: 'rare',   effect: { stocks: 1 },              emoji: '❤️', color: 'bg-pink-700',   glowColor: '#ec4899' },
  // ─── EPIC ────────────────────────────────────────────────────────────────
  { id: 'dragon_fist', nameJa: 'ドラゴンフィスト', descJa: '攻撃力 +35%',             rarity: 'epic',   effect: { attack: 0.35 },           emoji: '🐉',  color: 'bg-red-900',    glowColor: '#dc2626' },
  { id: 'god_armor',   nameJa: 'ゴッドアーマー',   descJa: 'のけぞり耐性 +28%',        rarity: 'epic',   effect: { defense: 0.28 },          emoji: '👑',  color: 'bg-yellow-900', glowColor: '#ca8a04' },
  { id: 'lightning_foot', nameJa: 'ライトニングフット', descJa: '移動速度 +30%',       rarity: 'epic',   effect: { speed: 0.30 },            emoji: '🌩️', color: 'bg-violet-900', glowColor: '#7c3aed' },
  { id: 'titan_gaunt', nameJa: 'タイタン籠手',     descJa: '攻撃力 +22% のけぞり耐性 +18%', rarity: 'epic', effect: { attack: 0.22, defense: 0.18 }, emoji: '🪽', color: 'bg-purple-900', glowColor: '#9333ea' },
  { id: 'berserker',   nameJa: 'バーサーカー魂',   descJa: '敵のダメージ%が高いほど攻撃力UP', rarity: 'epic', effect: { berserker: true },    emoji: '🔥',  color: 'bg-rose-900',   glowColor: '#e11d48' },
  // ─── CHARACTER (各1%) ──────────────────────────────────────────────────
  {
    id: 'char_blazer', nameJa: '炎帝ブレイザー', descJa: '攻撃力+25% 移動+10% 炎の剣士',
    rarity: 'character', effect: { attack: 0.25, speed: 0.10, character: true },
    emoji: '⚔️', color: 'bg-orange-900', glowColor: '#f97316',
  },
  {
    id: 'char_shadow', nameJa: '疾風シャドウ', descJa: '移動+30% 攻撃+12% 忍者の風',
    rarity: 'character', effect: { speed: 0.30, attack: 0.12, character: true },
    emoji: '🌑', color: 'bg-purple-950', glowColor: '#a855f7',
  },
  {
    id: 'char_titan', nameJa: '鋼鉄タイタン', descJa: '耐性+30% 攻撃力+15% 重装甲士',
    rarity: 'character', effect: { defense: 0.30, attack: 0.15, character: true },
    emoji: '⚙️', color: 'bg-slate-800', glowColor: '#94a3b8',
  },
  {
    id: 'char_phoenix', nameJa: '天翔フェニックス', descJa: '攻撃+25% 移動+15% 不死鳥の力',
    rarity: 'character', effect: { attack: 0.25, speed: 0.15, character: true },
    emoji: '🦅', color: 'bg-amber-900', glowColor: '#f59e0b',
  },
  {
    id: 'char_specter', nameJa: '霊魂スペクター', descJa: 'バーサーカー 移動+15% 霊体の力',
    rarity: 'character', effect: { berserker: true, speed: 0.15, character: true },
    emoji: '👻', color: 'bg-cyan-950', glowColor: '#22d3ee',
  },
  {
    id: 'char_thunder', nameJa: '雷神サンダー', descJa: '攻撃+20% 移動+20% 雷速の剣士',
    rarity: 'character', effect: { attack: 0.20, speed: 0.20, character: true },
    emoji: '⚡', color: 'bg-yellow-900', glowColor: '#fbbf24',
  },
  {
    id: 'char_frost', nameJa: '氷姫フロスト', descJa: '耐性+20% 残機+1 氷の加護',
    rarity: 'character', effect: { defense: 0.20, stocks: 1, character: true },
    emoji: '❄️', color: 'bg-sky-950', glowColor: '#7dd3fc',
  },
  {
    id: 'char_dragon', nameJa: '竜王ドラゴン', descJa: '攻撃+35% 耐性+5% 竜の覇者',
    rarity: 'character', effect: { attack: 0.35, defense: 0.05, character: true },
    emoji: '🐲', color: 'bg-green-950', glowColor: '#4ade80',
  },
  {
    id: 'char_demon', nameJa: '魔侯デーモン', descJa: 'バーサーカー 攻撃+20% 魔界の王',
    rarity: 'character', effect: { berserker: true, attack: 0.20, character: true },
    emoji: '😈', color: 'bg-rose-950', glowColor: '#f43f5e',
  },
  {
    id: 'char_sage', nameJa: '賢者セージ', descJa: '防御+15% 移動+20% 攻撃+10% 万能型',
    rarity: 'character', effect: { defense: 0.15, speed: 0.20, attack: 0.10, character: true },
    emoji: '🧙', color: 'bg-purple-950', glowColor: '#c084fc',
  },
];

// ─── Pull logic ────────────────────────────────────────────────────────────────
// character: 1% per character (dynamic), epic: 8%, rare: 27%, common: remainder
export const CHAR_ITEMS = GACHA_ITEMS.filter(i => i.rarity === 'character');
// Each character keeps exactly 1% rate; totals scale with roster size
const CHAR_RATE  = CHAR_ITEMS.length;   // e.g. 10 chars → 10%
const EPIC_RATE  = 8;
const RARE_RATE  = 27;
// common = 100 - CHAR_RATE - EPIC_RATE - RARE_RATE
export const PULL_RATES = {
  character: CHAR_RATE,
  epic:  EPIC_RATE,
  rare:  RARE_RATE,
  common: 100 - CHAR_RATE - EPIC_RATE - RARE_RATE,
};

export function pullItems(count: number, ownedIds: string[] = []): GachaItemDef[] {
  const results: GachaItemDef[] = [];
  const accumulated = [...ownedIds];
  for (let i = 0; i < count; i++) {
    const roll = Math.random() * 100;
    let rarity: Rarity;
    if      (roll < CHAR_RATE)                           rarity = 'character';
    else if (roll < CHAR_RATE + EPIC_RATE)               rarity = 'epic';
    else if (roll < CHAR_RATE + EPIC_RATE + RARE_RATE)   rarity = 'rare';
    else                                                  rarity = 'common';

    const unownedInRarity = GACHA_ITEMS.filter(x => x.rarity === rarity && !accumulated.includes(x.id));
    const unownedAny = GACHA_ITEMS.filter(x => !accumulated.includes(x.id));
    const pool = unownedInRarity.length > 0 ? unownedInRarity : unownedAny;
    if (pool.length === 0) break;

    const item = pool[Math.floor(Math.random() * pool.length)];
    accumulated.push(item.id);
    results.push(item);
  }
  return results;
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common:    'コモン',
  rare:      'レア',
  epic:      'エピック',
  character: 'キャラクター',
};

export const RARITY_COLORS: Record<Rarity, { text: string; bg: string; border: string; glow: string }> = {
  common:    { text: 'text-gray-300',   bg: 'bg-gray-800',    border: 'border-gray-500',   glow: '#9ca3af' },
  rare:      { text: 'text-blue-300',   bg: 'bg-blue-950',    border: 'border-blue-400',   glow: '#60a5fa' },
  epic:      { text: 'text-yellow-300', bg: 'bg-yellow-950',  border: 'border-yellow-400', glow: '#facc15' },
  character: { text: 'text-rose-300',   bg: 'bg-rose-950',    border: 'border-rose-400',   glow: '#fb7185' },
};
