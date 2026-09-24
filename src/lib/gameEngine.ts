import { type StageDef, type StagePlatform } from '@/data/stages';
import { WEAPONS, ARMORS, type WeaponDef, type ArmorDef, type EquipRarity, EQUIP_RARITY_COLOR, EQUIP_RARITY_LABEL } from '@/data/equipment';
import { type EffectiveStats } from '@/store/playerStore';
import { BOT_CONFIGS, type BotConfig, type Difficulty } from '@/types/game';

export { WEAPONS, ARMORS, EQUIP_RARITY_COLOR, EQUIP_RARITY_LABEL, BOT_CONFIGS };
export type { WeaponDef, ArmorDef, EquipRarity, EffectiveStats, BotConfig, Difficulty, StageDef, StagePlatform };

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Vec2 { x: number; y: number; }
export type FighterState =
  | 'idle' | 'walk' | 'jump' | 'fall'
  | 'attack' | 'strongAttack' | 'downAttack' | 'upAttack' | 'airAttack'
  | 'specialNeutral' | 'specialSide' | 'specialUp' | 'specialDown'
  | 'hit' | 'dead'
  | 'guard' | 'guardBreak' | 'counter' | 'counterHit';
export type BotBehav = 'approach' | 'attack' | 'recover';

export interface Fighter {
  pos: Vec2; vel: Vec2; dir: 1|-1;
  damage: number; stocks: number;
  onGround: boolean; jumpsLeft: number; maxJumps: number;
  state: FighterState; stateTimer: number; attackActive: boolean;
  invincible: number; color: string;
  botAI: boolean; botBehav: BotBehav; botDecisionTimer: number; botJumpCooldown: number;
  attackMult: number; defenseMult: number; speedMult: number; jumpMult: number;
  berserker: boolean; specialCooldown: number; maxSPCooldown: number; multiHitTimer: number;
  weapon: WeaponDef | null;
  armor:  ArmorDef  | null;
  bowFired: boolean;       // true after bow arrow fires this attack swing
  bleedDamage: number;     // per-tick bleed damage (axe effect)
  bleedTicks: number;      // remaining ticks
  bleedTickTimer: number;  // countdown to next tick
  // ── Guard / Counter ───────────────────────────────────────────────────────
  guardGauge: number;      // current guard energy (0‥maxGuardGauge)
  maxGuardGauge: number;   // default 100
  counterCooldown: number; // frames until counter is available again
  botGuardTimer: number;   // frames bot will hold guard
  // ── Divine weapon state ────────────────────────────────────────────────────
  stunTimer: number;       // frames remaining stunned (spear/fighting divine stun)
  divineHitCount: number;  // hit counter for fighting divine "stun every N hits"
  // ── Primordial weapon state ────────────────────────────────────────────────
  primordialRageStacks: number;  // sword primordial: stacks per hit taken (resets on death)
  primordialComboCount: number;  // fighting primordial: combo hit counter (resets on being hit)
}
export interface Particle { x:number;y:number;vx:number;vy:number;r:number;color:string;life:number;maxLife:number; }
export interface Projectile {
  id:number; pos:Vec2; vel:Vec2; owner:'player'|'bot';
  damage:number; knockback:number; atkMult:number; size:number; life:number; color:string; trail:Vec2[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const W = 800, H = 500;
export const GRAVITY = 0.55, MAX_FALL = 20;
export const BASE_WALK = 3.5, BASE_JUMP = -14, BASE_DJUMP = -12;
export const FW = 28, FH = 65;
export const BLAST_L = -180, BLAST_R = W + 180, BLAST_T = -220, BLAST_B = H + 100;
export const SP_COOLDOWN = 200;
export const SPECIAL_NAMES: Record<string,string> = {
  specialNeutral:'気弾', specialSide:'激流打', specialUp:'天昇拳', specialDown:'旋風脚',
};
export const SP_COLS: Record<string,string[]> = {
  specialNeutral:['#818cf8','#a78bfa','#c4b5fd','#e0e7ff'],
  specialSide:   ['#f97316','#fb923c','#fed7aa','#ffffff'],
  specialUp:     ['#38bdf8','#7dd3fc','#bae6fd','#ffffff'],
  specialDown:   ['#4ade80','#86efac','#bbf7d0','#ffffff'],
};
export const GUARD_MAX = 100;
export const COUNTER_CD = 100; // frames cooldown after counter
export const LOCKED_STATES: FighterState[]  = ['attack','strongAttack','downAttack','upAttack','airAttack','specialNeutral','specialSide','hit','guard','guardBreak','counter','counterHit'];
export const ACTION_STATES: FighterState[]  = ['attack','strongAttack','downAttack','upAttack','airAttack','specialNeutral','specialSide','specialUp','specialDown','hit','guard','guardBreak','counter','counterHit'];
export const DIFF_RARITY: Record<Difficulty, EquipRarity|null> = {
  easy:null, normal:'common', hard:'rare', vhard:'epic', oni:'legendary',
};
export function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random()*arr.length)]; }

// ─── Fighter factory ──────────────────────────────────────────────────────────
export function makeFighter(x:number, isBot:boolean, stats:EffectiveStats, stocks:number, cfg?: BotConfig, botWeapon?: WeaponDef|null, botArmor?: ArmorDef|null): Fighter {
  let botAtk = cfg?.attackMult ?? 1;
  let botSpd = cfg?.speedMult ?? 1;
  let botDef = 0;
  let botJmp = 1;
  if (isBot) {
    if (botWeapon) { botAtk += botWeapon.attackBonus; botSpd += botWeapon.speedBonus; }
    if (botArmor)  { botDef += botArmor.defenseBonus; botAtk += botArmor.attackBonus; botSpd += botArmor.speedBonus; botJmp += botArmor.jumpBonus; }
  }
  return {
    pos:{x,y:200}, vel:{x:0,y:0}, dir: isBot ? -1 : 1,
    damage:0, stocks,
    onGround:false, jumpsLeft: isBot ? 2 : stats.maxJumps, maxJumps: isBot ? 2 : stats.maxJumps,
    state:'idle', stateTimer:0, attackActive:false, invincible:0,
    color: isBot ? '#ef4444' : stats.playerColor,
    botAI:isBot, botBehav:'approach', botDecisionTimer:0, botJumpCooldown:0,
    attackMult: isBot ? botAtk : stats.attackMult,
    defenseMult: isBot ? botDef : stats.defenseMult,
    speedMult:   isBot ? botSpd : stats.speedMult,
    jumpMult:    isBot ? botJmp : stats.jumpMult,
    berserker: isBot ? false : stats.berserker,
    specialCooldown:0,
    maxSPCooldown: isBot ? SP_COOLDOWN : stats.effectiveSPCooldown,
    multiHitTimer:0,
    weapon: isBot ? (botWeapon ?? null) : stats.equippedWeapon,
    armor:  isBot ? (botArmor ?? null)  : stats.equippedArmor,
    bowFired: false,
    bleedDamage:0, bleedTicks:0, bleedTickTimer:0,
    guardGauge: GUARD_MAX, maxGuardGauge: GUARD_MAX, counterCooldown:0, botGuardTimer:0,
    stunTimer:0, divineHitCount:0,
    primordialRageStacks:0, primordialComboCount:0,
  };
}

export function respawnFighter(f:Fighter, x:number) {
  f.pos={x,y:80}; f.vel={x:0,y:0};
  f.state='fall'; f.stateTimer=0; f.attackActive=false; f.bowFired=false;
  f.invincible=90; f.onGround=false; f.jumpsLeft=f.maxJumps; f.damage=0;
  f.primordialRageStacks=0; f.primordialComboCount=0;
}

// ─── Attack geometry ──────────────────────────────────────────────────────────
export function getAtkBox(f:Fighter) {
  const s=f.state; const wt=f.weapon?.type??null;
  // Bow fires projectiles — no melee hitbox for regular attacks
  if (wt==='bow' && (s==='attack'||s==='strongAttack'||s==='downAttack')) {
    return {x:-9999,y:-9999,w:0,h:0};
  }
  if (wt==='spear') {
    if (s==='attack')       return {x:f.dir>0?f.pos.x-20:f.pos.x-120, y:f.pos.y-FH*0.64, w:140, h:28};
    if (s==='strongAttack') return {x:f.dir>0?f.pos.x-20:f.pos.x-142, y:f.pos.y-FH*0.64, w:162, h:28};
  }
  if (s==='downAttack')  return {x:f.pos.x-44,                      y:f.pos.y-24,       w:88,  h:34};
  if (s==='upAttack')   return {x:f.pos.x-44,                      y:f.pos.y-FH-44,    w:88,  h:50};
  if (s==='airAttack')  return {x:f.dir>0?f.pos.x+4:f.pos.x-68,   y:f.pos.y-FH*0.62, w:64,  h:38};
  if (s==='specialSide') return {x:f.dir>0?f.pos.x+6:f.pos.x-86,  y:f.pos.y-FH*0.72, w:80,  h:52};
  if (s==='specialUp')   return {x:f.pos.x-42,                      y:f.pos.y-FH-32,   w:84,  h:62};
  if (s==='specialDown') return {x:f.pos.x-58,                      y:f.pos.y-FH,      w:116, h:FH+12};
  let reach = s==='strongAttack' ? 88 : 60;
  if (wt==='axe')    reach += 14;
  if (wt==='hammer') reach += 12;
  return {x:f.dir>0?f.pos.x+8:f.pos.x-8-reach, y:f.pos.y-FH*0.56, w:reach, h:30};
}

