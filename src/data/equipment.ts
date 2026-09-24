export type WeaponType = 'sword' | 'axe' | 'spear' | 'hammer' | 'staff' | 'bow' | 'fighting';
export type ArmorSlot  = 'helmet' | 'armor' | 'shield' | 'gloves' | 'boots' | 'cloak';
export type EquipRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'divine' | 'transcend' | 'primordial';

export const EQUIP_RARITY_COLOR: Record<EquipRarity, string> = {
  common:    '#9ca3af',
  rare:      '#60a5fa',
  epic:      '#a855f7',
  legendary: '#f59e0b',
  mythic:    '#e11d48',
  transcend: '#f97316', // 超越 — 炎のオレンジ（mythicの次）
  divine:    '#fbbf24', // 神降 — 黄金の輝き
  primordial:'#c084fc', // 原初 — 宇宙の紫（最高位）
};
export const EQUIP_RARITY_LABEL: Record<EquipRarity, string> = {
  common:    'コモン',
  rare:      'レア',
  epic:      'エピック',
  legendary: 'レジェンダリー',
  mythic:    'ミシック',
  transcend: '超越',   // ランク1（ミシックの上）
  divine:    '神降',   // ランク2
  primordial:'原初',   // ランク3（最高位）
};

export interface WeaponDef {
  id: string;
  nameJa: string;
  emoji: string;
  type: WeaponType;
  rarity: EquipRarity;
  color: string;         // visual color of the weapon
  attackBonus: number;   // fraction e.g. 0.25 = +25% ATK
  speedBonus: number;    // fraction, can be negative
  knockbackBonus: number;// flat bonus to knockback power
  specialCDReduction: number; // 0.0–0.5
  description: string;
  // ── Weapon-type special effects ──
  attackSpeedMult?: number; // <1 faster, >1 slower (sword fast, spear slow)
  bleedDps?: number;        // damage per tick when inflicting bleed (axe)
  bleedTicks?: number;      // number of ticks (axe)
  knockbackMult?: number;   // multiplier on knockback power (hammer)
  projChance?: number;      // 0–1 chance to fire a small projectile on hit (staff)
  // ── Bow ──
  arrowDamage?: number;     // damage per arrow (bow)
  arrowSpeed?: number;      // horizontal speed of arrow (bow)
  arrowKnockback?: number;  // knockback power of arrow (bow)
  chargedMult?: number;     // damage/knockback multiplier for strongAttack charged shot (bow)
  // ── Fighting ──
  guardRegenBonus?: number; // extra guard gauge regen per frame (fighting)
  // ── Divine special skills ──────────────────────────────────────────────────
  autoCounterChance?: number;      // sword divine: % chance to auto-counter incoming hit
  bleedDmgReduction?: number;      // axe divine: damage reduction when attacker is bleeding
  stunOnHitChance?: number;        // spear divine: % chance to stun enemy on hit
  stunDuration?: number;           // stun duration in frames
  autoGuardChance?: number;        // hammer divine: % chance to auto-guard incoming hit
  healOnHit?: number;              // staff divine: reduce own damage% by this amount per hit
  autoArrowChance?: number;        // bow divine: % chance to auto-fire an upward arrow
  stunEvery?: number;              // fighting divine: stun enemy every N hits
  antiPrimordialDefBonus?: number; // all divine: +DEF when attacker uses primordial weapon
  // ── Primordial special skills ──────────────────────────────────────────────
  antiPrimordialAtkBonus?: number; // all primordial: +ATK% when enemy has primordial weapon
  vengefulRage?: number;           // sword primordial: +ATK bonus per hit taken (stacks until death)
  bleedTargetDmgBonus?: number;    // axe primordial: +DMG% to bleeding enemies
  explosionChance?: number;        // spear primordial: % chance to explode on hit (bonus knockback)
  armorBreakerBonus?: number;      // hammer primordial: +DMG scalar per opponent armor rarity rank
  lifeStealOnHit?: number;         // staff primordial: reduce own damage% per successful hit
  doubleArrowChance?: number;      // bow primordial: % chance to fire 2 arrows
  comboRageBonus?: number;         // fighting primordial: +ATK% per hit landed, resets on being hit
}

export interface ArmorDef {
  id: string;
  nameJa: string;
  emoji: string;
  slot: ArmorSlot;
  rarity: EquipRarity;
  color: string;
  defenseBonus: number; // fraction e.g. 0.15 = +15% def reduction
  attackBonus: number;  // fraction (gloves etc.)
  speedBonus: number;   // fraction, can be negative
  jumpBonus: number;    // fraction
  description: string;
}

