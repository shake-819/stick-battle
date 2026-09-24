import { GACHA_ITEMS, CHARACTER_COLORS } from '@/data/gachaItems';
import { BOSSES } from '@/data/bosses';
import { WEAPONS, ARMORS, type WeaponDef, type ArmorDef, type EquipRarity } from '@/data/equipment';

export interface LevelChoices {
  attack: number; defense: number; speed: number; jump: number; stocks: number;
}

export interface OwnedItem { id: string; count: number; }

export interface PlayerData {
  level: number; xp: number; coins: number;
  ownedItems: OwnedItem[];
  levelChoices: LevelChoices;
  pendingLevelUps: number;
  wins: number; losses: number;
  selectedCharacter?: string;
  weaponInventory: OwnedItem[];
  armorInventory:  OwnedItem[];
  equippedWeaponId: string | null;
  equippedArmorId:  string | null;
  weaponPity: number;
  armorPity:  number;
  gachaTickets: number;
  defenseGoldLv: number;
  defenseAtkSpeedLv: number;
  bossFragments: Record<string, number>;
  bossUnlockLv: Record<string, number>;
  bossLastDefeated: number;
}

export interface EffectiveStats {
  attackMult: number; defenseMult: number; speedMult: number; jumpMult: number;
  startingStocks: number; maxJumps: number; berserker: boolean; playerColor: string;
  equippedWeapon: WeaponDef | null;
  equippedArmor:  ArmorDef  | null;
  effectiveSPCooldown: number; // in frames
  selectedCharacter: string | undefined;
  bossUnlockLv: Record<string, number>;
}

const KEY = 'stick-smash-v2';

// Hook called whenever save() is invoked — used by auth to sync to server
let _saveHook: ((data: PlayerData) => void) | null = null;
export function setSaveHook(fn: ((data: PlayerData) => void) | null): void { _saveHook = fn; }

const DEFAULT: PlayerData = {
  level: 1, xp: 0, coins: 300,
  ownedItems: [],
  levelChoices: { attack: 0, defense: 0, speed: 0, jump: 0, stocks: 0 },
  pendingLevelUps: 0,
  wins: 0, losses: 0,
  selectedCharacter: undefined,
  weaponInventory: [], armorInventory: [],
  equippedWeaponId: null, equippedArmorId: null,
  weaponPity: 0, armorPity: 0,
  gachaTickets: 0,
  defenseGoldLv: 0,
  defenseAtkSpeedLv: 0,
  bossFragments: {},
  bossUnlockLv: {},
  bossLastDefeated: 0,
};

export function xpForLevel(level: number): number { return level * 200; }

export function load(): PlayerData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT };
}

export function save(data: PlayerData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
  _saveHook?.(data);
}

export function clearLocal(): void { localStorage.removeItem(KEY); }

export function setSelectedCharacter(id: string | undefined): void {
  const data = load(); data.selectedCharacter = id; save(data);
}

// Rarities considered "legend gacha only" — excluded from completion checks
const LEGEND_ONLY_RARITIES: EquipRarity[] = ['mythic', 'divine', 'transcend', 'primordial'];

export function getCompletionStatus(data: PlayerData) {
  const normalWeapons = WEAPONS.filter(w => !LEGEND_ONLY_RARITIES.includes(w.rarity));
  const normalArmors  = ARMORS.filter(a => !LEGEND_ONLY_RARITIES.includes(a.rarity));
  const gachaComplete  = GACHA_ITEMS.every(i => data.ownedItems.some(o => o.id === i.id));
  const weaponComplete = normalWeapons.every(w => data.weaponInventory.some(o => o.id === w.id));
  const armorComplete  = normalArmors.every(a => data.armorInventory.some(o => o.id === a.id));
  return { gachaComplete, weaponComplete, armorComplete, normalWeapons, normalArmors };
}