export function overlap(ax:number,ay:number,aw:number,ah:number,bx:number,by:number,bw:number,bh:number) {
  return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by;
}

export function knockback(victim:Fighter, atk:Vec2, atkMult:number, basePow:number, angle:number, dmg:number, isMulti=false) {
  const scale  = 1 + victim.damage*0.015;
  const defMul = Math.max(0.35, 1-victim.defenseMult);
  const power  = (basePow+victim.damage*0.1)*scale*atkMult*defMul;
  const d = victim.pos.x >= atk.x ? 1 : -1;
  victim.vel.x = Math.cos(angle)*power*d; victim.vel.y = -Math.abs(Math.sin(angle)*power);
  victim.damage += dmg*atkMult;
  victim.state='hit'; victim.stateTimer = isMulti ? 10 : 18;
  victim.invincible = isMulti ? 12 : 40; victim.onGround=false;
  if (isMulti) victim.attackActive=false;
}

// ─── Special start ────────────────────────────────────────────────────────────
export function startSpecial(f:Fighter, keys:Set<string>): FighterState|null {
  if (f.specialCooldown>0) return null;
  const up = keys.has('ArrowUp')||keys.has('w')||keys.has('W');
  const dn = keys.has('ArrowDown')||keys.has('s')||keys.has('S');
  const lr = keys.has('ArrowLeft')||keys.has('a')||keys.has('A')||keys.has('ArrowRight')||keys.has('d')||keys.has('D');
  let kind: FighterState;
  if (up)      { kind='specialUp';   f.vel.y=BASE_JUMP*1.2*f.jumpMult; if(f.jumpsLeft>0)f.jumpsLeft--; f.onGround=false; }
  else if (dn) { kind='specialDown'; }
  else if (lr) { kind='specialSide'; f.vel.x=f.dir*BASE_WALK*2.7*f.speedMult; }
  else         { kind='specialNeutral'; }
  f.state=kind; f.stateTimer=kind==='specialUp'?30:kind==='specialDown'?28:22;
  f.attackActive=false; f.multiHitTimer=0; f.specialCooldown=f.maxSPCooldown;
  return kind;
}

let _pid=0;
export function mkProj(owner:'player'|'bot',x:number,y:number,vx:number,dmg:number,kb:number,atkMult:number,color:string): Projectile {
  return {id:_pid++,pos:{x,y},vel:{x:vx,y:0},owner,damage:dmg,knockback:kb,atkMult,size:owner==='player'?12:10,life:90,color,trail:[]};
}

// ─── Weapon helpers & physics ─────────────────────────────────────────────────
export function getAttackFrames(weapon:WeaponDef|null, type:'attack'|'strongAttack'|'downAttack'|'upAttack'|'airAttack'): number {
  const base = type==='attack' ? 26 : type==='strongAttack' ? 34 : type==='upAttack' ? 28 : type==='airAttack' ? 22 : 24;
  const mult = weapon?.attackSpeedMult ?? 1.0;
  // strongAttack active window starts at stateTimer>=10; stateTimer decrements before check,
  // so minimum must be 12 to guarantee at least 2 active frames (stateTimer 11→10).
  const minFrames = type==='strongAttack' ? 12 : 10;
  return Math.max(minFrames, Math.round(base * mult));
}

export interface MeleeHitResult {
  hit: boolean;
  dmgDealt: number;
  spawnProj: Projectile | null;
}