// ─── 20 Weapons ────────────────────────────────────────────────────────────────
export const WEAPONS: WeaponDef[] = [
  // ── Swords — fast attack speed ──
  { id:'w_wood_sword',   nameJa:'木剣',               emoji:'🗡', type:'sword',  rarity:'common',    color:'#a16207', attackBonus:0.08, speedBonus:0,     knockbackBonus:0,   specialCDReduction:0,    attackSpeedMult:0.75, description:'軽くて速い木製の剣。攻撃が素早い。' },
  { id:'w_iron_sword',   nameJa:'鉄剣',               emoji:'⚔', type:'sword',  rarity:'common',    color:'#9ca3af', attackBonus:0.15, speedBonus:0,     knockbackBonus:0,   specialCDReduction:0,    attackSpeedMult:0.75, description:'バランスの取れた鉄製の剣。攻撃が速い。' },
  { id:'w_steel_sword',  nameJa:'鋼剣',               emoji:'⚔', type:'sword',  rarity:'rare',      color:'#93c5fd', attackBonus:0.25, speedBonus:0,     knockbackBonus:0.3, specialCDReduction:0,    attackSpeedMult:0.70, description:'鋼の剣。攻撃速度と吹き飛ばし力が上がる。' },
  { id:'w_fire_sword',   nameJa:'炎の剣',             emoji:'🔥', type:'sword',  rarity:'epic',      color:'#f97316', attackBonus:0.38, speedBonus:0.05,  knockbackBonus:0.8, specialCDReduction:0,    attackSpeedMult:0.63, description:'炎の剣。非常に速い連撃が可能。' },
  { id:'w_thunder_sword',nameJa:'雷鳴剣',             emoji:'⚡', type:'sword',  rarity:'epic',      color:'#fbbf24', attackBonus:0.35, speedBonus:0.08,  knockbackBonus:0.5, specialCDReduction:0,    attackSpeedMult:0.63, description:'雷の剣。攻撃速度が大幅に上昇。' },
  { id:'w_excalibur',    nameJa:'聖剣エクスカリバー',  emoji:'✨', type:'sword',  rarity:'legendary', color:'#fde68a', attackBonus:0.60, speedBonus:0.10,  knockbackBonus:1.2, specialCDReduction:0,    attackSpeedMult:0.52, description:'伝説の聖剣。最速の攻撃速度と全ステータス大幅強化。' },
  // ── Axes — inflict bleed (継続ダメージ) ──
  { id:'w_stone_axe',    nameJa:'石斧',               emoji:'🪓', type:'axe',    rarity:'common',    color:'#78716c', attackBonus:0.10, speedBonus:-0.03, knockbackBonus:0.5, specialCDReduction:0,    bleedDps:2, bleedTicks:3, description:'石の斧。命中で裂傷を与え継続ダメージ（2×3回）。' },
  { id:'w_iron_axe',     nameJa:'鉄斧',               emoji:'🪓', type:'axe',    rarity:'common',    color:'#9ca3af', attackBonus:0.20, speedBonus:-0.05, knockbackBonus:0.8, specialCDReduction:0,    bleedDps:3, bleedTicks:3, description:'鉄斧。裂傷（3×3回）を与える。' },
  { id:'w_steel_axe',    nameJa:'鋼斧',               emoji:'🪓', type:'axe',    rarity:'rare',      color:'#7dd3fc', attackBonus:0.32, speedBonus:-0.08, knockbackBonus:1.2, specialCDReduction:0,    bleedDps:5, bleedTicks:5, description:'鋼斧。強い裂傷（5×5回）を与える。' },
  { id:'w_battle_axe',   nameJa:'バトルアックス',      emoji:'⚔', type:'axe',    rarity:'epic',      color:'#ef4444', attackBonus:0.48, speedBonus:-0.10, knockbackBonus:2.0, specialCDReduction:0,    bleedDps:9, bleedTicks:7, description:'戦斧。凄まじい裂傷（9×7回）を与え敵を削り続ける。' },
  // ── Spears — slow but long reach ──
  { id:'w_wood_spear',   nameJa:'木槍',               emoji:'🏹', type:'spear',  rarity:'common',    color:'#a16207', attackBonus:0.08, speedBonus:0,     knockbackBonus:0,   specialCDReduction:0,    attackSpeedMult:1.45, description:'長リーチの木槍。攻撃は遅い。' },
  { id:'w_iron_spear',   nameJa:'鉄槍',               emoji:'🔱', type:'spear',  rarity:'common',    color:'#9ca3af', attackBonus:0.16, speedBonus:0,     knockbackBonus:0.3, specialCDReduction:0,    attackSpeedMult:1.42, description:'鉄槍。遅いが高威力のリーチ攻撃。' },
  { id:'w_steel_spear',  nameJa:'鋼槍',               emoji:'🔱', type:'spear',  rarity:'rare',      color:'#93c5fd', attackBonus:0.28, speedBonus:0.03,  knockbackBonus:0.5, specialCDReduction:0,    attackSpeedMult:1.35, description:'鋼槍。広い攻撃範囲と高威力。' },
  { id:'w_dragon_spear', nameJa:'龍の槍',             emoji:'🐲', type:'spear',  rarity:'epic',      color:'#34d399', attackBonus:0.42, speedBonus:0.08,  knockbackBonus:0.8, specialCDReduction:0,    attackSpeedMult:1.22, description:'龍の槍。遅さが和らぎ絶大な攻撃力を誇る。' },
  // ── Hammers — greatly enhanced knockback ──
  { id:'w_wood_hammer',  nameJa:'木槌',               emoji:'🔨', type:'hammer', rarity:'common',    color:'#92400e', attackBonus:0.12, speedBonus:0,     knockbackBonus:1.0, specialCDReduction:0,    knockbackMult:1.30, description:'木槌。吹き飛ばし力が大幅強化(×1.3)。' },
  { id:'w_iron_hammer',  nameJa:'鉄槌',               emoji:'🔨', type:'hammer', rarity:'rare',      color:'#6b7280', attackBonus:0.22, speedBonus:-0.03, knockbackBonus:1.5, specialCDReduction:0,    knockbackMult:1.50, description:'鉄槌。吹き飛ばし力がさらに増す(×1.5)。' },
  { id:'w_steel_hammer', nameJa:'鋼槌',               emoji:'🔨', type:'hammer', rarity:'rare',      color:'#93c5fd', attackBonus:0.35, speedBonus:-0.05, knockbackBonus:2.0, specialCDReduction:0,    knockbackMult:1.65, description:'鋼槌。圧倒的な吹き飛ばし力(×1.65)。' },
  { id:'w_destroy_hammer',nameJa:'破壊槌',            emoji:'💥', type:'hammer', rarity:'epic',      color:'#7c3aed', attackBonus:0.50, speedBonus:-0.08, knockbackBonus:3.0, specialCDReduction:0,    knockbackMult:2.10, description:'破壊槌。一撃で画面外まで吹き飛ばす(×2.1)。' },
  // ── Staves — chance to fire projectile on hit ──
  { id:'w_magic_staff',   nameJa:'魔法の杖',           emoji:'🪄', type:'staff',  rarity:'rare',      color:'#8b5cf6', attackBonus:0.20, speedBonus:0,     knockbackBonus:0,   specialCDReduction:0.25, projChance:0.22, description:'魔法の杖。命中時22%で飛弾を発射。必殺技CD短縮。' },
  { id:'w_dragon_staff',  nameJa:'竜の魔杖',           emoji:'🐉', type:'staff',  rarity:'legendary', color:'#a855f7', attackBonus:0.55, speedBonus:0,     knockbackBonus:0.5, specialCDReduction:0.45, projChance:0.48, description:'竜の魔杖。命中時ほぼ半数で飛弾を発射。必殺技CD激減。' },

  // ══════════════════════════ 追加20種 ══════════════════════════

  // ── 追加 Swords (5) ──
  { id:'w_bronze_sword',  nameJa:'銅剣',               emoji:'🗡', type:'sword',  rarity:'common',    color:'#b45309', attackBonus:0.12, speedBonus:0,     knockbackBonus:0,   specialCDReduction:0,    attackSpeedMult:0.78, description:'銅製の剣。木剣より少し鋭い速攻型。' },
  { id:'w_shadow_blade',  nameJa:'影の刃',             emoji:'🌑', type:'sword',  rarity:'rare',      color:'#6b21a8', attackBonus:0.28, speedBonus:0.06,  knockbackBonus:0,   specialCDReduction:0,    attackSpeedMult:0.68, description:'影をまとった短剣。速度と攻撃力を兼ね備える。' },
  { id:'w_crystal_sword', nameJa:'水晶剣',             emoji:'💎', type:'sword',  rarity:'rare',      color:'#67e8f9', attackBonus:0.22, speedBonus:0,     knockbackBonus:0.4, specialCDReduction:0,    attackSpeedMult:0.72, description:'水晶の剣。速い連撃と吹き飛ばし力を持つ。' },
  { id:'w_demon_sword',   nameJa:'魔剣',               emoji:'😈', type:'sword',  rarity:'epic',      color:'#dc2626', attackBonus:0.40, speedBonus:0,     knockbackBonus:0.6, specialCDReduction:0,    attackSpeedMult:0.60, description:'魔力を宿した剣。凄まじい速さで攻撃する。' },
  { id:'w_galaxy_sword',  nameJa:'銀河剣',             emoji:'🌌', type:'sword',  rarity:'legendary', color:'#818cf8', attackBonus:0.65, speedBonus:0.12,  knockbackBonus:1.5, specialCDReduction:0,    attackSpeedMult:0.48, description:'銀河の力を宿した剣。最強クラスの速さと破壊力。' },

  // ── 追加 Axes (4) ──
  { id:'w_copper_axe',    nameJa:'銅斧',               emoji:'🪓', type:'axe',    rarity:'common',    color:'#b45309', attackBonus:0.08, speedBonus:0,     knockbackBonus:0.3, specialCDReduction:0,    bleedDps:1, bleedTicks:2, description:'銅の斧。軽い裂傷（1×2回）を与える入門斧。' },
  { id:'w_obsidian_axe',  nameJa:'黒曜石の斧',         emoji:'⚫', type:'axe',    rarity:'rare',      color:'#1e1b4b', attackBonus:0.28, speedBonus:-0.06, knockbackBonus:1.0, specialCDReduction:0,    bleedDps:4, bleedTicks:4, description:'黒曜石の斧。強い裂傷（4×4回）と高い吹き飛ばし力。' },
  { id:'w_dragon_axe',    nameJa:'龍斧',               emoji:'🐉', type:'axe',    rarity:'epic',      color:'#16a34a', attackBonus:0.42, speedBonus:-0.09, knockbackBonus:1.5, specialCDReduction:0,    bleedDps:7, bleedTicks:6, description:'龍の力の斧。猛烈な裂傷（7×6回）で敵を削る。' },
  { id:'w_chaos_axe',     nameJa:'混沌の斧',           emoji:'🌀', type:'axe',    rarity:'legendary', color:'#7f1d1d', attackBonus:0.55, speedBonus:-0.12, knockbackBonus:2.5, specialCDReduction:0,    bleedDps:13, bleedTicks:9, description:'混沌の斧。凄絶な裂傷（13×9回）と圧倒的な破壊力。' },

  // ── 追加 Spears (4) ──
  { id:'w_bamboo_spear',  nameJa:'竹槍',               emoji:'🎋', type:'spear',  rarity:'common',    color:'#4d7c0f', attackBonus:0.06, speedBonus:0,     knockbackBonus:0,   specialCDReduction:0,    attackSpeedMult:1.48, description:'竹で作った槍。リーチは長いが攻撃は遅い。' },
  { id:'w_silver_spear',  nameJa:'銀槍',               emoji:'🔱', type:'spear',  rarity:'rare',      color:'#e2e8f0', attackBonus:0.25, speedBonus:0.04,  knockbackBonus:0.5, specialCDReduction:0,    attackSpeedMult:1.38, description:'銀の槍。速度が上がり威力も高い。' },
  { id:'w_thunder_spear', nameJa:'雷光槍',             emoji:'⚡', type:'spear',  rarity:'epic',      color:'#ca8a04', attackBonus:0.44, speedBonus:0.06,  knockbackBonus:1.0, specialCDReduction:0,    attackSpeedMult:1.20, description:'雷をまとった槍。遅さが改善し絶大な威力を発揮。' },
  { id:'w_gungnir',       nameJa:'神槍グングニル',      emoji:'🌟', type:'spear',  rarity:'legendary', color:'#fbbf24', attackBonus:0.58, speedBonus:0.10,  knockbackBonus:1.8, specialCDReduction:0,    attackSpeedMult:1.10, description:'神の槍グングニル。最強の槍、遅さも大幅に改善。' },

  // ── 追加 Hammers (4) ──
  { id:'w_stone_hammer',  nameJa:'石槌',               emoji:'🔨', type:'hammer', rarity:'common',    color:'#78716c', attackBonus:0.10, speedBonus:0,     knockbackBonus:0.8, specialCDReduction:0,    knockbackMult:1.20, description:'石製の槌。吹き飛ばし力が強化(×1.2)。' },
  { id:'w_war_hammer',    nameJa:'ウォーハンマー',      emoji:'🔨', type:'hammer', rarity:'rare',      color:'#dc2626', attackBonus:0.28, speedBonus:-0.04, knockbackBonus:1.8, specialCDReduction:0,    knockbackMult:1.45, description:'戦争用の槌。強烈な吹き飛ばし力(×1.45)。' },
  { id:'w_gravity_hammer',nameJa:'重力槌',             emoji:'🌑', type:'hammer', rarity:'epic',      color:'#0f172a', attackBonus:0.45, speedBonus:-0.07, knockbackBonus:2.5, specialCDReduction:0,    knockbackMult:1.80, description:'重力を操る槌。凄まじい吹き飛ばし(×1.8)を誇る。' },
  { id:'w_mjolnir',       nameJa:'ムジョルニル',        emoji:'⚡', type:'hammer', rarity:'legendary', color:'#3b82f6', attackBonus:0.58, speedBonus:-0.05, knockbackBonus:3.5, specialCDReduction:0,    knockbackMult:2.50, description:'雷神の槌ムジョルニル。最強の吹き飛ばし(×2.5)。' },

  // ── 追加 Staves (3) ──
  { id:'w_bone_staff',    nameJa:'骨の杖',             emoji:'🦴', type:'staff',  rarity:'common',    color:'#d6d3d1', attackBonus:0.10, speedBonus:0,     knockbackBonus:0,   specialCDReduction:0.10, projChance:0.12, description:'骨でできた杖。命中時12%で飛弾を発射。' },
  { id:'w_crystal_staff', nameJa:'水晶の杖',           emoji:'💎', type:'staff',  rarity:'rare',      color:'#38bdf8', attackBonus:0.22, speedBonus:0,     knockbackBonus:0,   specialCDReduction:0.20, projChance:0.18, description:'水晶の杖。命中時18%で飛弾を発射。必殺技CD短縮。' },
  { id:'w_chaos_staff',   nameJa:'混沌の杖',           emoji:'🌀', type:'staff',  rarity:'legendary', color:'#6d28d9', attackBonus:0.50, speedBonus:0,     knockbackBonus:0.5, specialCDReduction:0.40, projChance:0.62, description:'混沌の杖。命中時60%超で飛弾を発射。必殺技CD激減。' },

  // ══════════════════════════ 弓（Bow）全レア度 ══════════════════════════
  // 通常攻撃(Z)→矢を射出、強攻撃(X)→チャージショット（大弾）
  { id:'w_wood_bow',      nameJa:'木の弓',             emoji:'🏹', type:'bow',    rarity:'common',    color:'#92400e', attackBonus:0.05, speedBonus:0,     knockbackBonus:0,   specialCDReduction:0,    arrowDamage:8,   arrowSpeed:7.0, arrowKnockback:2.5, chargedMult:1.8, description:'シンプルな木製の弓。矢ダメ8%。安全な距離から矢を放てる。' },
  { id:'w_bamboo_bow',    nameJa:'竹弓',               emoji:'🏹', type:'bow',    rarity:'common',    color:'#4d7c0f', attackBonus:0.08, speedBonus:0.03,  knockbackBonus:0,   specialCDReduction:0,    arrowDamage:8,   arrowSpeed:7.5, arrowKnockback:2.8, chargedMult:1.9, description:'竹で作った弓。矢ダメ8%。軽くて扱いやすく、矢速が速い。' },
  { id:'w_iron_bow',      nameJa:'鉄弓',               emoji:'🏹', type:'bow',    rarity:'rare',      color:'#93c5fd', attackBonus:0.15, speedBonus:0,     knockbackBonus:0.2, specialCDReduction:0,    arrowDamage:15,  arrowSpeed:7.5, arrowKnockback:3.2, chargedMult:2.0, description:'鉄製の弓。矢ダメ15%。威力とチャージ射撃が強化される。' },
  { id:'w_dragon_bow',    nameJa:'龍の弓',             emoji:'🏹', type:'bow',    rarity:'epic',      color:'#34d399', attackBonus:0.28, speedBonus:0.05,  knockbackBonus:0.5, specialCDReduction:0,    arrowDamage:25,  arrowSpeed:8.5, arrowKnockback:4.0, chargedMult:2.2, description:'龍の息吹を宿した弓。矢ダメ25%。高速の矢と強力なチャージ射撃。' },
  { id:'w_apollo_bow',    nameJa:'神弓アポロン',        emoji:'☀', type:'bow',    rarity:'legendary', color:'#fde68a', attackBonus:0.45, speedBonus:0.08,  knockbackBonus:1.0, specialCDReduction:0,    arrowDamage:30,  arrowSpeed:10,  arrowKnockback:5.5, chargedMult:2.5, description:'太陽神の弓。矢ダメ30%。超高速の矢と破壊的なチャージ射撃で戦場を制す。' },

  // ══════════════════════════ 格闘（Fighting）全レア度 ══════════════════════════
  // 攻撃速度0.4倍（超速連打）、低ダメ・低吹き飛ばし、ガードゲージ回復ボーナス
  { id:'w_leather_gloves',nameJa:'革グローブ',          emoji:'🥊', type:'fighting', rarity:'common',  color:'#b45309', attackBonus:0.05, speedBonus:0.04,  knockbackBonus:-0.5, specialCDReduction:0,   attackSpeedMult:0.42, guardRegenBonus:0.30, description:'軽い革のグローブ。素早い連打でガードゲージが速く回復。' },
  { id:'w_iron_fist',     nameJa:'鉄拳グローブ',        emoji:'🥊', type:'fighting', rarity:'common',  color:'#9ca3af', attackBonus:0.10, speedBonus:0.02,  knockbackBonus:-0.4, specialCDReduction:0,   attackSpeedMult:0.42, guardRegenBonus:0.35, description:'鉄でできた拳。連打ダメージが上昇しガード回復も速い。' },
  { id:'w_fight_gloves',  nameJa:'格闘グローブ',        emoji:'🥊', type:'fighting', rarity:'rare',    color:'#60a5fa', attackBonus:0.18, speedBonus:0.06,  knockbackBonus:-0.3, specialCDReduction:0,   attackSpeedMult:0.40, guardRegenBonus:0.45, description:'本格格闘グローブ。速度・連打・ガード回復が大幅強化。' },
  { id:'w_blaze_fist',    nameJa:'烈火拳',              emoji:'🔥', type:'fighting', rarity:'epic',    color:'#f97316', attackBonus:0.32, speedBonus:0.08,  knockbackBonus:-0.2, specialCDReduction:0,   attackSpeedMult:0.38, guardRegenBonus:0.60, description:'炎をまとった拳。猛烈な連打で相手を封じ込める。' },
  { id:'w_dragon_fist',   nameJa:'龍拳',                emoji:'🐉', type:'fighting', rarity:'legendary',color:'#a855f7',attackBonus:0.52, speedBonus:0.12,  knockbackBonus:0.0,  specialCDReduction:0,   attackSpeedMult:0.35, guardRegenBonus:0.80, description:'龍の魂を宿した拳。最速の連打と圧倒的なガード回復力。' },

  // ══════════════════════════ ミシック（Mythic）全武器タイプ ══════════════════════════
  // ── ミシック Sword ──
  { id:'w_mythic_sword',   nameJa:'剣聖の魔剣',          emoji:'⚔', type:'sword',   rarity:'mythic',    color:'#e11d48', attackBonus:0.80, speedBonus:0.15,  knockbackBonus:2.0, specialCDReduction:0,    attackSpeedMult:0.45, description:'剣聖の名を冠する究極の剣。速さと破壊力が別次元。' },
  // ── ミシック Axe ──
  { id:'w_mythic_axe',     nameJa:'混沌の覇斧',           emoji:'🪓', type:'axe',    rarity:'mythic',    color:'#e11d48', attackBonus:0.70, speedBonus:-0.05, knockbackBonus:3.0, specialCDReduction:0,    bleedDps:20, bleedTicks:12, description:'混沌の覇斧。凄絶な裂傷（20×12回）と圧倒的な破壊力。' },
  // ── ミシック Spear ──
  { id:'w_mythic_spear',   nameJa:'天空槍アスガルド',      emoji:'🔱', type:'spear',  rarity:'mythic',    color:'#e11d48', attackBonus:0.68, speedBonus:0.12,  knockbackBonus:2.5, specialCDReduction:0,    attackSpeedMult:1.05, description:'天空の槍。遅さを完全に克服した最強のリーチ武器。' },
  // ── ミシック Hammer ──
  { id:'w_mythic_hammer',  nameJa:'大地砕きの鉄槌',       emoji:'🔨', type:'hammer', rarity:'mythic',    color:'#e11d48', attackBonus:0.70, speedBonus:-0.08, knockbackBonus:5.0, specialCDReduction:0,    knockbackMult:3.50, description:'大地を砕く究極の槌。吹き飛ばし力が次元を超える(×3.5)。' },
  // ── ミシック Staff ──
  { id:'w_mythic_staff',   nameJa:'宇宙の魔杖',           emoji:'🌌', type:'staff',  rarity:'mythic',    color:'#e11d48', attackBonus:0.65, speedBonus:0,     knockbackBonus:1.0, specialCDReduction:0.50, projChance:0.85, description:'宇宙の力を宿した杖。ほぼ毎回飛弾を発射し必殺技CD最小。' },
  // ── ミシック Bow ──
  { id:'w_mythic_bow',     nameJa:'天弓ゴールデンアロー',  emoji:'🏹', type:'bow',    rarity:'mythic',    color:'#e11d48', attackBonus:0.55, speedBonus:0.10,  knockbackBonus:1.2, specialCDReduction:0,    arrowDamage:40,  arrowSpeed:10, arrowKnockback:5.5, chargedMult:2.0, description:'神話の天弓。矢ダメ40%。高速の矢とチャージショットで戦場を制圧する。' },
  // ── ミシック Fighting ──
  { id:'w_mythic_fighting',nameJa:'龍神拳',               emoji:'🐲', type:'fighting',rarity:'mythic',   color:'#e11d48', attackBonus:0.68, speedBonus:0.15,  knockbackBonus:0.5, specialCDReduction:0,    attackSpeedMult:0.30, guardRegenBonus:1.20, description:'龍神の拳。最速の連打と驚異的なガード回復力で無双する。' },

  // ══════════════════════════ 超越（Transcend）全武器タイプ ══════════════════════════
  // ── 超越 Sword ──
  { id:'w_trans_sword',   nameJa:'超越刃・天斬',          emoji:'🌟', type:'sword',   rarity:'transcend', color:'#f97316', attackBonus:1.10, speedBonus:0.22, knockbackBonus:3.5, specialCDReduction:0.10, attackSpeedMult:0.48, description:'天を斬る超越の刃。全ての限界を超えた攻撃速度と破壊力。' },
  // ── 超越 Axe ──
  { id:'w_trans_axe',     nameJa:'超越斧・断滅',          emoji:'🔥', type:'axe',     rarity:'transcend', color:'#f97316', attackBonus:1.00, speedBonus:-0.03,knockbackBonus:5.0, specialCDReduction:0,    bleedDps:35, bleedTicks:15, description:'断滅の斧。35×15回の灼熱裂傷が止まらない究極の出血武器。' },
  // ── 超越 Spear ──
  { id:'w_trans_spear',   nameJa:'超越槍・貫天',          emoji:'⚡', type:'spear',   rarity:'transcend', color:'#f97316', attackBonus:0.95, speedBonus:0.20, knockbackBonus:4.0, specialCDReduction:0.15, attackSpeedMult:1.20, description:'天を貫く超越の槍。距離・速度・破壊力すべてが限界を超えた。' },
  // ── 超越 Hammer ──
  { id:'w_trans_hammer',  nameJa:'超越槌・地獄砕',        emoji:'💥', type:'hammer',  rarity:'transcend', color:'#f97316', attackBonus:0.95, speedBonus:-0.05,knockbackBonus:8.0, specialCDReduction:0,    knockbackMult:5.00, description:'地獄を砕く究極の槌。吹き飛ばし×5倍、KB+8の超次元威力。' },
  // ── 超越 Staff ──
  { id:'w_trans_staff',   nameJa:'超越杖・虚空',          emoji:'🌌', type:'staff',   rarity:'transcend', color:'#f97316', attackBonus:0.90, speedBonus:0.05, knockbackBonus:2.0, specialCDReduction:0.65, projChance:1.00, description:'虚空の魔杖。飛弾100%発生・必殺技CD-65%の究極魔法師装備。' },
  // ── 超越 Bow ──
  { id:'w_trans_bow',     nameJa:'超越弓・万光',          emoji:'✨', type:'bow',     rarity:'transcend', color:'#f97316', attackBonus:1.05, speedBonus:0.15, knockbackBonus:3.5, specialCDReduction:0,    arrowDamage:45,  arrowSpeed:15, arrowKnockback:12.0, chargedMult:4.0, description:'万の光を放つ超越の弓。矢ダメ45%、チャージ×4の絶対的射程。' },
  // ── 超越 Fighting ──
  { id:'w_trans_fighting',nameJa:'超越拳・極道',          emoji:'👊', type:'fighting',rarity:'transcend', color:'#f97316', attackBonus:0.95, speedBonus:0.22, knockbackBonus:1.5, specialCDReduction:0,    attackSpeedMult:0.25, guardRegenBonus:1.80, description:'極道の拳。人知を超えた連打速度とガード回復で戦場を支配する。' },

  // ══════════════════════════ 神降（Divine）武器タイプ ══════════════════════════
  // 全神降武具共通スキル: antiPrimordialDefBonus 0.50（敵が原初武器なら防御+50%）
  // ── 神降 Sword ── スキル: 20%の確率でオート反撃
  { id:'w_divine_sword',   nameJa:'神降刃・天翔',   emoji:'🌠', type:'sword',   rarity:'divine', color:'#fbbf24', attackBonus:1.40, speedBonus:0.28, knockbackBonus:5.0, specialCDReduction:0.20, attackSpeedMult:0.46, antiPrimordialDefBonus:0.50, autoCounterChance:0.20, description:'神が降ろした刃。20%の確率で被弾時に自動反撃。原初武器への防御+50%。' },
  // ── 神降 Axe ── スキル: 裂傷状態の敵からダメージ20%減
  { id:'w_divine_axe',     nameJa:'神降斧・滅絶',   emoji:'☄',  type:'axe',     rarity:'divine', color:'#fbbf24', attackBonus:1.30, speedBonus:-0.02,knockbackBonus:7.0, specialCDReduction:0,    bleedDps:60, bleedTicks:20, antiPrimordialDefBonus:0.50, bleedDmgReduction:0.20, description:'滅絶の神斧。裂傷60×20回。裂傷中の敵からのダメージ20%減。' },
  // ── 神降 Spear ── スキル: 10%の確率で敵を一定時間行動不能
  { id:'w_divine_spear',   nameJa:'神降槍・穿界',   emoji:'⚜',  type:'spear',   rarity:'divine', color:'#fbbf24', attackBonus:1.28, speedBonus:0.25, knockbackBonus:6.0, specialCDReduction:0.20, attackSpeedMult:1.15, antiPrimordialDefBonus:0.50, stunOnHitChance:0.10, stunDuration:70, description:'界を穿つ神槍。10%の確率で敵を約70フレーム行動不能にする。' },
  // ── 神降 Hammer ── スキル: 40%の確率でオートガード
  { id:'w_divine_hammer',  nameJa:'神降槌・神罰',   emoji:'🔱', type:'hammer',  rarity:'divine', color:'#fbbf24', attackBonus:1.28, speedBonus:-0.03,knockbackBonus:12.0,specialCDReduction:0,    knockbackMult:7.00, antiPrimordialDefBonus:0.50, autoGuardChance:0.40, description:'神の罰を下す槌。KB×7倍。40%の確率で攻撃を自動ガード。' },
  // ── 神降 Staff ── スキル: 攻撃が当たるたびに自分のダメージを少量回復
  { id:'w_divine_staff',   nameJa:'神降杖・星海',   emoji:'💫', type:'staff',   rarity:'divine', color:'#fbbf24', attackBonus:1.22, speedBonus:0.08, knockbackBonus:3.0, specialCDReduction:0.80, projChance:1.00, antiPrimordialDefBonus:0.50, healOnHit:5, description:'星海の神杖。飛弾100%・必殺CD-80%。命中のたびダメージ5%回復。' },
  // ── 神降 Bow ── スキル: 一定確率で自動的に上方向に矢を放つ
  { id:'w_divine_bow',     nameJa:'神降弓・極光',   emoji:'🌈', type:'bow',     rarity:'divine', color:'#fbbf24', attackBonus:1.38, speedBonus:0.18, knockbackBonus:5.0, specialCDReduction:0,    arrowDamage:50,  arrowSpeed:18, arrowKnockback:14.0, chargedMult:5.5, antiPrimordialDefBonus:0.50, autoArrowChance:0.35, description:'極光を放つ神弓。矢ダメ50%・チャージ×5.5。35%の確率で自動的に上方向矢を追加射出。' },
  // ── 神降 Fighting ── スキル: 10回命中ごとに敵をスタン
  { id:'w_divine_fighting',nameJa:'神降拳・神域',   emoji:'🙏', type:'fighting',rarity:'divine', color:'#fbbf24', attackBonus:1.32, speedBonus:0.25, knockbackBonus:2.0, specialCDReduction:0,    attackSpeedMult:0.22, guardRegenBonus:2.50, antiPrimordialDefBonus:0.50, stunEvery:10, description:'神域の拳。最高速連打+ガード回復2.5。10回命中ごとに敵をスタン。' },

  // ══════════════════════════ 原初（Primordial）武器タイプ ══════════════════════════
  // 全原初武具共通スキル: antiPrimordialAtkBonus 0.50（敵が原初武器なら攻撃+50%）
  // ── 原初 Sword ── スキル: 攻撃を食らうほどダメージ増加（被弾1回ごと+8% ATK、死亡リセット）
  { id:'w_primordial_sword',   nameJa:'原初刃・天地断',   emoji:'🌠', type:'sword',   rarity:'primordial', color:'#c084fc', attackBonus:1.65, speedBonus:0.35, knockbackBonus:7.0,  specialCDReduction:0.25, attackSpeedMult:0.42, antiPrimordialAtkBonus:0.50, vengefulRage:0.08,     description:'天地を断つ原初の刃。被弾するたびに攻撃力+8%（累積）。敵も原初武器なら攻撃+50%。' },
  // ── 原初 Axe ── スキル: 裂傷の敵へのダメージ20%増
  { id:'w_primordial_axe',     nameJa:'原初斧・魂喰い',   emoji:'☄',  type:'axe',     rarity:'primordial', color:'#c084fc', attackBonus:1.55, speedBonus:-0.02,knockbackBonus:8.0,  specialCDReduction:0,    bleedDps:90,  bleedTicks:25, antiPrimordialAtkBonus:0.50, bleedTargetDmgBonus:0.20, description:'魂を喰らう原初の斧。裂傷90×25回。裂傷状態の敵へのダメージ+20%。敵も原初武器なら攻撃+50%。' },
  // ── 原初 Spear ── スキル: 10%の確率で攻撃時爆発で吹き飛ばす
  { id:'w_primordial_spear',   nameJa:'原初槍・界裂き',   emoji:'⚜',  type:'spear',   rarity:'primordial', color:'#c084fc', attackBonus:1.52, speedBonus:0.32, knockbackBonus:9.0,  specialCDReduction:0.20, attackSpeedMult:1.10, antiPrimordialAtkBonus:0.50, explosionChance:0.10,  description:'界を裂く原初の槍。10%の確率で爆発が発生し敵を大きく吹き飛ばす。敵も原初武器なら攻撃+50%。' },
  // ── 原初 Hammer ── スキル: 敵の防具レア度が高いほどダメージ増加
  { id:'w_primordial_hammer',  nameJa:'原初槌・破壊神',   emoji:'🔱', type:'hammer',  rarity:'primordial', color:'#c084fc', attackBonus:1.55, speedBonus:-0.03,knockbackBonus:18.0, specialCDReduction:0,    knockbackMult:9.00, antiPrimordialAtkBonus:0.50, armorBreakerBonus:0.12, description:'破壊神の原初の槌。KB×9倍。敵防具のレア度ランクごとにダメージ+12%。敵も原初武器なら攻撃+50%。' },
  // ── 原初 Staff ── スキル: 攻撃が当たるたびに自分のダメージ%を吸収回復
  { id:'w_primordial_staff',   nameJa:'原初杖・生命泉',   emoji:'💫', type:'staff',   rarity:'primordial', color:'#c084fc', attackBonus:1.48, speedBonus:0.08, knockbackBonus:3.0,  specialCDReduction:0.90, projChance:1.00, antiPrimordialAtkBonus:0.50, lifeStealOnHit:8, description:'生命の泉を宿した原初の杖。飛弾100%・CD-90%。命中のたびダメージ8%吸収。敵も原初武器なら攻撃+50%。' },
  // ── 原初 Bow ── スキル: 35%の確率で矢が2本になる
  { id:'w_primordial_bow',     nameJa:'原初弓・双光矢',   emoji:'🌈', type:'bow',     rarity:'primordial', color:'#c084fc', attackBonus:1.62, speedBonus:0.18, knockbackBonus:5.0,  specialCDReduction:0,    arrowDamage:55,  arrowSpeed:22, arrowKnockback:20.0, chargedMult:7.0, antiPrimordialAtkBonus:0.50, doubleArrowChance:0.35, description:'双光を放つ原初の弓。矢ダメ55%・チャージ×7。35%の確率で矢が2本同時発射。敵も原初武器なら攻撃+50%。' },
  // ── 原初 Fighting ── スキル: 攻撃が当たるほど攻撃力UP（被弾でリセット）
  { id:'w_primordial_fighting',nameJa:'原初拳・覇道',     emoji:'🙌', type:'fighting',rarity:'primordial', color:'#c084fc', attackBonus:1.58, speedBonus:0.25, knockbackBonus:2.0,  specialCDReduction:0,    attackSpeedMult:0.18, guardRegenBonus:3.50, antiPrimordialAtkBonus:0.50, comboRageBonus:0.05, description:'覇道を歩む原初の拳。命中するたびに攻撃力+5%（累積）、被弾でリセット。敵も原初武器なら攻撃+50%。' },
];