export function computeEffectiveStats(data: PlayerData): EffectiveStats {
  const lc = data.levelChoices;
  let attack  = 1.0 + lc.attack  * 0.1;
  let defense = lc.defense * 0.08;
  let speed   = 1.0 + lc.speed   * 0.08;
  let jump    = 1.0 + lc.jump    * 0.08;
  let extraStocks = lc.stocks;
  let maxJumps = 2;
  let berserker = false;

  for (const owned of data.ownedItems) {
    const def = GACHA_ITEMS.find(i => i.id === owned.id);
    if (!def) continue;
    const n = owned.count;
    if (def.effect.attack)    attack      += def.effect.attack  * n;
    if (def.effect.defense)   defense     += def.effect.defense * n;
    if (def.effect.speed)     speed       += def.effect.speed   * n;
    if (def.effect.stocks)    extraStocks += def.effect.stocks  * n;
    if (def.effect.berserker) berserker = true;
  }

  const isBossCharacter = BOSSES.some(b => b.id === data.selectedCharacter);

  // Apply equipped weapon bonuses (stripped when playing as boss)
  const weapon = (!isBossCharacter && data.equippedWeaponId) ? WEAPONS.find(w => w.id === data.equippedWeaponId) ?? null : null;
  if (weapon) {
    attack += weapon.attackBonus;
    speed  += weapon.speedBonus;
  }

  // Apply equipped armor bonuses (stripped when playing as boss)
  const armor = (!isBossCharacter && data.equippedArmorId) ? ARMORS.find(a => a.id === data.equippedArmorId) ?? null : null;
  if (armor) {
    defense += armor.defenseBonus;
    attack  += armor.attackBonus;
    speed   += armor.speedBonus;
    jump    += armor.jumpBonus;
  }

  // Caps (before completion bonuses)
  attack  = Math.min(attack,  3.5);
  defense = Math.min(defense, 0.75);
  speed   = Math.min(speed,   2.5);
  jump    = Math.min(jump,    2.5);

  // ── コンプリートボーナス（キャップ後に上乗せ）レジェンダリー以下の武具・防具限定 ──
  const { weaponComplete, armorComplete } = getCompletionStatus(data);
  if (weaponComplete) { attack += 1.50; }                  // 武具全コンプ（レジェンダリー以下）
  if (armorComplete)  { defense += 1.00; }                 // 防具全コンプ（レジェンダリー以下）

  const startingStocks = Math.min(3 + extraStocks, 5);

  const playerColor =
    data.selectedCharacter && CHARACTER_COLORS[data.selectedCharacter]
      ? CHARACTER_COLORS[data.selectedCharacter]
      : data.selectedCharacter
        ? (BOSSES.find(b => b.id === data.selectedCharacter)?.color ?? '#3b82f6')
        : '#3b82f6';

  const effectiveSPCooldown = Math.floor(200 * (1 - (weapon?.specialCDReduction ?? 0)));

  return {
    attackMult: attack, defenseMult: defense, speedMult: speed, jumpMult: jump,
    startingStocks, maxJumps, berserker, playerColor,
    equippedWeapon: weapon, equippedArmor: armor,
    effectiveSPCooldown,
    selectedCharacter: data.selectedCharacter,
    bossUnlockLv: data.bossUnlockLv ?? {},
  };
}

export interface BattleReward {
  xpGained: number; coinsGained: number; newLevel: number; leveledUp: boolean;
}

export function recordBattleResult(won: boolean, damageDealt: number): BattleReward {
  const data = load(); const prevLevel = data.level;
  const xpGained    = (won ? 150 : 50) + Math.floor(damageDealt * 0.6);
  const coinsGained = (won ? 80  : 30) + Math.floor(damageDealt * 0.25);
  data.xp += xpGained; data.coins += coinsGained;
  if (won) data.wins++; else data.losses++;
  while (data.level < 15 && data.xp >= xpForLevel(data.level)) {
    data.xp -= xpForLevel(data.level); data.level++;
    // Lv5刻みでガチャチケット付与
    if (data.level % 5 === 0) data.gachaTickets = (data.gachaTickets ?? 0) + 1;
    data.pendingLevelUps++;
  }
  const leveledUp = data.level > prevLevel;
  save(data);
  return { xpGained, coinsGained, newLevel: data.level, leveledUp };
}

export function spendTicket(): boolean {
  const data = load();
  if ((data.gachaTickets ?? 0) <= 0) return false;
  data.gachaTickets--;
  save(data); return true;
}

export function applyLevelUpChoice(choice: keyof LevelChoices): boolean {
  const data = load();
  if (data.pendingLevelUps <= 0) return false;
  data.levelChoices[choice]++;
  data.pendingLevelUps--;
  save(data); return true;
}