export function applyMeleeHit(
  atk: Fighter, vic: Fighter,
  parts: Particle[], projs: Projectile[],
): MeleeHitResult {
  const RESULT: MeleeHitResult = { hit:false, dmgDealt:0, spawnProj:null };
  if (!atk.attackActive || vic.state==='dead') return RESULT;

  // ── Bow: fire arrow instead of melee (ranged, only on normal attack states) ─
  const BOW_FIRE_STATES = ['attack', 'strongAttack', 'downAttack'] as const;
  if (atk.weapon?.type === 'bow' && !atk.bowFired &&
      BOW_FIRE_STATES.includes(atk.state as typeof BOW_FIRE_STATES[number])) {
    atk.bowFired = true; atk.attackActive = false;
    const w = atk.weapon;
    const isCharged = atk.state === 'strongAttack';
    const isDown    = atk.state === 'downAttack';
    const cMult  = isCharged ? (w.chargedMult ?? 2.0) : 1.0;
    const dmgA   = Math.min((w.arrowDamage ?? 10) * cMult, 60);
    const spdA   = (w.arrowSpeed    ?? 7)  * (isCharged ? 0.75 : 1.0);
    const kbA    = (w.arrowKnockback ?? 3) * cMult;
    const owner  = atk.botAI ? 'bot' : 'player';
    const startX = atk.pos.x + atk.dir * 32;
    const startY = isDown ? atk.pos.y - 8 : atk.pos.y - 42;
    const velX   = isDown ? atk.dir * spdA * 0.5 : atk.dir * spdA;
    const velY   = isDown ? 7 : 0;
    const arrow  = mkProj(owner, startX, startY, velX, dmgA, kbA, atk.attackMult, w.color);
    arrow.vel.y  = velY;
    arrow.size   = isCharged ? 16 : 8;
    arrow.life   = isCharged ? 80 : 58;
    projs.push(arrow);
    RESULT.spawnProj = arrow;

    // ── Divine bow: auto-fire an upward arrow ──────────────────────────────
    if ((w.autoArrowChance ?? 0) > 0 && Math.random() < w.autoArrowChance!) {
      const autoArr = mkProj(
        atk.botAI ? 'bot' : 'player',
        atk.pos.x, atk.pos.y - 52,
        0,
        (w.arrowDamage ?? 10) * 0.65,
        (w.arrowKnockback ?? 3) * 0.8,
        atk.attackMult,
        w.color
      );
      autoArr.vel.y = -11;
      autoArr.size = 10;
      autoArr.life = 90;
      projs.push(autoArr);
    }

    // ── Primordial bow: double arrow ────────────────────────────────────────
    if ((w.doubleArrowChance ?? 0) > 0 && Math.random() < w.doubleArrowChance!) {
      const arrow2 = mkProj(owner, startX + atk.dir * 10, startY - 10, velX * 1.05, dmgA, kbA, atk.attackMult, w.color);
      arrow2.vel.y = velY - 0.6;
      arrow2.size = isCharged ? 16 : 8;
      arrow2.life = isCharged ? 80 : 58;
      projs.push(arrow2);
    }

    return RESULT;
  }

  if (vic.invincible>0) return RESULT;
  const ab = getAtkBox(atk);
  const vb = {x:vic.pos.x-FW/2, y:vic.pos.y-FH, w:FW, h:FH};
  if (!overlap(ab.x,ab.y,ab.w,ab.h,vb.x,vb.y,vb.w,vb.h)) return RESULT;

  // ── Divine: Auto guard (hammer) / Auto counter (sword) ───────────────────
  if (!LOCKED_STATES.includes(vic.state)) {
    const autoG = vic.weapon?.autoGuardChance ?? 0;
    const autoC = vic.weapon?.autoCounterChance ?? 0;
    if (autoG > 0 && Math.random() < autoG && vic.guardGauge > 0) {
      vic.state = 'guard';
    } else if (autoC > 0 && Math.random() < autoC && vic.counterCooldown === 0) {
      vic.state = 'counter'; vic.stateTimer = 18;
    }
  }

  // ── Counter: block attack and knock back attacker ────────────────────────
  if (vic.state === 'counter') {
    if (atk.state !== 'specialUp' && atk.state !== 'specialDown') atk.attackActive = false;
    spawn(parts, (atk.pos.x+vic.pos.x)/2, vic.pos.y-40, ['#fbbf24','#f59e0b','#ffffff','#fef3c7'], 22);
    knockback(atk, vic.pos, vic.attackMult * 0.9, 6.5, 0.50, 12);
    atk.invincible = Math.max(atk.invincible, 22);
    vic.state = 'counterHit'; vic.stateTimer = 28; vic.counterCooldown = COUNTER_CD;
    RESULT.hit = true; RESULT.dmgDealt = 0;
    return RESULT;
  }

  // ── Guard: absorb damage, drain gauge ────────────────────────────────────
  if (vic.state === 'guard') {
    // Drain is flat per attack type — NOT scaled by aMult/weapon tier
    // so guard remains useful at all difficulties.
    let drain = 0;
    if      (atk.state==='attack')       drain=20;
    else if (atk.state==='strongAttack') drain=38;
    else if (atk.state==='downAttack')   drain=25;
    else if (atk.state==='upAttack')     drain=28;
    else if (atk.state==='airAttack')    drain=22;
    else if (atk.state==='specialSide')  drain=45;
    else if (atk.state==='specialUp')    drain=12;
    else if (atk.state==='specialDown')  drain=10;
    vic.guardGauge = Math.max(0, vic.guardGauge - drain);
    const pushDir = vic.pos.x > atk.pos.x ? 1 : -1;
    vic.vel.x += pushDir * 1.5;
    // Block re-hit within the same attack swing (multiHitTimer gates attackActive for all states)
    atk.multiHitTimer = Math.max(atk.multiHitTimer, 25);
    if (atk.state !== 'specialUp' && atk.state !== 'specialDown') atk.attackActive = false;
    spawn(parts, (atk.pos.x+vic.pos.x)/2, vic.pos.y-32, ['#93c5fd','#bfdbfe','#ffffff'], 10);
    if (vic.guardGauge <= 0) {
      vic.state = 'guardBreak'; vic.stateTimer = 70; vic.guardGauge = 0;
      spawn(parts, vic.pos.x, vic.pos.y-40, ['#facc15','#fef08a','#ffffff','#fbbf24'], 24);
    }
    RESULT.hit = false; RESULT.dmgDealt = 0;
    return RESULT;
  }

  RESULT.hit = true;
  const isMulti = atk.state==='specialUp' || atk.state==='specialDown';
  const isFighting = atk.weapon?.type === 'fighting';
  const cols = SP_COLS[atk.state] ?? ['#facc15','#fb923c','#ffffff'];
  spawn(parts, (atk.pos.x+vic.pos.x)/2, vic.pos.y-30, cols, isMulti?8:14);

  // ── Primordial ATK bonuses (rage stacks + combo stacks + anti-primordial) ──
  const rageBonus  = (atk.weapon?.vengefulRage  ?? 0) * atk.primordialRageStacks;
  const comboBonus = (atk.weapon?.comboRageBonus ?? 0) * atk.primordialComboCount;
  const primAtkBonus = (atk.weapon?.antiPrimordialAtkBonus ?? 0) > 0 && vic.weapon?.rarity === 'primordial'
    ? atk.weapon!.antiPrimordialAtkBonus! : 0;
  const baseAMult = atk.berserker ? atk.attackMult*(1+vic.damage*0.005) : atk.attackMult;
  const aMult = baseAMult * (1 + rageBonus + comboBonus + primAtkBonus);

  const wkb   = atk.weapon?.knockbackBonus ?? 0;
  const kbm   = atk.weapon?.knockbackMult  ?? 1.0; // hammer multiplier

  let basePow=0, angle=0, dmg=0, multi=false;
  if      (atk.state==='attack')       { basePow=3.5+wkb*0.6;  angle=0.45; dmg=7;  atk.attackActive=false; }
  else if (atk.state==='strongAttack') { basePow=6.0+wkb*1.0;  angle=0.50; dmg=14; atk.attackActive=false; }
  else if (atk.state==='downAttack')   { basePow=4.0+wkb*0.7;  angle=0.60; dmg=9;  atk.attackActive=false; }
  else if (atk.state==='upAttack')     { basePow=5.5+wkb*0.8;  angle=1.05; dmg=11; atk.attackActive=false; }
  else if (atk.state==='airAttack')    { basePow=4.5+wkb*0.7;  angle=0.55; dmg=9;  atk.attackActive=false; }
  else if (atk.state==='specialSide')  { basePow=7.5+wkb*1.0;  angle=0.33; dmg=16; atk.attackActive=false; }
  else if (atk.state==='specialUp')    { basePow=4.5+wkb*0.5;  angle=0.90; dmg=8;  multi=true; atk.multiHitTimer=12; }
  else if (atk.state==='specialDown')  { basePow=3.5+wkb*0.5;  angle=0.50; dmg=5;  multi=true; atk.multiHitTimer=10; }

  // Fighting: weaker individual hits but shorter invincibility for rapid combos
  if (isFighting && (atk.state==='attack'||atk.state==='strongAttack'||atk.state==='downAttack'||atk.state==='upAttack'||atk.state==='airAttack')) {
    basePow *= 0.65; dmg *= 0.75; multi = true;
    if (atk.state==='attack') atk.multiHitTimer=8;
    else atk.multiHitTimer=10;
  }

  // ── Damage scalar (divine reduction + primordial bonuses) ─────────────────
  let dmgScalar = 1.0;
  // Divine axe: bleed damage reduction (victim has bleed and divine axe weapon)
  if (atk.bleedTicks > 0 && (vic.weapon?.bleedDmgReduction ?? 0) > 0) {
    dmgScalar *= (1 - vic.weapon!.bleedDmgReduction!);
  }
  // Primordial axe: +20% damage to bleeding enemies
  if ((atk.weapon?.bleedTargetDmgBonus ?? 0) > 0 && vic.bleedTicks > 0) {
    dmgScalar *= (1 + atk.weapon!.bleedTargetDmgBonus!);
  }
  // Primordial hammer: +12% per rarity rank of victim's armor
  if ((atk.weapon?.armorBreakerBonus ?? 0) > 0 && vic.armor) {
    const RARITY_RANK: Record<string, number> = {
      common:1, rare:2, epic:3, legendary:4, mythic:5, transcend:6, divine:7, primordial:8
    };
    const rank = RARITY_RANK[vic.armor.rarity] ?? 0;
    dmgScalar *= (1 + atk.weapon!.armorBreakerBonus! * rank);
  }

  // Anti-primordial defense bonus (divine weapons vs primordial attackers)
  const primDefBonus = (atk.weapon?.rarity === 'primordial' && (vic.weapon?.antiPrimordialDefBonus ?? 0) > 0)
    ? vic.weapon!.antiPrimordialDefBonus! : 0;
  if (primDefBonus > 0) vic.defenseMult += primDefBonus;
  knockback(vic, atk.pos, aMult, basePow * kbm * dmgScalar, angle, dmg * dmgScalar, multi||isFighting);
  if (primDefBonus > 0) vic.defenseMult -= primDefBonus;
  RESULT.dmgDealt = dmg * dmgScalar * aMult;

  // ── Primordial sword: victim's rage stacks increase on being hit ──────────
  if ((vic.weapon?.vengefulRage ?? 0) > 0) {
    vic.primordialRageStacks++;
    spawn(parts, vic.pos.x + vic.dir*12, vic.pos.y-50, ['#c084fc','#e879f9','#ffffff'], 6);
  }

  // ── Primordial fighting: combo count up on hit, victim's combo resets ─────
  if ((atk.weapon?.comboRageBonus ?? 0) > 0) {
    atk.primordialComboCount++;
    spawn(parts, atk.pos.x + atk.dir*16, atk.pos.y-55, ['#c084fc','#a855f7','#f3e8ff'], 5);
  }
  if ((vic.weapon?.comboRageBonus ?? 0) > 0) {
    vic.primordialComboCount = 0;
  }

  // ── Axe: apply bleed ─────────────────────────────────────────────────────
  if (atk.weapon?.type==='axe' && (atk.weapon.bleedDps??0)>0) {
    const newDps   = atk.weapon.bleedDps!;
    const newTicks = atk.weapon.bleedTicks ?? 3;
    vic.bleedDamage    = Math.max(vic.bleedDamage, newDps);
    vic.bleedTicks     = Math.max(vic.bleedTicks, 0) + newTicks;
    vic.bleedTickTimer = vic.bleedTickTimer > 0 ? vic.bleedTickTimer : 55;
  }

  // ── Staff: chance to spawn small projectile ───────────────────────────────
  if (atk.weapon?.type==='staff' && Math.random() < (atk.weapon.projChance??0)) {
    const sp = mkProj(
      atk.botAI ? 'bot' : 'player',
      atk.pos.x + atk.dir*20, atk.pos.y-38,
      atk.dir * 7, 6, 2.5, aMult * 0.7,
      atk.weapon.color
    );
    sp.size = 7;
    projs.push(sp);
    RESULT.spawnProj = sp;
  }

  // ── Primordial spear: 10% explosion on hit ────────────────────────────────
  if ((atk.weapon?.explosionChance ?? 0) > 0 && Math.random() < atk.weapon!.explosionChance!) {
    knockback(vic, atk.pos, aMult * 0.8, basePow * 5.0, 0.72, dmg * 0.3, false);
    spawn(parts, vic.pos.x, vic.pos.y-30, ['#ff6b35','#ffd700','#ff4500','#c084fc','#ffffff'], 45);
  }

  // ── Divine: stun on hit (spear) ───────────────────────────────────────────
  if ((atk.weapon?.stunOnHitChance ?? 0) > 0 && Math.random() < atk.weapon!.stunOnHitChance!) {
    vic.stunTimer = atk.weapon?.stunDuration ?? 60;
    spawn(parts, vic.pos.x, vic.pos.y-44, ['#fbbf24','#fde68a','#c084fc','#ffffff'], 16);
  }

  // ── Divine: heal on hit (staff) / Primordial: life steal ─────────────────
  if ((atk.weapon?.healOnHit ?? 0) > 0 && atk.weapon?.type === 'staff') {
    atk.damage = Math.max(0, atk.damage - atk.weapon.healOnHit!);
  }
  if ((atk.weapon?.lifeStealOnHit ?? 0) > 0 && atk.weapon?.type === 'staff') {
    atk.damage = Math.max(0, atk.damage - atk.weapon.lifeStealOnHit!);
    spawn(parts, atk.pos.x, atk.pos.y-48, ['#c084fc','#86efac','#ffffff'], 8);
  }

  // ── Divine: stun every N hits (fighting) ─────────────────────────────────
  if ((atk.weapon?.stunEvery ?? 0) > 0 && atk.weapon?.type === 'fighting') {
    atk.divineHitCount++;
    if (atk.divineHitCount >= atk.weapon.stunEvery!) {
      atk.divineHitCount = 0;
      vic.stunTimer = 70;
      spawn(parts, vic.pos.x, vic.pos.y-44, ['#fbbf24','#fde68a','#c084fc','#ffffff'], 22);
    }
  }

  return RESULT;
}