// ─── 20 Armors ───────────────────────────────────────────────────────────────
export const ARMORS: ArmorDef[] = [
  // ── Helmets (4) ──
  { id:'a_leather_helm', nameJa:'革の兜',     emoji:'⛑',  slot:'helmet', rarity:'common',    color:'#92400e', defenseBonus:0.08, attackBonus:0,    speedBonus:0,     jumpBonus:0,    description:'軽い革製の兜。基本的な防御力。' },
  { id:'a_iron_helm',    nameJa:'鉄の兜',     emoji:'⛑',  slot:'helmet', rarity:'common',    color:'#9ca3af', defenseBonus:0.15, attackBonus:0,    speedBonus:0,     jumpBonus:0,    description:'鉄製の兜。頭部をしっかり守る。' },
  { id:'a_steel_helm',   nameJa:'鋼の兜',     emoji:'⛑',  slot:'helmet', rarity:'rare',      color:'#93c5fd', defenseBonus:0.25, attackBonus:0,    speedBonus:0,     jumpBonus:0,    description:'鋼の兜。高い防御力を誇る。' },
  { id:'a_golden_helm',  nameJa:'黄金の兜',   emoji:'👑',  slot:'helmet', rarity:'epic',      color:'#fbbf24', defenseBonus:0.35, attackBonus:0.05, speedBonus:0,     jumpBonus:0,    description:'黄金の兜。防御力と少し攻撃力も上がる。' },
  // ── Chest Armor (4) ──
  { id:'a_leather_armor',nameJa:'革鎧',       emoji:'🛡',  slot:'armor',  rarity:'common',    color:'#92400e', defenseBonus:0.10, attackBonus:0,    speedBonus:0,     jumpBonus:0,    description:'軽量な革の鎧。機動力を損なわない。' },
  { id:'a_iron_armor',   nameJa:'鉄鎧',       emoji:'🛡',  slot:'armor',  rarity:'common',    color:'#9ca3af', defenseBonus:0.18, attackBonus:0,    speedBonus:0,     jumpBonus:0,    description:'鉄の鎧。バランスの取れた防御性能。' },
  { id:'a_dragon_armor', nameJa:'竜の鎧',     emoji:'🐲',  slot:'armor',  rarity:'epic',      color:'#059669', defenseBonus:0.40, attackBonus:0,    speedBonus:-0.05, jumpBonus:0,    description:'竜の鱗でできた鎧。高防御だが少し重い。' },
  { id:'a_holy_armor',   nameJa:'聖なる鎧',   emoji:'✨',  slot:'armor',  rarity:'legendary', color:'#fde68a', defenseBonus:0.55, attackBonus:0,    speedBonus:0,     jumpBonus:0,    description:'神聖な力に守られた鎧。圧倒的な防御力。' },
  // ── Shields (4) ──
  { id:'a_leather_shield',nameJa:'革の盾',    emoji:'🔵',  slot:'shield', rarity:'common',    color:'#92400e', defenseBonus:0.06, attackBonus:0,    speedBonus:0,     jumpBonus:0,    description:'軽い革の盾。機動力を損なわずに守れる。' },
  { id:'a_iron_shield',  nameJa:'鉄の盾',     emoji:'🔵',  slot:'shield', rarity:'common',    color:'#9ca3af', defenseBonus:0.12, attackBonus:0,    speedBonus:0,     jumpBonus:0,    description:'鉄の盾。しっかりとした防御性能。' },
  { id:'a_steel_shield', nameJa:'鋼の盾',     emoji:'🔷',  slot:'shield', rarity:'rare',      color:'#93c5fd', defenseBonus:0.22, attackBonus:0,    speedBonus:0,     jumpBonus:0,    description:'鋼の盾。高い防御力と耐久性。' },
  { id:'a_holy_shield',  nameJa:'聖盾',       emoji:'⭐',  slot:'shield', rarity:'epic',      color:'#fde68a', defenseBonus:0.32, attackBonus:0.08, speedBonus:0,     jumpBonus:0,    description:'聖なる盾。防御しつつ攻撃力も上がる。' },
  // ── Gloves (3) ──
  { id:'a_leather_gloves',nameJa:'革手袋',    emoji:'🧤',  slot:'gloves', rarity:'common',    color:'#92400e', defenseBonus:0.04, attackBonus:0.04, speedBonus:0,     jumpBonus:0,    description:'革の手袋。攻撃と防御を少し強化。' },
  { id:'a_iron_gauntlets',nameJa:'鉄手袋',    emoji:'🧤',  slot:'gloves', rarity:'rare',      color:'#9ca3af', defenseBonus:0.10, attackBonus:0.08, speedBonus:0,     jumpBonus:0,    description:'鉄の籠手。攻守バランスが良い。' },
  { id:'a_magic_gauntlets',nameJa:'魔法の手袋',emoji:'✨', slot:'gloves', rarity:'epic',      color:'#8b5cf6', defenseBonus:0.15, attackBonus:0.15, speedBonus:0,     jumpBonus:0,    description:'魔法が宿った籠手。攻防ともに大幅強化。' },
  // ── Boots (3) ──
  { id:'a_leather_boots', nameJa:'革靴',         emoji:'👢', slot:'boots', rarity:'common',    color:'#92400e', defenseBonus:0,    attackBonus:0,    speedBonus:0.08,  jumpBonus:0, description:'軽量な革靴。移動速度が上がる。' },
  { id:'a_swift_boots',   nameJa:'俊足のブーツ', emoji:'💨', slot:'boots', rarity:'rare',      color:'#34d399', defenseBonus:0,    attackBonus:0.06, speedBonus:0.18,  jumpBonus:0, description:'俊足のブーツ。速度と攻撃力を強化。' },
  { id:'a_thunder_boots', nameJa:'雷鳴のブーツ', emoji:'⚡', slot:'boots', rarity:'epic',      color:'#fbbf24', defenseBonus:0,    attackBonus:0.10, speedBonus:0.26,  jumpBonus:0, description:'雷をまとったブーツ。驚異的な速度と攻撃力。' },
  // ── Cloaks (2) ──
  { id:'a_guardian_cloak', nameJa:'守護のマント', emoji:'🌀', slot:'cloak', rarity:'epic',      color:'#6d28d9', defenseBonus:0.30, attackBonus:0.08, speedBonus:0,     jumpBonus:0, description:'守護のマント。高い防御と攻撃力を兼ね備える。' },
  { id:'a_divine_cloak',   nameJa:'神々のマント', emoji:'🌟', slot:'cloak', rarity:'legendary', color:'#a855f7', defenseBonus:0.35, attackBonus:0.15, speedBonus:0.12,  jumpBonus:0, description:'神の力を宿したマント。攻撃・防御・速度を全強化。' },

  // ══════════════════════════ ミシック防具（全スロット） ══════════════════════════
  { id:'a_mythic_helm',    nameJa:'覇者の冠',       emoji:'👑', slot:'helmet', rarity:'mythic', color:'#e11d48', defenseBonus:0.50, attackBonus:0.12, speedBonus:0,     jumpBonus:0,    description:'覇者だけが纏える冠。防御と攻撃の両面で圧倒する。' },
  { id:'a_mythic_armor',   nameJa:'神鎧アルカナム', emoji:'🛡', slot:'armor',  rarity:'mythic', color:'#e11d48', defenseBonus:0.70, attackBonus:0.05, speedBonus:-0.03, jumpBonus:0,    description:'神が鍛えた究極の鎧。比類なき防御力を誇る。' },
  { id:'a_mythic_shield',  nameJa:'絶対防壁',       emoji:'🔴', slot:'shield', rarity:'mythic', color:'#e11d48', defenseBonus:0.60, attackBonus:0.15, speedBonus:0,     jumpBonus:0,    description:'絶対に崩れない防壁。ガードが格段に強化される。' },
  { id:'a_mythic_gloves',  nameJa:'神授の拳',       emoji:'🧤', slot:'gloves', rarity:'mythic', color:'#e11d48', defenseBonus:0.25, attackBonus:0.35, speedBonus:0,     jumpBonus:0,    description:'神から授かった拳。攻撃力が圧倒的に上昇する。' },
  { id:'a_mythic_boots',   nameJa:'神速のサンダル', emoji:'⚡', slot:'boots',  rarity:'mythic', color:'#e11d48', defenseBonus:0.05, attackBonus:0.18, speedBonus:0.40,  jumpBonus:0.15, description:'神の速度を宿したサンダル。速度・攻撃・跳躍を全強化。' },
  { id:'a_mythic_cloak',   nameJa:'無限のマント',   emoji:'🌌', slot:'cloak',  rarity:'mythic', color:'#e11d48', defenseBonus:0.45, attackBonus:0.22, speedBonus:0.18,  jumpBonus:0.15, description:'無限の力を宿したマント。全ステータスを大幅強化。' },

  // ══════════════════════════ 超越防具（全スロット） ══════════════════════════
  { id:'a_trans_helm',   nameJa:'超越兜・天焰冠',   emoji:'🔥', slot:'helmet', rarity:'transcend', color:'#f97316', defenseBonus:0.72, attackBonus:0.22, speedBonus:0.05,  jumpBonus:0.10, description:'天の炎を宿した超越の冠。防御・攻撃・跳躍をすべて次元を超えて強化する。' },
  { id:'a_trans_armor',  nameJa:'超越鎧・不壊甲',   emoji:'🛡', slot:'armor',  rarity:'transcend', color:'#f97316', defenseBonus:0.98, attackBonus:0.12, speedBonus:-0.02, jumpBonus:0,    description:'決して砕けぬ超越の鎧。神を超えた防御力で全ての攻撃を圧倒的に無効化する。' },
  { id:'a_trans_shield', nameJa:'超越盾・絶壁壁',   emoji:'🟠', slot:'shield', rarity:'transcend', color:'#f97316', defenseBonus:0.82, attackBonus:0.28, speedBonus:0,     jumpBonus:0,    description:'絶対に破れない超越の盾。防御しながら攻撃力も大幅に押し上げる。' },
  { id:'a_trans_gloves', nameJa:'超越手袋・滅砕掌', emoji:'🧤', slot:'gloves', rarity:'transcend', color:'#f97316', defenseBonus:0.38, attackBonus:0.55, speedBonus:0.05,  jumpBonus:0,    description:'万物を砕く超越の掌。攻撃力が神の領域に達し、防御も並外れた性能を誇る。' },
  { id:'a_trans_boots',  nameJa:'超越靴・瞬雷足',   emoji:'⚡', slot:'boots',  rarity:'transcend', color:'#f97316', defenseBonus:0.10, attackBonus:0.30, speedBonus:0.58,  jumpBonus:0.28, description:'瞬く雷の如き超越の靴。移動速度・跳躍・攻撃力すべてがミシックを遥かに超える。' },
  { id:'a_trans_cloak',  nameJa:'超越マント・覇炎翼',emoji:'🌟', slot:'cloak',  rarity:'transcend', color:'#f97316', defenseBonus:0.62, attackBonus:0.38, speedBonus:0.30,  jumpBonus:0.22, description:'覇炎の翼を持つ超越のマント。攻撃・防御・速度・跳躍の全てを同時に超次元強化する。' },
];