export function addItems(itemIds: string[]): number {
  const data = load(); let bonusCoins = 0;
  for (const id of itemIds) {
    const def = GACHA_ITEMS.find(i => i.id === id);
    if (!def) continue;
    const existing = data.ownedItems.find(o => o.id === id);
    if (existing) {
      existing.count++;
      bonusCoins += def.rarity === 'character' ? 500 : def.rarity === 'epic' ? 100 : def.rarity === 'rare' ? 40 : 15;
    } else { data.ownedItems.push({ id, count: 1 }); }
    if (def.effect.coinBonus) bonusCoins += def.effect.coinBonus;
  }
  data.coins += bonusCoins; save(data); return bonusCoins;
}

export function addWeapons(ids: string[]): { bonusCoins: number; pity: number } {
  const data = load();
  for (const id of ids) {
    const def = WEAPONS.find(w => w.id === id);
    if (!def) continue;
    const existing = data.weaponInventory.find(o => o.id === id);
    if (existing) { existing.count++; }
    else data.weaponInventory.push({ id, count: 1 });
  }
  data.weaponPity = 0; save(data);
  return { bonusCoins: 0, pity: data.weaponPity };
}

export function addArmors(ids: string[]): { bonusCoins: number; pity: number } {
  const data = load();
  for (const id of ids) {
    const def = ARMORS.find(a => a.id === id);
    if (!def) continue;
    const existing = data.armorInventory.find(o => o.id === id);
    if (existing) { existing.count++; }
    else data.armorInventory.push({ id, count: 1 });
  }
  data.armorPity = 0; save(data);
  return { bonusCoins: 0, pity: data.armorPity };
}

export function incrementWeaponPity(): number {
  const data = load(); data.weaponPity++; save(data); return data.weaponPity;
}
export function incrementArmorPity(): number {
  const data = load(); data.armorPity++; save(data); return data.armorPity;
}

export function equipWeapon(id: string | null): void {
  const data = load(); data.equippedWeaponId = id; save(data);
}
export function equipArmor(id: string | null): void {
  const data = load(); data.equippedArmorId = id; save(data);
}

export function spendCoins(amount: number): boolean {
  const data = load();
  if (data.coins < amount) return false;
  data.coins -= amount; save(data); return true;
}

// ── ボスクールダウンシステム ──────────────────────────────────────────────────

/** ボスを倒した時に呼ぶ（全ボス共通60秒クールダウン開始） */
export function recordBossDefeat(): void {
  const data = load();
  data.bossLastDefeated = Date.now();
  save(data);
}

/** クールダウン残り秒数を返す（0なら挑戦可能） */
export function getBossCooldownRemaining(): number {
  const data = load();
  const last = data.bossLastDefeated ?? 0;
  if (last === 0) return 0;
  const elapsed = (Date.now() - last) / 1000;
  return Math.max(0, 60 - elapsed);
}

// ── ボス欠片システム ──────────────────────────────────────────────────────────

/** 各★レベルに必要な欠片数（累計ではなく、その都度必要） */
export const BOSS_UNLOCK_COSTS = [20, 40, 60, 100, 150] as const;

/** ボスを倒した時に呼ぶ。欠片を追加して保存し、追加後の合計を返す */
export function addBossFragments(bossId: string, count: number): number {
  const data = load();
  if (!data.bossFragments) data.bossFragments = {};
  data.bossFragments[bossId] = (data.bossFragments[bossId] ?? 0) + count;
  save(data);
  return data.bossFragments[bossId];
}

/** 欠片を消費して★レベルを1上げる。成功したら { success: true, newLv } を返す */
export function upgradeBossUnlock(bossId: string): { success: boolean; newLv: number } {
  const data = load();
  if (!data.bossFragments) data.bossFragments = {};
  if (!data.bossUnlockLv)  data.bossUnlockLv  = {};
  const currentLv = data.bossUnlockLv[bossId] ?? 0;
  if (currentLv >= BOSS_UNLOCK_COSTS.length) return { success: false, newLv: currentLv };
  const cost = BOSS_UNLOCK_COSTS[currentLv];
  const frags = data.bossFragments[bossId] ?? 0;
  if (frags < cost) return { success: false, newLv: currentLv };
  data.bossFragments[bossId] = frags - cost;
  data.bossUnlockLv[bossId] = currentLv + 1;
  save(data);
  return { success: true, newLv: currentLv + 1 };
}