export function updateFighter(f:Fighter, keys:Set<string>, platforms:StagePlatform[]) {
  // ── Bleed tick ────────────────────────────────────────────────────────────
  if (f.bleedTicks>0 && f.state!=='dead') {
    f.bleedTickTimer--;
    if (f.bleedTickTimer<=0) {
      f.damage += f.bleedDamage;
      f.bleedTicks--;
      f.bleedTickTimer = f.bleedTicks>0 ? 55 : 0;
    }
  }
  if (f.state==='dead'){if(f.stateTimer>0)f.stateTimer--;return;}
  // ── Divine stun: keep fighter in guardBreak state while stunTimer runs ────
  if (f.stunTimer > 0) { f.stunTimer--; f.state = 'guardBreak'; f.stateTimer = 5; }
  if (f.specialCooldown>0)  f.specialCooldown--;
  if (f.multiHitTimer>0)    f.multiHitTimer--;
  if (f.counterCooldown>0)  f.counterCooldown--;

  // ── Guard management ────────────────────────────────────────────────────────
  const guardKey = !f.botAI && (keys.has('f') || keys.has('F'));
  if (f.state === 'guard') {
    if (!guardKey) {
      f.state = 'idle';
    } else {
      f.guardGauge -= 0.75;
      f.vel.x *= 0.12;
      if (f.guardGauge <= 0) {
        f.guardGauge = 0; f.state = 'guardBreak'; f.stateTimer = 70;
      }
    }
  } else if (guardKey && f.onGround && !LOCKED_STATES.includes(f.state) && f.guardGauge > 0) {
    f.state = 'guard';
  }
  if (f.state !== 'guard' && f.state !== 'guardBreak') {
    const fightRegen = f.weapon?.type === 'fighting' ? (f.weapon.guardRegenBonus ?? 0) : 0;
    f.guardGauge = Math.min(f.maxGuardGauge, f.guardGauge + 0.42 + fightRegen);
  }
  // Reset bow fired flag when not in an attack state
  if (f.state !== 'attack' && f.state !== 'strongAttack' && f.state !== 'downAttack') {
    f.bowFired = false;
  }
  // Bot guard timer
  if (f.botAI && f.botGuardTimer > 0) {
    f.botGuardTimer--;
    if (f.botGuardTimer === 0 && f.state === 'guard') f.state = 'idle';
  }

  if (f.stateTimer>0){
    f.stateTimer--;
    if(f.stateTimer===0 && ACTION_STATES.includes(f.state) && f.state !== 'guard'){f.state=f.onGround?'idle':'fall';f.attackActive=false;}
  }
  if(f.invincible>0)f.invincible--;
  f.attackActive=false;
  // multiHitTimer===0 gates all attacks so the same swing can only hit (or drain guard) once.
  // Fighting weapons set multiHitTimer after each hit to allow rapid multi-hits.
  // Guard drain also sets multiHitTimer so guard isn't drained every frame of the active window.
  if(f.state==='attack')       f.attackActive=f.stateTimer>=7 &&f.stateTimer<=15&&f.multiHitTimer===0;
  if(f.state==='strongAttack') f.attackActive=f.stateTimer>=10&&f.stateTimer<=22&&f.multiHitTimer===0;
  if(f.state==='downAttack')   f.attackActive=f.stateTimer>=5 &&f.stateTimer<=14&&f.multiHitTimer===0;
  if(f.state==='upAttack')     f.attackActive=f.stateTimer>=6 &&f.stateTimer<=17&&f.multiHitTimer===0;
  if(f.state==='airAttack')    f.attackActive=f.stateTimer>=4 &&f.stateTimer<=13&&f.multiHitTimer===0;
  if(f.state==='specialSide')  f.attackActive=f.stateTimer>=8 &&f.stateTimer<=18&&f.multiHitTimer===0;
  if(f.state==='specialUp')    f.attackActive=f.stateTimer>=5 &&f.stateTimer<=22&&f.multiHitTimer===0;
  if(f.state==='specialDown')  f.attackActive=f.stateTimer>=4 &&f.stateTimer<=22&&f.multiHitTimer===0;
  const locked=LOCKED_STATES.includes(f.state);
  const spd=BASE_WALK*f.speedMult;
  if(!f.botAI&&!locked){
    const left =keys.has('ArrowLeft')||keys.has('a')||keys.has('A');
    const right=keys.has('ArrowRight')||keys.has('d')||keys.has('D');
    if(left){f.vel.x=-spd;f.dir=-1;}else if(right){f.vel.x=spd;f.dir=1;}else f.vel.x*=f.onGround?0.55:0.88;
  }
  if(f.state==='specialSide')f.vel.x*=0.95;
  f.vel.y=Math.min(f.vel.y+GRAVITY,MAX_FALL); f.pos.x+=f.vel.x; f.pos.y+=f.vel.y;
  const wasGround=f.onGround; f.onGround=false;
  for(const p of platforms){
    const prev=f.pos.y-f.vel.y;
    if(f.vel.y>=0&&f.pos.x>p.x+4&&f.pos.x<p.x+p.w-4&&prev<=p.y+1&&f.pos.y>=p.y){
      f.pos.y=p.y;f.vel.y=0;f.onGround=true;f.jumpsLeft=f.maxJumps;
      if(!wasGround&&!ACTION_STATES.includes(f.state))f.state='idle'; break;
    }
  }
  if(!ACTION_STATES.includes(f.state)){
    if(f.onGround){
      if(!f.botAI){const mv=keys.has('ArrowLeft')||keys.has('a')||keys.has('A')||keys.has('ArrowRight')||keys.has('d')||keys.has('D');f.state=mv?'walk':'idle';}
      else f.state=Math.abs(f.vel.x)>0.5?'walk':'idle';
    }else f.state=f.vel.y<0?'jump':'fall';
  }
}

export function updateBot(bot:Fighter, player:Fighter, cfg:BotConfig, projectiles:Projectile[], platforms:StagePlatform[]) {
  if(bot.state==='dead'||bot.state==='hit')return;
  // Allow guard/guardBreak/counter/counterHit to play out via updateFighter
  if(bot.state==='guard'||bot.state==='guardBreak'||bot.state==='counter'||bot.state==='counterHit')return;
  if(ACTION_STATES.includes(bot.state))return;
  if(bot.botDecisionTimer>0)bot.botDecisionTimer--;
  if(bot.botJumpCooldown>0) bot.botJumpCooldown--;
  const dx=player.pos.x-bot.pos.x, dy=player.pos.y-bot.pos.y;
  const dist=Math.abs(dx);
  const onStageX=bot.pos.x>100&&bot.pos.x<W-100;
  const spd=BASE_WALK*cfg.speedMult;
  if(!bot.onGround&&!onStageX) bot.botBehav='recover';
  if(bot.botBehav==='recover'){
    const cx2=W/2, ddx=cx2-bot.pos.x;
    bot.vel.x=ddx>0?Math.min(spd*1.15,ddx):Math.max(-spd*1.15,ddx); bot.dir=ddx>0?1:-1;
    if(bot.jumpsLeft>0&&!bot.onGround&&bot.botJumpCooldown===0){bot.vel.y=BASE_DJUMP;bot.jumpsLeft--;bot.botJumpCooldown=28;}
    if(bot.onGround&&onStageX) bot.botBehav='approach'; return;
  }
  if(bot.botDecisionTimer===0){
    bot.botBehav=dist<cfg.attackRange?'attack':'approach';
    bot.botDecisionTimer=cfg.decisionMin+Math.floor(Math.random()*(cfg.decisionMax-cfg.decisionMin));
  }
  if(bot.botBehav==='approach'){
    const playerOffStage=player.pos.x<80||player.pos.x>W-80;
    if(cfg.edgeGuard&&playerOffStage&&bot.onGround){
      const edgeX=player.pos.x<80?92:W-92, ddx=edgeX-bot.pos.x;
      bot.vel.x=ddx>0?spd*1.2:-spd*1.2; bot.dir=ddx>0?1:-1;
    }else{ bot.vel.x=dx>0?spd:-spd; bot.dir=dx>0?1:-1; }
    if(dy<-65&&bot.onGround&&bot.jumpsLeft>0&&bot.botJumpCooldown===0){bot.vel.y=BASE_JUMP;bot.jumpsLeft--;bot.botJumpCooldown=42;}
    if(dy<-95&&!bot.onGround&&bot.jumpsLeft>0&&bot.botJumpCooldown===0&&bot.vel.y>-2){bot.vel.y=BASE_DJUMP;bot.jumpsLeft--;bot.botJumpCooldown=42;}
    if(bot.pos.x<110)bot.vel.x=spd*0.5; if(bot.pos.x>W-110)bot.vel.x=-spd*0.5;
    if(cfg.usesSpecial&&bot.specialCooldown===0&&dist>150&&dist<340&&Math.random()<0.022){
      bot.dir=dx>0?1:-1; bot.state='specialNeutral'; bot.stateTimer=22; bot.attackActive=false; bot.specialCooldown=SP_COOLDOWN;
      projectiles.push(mkProj('bot',bot.pos.x+bot.dir*20,bot.pos.y-40,bot.dir*7.5,10,3.5,cfg.attackMult,'#ef4444'));
    }
  }
  if(bot.botBehav==='attack'){
    bot.vel.x*=0.35; bot.dir=dx>0?1:-1;
    // ── Guard/Counter AI (react to player attacks) ──────────────────────────
    const guardChance   = cfg.guardChance   ?? (cfg.usesSpecial ? (cfg.missChance < 0.05 ? 0.20 : 0.10) : 0.04);
    const counterChance = cfg.counterChance ?? (cfg.usesSpecial ? (cfg.missChance < 0.05 ? 0.09 : 0.04) : 0.00);
    if (player.attackActive && dist < cfg.attackRange * 1.4 && bot.onGround) {
      if (bot.counterCooldown === 0 && Math.random() < counterChance) {
        bot.state = 'counter'; bot.stateTimer = 22; bot.counterCooldown = COUNTER_CD;
        return;
      }
      if (bot.guardGauge > 20 && Math.random() < guardChance) {
        bot.state = 'guard'; bot.botGuardTimer = 16 + Math.floor(Math.random() * 16);
        return;
      }
    }
    if(dist<cfg.attackRange&&Math.random()>=cfg.missChance){
      const r=Math.random();
      if(cfg.usesSpecial&&bot.specialCooldown===0&&dist<110&&r<0.22){bot.state='specialDown';bot.stateTimer=28;bot.attackActive=false;bot.specialCooldown=SP_COOLDOWN;}
      else if(cfg.usesSpecial&&bot.specialCooldown===0&&r<0.35){bot.state='specialSide';bot.stateTimer=22;bot.attackActive=false;bot.vel.x=bot.dir*BASE_WALK*2.5*cfg.speedMult;bot.specialCooldown=SP_COOLDOWN;}
      else if(!bot.onGround&&r<0.55){bot.state='airAttack';bot.stateTimer=22;bot.attackActive=false;}
      else if(dy<-35&&r<0.38){bot.state='upAttack';bot.stateTimer=28;bot.attackActive=false;}
      else if(dy>20&&r<0.28){bot.state='downAttack';bot.stateTimer=24;bot.attackActive=false;}
      else if(player.damage>55&&r<0.42){bot.state='strongAttack';bot.stateTimer=34;bot.attackActive=false;}
      else{bot.state='attack';bot.stateTimer=26;bot.attackActive=false;}
    }
  }
}