// ─── Pull logic ───────────────────────────────────────────────────────────────
const WEAPON_RATES: Array<[EquipRarity, number]> = [
  ['legendary', 0.03],
  ['epic',      0.12],
  ['rare',      0.35],
  ['common',    1.00],
];
const ARMOR_RATES = WEAPON_RATES;

const NORMAL_EQUIP_RARITIES: EquipRarity[] = ['common', 'rare', 'epic', 'legendary'];

export function pullWeapon(pity = false, ownedIds: string[] = []): WeaponDef {
  const r = pity ? 0 : Math.random();
  let rarity: EquipRarity = 'common';
  for (const [rar, threshold] of WEAPON_RATES) {
    if (r < threshold) { rarity = rar; break; }
  }
  if (pity && rarity === 'common') rarity = 'epic';
  const rarityPool = WEAPONS.filter(w => w.rarity === rarity && !ownedIds.includes(w.id));
  if (rarityPool.length > 0) return rarityPool[Math.floor(Math.random() * rarityPool.length)];
  const fallback = WEAPONS.filter(w => NORMAL_EQUIP_RARITIES.includes(w.rarity) && !ownedIds.includes(w.id));
  if (fallback.length > 0) return fallback[Math.floor(Math.random() * fallback.length)];
  const any = WEAPONS.filter(w => w.rarity === rarity);
  return any[Math.floor(Math.random() * any.length)];
}

