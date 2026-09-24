export type Difficulty = 'easy' | 'normal' | 'hard' | 'vhard' | 'oni';

export interface BotConfig {
  label: string;
  sub: string;
  levelEq: number;
  speedMult: number;
  attackMult: number;
  decisionMin: number;
  decisionMax: number;
  attackRange: number;
  missChance: number;
  usesSpecial: boolean;
  edgeGuard: boolean;
  guardChance?: number;    // override computed guard probability
  counterChance?: number;  // override computed counter probability
}

export const BOT_CONFIGS: Record<Difficulty, BotConfig> = {
  easy: {
    label: 'かんたん', sub: 'Lv.1相当', levelEq: 1,
    speedMult: 0.62, attackMult: 0.75,
    decisionMin: 26, decisionMax: 50,
    attackRange: 58, missChance: 0.36,
    usesSpecial: false, edgeGuard: false,
  },
  normal: {
    label: 'ふつう', sub: 'Lv.10相当', levelEq: 10,
    speedMult: 0.93, attackMult: 1.08,
    decisionMin: 8, decisionMax: 17,
    attackRange: 84, missChance: 0.05,
    usesSpecial: false, edgeGuard: false,
  },
  hard: {
    label: 'むずかしい', sub: 'Lv.20相当', levelEq: 20,
    speedMult: 1.15, attackMult: 1.35,
    decisionMin: 3, decisionMax: 8,
    attackRange: 98, missChance: 0.01,
    usesSpecial: true, edgeGuard: true,
  },
  vhard: {
    label: 'げきむず', sub: 'Lv.30相当', levelEq: 30,
    speedMult: 1.25, attackMult: 1.45,
    decisionMin: 2, decisionMax: 7,
    attackRange: 108, missChance: 0.00,
    usesSpecial: true, edgeGuard: true,
  },
  oni: {
    label: 'おにむず', sub: 'Lv.50相当', levelEq: 50,
    speedMult: 1.55, attackMult: 1.85,
    decisionMin: 1, decisionMax: 3,
    attackRange: 130, missChance: 0.00,
    usesSpecial: true, edgeGuard: true,
  },
};