export function updateProjectiles(projs:Projectile[]) {
  for(let i=projs.length-1;i>=0;i--){
    const p=projs[i]; p.trail.push({x:p.pos.x,y:p.pos.y}); if(p.trail.length>7)p.trail.shift();
    p.pos.x+=p.vel.x; p.pos.y+=p.vel.y; p.life--;
    if(p.life<=0||p.pos.x<-120||p.pos.x>W+120||p.pos.y<-250||p.pos.y>H+120) projs.splice(i,1);
  }
}

/**
 * Apply a projectile hit to a victim, respecting guard state.
 * Returns true if damage was dealt, false if blocked by guard.
 * Caller should always remove the projectile regardless of return value.
 */
export function applyProjHit(
  vic: Fighter,
  projPos: {x:number;y:number},
  projVel: {x:number;y:number},
  atkMult: number,
  knockbackPow: number,
  dmg: number,
  parts: Particle[],
  guardSpawnCols = ['#93c5fd','#bfdbfe','#ffffff'],
  hitCols = ['#818cf8','#a5b4fc','#ffffff'],
): boolean {
  if (vic.state === 'guard') {
    // Block: drain guard gauge, push back, no damage
    // Flat drain (not scaled by atkMult) so guard stays meaningful.
    const drain = Math.min(dmg * 2.5, 35);
    vic.guardGauge = Math.max(0, vic.guardGauge - drain);
    const pushDir = projVel.x > 0 ? 1 : -1;
    vic.vel.x += pushDir * 1.0;
    spawn(parts, projPos.x, projPos.y, guardSpawnCols, 10);
    if (vic.guardGauge <= 0) {
      vic.state = 'guardBreak'; vic.stateTimer = 70; vic.guardGauge = 0;
      spawn(parts, vic.pos.x, vic.pos.y - 40, ['#facc15','#fef08a','#ffffff','#fbbf24'], 24);
    }
    return false;
  }
  knockback(vic, {x:projPos.x-projVel.x*8,y:projPos.y}, atkMult, knockbackPow, 0.40, dmg);
  spawn(parts, projPos.x, projPos.y, hitCols, 16);
  return true;
}

export function spawn(parts:Particle[],x:number,y:number,cols:string[],n=12){
  for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=2+Math.random()*6;parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-2.5,r:2+Math.random()*4.5,color:cols[Math.floor(Math.random()*cols.length)],life:25+Math.random()*12,maxLife:37});}
}
export function updateParticles(parts:Particle[]) {
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.18;p.life--;if(p.life<=0)parts.splice(i,1);}
}

