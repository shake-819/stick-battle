import type { WeaponDef, ArmorDef } from '@/data/equipment';

export interface OnlinePlayerData {
  attackMult: number;
  defenseMult: number;
  speedMult: number;
  jumpMult: number;
  startingStocks: number;
  maxJumps: number;
  berserker: boolean;
  playerColor: string;
  equippedWeapon: WeaponDef | null;
  equippedArmor: ArmorDef | null;
  effectiveSPCooldown: number;
  selectedCharacter?: string;
  bossUnlockLv?: Record<string, number>;
}

// Compact wire format — short keys + rounded numbers to minimise JSON payload
export interface FighterSnap {
  x: number;   // pos.x (1dp)
  y: number;   // pos.y (1dp)
  vx: number;  // vel.x (2dp)
  vy: number;  // vel.y (2dp)
  st: string;  // state
  ti: number;  // stateTimer (int) — needed for hit/knockback animation duration
  dir: number; // direction: 1 | -1
  d: number;   // damage (int)
  s: number;   // stocks (int)
  aa: boolean; // attackActive
  inv: number; // invincible frames (int)
  gc: number;  // guardGauge (int)
  sc: number;  // specialCooldown (int)
  og: boolean; // onGround
}

// Compact projectile wire format
export interface ProjSnap {
  x: number;
  y: number;
  vx: number;
  vy: number;
  o: number;  // owner: 0=player, 1=bot
  c: string;  // color
  sz: number; // size
}

export interface GameStateMsg {
  frame: number;
  host: FighterSnap;
  guest: FighterSnap;
  projs: ProjSnap[];
  over: boolean;
  winner: 'host' | 'guest' | null;
}