export function pullArmor(pity = false, ownedIds: string[] = []): ArmorDef {
  const r = pity ? 0 : Math.random();
  let rarity: EquipRarity = 'common';
  for (const [rar, threshold] of ARMOR_RATES) {
    if (r < threshold) { rarity = rar; break; }
  }
  if (pity && rarity === 'common') rarity = 'epic';
  const rarityPool = ARMORS.filter(a => a.rarity === rarity && !ownedIds.includes(a.id));
  if (rarityPool.length > 0) return rarityPool[Math.floor(Math.random() * rarityPool.length)];
  const fallback = ARMORS.filter(a => NORMAL_EQUIP_RARITIES.includes(a.rarity) && !ownedIds.includes(a.id));
  if (fallback.length > 0) return fallback[Math.floor(Math.random() * fallback.length)];
  const any = ARMORS.filter(a => a.rarity === rarity);
  return any[Math.floor(Math.random() * any.length)];
}

export function pullWeaponOfRarity(rarity: EquipRarity): WeaponDef {
  const pool = WEAPONS.filter(w => w.rarity === rarity);
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  return WEAPONS[Math.floor(Math.random() * WEAPONS.length)];
}

export function pullArmorOfRarity(rarity: EquipRarity): ArmorDef {
  const pool = ARMORS.filter(a => a.rarity === rarity);
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  return ARMORS[Math.floor(Math.random() * ARMORS.length)];
}