// ─── Weapon drawing helper ────────────────────────────────────────────────────
export function drawWeapon(ctx:CanvasRenderingContext2D, cx:number, cy:number, dir:1|-1, f:Fighter, frame:number, domArmX:number, domArmY:number) {
  const w=f.weapon!; const col=w.color; const s=f.state;
  const inAtk=s==='attack'||s==='strongAttack'||s==='airAttack'||s==='upAttack'; const inDn=s==='downAttack';
  const {attackActive,stateTimer}=f; const armY=cy-37;
  ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
  if(attackActive){ctx.shadowColor=col;ctx.shadowBlur=18;}
  switch(w.type){
    case 'sword':{
      if(inAtk){
        const hx=cx+dir*20,tx=domArmX+dir*14;
        ctx.strokeStyle=col;ctx.lineWidth=attackActive?5:3;ctx.beginPath();ctx.moveTo(hx,armY);ctx.lineTo(tx,armY);ctx.stroke();
        ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(hx,armY-8);ctx.lineTo(hx,armY+8);ctx.stroke();
        if(attackActive){ctx.fillStyle=col;ctx.beginPath();ctx.arc(tx,armY,5,0,Math.PI*2);ctx.fill();}
      }else if(inDn){
        ctx.strokeStyle=col;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx+dir*14,cy-34);ctx.lineTo(cx+dir*10,cy+2);ctx.stroke();
        ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(cx+dir*6,cy-24);ctx.lineTo(cx+dir*22,cy-24);ctx.stroke();
      }else{
        const hx=cx+dir*16,hy=cy-28,tx=cx+dir*40,ty=cy-44;
        ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(tx,ty);ctx.stroke();
        const mx=(hx+tx)/2,my=(hy+ty)/2;
        ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(mx-dir*7,my+5);ctx.lineTo(mx+dir*7,my-5);ctx.stroke();
      }
      break;
    }
    case 'axe':{
      if(inAtk){
        const perpDx=domArmX-cx,perpDy=domArmY-armY;const len=Math.sqrt(perpDx*perpDx+perpDy*perpDy)||1;
        const px=-perpDy/len,py=perpDx/len;
        ctx.strokeStyle=col;ctx.lineWidth=attackActive?9:7;ctx.beginPath();ctx.moveTo(domArmX+px*17,domArmY+py*17);ctx.lineTo(domArmX-px*17,domArmY-py*17);ctx.stroke();
        if(attackActive){ctx.fillStyle=col;ctx.globalAlpha=0.35;ctx.beginPath();ctx.arc(domArmX,domArmY,19,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
      }else if(inDn){
        ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(cx+dir*10,cy-28);ctx.lineTo(cx+dir*10,cy-10);ctx.stroke();
        ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(cx+dir*0,cy-10);ctx.lineTo(cx+dir*20,cy-10);ctx.stroke();
      }else{
        ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(cx+dir*12,cy-20);ctx.lineTo(cx+dir*12,cy-44);ctx.stroke();
        ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(cx+dir*0,cy-40);ctx.lineTo(cx+dir*20,cy-40);ctx.stroke();
      }
      break;
    }
    case 'spear':{
      if(inAtk){
        const tailX=cx-dir*26,tipX=domArmX+dir*28,y=armY+1;
        ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(tailX,y+2);ctx.lineTo(tipX,y);ctx.stroke();
        ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(tipX,y-9);ctx.lineTo(tipX+dir*16,y);ctx.lineTo(tipX,y+9);ctx.closePath();ctx.fill();
        if(attackActive){ctx.globalAlpha=0.5;ctx.beginPath();ctx.arc(tipX+dir*16,y,13,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
      }else if(inDn){
        const sx=cx+dir*7;
        ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(sx,cy-65);ctx.lineTo(sx,cy);ctx.stroke();
        ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(sx-5,cy-66);ctx.lineTo(sx,cy-78);ctx.lineTo(sx+5,cy-66);ctx.closePath();ctx.fill();
      }else{
        const sx=cx+dir*10;
        ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx,cy-12);ctx.lineTo(sx,cy-70);ctx.stroke();
        ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(sx-4,cy-70);ctx.lineTo(sx,cy-82);ctx.lineTo(sx+4,cy-70);ctx.closePath();ctx.fill();
      }
      break;
    }
    case 'hammer':{
      if(inAtk){
        const perpDx=domArmX-cx,perpDy=domArmY-armY;const len=Math.sqrt(perpDx*perpDx+perpDy*perpDy)||1;
        const px=-perpDy/len,py=perpDx/len;
        ctx.lineCap='square';ctx.strokeStyle=col;ctx.lineWidth=attackActive?16:12;
        ctx.beginPath();ctx.moveTo(domArmX+px*14,domArmY+py*14);ctx.lineTo(domArmX-px*14,domArmY-py*14);ctx.stroke();
        ctx.lineCap='round';
        if(attackActive){ctx.fillStyle=col;ctx.globalAlpha=0.3;ctx.beginPath();ctx.arc(domArmX,domArmY,22,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
      }else if(inDn){
        ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(cx+dir*10,cy-28);ctx.lineTo(cx+dir*10,cy-10);ctx.stroke();
        ctx.lineCap='square';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(cx+dir*2,cy-10);ctx.lineTo(cx+dir*18,cy-10);ctx.stroke();ctx.lineCap='round';
      }else{
        ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(cx+dir*12,cy-22);ctx.lineTo(cx+dir*12,cy-44);ctx.stroke();
        ctx.lineCap='square';ctx.lineWidth=10;ctx.beginPath();ctx.moveTo(cx+dir*4,cy-44);ctx.lineTo(cx+dir*20,cy-44);ctx.stroke();ctx.lineCap='round';
      }
      break;
    }
    case 'staff':{
      const glow=Math.sin(frame*0.1)*0.5+0.5;
      if(inAtk){
        ctx.strokeStyle=col;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx-dir*10,cy-14);ctx.lineTo(domArmX+dir*8,domArmY-4);ctx.stroke();
        ctx.save();ctx.shadowColor=col;ctx.shadowBlur=attackActive?28:14;
        ctx.fillStyle=col;ctx.globalAlpha=0.75+glow*0.25;ctx.beginPath();ctx.arc(domArmX+dir*8,domArmY-4,attackActive?13:8,0,Math.PI*2);ctx.fill();ctx.restore();
      }else if(inDn){
        const sx=cx+dir*8;
        ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(sx,cy-72);ctx.lineTo(sx,cy-5);ctx.stroke();
        ctx.save();ctx.shadowColor=col;ctx.shadowBlur=14;ctx.fillStyle=col;ctx.globalAlpha=0.8;ctx.beginPath();ctx.arc(sx,cy-72,7,0,Math.PI*2);ctx.fill();ctx.restore();
      }else{
        const sx=cx+dir*9;
        ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx,cy-12);ctx.lineTo(sx,cy-74);ctx.stroke();
        ctx.save();ctx.shadowColor=col;ctx.shadowBlur=12+glow*8;ctx.fillStyle=col;ctx.globalAlpha=0.7+glow*0.3;ctx.beginPath();ctx.arc(sx,cy-74,7,0,Math.PI*2);ctx.fill();ctx.restore();
      }
      break;
    }
    case 'bow':{
      const glow=Math.sin(frame*0.12)*0.5+0.5;
      const isCharged=s==='strongAttack';
      if(inAtk){
        // Bow drawn — arm extended, string pulled
        const tipX=cx+dir*36, tipY=armY-10;
        const botX=cx+dir*36, botY=armY+10;
        const midX=cx+dir*12, midY=armY;   // grip point
        // Bow arc
        ctx.strokeStyle=col; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(tipX,tipY); ctx.quadraticCurveTo(cx+dir*52,armY,botX,botY); ctx.stroke();
        // Bowstring pulled back
        ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(tipX,tipY); ctx.lineTo(midX-dir*10,midY); ctx.lineTo(botX,botY); ctx.stroke();
        if(attackActive){
          // Arrow nocked and flying
          ctx.save(); ctx.shadowColor=isCharged?'#ffffff':col; ctx.shadowBlur=isCharged?30:16;
          ctx.strokeStyle=isCharged?'#ffffff':col; ctx.lineWidth=isCharged?4:2.5;
          ctx.beginPath(); ctx.moveTo(midX-dir*10,midY); ctx.lineTo(tipX+dir*18,midY); ctx.stroke();
          // Arrowhead
          ctx.fillStyle=isCharged?'#ffffff':col; ctx.globalAlpha=0.9;
          ctx.beginPath(); ctx.moveTo(tipX+dir*18,midY-5); ctx.lineTo(tipX+dir*30,midY); ctx.lineTo(tipX+dir*18,midY+5); ctx.closePath(); ctx.fill();
          if(isCharged){ ctx.globalAlpha=0.35; ctx.beginPath(); ctx.arc(tipX+dir*30,midY,14,0,Math.PI*2); ctx.fill(); }
          ctx.restore();
        }
      }else if(inDn){
        // Bow held downward, arrow pointed diagonally down
        ctx.strokeStyle=col; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(cx+dir*10,cy-52); ctx.quadraticCurveTo(cx+dir*28,cy-30,cx+dir*10,cy-10); ctx.stroke();
        ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(cx+dir*10,cy-52); ctx.lineTo(cx+dir*2,cy-30); ctx.lineTo(cx+dir*10,cy-10); ctx.stroke();
        if(attackActive){
          ctx.save(); ctx.shadowColor=col; ctx.shadowBlur=14;
          ctx.strokeStyle=col; ctx.lineWidth=2.5;
          ctx.beginPath(); ctx.moveTo(cx+dir*2,cy-30); ctx.lineTo(cx+dir*14,cy-8); ctx.stroke();
          ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(cx+dir*8,cy-4); ctx.lineTo(cx+dir*20,cy-8); ctx.lineTo(cx+dir*14,cy+4); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }else{
        // Idle — bow held upright at side
        const bx=cx+dir*16;
        ctx.strokeStyle=col; ctx.lineWidth=3;
        ctx.beginPath(); ctx.moveTo(bx,cy-60); ctx.quadraticCurveTo(bx+dir*16,cy-30,bx,cy-2); ctx.stroke();
        ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.moveTo(bx,cy-60); ctx.lineTo(bx-dir*4,cy-30); ctx.lineTo(bx,cy-2); ctx.stroke();
        // Glowing nock
        ctx.save(); ctx.shadowColor=col; ctx.shadowBlur=8+glow*8;
        ctx.fillStyle=col; ctx.globalAlpha=0.6+glow*0.3;
        ctx.beginPath(); ctx.arc(bx-dir*4,cy-30,4,0,Math.PI*2); ctx.fill();
        ctx.restore();
      }
      break;
    }
    case 'fighting':{
      const pulse=Math.sin(frame*0.18)*0.5+0.5;
      if(inAtk){
        // Extended punch
        const punchX=domArmX+dir*10, punchY=domArmY;
        ctx.save(); ctx.shadowColor=col; ctx.shadowBlur=attackActive?22:10;
        // Arm line
        ctx.strokeStyle=attackActive?'#facc15':col; ctx.lineWidth=4.5;
        ctx.beginPath(); ctx.moveTo(cx,armY); ctx.lineTo(punchX,punchY); ctx.stroke();
        // Fist (glove)
        ctx.fillStyle=attackActive?'#facc15':col; ctx.globalAlpha=0.9;
        ctx.beginPath(); ctx.roundRect(punchX-6,punchY-7,18,14,4); ctx.fill();
        if(attackActive){ ctx.globalAlpha=0.3; ctx.beginPath(); ctx.arc(punchX+6,punchY,16,0,Math.PI*2); ctx.fill(); }
        ctx.restore();
      }else if(inDn){
        // Both fists down
        ctx.save(); ctx.shadowColor=col; ctx.shadowBlur=attackActive?18:8;
        ctx.strokeStyle=attackActive?'#facc15':col; ctx.lineWidth=4;
        ctx.beginPath(); ctx.moveTo(cx,armY); ctx.lineTo(cx-28,cy-6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx,armY); ctx.lineTo(cx+28,cy-6); ctx.stroke();
        ctx.fillStyle=attackActive?'#facc15':col; ctx.globalAlpha=0.88;
        ctx.beginPath(); ctx.roundRect(cx-36,cy-14,14,12,3); ctx.fill();
        ctx.beginPath(); ctx.roundRect(cx+22,cy-14,14,12,3); ctx.fill();
        ctx.restore();
      }else{
        // Idle — guard stance, fists raised
        const raisedY=armY-4;
        ctx.save(); ctx.shadowColor=col; ctx.shadowBlur=6+pulse*8;
        ctx.strokeStyle=col; ctx.lineWidth=3.5;
        ctx.beginPath(); ctx.moveTo(cx,armY); ctx.lineTo(cx+dir*20,raisedY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx,armY); ctx.lineTo(cx-dir*16,raisedY+2); ctx.stroke();
        ctx.fillStyle=col; ctx.globalAlpha=0.85;
        ctx.beginPath(); ctx.roundRect(cx+dir*18,raisedY-7,14,12,3); ctx.fill();
        ctx.beginPath(); ctx.roundRect(cx-dir*26,raisedY-5,12,10,3); ctx.fill();
        ctx.restore();
      }
      break;
    }
  }
  ctx.restore();
  void stateTimer;
}

// ─── Fighter renderer ─────────────────────────────────────────────────────────
export function drawFighter(ctx:CanvasRenderingContext2D, f:Fighter, frame:number) {
  if(f.invincible>0&&Math.floor(f.invincible/4)%2===0)return;
  const {pos,dir,state,color,attackActive}=f; const cx=pos.x,cy=pos.y; const wt=f.weapon?.type??null;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  const wp=(frame*0.25)%(Math.PI*2);
  const isWalk=state==='walk'; const isAir=state==='jump'||state==='fall';
  const inAtk=state==='attack'||state==='strongAttack'; const armY=cy-37;

  if(f.armor?.slot==='cloak'){
    const wave=Math.sin(frame*0.08)*5;const acol=f.armor.color;
    ctx.save();ctx.fillStyle=acol;ctx.globalAlpha=0.55;
    ctx.beginPath();ctx.moveTo(cx,cy-42);
    ctx.quadraticCurveTo(cx-dir*34,cy-26+wave,cx-dir*30,cy-4);
    ctx.quadraticCurveTo(cx-dir*20,cy+5,cx-dir*8,cy-5);
    ctx.lineTo(cx,cy-42);ctx.closePath();ctx.fill();
    ctx.strokeStyle=acol;ctx.lineWidth=1.5;ctx.globalAlpha=0.8;
    ctx.beginPath();ctx.moveTo(cx,cy-42);ctx.quadraticCurveTo(cx-dir*34,cy-26+wave,cx-dir*30,cy-4);ctx.stroke();
    ctx.restore();
  }

  const spin=['specialUp','specialDown'].includes(state)?frame*0.35:0;
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=4;
  ctx.beginPath();ctx.arc(cx+Math.cos(spin)*3,cy-55+Math.sin(spin)*3,12,0,Math.PI*2);ctx.stroke();

  if(f.armor?.slot==='helmet'){
    const hcol=f.armor.color;
    ctx.save();ctx.strokeStyle=hcol;ctx.lineWidth=3.5;
    ctx.beginPath();ctx.arc(cx+Math.cos(spin)*3,cy-55+Math.sin(spin)*3,14,Math.PI,0);ctx.stroke();
    if(f.armor.rarity!=='common'){ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-10,cy-50);ctx.lineTo(cx+10,cy-50);ctx.stroke();}
    if(f.armor.rarity==='legendary'||f.armor.rarity==='epic'){ctx.fillStyle=hcol;ctx.globalAlpha=0.8;ctx.beginPath();ctx.arc(cx,cy-70,5,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }

  ctx.strokeStyle=color;ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(cx,cy-43);ctx.lineTo(cx,cy-18);ctx.stroke();

  if(f.armor?.slot==='armor'){
    const acol=f.armor.color;
    ctx.save();ctx.fillStyle=acol;ctx.globalAlpha=0.75;
    ctx.beginPath();ctx.arc(cx-20,cy-40,7,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(cx+20,cy-40,7,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=0.55;ctx.beginPath();ctx.roundRect(cx-9,cy-40,18,20,3);ctx.fill();ctx.restore();
  }

  ctx.strokeStyle=color;ctx.lineWidth=3.5;
  let legLx=cx,legLy=cy,legRx=cx,legRy=cy;
  if(state==='specialDown'){
    const s2=frame*0.45;
    ctx.beginPath();ctx.moveTo(cx,cy-18);ctx.lineTo(cx+Math.cos(s2)*32,cy-10+Math.sin(s2)*12);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,cy-18);ctx.lineTo(cx+Math.cos(s2+Math.PI)*32,cy-10+Math.sin(s2+Math.PI)*12);ctx.stroke();
  }else{
    const leg=isWalk?Math.sin(wp)*18:(isAir||state.startsWith('special')?14:0);
    legLx=cx-leg;legLy=cy;legRx=cx+leg;legRy=cy;
    ctx.beginPath();ctx.moveTo(cx,cy-18);ctx.lineTo(legLx,legLy);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,cy-18);ctx.lineTo(legRx,legRy);ctx.stroke();
  }

  if(f.armor?.slot==='boots'){
    const bcol=f.armor.color;
    ctx.save();ctx.fillStyle=bcol;ctx.globalAlpha=0.85;
    ctx.beginPath();ctx.roundRect(legLx-8,legLy-4,16,6,2);ctx.fill();
    ctx.beginPath();ctx.roundRect(legRx-8,legRy-4,16,6,2);ctx.fill();ctx.restore();
  }

  let domArmX=cx+dir*22,domArmY=cy-24;
  let offArmX=cx-dir*22,offArmY=cy-24;

  if(inAtk){
    if((wt==='axe'||wt==='hammer')&&f.weapon){
      const maxT=state==='strongAttack'?34:26;const phase=1-f.stateTimer/maxT;
      const baseAngle=wt==='hammer'?-Math.PI*0.75:-Math.PI*0.65;
      const swingRange=wt==='hammer'?Math.PI*0.85:Math.PI*0.72;
      const swingAngle=baseAngle+phase*swingRange;const armLen=wt==='hammer'?46:42;
      domArmX=cx+Math.cos(swingAngle)*armLen*dir;domArmY=armY+Math.sin(swingAngle)*armLen;
      ctx.strokeStyle=attackActive?'#facc15':color;ctx.lineWidth=3.5;
      ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(domArmX,domArmY);ctx.stroke();
      ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx-dir*22,cy-27);ctx.stroke();
      offArmX=cx-dir*22;offArmY=cy-27;
    }else if(wt==='spear'&&f.weapon){
      const reach=state==='strongAttack'?82:66;
      domArmX=cx+dir*reach;domArmY=armY;
      ctx.strokeStyle=attackActive?'#facc15':color;ctx.lineWidth=3.5;
      ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(domArmX,domArmY);ctx.stroke();
      offArmX=cx-dir*16;offArmY=armY+5;
      ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(offArmX,offArmY);ctx.stroke();
    }else{
      const reach=state==='strongAttack'?62:46;
      domArmX=cx+dir*reach;domArmY=armY;
      ctx.strokeStyle=attackActive?'#facc15':color;ctx.lineWidth=attackActive?5.5:3.5;
      ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(domArmX,domArmY);ctx.stroke();
      ctx.strokeStyle=color;ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx-dir*22,cy-27);ctx.stroke();
      offArmX=cx-dir*22;offArmY=cy-27;
      if(!f.weapon&&attackActive){ctx.save();ctx.fillStyle='#facc15';ctx.beginPath();ctx.arc(domArmX,domArmY,7,0,Math.PI*2);ctx.fill();ctx.restore();}
    }
  }else if(state==='downAttack'){
    ctx.save();ctx.strokeStyle=attackActive?'#facc15':color;ctx.lineWidth=3.5;
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx-34,cy-5);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx+34,cy-5);ctx.stroke();
    domArmX=cx+dir*34;domArmY=cy-5;offArmX=cx-dir*34;offArmY=cy-5;
    if(!f.weapon&&attackActive){ctx.fillStyle='#facc15';[cx-34,cx+34].forEach(ax=>{ctx.beginPath();ctx.arc(ax,cy-5,6,0,Math.PI*2);ctx.fill();});}
    ctx.restore();
  }else if(state==='upAttack'){
    // アッパー: 両腕を頭上に突き上げる
    domArmX=cx+dir*14;domArmY=armY-34;offArmX=cx-dir*14;offArmY=armY-28;
    ctx.save();ctx.strokeStyle=attackActive?'#facc15':color;ctx.lineWidth=attackActive?5.5:3.5;
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(domArmX,domArmY);ctx.stroke();
    ctx.strokeStyle=color;ctx.lineWidth=3.5;
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(offArmX,offArmY);ctx.stroke();
    if(!f.weapon&&attackActive){ctx.save();ctx.fillStyle='#facc15';ctx.shadowColor='#facc15';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(domArmX,domArmY,8,0,Math.PI*2);ctx.fill();ctx.restore();}
    ctx.restore();
  }else if(state==='airAttack'){
    // 空中攻撃: 前方斜め下に腕を突き出す
    domArmX=cx+dir*48;domArmY=armY+10;offArmX=cx-dir*18;offArmY=armY-8;
    ctx.save();ctx.strokeStyle=attackActive?'#facc15':color;ctx.lineWidth=attackActive?5.5:3.5;
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(domArmX,domArmY);ctx.stroke();
    ctx.strokeStyle=color;ctx.lineWidth=3.5;
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(offArmX,offArmY);ctx.stroke();
    if(!f.weapon&&attackActive){ctx.save();ctx.fillStyle='#facc15';ctx.shadowColor='#facc15';ctx.shadowBlur=10;ctx.beginPath();ctx.arc(domArmX,domArmY,7,0,Math.PI*2);ctx.fill();ctx.restore();}
    ctx.restore();
  }else if(state==='specialNeutral'){
    domArmX=cx+dir*50;domArmY=armY-1;
    ctx.save();ctx.strokeStyle='#818cf8';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(domArmX,domArmY);ctx.stroke();
    ctx.fillStyle='#818cf899';ctx.beginPath();ctx.arc(domArmX,armY,10,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx-dir*22,cy-27);ctx.stroke();
    offArmX=cx-dir*22;offArmY=cy-27;
  }else if(state==='specialSide'){
    domArmX=cx+dir*64;domArmY=armY-2;
    ctx.save();ctx.strokeStyle=attackActive?'#f97316':color;ctx.lineWidth=attackActive?6:3.5;
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(domArmX,domArmY);ctx.stroke();
    if(attackActive){ctx.fillStyle='#f97316';ctx.beginPath();ctx.arc(domArmX,domArmY,10,0,Math.PI*2);ctx.fill();}
    ctx.restore();ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx-dir*20,cy-28);ctx.stroke();
    offArmX=cx-dir*20;offArmY=cy-28;
  }else if(state==='specialUp'){
    const s2=frame*0.32;
    ctx.save();ctx.strokeStyle=attackActive?'#38bdf8':color;ctx.lineWidth=attackActive?5.5:3.5;
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx+Math.cos(s2)*38,armY+Math.sin(s2)*16);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx+Math.cos(s2+Math.PI)*38,armY+Math.sin(s2+Math.PI)*16);ctx.stroke();
    if(attackActive){ctx.fillStyle='#38bdf8';ctx.beginPath();ctx.arc(cx+Math.cos(s2)*38,armY+Math.sin(s2)*16,8,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }else if(state==='specialDown'){
    const s2=frame*0.45;
    ctx.save();ctx.strokeStyle=attackActive?'#4ade80':color;ctx.lineWidth=attackActive?5.5:3.5;
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx+Math.cos(s2)*44,armY-5+Math.sin(s2)*20);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx+Math.cos(s2+Math.PI)*44,armY-5+Math.sin(s2+Math.PI)*20);ctx.stroke();
    ctx.restore();
  }else if(isAir){
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx-25,cy-50);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx+25,cy-50);ctx.stroke();
    domArmX=cx+dir*25;domArmY=cy-50;offArmX=cx-dir*25;offArmY=cy-50;
  }else{
    const as=isWalk?Math.sin(wp+Math.PI)*14:0;
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx-22+as*0.5,cy-24-as*0.3);ctx.stroke();
    ctx.beginPath();ctx.moveTo(cx,armY);ctx.lineTo(cx+22-as*0.5,cy-24+as*0.3);ctx.stroke();
    domArmX=cx+dir*22;domArmY=cy-24;offArmX=cx-dir*22;offArmY=cy-24;
  }

  if(f.armor?.slot==='gloves'){
    const gcol=f.armor.color;
    ctx.save();ctx.fillStyle=gcol;ctx.globalAlpha=0.85;
    ctx.beginPath();ctx.arc(domArmX,domArmY,5,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(offArmX,offArmY,5,0,Math.PI*2);ctx.fill();ctx.restore();
  }

  if(f.weapon) drawWeapon(ctx,cx,cy,dir,f,frame,domArmX,domArmY);

  if(f.armor?.slot==='shield'){
    const scol=f.armor.color;
    ctx.save();ctx.fillStyle=scol;ctx.globalAlpha=0.85;
    ctx.beginPath();ctx.roundRect(offArmX-8,offArmY-14,16,26,3);ctx.fill();
    ctx.strokeStyle=scol;ctx.lineWidth=2;ctx.globalAlpha=1;
    ctx.beginPath();ctx.roundRect(offArmX-8,offArmY-14,16,26,3);ctx.stroke();
    ctx.strokeStyle='#ffffff';ctx.lineWidth=1;ctx.globalAlpha=0.35;
    ctx.beginPath();ctx.roundRect(offArmX-6,offArmY-12,12,22,2);ctx.stroke();ctx.restore();
  }
  // ── Bleed indicator ────────────────────────────────────────────────────────
  if (f.bleedTicks>0) {
    const pulse = Math.sin(frame*0.25)*0.4+0.6;
    ctx.save();
    ctx.globalAlpha = pulse * 0.85;
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🩸', cx, cy - FH - 6);
    ctx.restore();
  }

  // ── Guard overlay ──────────────────────────────────────────────────────────
  if (state === 'guard') {
    const gPct = Math.max(0, f.guardGauge / f.maxGuardGauge);
    ctx.save();
    ctx.globalAlpha = 0.25 + gPct * 0.25;
    ctx.strokeStyle = '#60a5fa'; ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 18; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(cx, cy - FH*0.46, FW*1.85, FH*0.58, 0, 0, Math.PI*2); ctx.stroke();
    // crossed arms (defensive pose)
    ctx.globalAlpha = 0.85; ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 4.5; ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(cx-16, cy-46); ctx.lineTo(cx+16, cy-26); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+16, cy-46); ctx.lineTo(cx-16, cy-26); ctx.stroke();
    ctx.restore();
  }

  // ── Guard break (dizzy stars) ──────────────────────────────────────────────
  if (state === 'guardBreak') {
    ctx.save(); ctx.fillStyle = '#facc15'; ctx.shadowColor = '#facc15'; ctx.shadowBlur = 10;
    for (let i = 0; i < 3; i++) {
      const a = (frame * 0.16 + i * Math.PI * 2 / 3);
      ctx.globalAlpha = 0.5 + Math.sin(frame * 0.3 + i) * 0.3;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a)*18, cy - 70 + Math.sin(a)*5, 3.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  // ── Counter ready (gold pulsing aura) ─────────────────────────────────────
  if (state === 'counter') {
    const pulse = Math.sin(frame * 0.38) * 0.45 + 0.55;
    ctx.save();
    ctx.globalAlpha = pulse * 0.65; ctx.strokeStyle = '#fbbf24'; ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 22; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.ellipse(cx, cy - FH*0.46, FW*2.1, FH*0.62, 0, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = pulse * 0.4; ctx.fillStyle = '#fef3c7';
    ctx.beginPath(); ctx.ellipse(cx, cy - FH*0.46, FW*2.1, FH*0.62, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // ── Counter hit flash (burst) ──────────────────────────────────────────────
  if (state === 'counterHit') {
    const t = f.stateTimer / 28;
    ctx.save();
    ctx.globalAlpha = t * 0.75; ctx.fillStyle = '#fef3c7'; ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(cx, cy - FH*0.46, FW * 2.8 * (1 - t * 0.4), 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

// ─── Guard gauge HUD helper ───────────────────────────────────────────────────
export function drawGuardGauge(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number) {
  const pct    = Math.max(0, f.guardGauge / f.maxGuardGauge);
  const broken = f.state === 'guardBreak';
  const ready  = f.counterCooldown === 0;
  const gw = 88, gh = 6;
  ctx.save();
  // Guard bar
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(x, y, gw, gh, 3); ctx.fill();
  ctx.fillStyle = broken ? '#ef4444' : pct > 0.45 ? '#60a5fa' : '#f97316';
  if (pct > 0) { ctx.beginPath(); ctx.roundRect(x, y, gw * pct, gh, 3); ctx.fill(); }
  ctx.fillStyle = broken ? '#fca5a5' : '#93c5fd'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left';
  ctx.fillText(broken ? '💥 BREAK!' : `🛡 ガード [F]`, x, y - 2);
  // Counter indicator
  ctx.fillStyle = ready ? '#fbbf24' : '#6b7280'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'right';
  ctx.fillText(ready ? '⚡ カウンター [C]' : `⚡ ${Math.ceil(f.counterCooldown / 60 * 10)/10}s`, x + gw + 56, y - 2);
  // Counter cooldown bar
  const cPct = ready ? 1 : 1 - f.counterCooldown / COUNTER_CD;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.roundRect(x + gw + 4, y, 48, gh, 3); ctx.fill();
  ctx.fillStyle = ready ? '#fbbf24' : '#6b7280';
  if (cPct > 0) { ctx.beginPath(); ctx.roundRect(x + gw + 4, y, 48 * cPct, gh, 3); ctx.fill(); }
  ctx.restore();
}

// ─── Projectile renderer ──────────────────────────────────────────────────────
export function drawProjectile(ctx:CanvasRenderingContext2D, proj:Projectile) {
  for(let i=0;i<proj.trail.length;i++){
    const tp=proj.trail[i];
    ctx.save();ctx.globalAlpha=(i/proj.trail.length)*0.45;ctx.fillStyle=proj.color;
    ctx.beginPath();ctx.arc(tp.x,tp.y,proj.size*0.55,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  ctx.save();
  ctx.shadowColor=proj.color;ctx.shadowBlur=18;
  const g=ctx.createRadialGradient(proj.pos.x,proj.pos.y,0,proj.pos.x,proj.pos.y,proj.size*1.6);
  g.addColorStop(0,'#ffffff');g.addColorStop(0.35,proj.color);g.addColorStop(1,proj.color+'00');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(proj.pos.x,proj.pos.y,proj.size*1.6,0,Math.PI*2);ctx.fill();ctx.restore();
}

// ─── Scene renderer ───────────────────────────────────────────────────────────
export function drawScene(ctx:CanvasRenderingContext2D, player:Fighter, bot:Fighter, frame:number, parts:Particle[], projs:Projectile[], stage:StageDef, playerDrawOverride?:(ctx:CanvasRenderingContext2D,f:Fighter,frame:number)=>void, botDrawOverride?:(ctx:CanvasRenderingContext2D,f:Fighter,frame:number)=>void) {
  const bg=ctx.createLinearGradient(0,0,0,H);
  bg.addColorStop(0,stage.bgTop);bg.addColorStop(1,stage.bgBottom);
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);

  if(stage.id==='skytower'){
    ctx.save();ctx.fillStyle='#ffffff';
    for(let i=0;i<40;i++){const sx=((i*137+frame*0.05)%W),sy=((i*97+30)%H);ctx.globalAlpha=0.3+Math.sin(frame*0.05+i)*0.15;ctx.beginPath();ctx.arc(sx,sy,0.8,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }else if(stage.id==='faultzone'){
    ctx.save();
    const lava=ctx.createLinearGradient(0,H-60,0,H);
    lava.addColorStop(0,'transparent');lava.addColorStop(1,'#ff440044');
    ctx.fillStyle=lava;ctx.fillRect(0,H-60,W,60);
    ctx.strokeStyle='#ff220022';ctx.lineWidth=1;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(100+i*130,H-80);ctx.lineTo(140+i*130,H);ctx.stroke();}
    ctx.restore();
  }

  stage.platforms.forEach((p,i)=>{
    const isMain=i===0;
    ctx.save();ctx.shadowColor=isMain?stage.glowColor:stage.platColor2;ctx.shadowBlur=isMain?14:8;
    const g=ctx.createLinearGradient(p.x,p.y,p.x,p.y+p.h);
    g.addColorStop(0,isMain?stage.platColor1:stage.platColor2);
    g.addColorStop(1,isMain?stage.platColor2+'cc':stage.platColor2+'88');
    ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(p.x,p.y,p.w,p.h,isMain?6:4);ctx.fill();
    ctx.strokeStyle=isMain?stage.glowColor:stage.platColor2;ctx.lineWidth=isMain?2:1;
    ctx.beginPath();ctx.roundRect(p.x,p.y,p.w,p.h,isMain?6:4);ctx.stroke();
    ctx.restore();
  });

  parts.forEach(p=>{
    ctx.save();ctx.globalAlpha=p.life/p.maxLife;ctx.fillStyle=p.color;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.restore();
  });
  projs.forEach(p=>drawProjectile(ctx,p));
  playerDrawOverride ? playerDrawOverride(ctx,player,frame) : drawFighter(ctx,player,frame);
  botDrawOverride ? botDrawOverride(ctx,bot,frame) : drawFighter(ctx,bot,frame);
}