export const EQUIP_PULL_COST   = 150;
export const EQUIP_PULL_COST10 = 1350; // 10-pull, 1 free

// ─── Legend (Mythic+) Pull logic ──────────────────────────────────────────────
export const LEGEND_PULL_COST = 800;

const LEGEND_RARITIES: EquipRarity[] = ['mythic', 'transcend', 'divine', 'primordial'];

// Legend gacha pull rates: 原初1% / 神降5% / 超越25% / ミシック69%
// ownedIds: already-owned weapon IDs — duplicates are skipped automatically
export function pullLegendWeapon(ownedIds: string[] = []): WeaponDef | null {
  const allLegend = WEAPONS.filter(w => LEGEND_RARITIES.includes(w.rarity));
  const unowned = allLegend.filter(w => !ownedIds.includes(w.id));
  if (unowned.length === 0) return null; // all items collected

  const r = Math.random();
  const rarity: EquipRarity = r < 0.01 ? 'primordial' : r < 0.06 ? 'divine' : r < 0.31 ? 'transcend' : 'mythic';
  const rarityPool = unowned.filter(w => w.rarity === rarity);
  const pool = rarityPool.length > 0 ? rarityPool : unowned;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function pullLegendArmor(ownedIds: string[] = []): ArmorDef | null {
  const allLegend = ARMORS.filter(a => LEGEND_RARITIES.includes(a.rarity));
  const unowned = allLegend.filter(a => !ownedIds.includes(a.id));
  if (unowned.length === 0) return null;
  return unowned[Math.floor(Math.random() * unowned.length)];
}
