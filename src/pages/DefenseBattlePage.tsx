/**
 * 防衛戦 — DefenseBattlePage
 * ステージイベント方式（にゃんこ大戦争スタイル）
 * - 横スクロールマップ / 拠点HP / ステージスクリプト / ゴールド / ショップ
 * - ジャンプなし: 左右移動 + 攻撃のみ
 * - 全装備・全ステータス反映済み
 * - ウェーブ制廃止: 時間・城へのヒット・敵数の条件で出現
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { computeEffectiveStats, load, save, xpForLevel, type PlayerData } from '@/store/playerStore';
import { drawPlayerAsBoss } from '@/lib/bossRenderer';
import {
  drawFighter, DIFF_RARITY,
  type Fighter, type FighterState, type EffectiveStats, type WeaponDef, type ArmorDef,
} from '@/lib/gameEngine';
import { BOT_CONFIGS, type Difficulty } from '@/types/game';
import { pullWeaponOfRarity, pullArmorOfRarity } from '@/data/equipment';
import {
  drawLionelGauge, GUN_MODES, GUN_INTERVAL, GUN_DMG, GUN_SPEED, GUN_COLOR, getEffectiveReload,
  type GunMode,
} from '@/data/lionelGun';

// ── World constants ─────────────────────────────────────────────────────────
const WORLD_W  = 2500;
const GROUND_Y = 420;
const VP_W     = 1100;
const VP_H     = 520;
const P_BASE_X = 120;
const E_BASE_X = 2380;
const BASE_W   = 80;
const RESPAWN_FRAMES = 1200; // 20秒

// ── Difficulty tables ───────────────────────────────────────────────────────
const ENEMY_MULT: Record<Difficulty, number> = {
  easy: 0.5, normal: 1.0, hard: 1.6, vhard: 2.4, oni: 4.0,
};

// ── Stage event system (にゃんこ大戦争スタイル) ────────────────────────────
interface StageEvent {
  afterFrames: number;       // 最低経過フレーム数（この時間以降にトリガー）
  castleHitsMin?: number;    // 城へのヒット数がこの値以上でもトリガー（OR条件）
  ifEnemiesBelow?: number;   // 現在の敵数がこの値未満の場合のみ発動（ゲート条件）
  isBoss: boolean;
  count: number;             // 合計出現数
  interval: number;          // 1体ずつ出現する間隔（フレーム）
  repeat?: number;           // 発動後、このフレーム間隔で繰り返す
  // 実行時状態
  fired: boolean;
  pendingCount: number;
  pendingTimer: number;
  nextTriggerFrame: number;
}

function buildStageScript(diff: Difficulty): StageEvent[] {
  type Def = Omit<StageEvent, 'fired'|'pendingCount'|'pendingTimer'|'nextTriggerFrame'>;
  const defs: Record<Difficulty, Def[]> = {
    easy: [
      { afterFrames: 120,  count: 2,  interval: 70,  isBoss: false },
      { afterFrames: 420,  count: 3,  interval: 55,  isBoss: false },
      { afterFrames: 900,  count: 4,  interval: 45,  isBoss: false, ifEnemiesBelow: 5 },
      { afterFrames: 1500, count: 2,  interval: 90,  isBoss: false, repeat: 480 },
      { afterFrames: 1800, castleHitsMin: 3, count: 1, interval: 1, isBoss: true },
      { afterFrames: 3000, count: 3,  interval: 45,  isBoss: false, repeat: 720 },
    ],
    normal: [
      { afterFrames: 90,   count: 2,  interval: 55,  isBoss: false },
      { afterFrames: 300,  count: 4,  interval: 45,  isBoss: false },
      { afterFrames: 600,  count: 5,  interval: 38,  isBoss: false, ifEnemiesBelow: 6 },
      { afterFrames: 1000, count: 2,  interval: 70,  isBoss: false, repeat: 360 },
      { afterFrames: 1320, castleHitsMin: 4, count: 1, interval: 1, isBoss: true },
      { afterFrames: 2000, count: 4,  interval: 30,  isBoss: false, repeat: 540 },
      { afterFrames: 3000, castleHitsMin: 9, count: 1, interval: 1, isBoss: true },
    ],
    hard: [
      { afterFrames: 60,   count: 3,  interval: 48,  isBoss: false },
      { afterFrames: 210,  count: 5,  interval: 38,  isBoss: false },
      { afterFrames: 450,  count: 7,  interval: 30,  isBoss: false, ifEnemiesBelow: 7 },
      { afterFrames: 750,  count: 3,  interval: 60,  isBoss: false, repeat: 270 },
      { afterFrames: 1020, castleHitsMin: 4, count: 1, interval: 1, isBoss: true },
      { afterFrames: 1560, count: 6,  interval: 25,  isBoss: false, repeat: 420 },
      { afterFrames: 2400, castleHitsMin: 11, count: 1, interval: 1, isBoss: true },
    ],
    vhard: [
      { afterFrames: 45,   count: 3,  interval: 42,  isBoss: false },
      { afterFrames: 150,  count: 6,  interval: 32,  isBoss: false },
      { afterFrames: 300,  count: 8,  interval: 26,  isBoss: false, ifEnemiesBelow: 8 },
      { afterFrames: 540,  count: 3,  interval: 50,  isBoss: false, repeat: 210 },
      { afterFrames: 780,  castleHitsMin: 4, count: 1, interval: 1, isBoss: true },
      { afterFrames: 1200, count: 7,  interval: 20,  isBoss: false, repeat: 330 },
      { afterFrames: 1800, castleHitsMin: 12, count: 1, interval: 1, isBoss: true },
      { afterFrames: 2400, count: 4,  interval: 15,  isBoss: false, repeat: 150 },
    ],
    oni: [
      { afterFrames: 30,   count: 4,  interval: 36,  isBoss: false },
      { afterFrames: 100,  count: 7,  interval: 26,  isBoss: false },
      { afterFrames: 210,  count: 9,  interval: 20,  isBoss: false, ifEnemiesBelow: 10 },
      { afterFrames: 390,  count: 3,  interval: 42,  isBoss: false, repeat: 180 },
      { afterFrames: 600,  castleHitsMin: 4, count: 1, interval: 1, isBoss: true },
      { afterFrames: 840,  count: 8,  interval: 16,  isBoss: false, repeat: 280 },
      { afterFrames: 1200, castleHitsMin: 12, count: 1, interval: 1, isBoss: true },
      { afterFrames: 1680, count: 5,  interval: 12,  isBoss: false, repeat: 110 },
      { afterFrames: 2520, castleHitsMin: 20, count: 1, interval: 1, isBoss: true },
    ],
  };
  return defs[diff].map(d => ({
    ...d,
    fired: false,
    pendingCount: 0,
    pendingTimer: 0,
    nextTriggerFrame: 0,
  }));
}
const ALLY_COST: Record<Difficulty, number> = {
  easy: 80, normal: 150, hard: 280, vhard: 450, oni: 750,
};
const ALLY_STATS: Record<Difficulty, { hp: number; dmg: number; spd: number }> = {
  easy:  { hp: 100,  dmg: 8,   spd: 1.2 },
  normal:{ hp: 200,  dmg: 18,  spd: 1.6 },
  hard:  { hp: 380,  dmg: 35,  spd: 2.0 },
  vhard: { hp: 650,  dmg: 65,  spd: 2.4 },
  oni:   { hp: 1200, dmg: 130, spd: 3.0 },
};

// ── Types ───────────────────────────────────────────────────────────────────
type AllySpecialType = 'heavy' | 'archer' | 'ninja' | 'mage' | 'healer';
interface Unit {
  id: number; x: number; vx: number;
  hp: number; maxHp: number;
  damage: number;           // 蓄積ダメージ%(ノックバック増加)
  w: number; h: number;
  dir: -1 | 1;
  state: 'walk' | 'attack' | 'hit' | 'dead';
  atkCd: number; atkTimer: number;
  dmg: number; range: number; spd: number;
  color: string; isAlly: boolean;
  flash: number;
  isBoss?: boolean;
  isBow?: boolean;
  allyType?: AllySpecialType;
  weapon: WeaponDef | null;
  armor: ArmorDef | null;
  // ── 状態異常 ──
  bleedDps: number; bleedTicks: number; bleedTickTimer: number;
  stunTimer: number;
}
interface Turret {
  id: number; x: number; level: number;
  cd: number; maxCd: number; dmg: number; range: number;
  hp: number; maxHp: number;
}
interface Wall { id: number; x: number; hp: number; maxHp: number; }
interface Proj { id: number; x: number; y: number; vy: number; vx: number; dmg: number; isAlly: boolean; life: number; color?: string; }
interface Pt   { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; }

type PState = 'idle' | 'walk' | 'attack' | 'strongAttack' | 'hit' | 'dead';
type Phase  = 'battle' | 'victory' | 'defeat';

interface GS {
  px: number; pvx: number;
  php: number; pmaxHp: number;
  pdir: -1 | 1; pstate: PState; pTimer: number;
  pAtkCd: number; pInv: number;
  pRespawnTimer: number;  // >0 = dead & counting down
  pdamage: number;        // 蓄積ダメージ%(ノックバック強化に使用)
  // ── Primordial / Divine プレイヤー側状態 ──
  pPrimordialRageStacks: number;  // 原初剣: 被弾ごとに+ATK
  pPrimordialComboCount: number;  // 原初格闘: ヒットごとに+ATK、被弾でリセット
  pDivineHitCount: number;        // 神降格闘: N回ヒットでスタン
  baseHp: number; baseMaxHp: number;
  eBaseHp: number; eBaseMaxHp: number;
  gold: number;
  enemies: Unit[]; allies: Unit[];
  turrets: Turret[]; walls: Wall[];
  projs: Proj[]; pts: Pt[];
  // ── ステージイベント方式 ──
  castleHits: number;           // 城が攻撃を受けた合計回数
  stageEvents: StageEvent[];    // ステージスクリプト
  phase: Phase; frame: number; nextId: number;
  kills: number; goldEarned: number;
  currentDiff: Difficulty;
  lionelMode: GunMode;
  lionelReload: number;
}

// ── Special ally definitions ────────────────────────────────────────────────
const SPECIAL_ALLY_DEFS: Record<AllySpecialType, {
  nameJa: string; icon: string; cost: number;
  hp: number; dmg: number; spd: number; range: number; atkCd: number;
  color: string; desc: string;
}> = {
  heavy:  { nameJa: '重装兵', icon: '🛡️', cost: 320, hp: 900,  dmg: 60,  spd: 1.0, range: 40,  atkCd: 110, color: '#94a3b8', desc: 'HP大・鈍足・高火力' },
  archer: { nameJa: '弓兵',   icon: '🏹', cost: 200, hp: 260,  dmg: 42,  spd: 1.6, range: 210, atkCd: 75,  color: '#86efac', desc: '遠距離・矢攻撃' },
  ninja:  { nameJa: '忍者',   icon: '🥷', cost: 240, hp: 220,  dmg: 50,  spd: 4.0, range: 36,  atkCd: 48,  color: '#c084fc', desc: '超高速・連撃' },
  mage:   { nameJa: '魔導師', icon: '🔮', cost: 300, hp: 200,  dmg: 55,  spd: 1.2, range: 165, atkCd: 100, color: '#67e8f9', desc: '範囲攻撃・遠距離' },
  healer: { nameJa: '回復師', icon: '💚', cost: 280, hp: 280,  dmg: 200, spd: 1.4, range: 160, atkCd: 180, color: '#4ade80', desc: '味方HP大回復' },
};
function makeSpecialAlly(id: number, x: number, type: AllySpecialType): Unit {
  const def = SPECIAL_ALLY_DEFS[type];
  return {
    id, x, vx: 0,
    hp: def.hp, maxHp: def.hp, damage: 0,
    w: type === 'heavy' ? 30 : 22, h: type === 'heavy' ? 52 : 46,
    dir: 1, state: 'walk',
    atkCd: def.atkCd, atkTimer: 0,
    dmg: def.dmg, range: def.range, spd: def.spd,
    color: def.color, isAlly: true, flash: 0,
    isBoss: false, isBow: false, allyType: type,
    weapon: null, armor: null,
    bleedDps: 0, bleedTicks: 0, bleedTickTimer: 0, stunTimer: 0,
  };
}

// ── Helper ─────────────────────────────────────────────────────────────────
function makeUnit(
  id: number, x: number, isAlly: boolean, mult: number,
  isBoss = false, difficulty: Difficulty = 'normal',
): Unit {
  const base = isAlly
    ? { hp: 150, dmg: 15, spd: 1.8, color: '#22d3ee', w: 22, h: 46 }
    : { hp: 120, dmg: 12, spd: 1.4, color: '#f87171', w: 24, h: 48 };
  const bm = isBoss ? 8 : 1;
  const hp = Math.round(base.hp * mult * bm);
  // Equipment based on difficulty (enemies AND allies)
  const rarity = DIFF_RARITY[difficulty];
  const weapon = rarity ? pullWeaponOfRarity(rarity) : null;
  const armor  = rarity ? pullArmorOfRarity(rarity)  : null;
  // Boost stats if equipped
  const atkBonus = weapon ? weapon.attackBonus : 0;
  const defBonus = armor  ? armor.defenseBonus : 0;
  void defBonus; // used for reference — affects range
  const isBow = !isAlly && !isBoss && weapon?.type === 'bow';
  return {
    id, x, vx: 0, hp, maxHp: hp, damage: 0,
    w: isBoss ? 48 : base.w,
    h: isBoss ? 90 : base.h,
    dir: isAlly ? 1 : -1,
    state: 'walk',
    atkCd: isBoss ? 50 : 80,
    atkTimer: 0,
    dmg: Math.round(base.dmg * mult * bm * (1 + atkBonus * 0.5)),
    range: isBoss ? 65 : isBow ? 220 : 42,
    spd: base.spd * (isBoss ? 0.7 : 1),
    color: isBoss ? '#7c3aed' : base.color,
    isAlly, flash: 0, isBoss, isBow,
    weapon, armor,
    bleedDps: 0, bleedTicks: 0, bleedTickTimer: 0, stunTimer: 0,
  };
}

function spawnParticles(pts: Pt[], x: number, y: number | string = GROUND_Y - 30, colorOrN: string | number = '#ffffff', n = 8) {
  let color: string;
  let count: number;
  if (typeof y === 'string') {
    color = y;
    count = typeof colorOrN === 'number' ? colorOrN : n;
    y = GROUND_Y - 30;
  } else {
    color = typeof colorOrN === 'string' ? colorOrN : '#ffffff';
    count = typeof colorOrN === 'number' ? colorOrN : n;
  }
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 1.5 + Math.random() * 3;
    pts.push({ x, y: y as number, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 2,
               life: 25 + Math.random() * 20, color, size: 3 + Math.random() * 4 });
  }
}

function calcBaseHp(stats: EffectiveStats): number {
  return Math.round(600 + stats.defenseMult * 800);
}
function calcPlayerHp(stats: EffectiveStats): number {
  return Math.round(100 + stats.defenseMult * 300);
}

// ── Render helpers ─────────────────────────────────────────────────────────
const FIGHTER_DEFAULTS: Omit<Fighter,
  'pos'|'vel'|'dir'|'state'|'stateTimer'|'attackActive'|'invincible'|'color'|'weapon'|'armor'|'attackMult'|'defenseMult'|'speedMult'|'jumpMult'|'berserker'
> = {
  damage:0, stocks:0, onGround:true, jumpsLeft:0, maxJumps:0,
  botAI:false, botBehav:'approach', botDecisionTimer:0, botJumpCooldown:0,
  specialCooldown:0, maxSPCooldown:200, multiHitTimer:0,
  bowFired:false,
  bleedDamage:0, bleedTicks:0, bleedTickTimer:0,
  guardGauge:100, maxGuardGauge:100, counterCooldown:0, botGuardTimer:0,
  stunTimer:0, divineHitCount:0,
  primordialRageStacks:0, primordialComboCount:0,
};

function makeRenderFighter(gs: GS, stats: EffectiveStats, screenX: number): Fighter {
  const isAtk    = gs.pstate === 'attack';
  const isSAtk   = gs.pstate === 'strongAttack';
  const atkActive = (isAtk && gs.pTimer < 12 && gs.pTimer > 3) ||
                    (isSAtk && gs.pTimer < 20 && gs.pTimer > 6);
  return {
    ...FIGHTER_DEFAULTS,
    pos: { x: screenX, y: GROUND_Y },
    vel: { x: gs.pvx, y: 0 },
    dir: gs.pdir,
    state:       gs.pstate as FighterState,
    stateTimer:  gs.pTimer,
    attackActive: atkActive,
    invincible:  gs.pInv,
    color:       stats.playerColor,
    weapon:      stats.equippedWeapon,
    armor:       stats.equippedArmor,
    attackMult:  stats.attackMult,
    defenseMult: stats.defenseMult,
    speedMult:   stats.speedMult,
    jumpMult:    stats.jumpMult,
    berserker:   stats.berserker,
  };
}

function makeUnitFighter(u: Unit, screenX: number): Fighter {
  const atkActive = u.state === 'attack' && u.atkTimer < u.atkCd / 2;
  const fstate: FighterState =
    u.state === 'dead'   ? 'dead'   :
    u.state === 'hit'    ? 'hit'    :
    u.state === 'attack' ? 'attack' :
    'walk';
  return {
    ...FIGHTER_DEFAULTS,
    pos: { x: screenX, y: GROUND_Y },
    vel: { x: 0, y: 0 },
    dir: u.dir,
    state:       fstate,
    stateTimer:  u.atkTimer,
    attackActive: atkActive,
    invincible:  0,
    color:       u.flash > 0 ? '#ffffff' : u.color,
    weapon:      u.weapon,
    armor:       u.armor,
    attackMult:  1, defenseMult:0, speedMult:1, jumpMult:1, berserker:false,
  };
}

// ── Developer gate ─────────────────────────────────────────────────────────
function DevCodeGate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(false);

  const submit = (val: string) => {
    if (val === '0819') {
      onUnlock();
    } else if (val.length === 4) {
      setShake(true);
      setCode('');
      setTimeout(() => setShake(false), 500);
    }
  };

  const press = (d: string) => {
    const next = code + d;
    setCode(next);
    if (next.length === 4) submit(next);
  };

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center justify-center select-none gap-6">
      <div className="text-center">
        <div className="text-5xl mb-3">🔒</div>
        <h1 className="text-2xl font-black text-gray-300">開発者コードを入力してください</h1>
        <p className="text-gray-600 text-sm mt-1">このコンテンツは現在開発中です</p>
      </div>

      {/* PIN display */}
      <div className={`flex gap-3 transition-all ${shake ? 'animate-bounce' : ''}`}>
        {[0,1,2,3].map(i => (
          <div key={i}
            className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-black transition-all
              ${code.length > i ? 'border-orange-500 bg-orange-900/20 text-orange-300' : 'border-gray-700 bg-gray-900 text-gray-700'}`}>
            {code.length > i ? '●' : '○'}
          </div>
        ))}
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-2 w-56">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
          k === '' ? <div key={i} /> :
          <button key={i}
            onClick={() => k === '⌫' ? setCode(c => c.slice(0, -1)) : press(k)}
            className="h-14 rounded-xl bg-gray-800 hover:bg-gray-700 active:scale-95 border border-gray-700 text-white font-bold text-xl transition-all">
            {k}
          </button>
        ))}
      </div>

      {shake && (
        <p className="text-red-400 text-sm font-bold animate-pulse">コードが違います</p>
      )}
    </div>
  );
}

// ── Difficulty select page ─────────────────────────────────────────────────
const DIFF_STYLES: Record<Difficulty, string> = {
  easy:  'border-green-500  bg-green-900/30  text-green-300',
  normal:'border-blue-500   bg-blue-900/30   text-blue-300',
  hard:  'border-yellow-500 bg-yellow-900/30 text-yellow-300',
  vhard: 'border-red-500    bg-red-900/30    text-red-300',
  oni:   'border-rose-900   bg-rose-950/60   text-rose-400',
};

function DefenseSelectPage({ stats, onStart, onBack }: {
  stats: EffectiveStats;
  onStart: (d: Difficulty) => void;
  onBack: () => void;
}) {
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [playerData, setPlayerData] = useState<PlayerData>(() => load());
  const baseHp  = calcBaseHp(stats);
  const playerHp = calcPlayerHp(stats);

  const goldLv    = playerData.defenseGoldLv ?? 0;
  const atkLv     = playerData.defenseAtkSpeedLv ?? 0;
  const goldCost  = (goldLv + 1) * 100;
  const atkCost   = (atkLv + 1) * 150;

  const upgrade = (type: 'gold' | 'atk') => {
    const data = load();
    if (type === 'gold') {
      if ((data.defenseGoldLv ?? 0) >= 30) return;
      const cost = ((data.defenseGoldLv ?? 0) + 1) * 100;
      if (data.coins < cost) return;
      data.coins -= cost;
      data.defenseGoldLv = (data.defenseGoldLv ?? 0) + 1;
    } else {
      if ((data.defenseAtkSpeedLv ?? 0) >= 30) return;
      const cost = ((data.defenseAtkSpeedLv ?? 0) + 1) * 150;
      if (data.coins < cost) return;
      data.coins -= cost;
      data.defenseAtkSpeedLv = (data.defenseAtkSpeedLv ?? 0) + 1;
    }
    save(data);
    setPlayerData({ ...data });
  };

  return (
    <div className="w-full min-h-screen bg-gray-950 flex flex-col items-center justify-center select-none py-8 gap-4">
      <button onClick={onBack} className="absolute top-4 left-4 text-gray-400 hover:text-white text-sm">
        ← メニューへ
      </button>

      <div className="text-center mb-2">
        <h1 className="text-5xl font-black text-orange-400">🏰 防衛戦</h1>
        <p className="text-gray-400 mt-1 text-sm">
          自分の拠点を守り、敵の拠点を破壊せよ！
        </p>
      </div>

      <div className="bg-gray-900 border border-orange-800/40 rounded-2xl p-4 w-80">
        <p className="text-orange-300 font-bold text-sm mb-2 text-center">ステータス反映</p>
        <div className="grid grid-cols-2 gap-1 text-xs text-gray-300">
          <div className="flex justify-between"><span className="text-gray-500">🏰 拠点HP</span><span className="text-orange-300 font-bold">{baseHp}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">❤ 自分HP</span><span className="text-red-400 font-bold">{playerHp}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">⚔ 攻撃倍率</span><span className="text-red-400 font-bold">{Math.round(stats.attackMult * 100)}%</span></div>
          <div className="flex justify-between"><span className="text-gray-500">💨 速度倍率</span><span className="text-green-400 font-bold">{Math.round(stats.speedMult * 100)}%</span></div>
        </div>
      </div>

      {/* ── 防衛専用アップグレード ── */}
      <div className="bg-gray-900 border border-yellow-700/40 rounded-2xl p-4 w-80">
        <div className="flex items-center justify-between mb-3">
          <p className="text-yellow-300 font-bold text-sm">⚡ 防衛専用アップグレード</p>
          <span className="text-yellow-400 font-bold text-xs">🪙 {playerData.coins} コイン</span>
        </div>

        {/* 自動ゴールド生産 */}
        <div className="mb-3 bg-gray-800/60 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-yellow-200 font-bold">🪙 自動ゴールド生産</span>
            <span className={`text-xs font-black ${goldLv >= 30 ? 'text-yellow-400' : 'text-gray-400'}`}>
              Lv.{goldLv}/30
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-[10px] text-yellow-400 font-bold">
                {goldLv === 0 ? '効果なし' : `+${goldLv * 5}G/秒`}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                <div className="bg-yellow-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round(goldLv / 30 * 100)}%` }} />
              </div>
            </div>
            {goldLv < 30 ? (
              <button
                onClick={() => upgrade('gold')}
                disabled={playerData.coins < goldCost}
                className={`text-[10px] font-bold px-2 py-1.5 rounded-lg transition-all active:scale-95 whitespace-nowrap
                  ${playerData.coins >= goldCost
                    ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                {goldCost}コイン →
              </button>
            ) : (
              <span className="text-[10px] text-yellow-400 font-black px-2">MAX</span>
            )}
          </div>
        </div>

        {/* 攻撃速度 */}
        <div className="bg-gray-800/60 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-red-300 font-bold">⚔ 攻撃速度</span>
            <span className={`text-xs font-black ${atkLv >= 30 ? 'text-red-400' : 'text-gray-400'}`}>
              Lv.{atkLv}/30
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="text-[10px] text-red-400 font-bold">
                {atkLv === 0 ? '効果なし' : `攻撃CD: ${Math.max(10, 60 - atkLv)}f（基本60f）`}
              </div>
              <div className="w-full bg-gray-700 rounded-full h-1.5 mt-1">
                <div className="bg-red-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round(atkLv / 30 * 100)}%` }} />
              </div>
            </div>
            {atkLv < 30 ? (
              <button
                onClick={() => upgrade('atk')}
                disabled={playerData.coins < atkCost}
                className={`text-[10px] font-bold px-2 py-1.5 rounded-lg transition-all active:scale-95 whitespace-nowrap
                  ${playerData.coins >= atkCost
                    ? 'bg-red-700 hover:bg-red-600 text-white'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                {atkCost}コイン →
              </button>
            ) : (
              <span className="text-[10px] text-red-400 font-black px-2">MAX</span>
            )}
          </div>
        </div>
      </div>

      <div className="w-80">
        <p className="text-gray-400 text-xs mb-2 text-center">難易度（全5段階）</p>
        <div className="flex gap-1.5 flex-wrap justify-center">
          {(['easy','normal','hard','vhard','oni'] as Difficulty[]).map(d => {
            const cfg = BOT_CONFIGS[d];
            return (
              <button key={d} onClick={() => setDiff(d)}
                className={`border-2 rounded-xl px-3 py-2 text-center transition-all font-bold text-xs ${DIFF_STYLES[d]} ${diff === d ? 'scale-105 ring-2 ring-white/20' : 'opacity-50 hover:opacity-80'}`}>
                <div className="text-sm">{cfg.label}</div>
                <div className="text-[9px] font-normal opacity-70">{cfg.sub}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-80 bg-gray-900/60 border border-gray-700 rounded-xl p-3 text-xs text-gray-400">
        <p className="text-gray-300 font-bold mb-1">ルール（ステージイベント方式）</p>
        <ul className="space-y-0.5 list-disc list-inside">
          <li>左右移動・攻撃のみ（ジャンプなし）</li>
          <li>敵は時間経過・城への被弾・敵数の条件で出現</li>
          <li>全滅させても次の群れは設定条件で出現</li>
          <li>ゴールドで壁・砲台・仲間を購入</li>
          <li>敵拠点を破壊すると勝利</li>
          <li>自拠点HPが0になると敗北</li>
        </ul>
      </div>

      <button onClick={() => onStart(diff)}
        className="w-80 bg-gradient-to-r from-orange-700 to-red-700 hover:from-orange-600 hover:to-red-600 text-white font-black text-xl py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-orange-900/40">
        🏰 防衛戦開始
      </button>
    </div>
  );
}

// ── Main game page ─────────────────────────────────────────────────────────
export default function DefenseBattlePage({ onBack }: { onBack: () => void }) {
  const stats = computeEffectiveStats(load());
  const [gameStarted, setGameStarted] = useState(false);
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [shopOpen, setShopOpen] = useState(false);
  const [gamePhase, setGamePhase] = useState<Phase>('battle');
  const [uiTick, setUiTick] = useState(0); // force re-render for HUD
  const [goldConvert, setGoldConvert] = useState<{ xp: number; coins: number } | null>(null);
  const goldConvertedRef = useRef(false);

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const keysRef     = useRef<Set<string>>(new Set());
  const gsRef       = useRef<GS | null>(null);
  const rafRef      = useRef<number>(0);
  const shopOpenRef = useRef(false);
  const defUpgradesRef = useRef({ goldLv: 0, atkSpeedLv: 0 });

  // Keep shopOpenRef in sync
  useEffect(() => { shopOpenRef.current = shopOpen; }, [shopOpen]);

  const initGame = useCallback((difficulty: Difficulty) => {
    const mult    = ENEMY_MULT[difficulty];
    const baseHp  = calcBaseHp(stats);
    const php     = calcPlayerHp(stats);
    const eBaseHp = Math.round(1200 * mult);

    gsRef.current = {
      px: 400, pvx: 0,
      php, pmaxHp: php,
      pdir: 1, pstate: 'idle', pTimer: 0, pAtkCd: 0, pInv: 0,
      pRespawnTimer: 0,
      pdamage: 0,
      pPrimordialRageStacks: 0, pPrimordialComboCount: 0, pDivineHitCount: 0,
      baseHp, baseMaxHp: baseHp,
      eBaseHp, eBaseMaxHp: eBaseHp,
      gold: 0,
      enemies: [], allies: [],
      turrets: [], walls: [],
      projs: [], pts: [],
      castleHits: 0,
      stageEvents: buildStageScript(difficulty),
      phase: 'battle',
      frame: 0, nextId: 1,
      kills: 0, goldEarned: 0,
      currentDiff: difficulty,
      lionelMode: 'pistol',
      lionelReload: 0,
    };
  }, [stats]);

  const tick = useCallback((difficulty: Difficulty) => {
    const gs = gsRef.current;
    if (!gs || gs.phase === 'victory' || gs.phase === 'defeat') return;
    const mult = ENEMY_MULT[difficulty];

    gs.frame++;

    // ── Auto gold production ─────────────────────────────────────────────────
    if (gs.frame % 60 === 0 && defUpgradesRef.current.goldLv > 0) {
      gs.gold += defUpgradesRef.current.goldLv * 5;
    }

    // ── Stage event system: イベントのトリガー判定 ──────────────────────────
    const activeEnemyCount = gs.enemies.filter(e => e.state !== 'dead').length;
    for (const ev of gs.stageEvents) {
      // 繰り返しイベント: 次のトリガーフレームに達したか
      if (ev.fired && ev.repeat != null && gs.frame >= ev.nextTriggerFrame) {
        ev.fired = false; // 再発動可能にリセット
      }
      if (ev.fired) continue;

      // トリガー条件: afterFrames OR castleHitsMin（どちらかを満たせばOK）
      const timeOk  = gs.frame >= ev.afterFrames;
      const hitsOk  = ev.castleHitsMin != null && gs.castleHits >= ev.castleHitsMin;
      if (!timeOk && !hitsOk) continue;

      // ゲート条件: 現在の敵数が閾値未満
      if (ev.ifEnemiesBelow != null && activeEnemyCount >= ev.ifEnemiesBelow) continue;

      // トリガー!
      ev.fired         = true;
      ev.pendingCount  = ev.count;
      ev.pendingTimer  = 0;
      if (ev.repeat != null) ev.nextTriggerFrame = gs.frame + ev.repeat;
    }

    // ── Stage event system: 待機中イベントからスポーン ──────────────────────
    for (const ev of gs.stageEvents) {
      if (ev.pendingCount <= 0) continue;
      ev.pendingTimer--;
      if (ev.pendingTimer <= 0) {
        const offset = (Math.random() - 0.5) * 180;
        gs.enemies.push(makeUnit(gs.nextId++, E_BASE_X - BASE_W - 20 + offset, false, mult, ev.isBoss, gs.currentDiff));
        ev.pendingCount--;
        ev.pendingTimer = ev.interval;
      }
    }

    // ── Respawn timer ────────────────────────────────────────────────────────
    if (gs.pRespawnTimer > 0) {
      gs.pRespawnTimer--;
      if (gs.pRespawnTimer <= 0 && gs.baseHp > 0) {
        gs.php     = gs.pmaxHp;
        gs.pdamage = 0;
        gs.px      = P_BASE_X + BASE_W + 60;
        gs.pvx     = 0;
        gs.pstate  = 'idle';
        gs.pTimer  = 0;
        gs.pInv    = 120; // 無敵時間
        spawnParticles(gs.pts, gs.px, '#22c55e', 16);
      }
    }

    // ── Player input ────────────────────────────────────────────────────────
    const left  = keysRef.current.has('ArrowLeft')  || keysRef.current.has('a') || keysRef.current.has('A');
    const right = keysRef.current.has('ArrowRight') || keysRef.current.has('d') || keysRef.current.has('D');
    const atk   = keysRef.current.has('z') || keysRef.current.has('Z') || keysRef.current.has('j') || keysRef.current.has('J');
    const satk  = keysRef.current.has('x') || keysRef.current.has('X') || keysRef.current.has('k') || keysRef.current.has('K');
    const isLionel = stats.selectedCharacter === 'lionel';
    const lionelStars = isLionel ? ((load().bossUnlockLv ?? {})['lionel'] ?? 0) : 0;

    if (gs.lionelReload > 0) gs.lionelReload--;

    if (gs.pstate !== 'hit' && gs.pstate !== 'dead') {
      const spd = 3.5 * stats.speedMult;
      if (left)  { gs.pvx = -spd; gs.pdir = -1; }
      else if (right) { gs.pvx = spd; gs.pdir = 1; }
      else gs.pvx *= 0.7;

      if (isLionel && (atk || satk) && gs.lionelReload <= 0) {
        // ── Lionel gun fire ───────────────────────────────────────────────
        const mode = gs.lionelMode;
        const spd2 = GUN_SPEED[mode] * gs.pdir;
        gs.projs.push({
          id: gs.nextId++,
          x: gs.px + gs.pdir * 28, y: GROUND_Y - 40,
          vx: spd2, vy: 0,
          dmg: Math.round(GUN_DMG[mode] * stats.attackMult),
          isAlly: true, life: 240, color: GUN_COLOR[mode],
        });
        if (mode === 'dual') {
          gs.projs.push({
            id: gs.nextId++,
            x: gs.px + gs.pdir * 28, y: GROUND_Y - 54,
            vx: spd2, vy: 0,
            dmg: Math.round(GUN_DMG[mode] * stats.attackMult),
            isAlly: true, life: 240, color: GUN_COLOR[mode],
          });
        }
        gs.lionelReload = getEffectiveReload(mode, lionelStars);
        gs.pstate = 'attack';
        gs.pTimer = 8;
      } else if (!isLionel && (atk || satk) && gs.pAtkCd <= 0 && gs.pstate !== 'attack' && gs.pstate !== 'strongAttack') {
        const asm = stats.equippedWeapon?.attackSpeedMult ?? 1.0;
        gs.pstate = satk ? 'strongAttack' : 'attack';
        gs.pTimer = satk ? Math.max(10, Math.round(28 * asm)) : Math.max(10, Math.round(18 * asm));
        gs.pAtkCd = Math.max(10, 60 - defUpgradesRef.current.atkSpeedLv);
      } else if (isLionel && (atk || satk) && gs.pAtkCd <= 0 && gs.pstate !== 'attack' && gs.pstate !== 'strongAttack') {
        // Lionel: melee fallback when gun is reloading
        const asm = stats.equippedWeapon?.attackSpeedMult ?? 1.0;
        gs.pstate = satk ? 'strongAttack' : 'attack';
        gs.pTimer = satk ? Math.max(10, Math.round(28 * asm)) : Math.max(10, Math.round(18 * asm));
        gs.pAtkCd = Math.max(10, 60 - defUpgradesRef.current.atkSpeedLv);
      }
    }

    // Move player
    gs.px += gs.pvx;
    gs.px  = Math.max(P_BASE_X + BASE_W / 2 + 20, Math.min(E_BASE_X - BASE_W / 2 - 20, gs.px));
    if (gs.pAtkCd  > 0) gs.pAtkCd--;
    if (gs.pInv    > 0) gs.pInv--;

    // Player state timer
    if (gs.pstate === 'attack' || gs.pstate === 'strongAttack' || gs.pstate === 'hit') {
      gs.pTimer--;
      if (gs.pTimer <= 0) gs.pstate = 'idle';
    } else if (gs.pstate !== 'dead' && Math.abs(gs.pvx) > 0.2) {
      gs.pstate = 'walk';
    } else if (gs.pstate === 'walk') {
      gs.pstate = 'idle';
    }

    // ── Player attack (melee / ranged) ─────────────────────────────────────
    const _asm2       = stats.equippedWeapon?.attackSpeedMult ?? 1.0;
    const _normalDur  = Math.max(10, Math.round(18 * _asm2));
    const _strongDur  = Math.max(10, Math.round(28 * _asm2));
    const _curDur     = gs.pstate === 'strongAttack' ? _strongDur : _normalDur;
    const atkIsActive = (gs.pstate === 'attack' || gs.pstate === 'strongAttack') &&
                        gs.pTimer === Math.floor(_curDur / 2);
    if (atkIsActive) {
      const weapon        = stats.equippedWeapon;
      const isBow         = weapon?.type === 'bow';
      const rageBonus     = (weapon?.vengefulRage  ?? 0) * gs.pPrimordialRageStacks;
      const comboBonus    = (weapon?.comboRageBonus ?? 0) * gs.pPrimordialComboCount;
      const effectiveMult = stats.attackMult * (1 + rageBonus + comboBonus);

      if (isBow) {
        // ── 弓: 矢の発射 ──────────────────────────────────────────────────
        const isCharged  = gs.pstate === 'strongAttack';
        const cMult      = isCharged ? (weapon!.chargedMult ?? 2.0) : 1.0;
        const arrowDmg   = Math.round(Math.min((weapon!.arrowDamage ?? 10) * cMult, 60) * effectiveMult);
        const arrowSpd   = (weapon!.arrowSpeed ?? 7) * (isCharged ? 0.75 : 1.0);
        const arrowColor = weapon!.color;
        gs.projs.push({
          id: gs.nextId++,
          x: gs.px + gs.pdir * 32, y: GROUND_Y - 42,
          vx: gs.pdir * arrowSpd, vy: 0,
          dmg: arrowDmg, isAlly: true,
          life: isCharged ? 40 : 29, color: arrowColor,
        });
        spawnParticles(gs.pts, gs.px + gs.pdir * 20, GROUND_Y - 42, arrowColor, 4);
        // 神降弓: 自動上昇矢
        if ((weapon!.autoArrowChance ?? 0) > 0 && Math.random() < weapon!.autoArrowChance!) {
          gs.projs.push({
            id: gs.nextId++,
            x: gs.px, y: GROUND_Y - 52,
            vx: 0, vy: -10,
            dmg: Math.round((weapon!.arrowDamage ?? 10) * 0.65 * effectiveMult),
            isAlly: true, life: 45, color: arrowColor,
          });
        }
        // 原初弓: 2本同時射
        if ((weapon!.doubleArrowChance ?? 0) > 0 && Math.random() < weapon!.doubleArrowChance!) {
          gs.projs.push({
            id: gs.nextId++,
            x: gs.px + gs.pdir * 42, y: GROUND_Y - 52,
            vx: gs.pdir * arrowSpd * 1.05, vy: -0.6,
            dmg: arrowDmg, isAlly: true, life: isCharged ? 40 : 29, color: arrowColor,
          });
        }
      } else {
        // ── 近接攻撃 ─────────────────────────────────────────────────────
        const kbm       = weapon?.knockbackMult ?? 1.0;
        const baseRange = gs.pstate === 'strongAttack' ? 80 : 55;
        const atkRange  = weapon?.type === 'spear' ? baseRange * 1.5 : baseRange;
        const atkX      = gs.px + gs.pdir * atkRange * 0.6;
        const baseDmg   = gs.pstate === 'strongAttack' ? 18 : 10;
        const atkDmg    = Math.round(baseDmg * effectiveMult);

        // 最近傍の敵を探す
        let closestEnemy: { unit: typeof gs.enemies[0]; dist: number } | null = null;
        for (const e of gs.enemies) {
          if (e.state === 'dead') continue;
          const dx = Math.abs(atkX - e.x);
          if (dx < atkRange * 0.8) {
            if (!closestEnemy || dx < closestEnemy.dist) closestEnemy = { unit: e, dist: dx };
          }
        }
        if (closestEnemy) {
          const e = closestEnemy.unit;
          // 原初斧: 裂傷中の敵へのボーナスダメージ
          const bleedBonus = ((weapon?.bleedTargetDmgBonus ?? 0) > 0 && e.bleedTicks > 0)
            ? (1 + weapon!.bleedTargetDmgBonus!) : 1.0;
          const finalDmg = Math.round(atkDmg * bleedBonus);

          e.hp      -= finalDmg;
          e.flash    = 8;
          e.state    = 'hit';
          e.atkTimer = e.atkCd;
          const eBasePow = (gs.pstate === 'strongAttack' ? 9 : 6) * effectiveMult * kbm;
          const eScale   = 1 + e.damage * 0.015;
          const eKbDir   = e.x >= gs.px ? 1 : -1;
          e.vx           = eKbDir * Math.min(eBasePow * eScale, 28);
          e.damage      += finalDmg;
          spawnParticles(gs.pts, e.x, '#fbbf24', 5);

          // ── 斧: 裂傷（継続ダメージ）付与 ───────────────────────────────
          if (weapon?.type === 'axe' && (weapon.bleedDps ?? 0) > 0) {
            e.bleedDps       = Math.max(e.bleedDps, weapon.bleedDps!);
            e.bleedTicks    += weapon.bleedTicks ?? 3;
            e.bleedTickTimer = e.bleedTickTimer > 0 ? e.bleedTickTimer : 55;
            spawnParticles(gs.pts, e.x, '#dc2626', 5);
          }
          // ── 杖: 命中時に飛弾発射 ───────────────────────────────────────
          if (weapon?.type === 'staff' && Math.random() < (weapon.projChance ?? 0)) {
            gs.projs.push({
              id: gs.nextId++,
              x: gs.px + gs.pdir * 24, y: GROUND_Y - 38,
              vx: gs.pdir * 7, vy: 0,
              dmg: Math.round(6 * effectiveMult * 0.7),
              isAlly: true, life: 65, color: weapon.color,
            });
            spawnParticles(gs.pts, gs.px, weapon.color, 4);
          }
          // ── 杖神降: 命中でHP回復（蓄積ダメージ軽減） ───────────────────
          if ((weapon?.healOnHit ?? 0) > 0 && weapon?.type === 'staff') {
            gs.pdamage = Math.max(0, gs.pdamage - weapon.healOnHit!);
          }
          // ── 杖原初: ライフスティール ──────────────────────────────────
          if ((weapon?.lifeStealOnHit ?? 0) > 0 && weapon?.type === 'staff') {
            gs.pdamage = Math.max(0, gs.pdamage - weapon.lifeStealOnHit!);
            spawnParticles(gs.pts, gs.px, '#c084fc', 6);
          }
          // ── 槍神降: スタン付与 ────────────────────────────────────────
          if ((weapon?.stunOnHitChance ?? 0) > 0 && Math.random() < weapon!.stunOnHitChance!) {
            e.stunTimer = weapon!.stunDuration ?? 60;
            spawnParticles(gs.pts, e.x, '#fbbf24', 12);
          }
          // ── 槍原初: 爆発ノックバック ─────────────────────────────────
          if ((weapon?.explosionChance ?? 0) > 0 && Math.random() < weapon!.explosionChance!) {
            e.vx += eKbDir * 18;
            spawnParticles(gs.pts, e.x, '#ff6b35', 20);
            spawnParticles(gs.pts, e.x, '#ffd700', 10);
          }
          // ── 格闘神降: N回ヒットでスタン ─────────────────────────────
          if ((weapon?.stunEvery ?? 0) > 0 && weapon?.type === 'fighting') {
            gs.pDivineHitCount++;
            if (gs.pDivineHitCount >= weapon.stunEvery!) {
              gs.pDivineHitCount = 0;
              e.stunTimer = 70;
              spawnParticles(gs.pts, e.x, '#fbbf24', 18);
            }
          }
          // ── 原初格闘: コンボカウント増加 ─────────────────────────────
          if ((weapon?.comboRageBonus ?? 0) > 0) {
            gs.pPrimordialComboCount++;
            spawnParticles(gs.pts, gs.px + gs.pdir * 16, GROUND_Y - 55, '#c084fc', 3);
          }

          if (e.hp <= 0) {
            e.state = 'dead';
            const reward = e.isBoss ? 300 : 30 + gs.kills * 2;
            gs.gold += reward; gs.goldEarned += reward; gs.kills++;
            spawnParticles(gs.pts, e.x, e.color, 14);
          }
        }
        // 敵拠点への直接攻撃
        if (Math.abs(gs.px - E_BASE_X) < 100) {
          gs.eBaseHp = Math.max(0, gs.eBaseHp - atkDmg);
          spawnParticles(gs.pts, E_BASE_X, '#a78bfa', 6);
        }
      }
    }

    // ── Update enemies ──────────────────────────────────────────────────────
    for (const e of gs.enemies) {
      if (e.state === 'dead') continue;
      if (e.flash > 0) e.flash--;

      // ── 裂傷（Bleed）ティック ───────────────────────────────────────────
      if (e.bleedTicks > 0) {
        e.bleedTickTimer--;
        if (e.bleedTickTimer <= 0) {
          e.hp -= e.bleedDps;
          e.bleedTicks--;
          e.bleedTickTimer = e.bleedTicks > 0 ? 55 : 0;
          e.flash = Math.max(e.flash, 5);
          spawnParticles(gs.pts, e.x, '#dc2626', 2);
          if (e.hp <= 0) {
            e.state = 'dead';
            const reward = e.isBoss ? 300 : 30 + gs.kills * 2;
            gs.gold += reward; gs.goldEarned += reward; gs.kills++;
            spawnParticles(gs.pts, e.x, e.color, 12);
            continue;
          }
        }
      }

      // ── スタン: 移動・攻撃不可 ─────────────────────────────────────────
      if (e.stunTimer > 0) {
        e.stunTimer--;
        e.flash = Math.max(e.flash, 3);
        e.vx *= 0.72;
        e.x  += e.vx;
        e.x = Math.max(P_BASE_X, Math.min(WORLD_W, e.x));
        continue;
      }

      // ── ノックバック速度の適用と減衰 ──────────────────────────────────────
      e.x  += e.vx;
      e.vx *= 0.72;
      if (Math.abs(e.vx) < 0.2) e.vx = 0;
      e.x = Math.max(P_BASE_X, Math.min(WORLD_W, e.x));

      // ── hit状態: スタンカウントダウン（移動はそのまま継続） ───────────────
      const inHit = e.state === 'hit';
      if (inHit) {
        e.atkTimer--;
        if (e.atkTimer <= 0) { e.state = 'walk'; }
        // hit中も前進継続（速度は半減）
        e.x += e.dir * e.spd * 0.4;
        continue; // 攻撃はしない
      }

      // ── ターゲット選択: 壁/砲台 > 味方 > プレイヤー(通り道のみ) > 拠点 ─
      let targetX      = P_BASE_X;
      let targetIsWall = false;
      // 壁チェック（左側の壁を優先）
      for (const w of gs.walls) {
        if (w.hp > 0 && w.x < e.x) {
          if (Math.abs(w.x - e.x) < Math.abs(targetX - e.x) || targetX === P_BASE_X) {
            targetX = w.x;
            targetIsWall = true;
          }
        }
      }
      // 砲台チェック（壁と同様に障害物として扱う）
      for (const t of gs.turrets) {
        if (t.hp > 0 && t.x < e.x) {
          if (Math.abs(t.x - e.x) < Math.abs(targetX - e.x)) {
            targetX = t.x;
            targetIsWall = true; // 砲台も障害物扱い
          }
        }
      }
      // 味方チェック（障害物より近い場合のみ上書き）
      for (const a of gs.allies) {
        if (a.state !== 'dead' && a.x < e.x) {
          if (Math.abs(a.x - e.x) < Math.abs(targetX - e.x)) {
            targetX = a.x;
            targetIsWall = false;
          }
        }
      }
      // プレイヤーチェック（左側にいて、かつ障害物より近い場合のみ）
      if (gs.pstate !== 'dead' && gs.px < e.x && Math.abs(gs.px - e.x) < Math.abs(targetX - e.x)) {
        targetX = gs.px;
        targetIsWall = false;
      }

      const distToTarget = Math.abs(targetX - e.x);
      if (distToTarget > e.range) {
        // 目標に向かって歩く
        e.x    += e.dir * e.spd;
        e.state = 'walk';
      } else {
        // 攻撃フェーズ
        e.state = 'attack';
        e.atkTimer--;
        if (e.atkTimer <= 0) {
          e.atkTimer = e.atkCd;

          if (e.isBow) {
            // ── 弓ユニット: 射程内で停止して矢を放つ ──────────────────
            const arrVx = e.dir * 5;
            gs.projs.push({
              id: gs.nextId++,
              x: e.x + e.dir * 20, y: GROUND_Y - 42,
              vx: arrVx, vy: 0,
              dmg: e.dmg,
              isAlly: false,
              life: 55,
              color: e.weapon?.color ?? '#f87171',
            });
            spawnParticles(gs.pts, e.x + e.dir * 12, GROUND_Y - 42, e.weapon?.color ?? '#f87171', 3);
          } else if (targetIsWall) {
            // ── 壁または砲台を攻撃 ──────────────────────────────────────
            const wall = gs.walls.find(w => w.hp > 0 && Math.abs(w.x - e.x) <= e.range * 1.2);
            if (wall) {
              wall.hp -= e.dmg;
              spawnParticles(gs.pts, wall.x, '#78716c', 4);
              if (wall.hp <= 0) wall.hp = 0;
            } else {
              // 砲台を攻撃
              const turret = gs.turrets.find(t => t.hp > 0 && Math.abs(t.x - e.x) <= e.range * 1.2);
              if (turret) {
                turret.hp -= e.dmg;
                spawnParticles(gs.pts, turret.x, '#f59e0b', 4);
                if (turret.hp <= 0) {
                  turret.hp = 0;
                  gs.turrets = gs.turrets.filter(t => t.hp > 0);
                  spawnParticles(gs.pts, turret.x, '#ef4444', 10);
                }
              }
            }
          } else {
            // ── 拠点攻撃（常に拠点がメインターゲット）────────────────────
            // プレイヤーが射程内なら同時にヒット（通り道に当たる）
            if (gs.pInv <= 0 && gs.pstate !== 'dead' && Math.abs(gs.px - e.x) <= e.range * 1.2) {
              gs.php  -= e.dmg;
              gs.pInv  = 45;
              gs.pstate = 'hit';
              gs.pTimer = 18;
              const defMul  = Math.max(0.35, 1 - stats.defenseMult);
              const basePow = 5 + e.dmg * 0.6;
              const scale   = 1 + gs.pdamage * 0.015;
              const kbForce = basePow * scale * defMul;
              const kbDir   = gs.px <= e.x ? -1 : 1;
              gs.pvx        = kbDir * Math.min(kbForce, 28);
              gs.pdamage    += e.dmg * 1.2;
              // 原初剣: 被弾でスタック増加
              if ((stats.equippedWeapon?.vengefulRage ?? 0) > 0) gs.pPrimordialRageStacks++;
              // 原初格闘: 被弾でコンボリセット
              if ((stats.equippedWeapon?.comboRageBonus ?? 0) > 0) gs.pPrimordialComboCount = 0;
              spawnParticles(gs.pts, gs.px, '#ef4444', 6);
              if (gs.php <= 0) {
                gs.php    = 0;
                gs.pvx    = 0; // 死亡時に速度リセット（死体が動かないように）
                gs.pstate = 'dead';
                if (gs.baseHp > 0) gs.pRespawnTimer = RESPAWN_FRAMES;
              }
            }
            // 味方ユニットへのヒット
            const ally = gs.allies.find(a => a.state !== 'dead' && Math.abs(a.x - e.x) <= e.range * 1.2);
            if (ally) {
              ally.hp -= e.dmg;
              ally.flash = 6;
              spawnParticles(gs.pts, ally.x, '#f87171', 4);
              if (ally.hp <= 0) ally.state = 'dead';
            }
            // 拠点への直接ダメージ（射程内に来たら必ず攻撃）
            if (Math.abs(e.x - P_BASE_X) <= e.range * 1.5 + BASE_W / 2) {
              gs.baseHp -= e.dmg;
              gs.castleHits++;
              spawnParticles(gs.pts, P_BASE_X, '#f97316', 5);
              if (gs.baseHp <= 0) {
                gs.baseHp = 0;
                gs.phase  = 'defeat';
              }
            }
          }
        }
      }
    }

    // ── Update allies ───────────────────────────────────────────────────────
    for (const a of gs.allies) {
      if (a.state === 'dead') continue;
      if (a.flash > 0) a.flash--;

      // ── 回復師: 仲間のHPを回復する（戦闘とは別行動） ─────────────────────
      if (a.allyType === 'healer') {
        a.atkTimer--;
        if (a.atkTimer <= 0) {
          a.atkTimer = a.atkCd;
          let healTarget: Unit | null = null;
          let lowestPct = 0.95;
          for (const a2 of gs.allies) {
            if (a2.id === a.id || a2.state === 'dead') continue;
            const pct = a2.hp / a2.maxHp;
            if (pct < lowestPct && Math.abs(a2.x - a.x) <= a.range) {
              lowestPct = pct; healTarget = a2;
            }
          }
          if (healTarget) {
            healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + a.dmg);
            healTarget.flash = 6;
            spawnParticles(gs.pts, healTarget.x, '#4ade80', 8);
            a.state = 'attack';
          }
        }
        // 仲間の中央付近に寄り添って歩く
        const liveAllies = gs.allies.filter(a2 => a2.state !== 'dead' && a2.id !== a.id);
        const centerX = liveAllies.length > 0
          ? liveAllies.reduce((s, a2) => s + a2.x, 0) / liveAllies.length
          : gs.px;
        if (Math.abs(a.x - centerX) > 60) {
          a.x += (centerX > a.x ? 1 : -1) * a.spd;
          if (a.state !== 'attack') a.state = 'walk';
        } else if (a.state !== 'attack') {
          a.state = 'walk';
        }
        continue;
      }

      // Find nearest enemy
      let nearestEnemy: Unit | null = null;
      let nearestDist = Infinity;
      for (const e of gs.enemies) {
        if (e.state === 'dead') continue;
        const d = Math.abs(e.x - a.x);
        if (d < nearestDist) { nearestDist = d; nearestEnemy = e; }
      }
      if (!nearestEnemy) {
        // Attack enemy base if in range; otherwise walk toward it
        if (Math.abs(a.x - E_BASE_X) <= a.range) {
          a.state = 'attack';
          a.atkTimer--;
          if (a.atkTimer <= 0) {
            a.atkTimer = a.atkCd;
            gs.eBaseHp = Math.max(0, gs.eBaseHp - a.dmg);
            spawnParticles(gs.pts, E_BASE_X, '#a78bfa', 4);
          }
        } else {
          a.x    += a.spd;
          a.state = 'walk';
          // 敵拠点を越えないようにクランプ
          if (a.x > E_BASE_X) a.x = E_BASE_X;
        }
      } else if (nearestDist > a.range) {
        // 最近傍の敵の方向へ移動（常に正しい向きに）
        const toEnemy = nearestEnemy.x > a.x ? 1 : -1;
        a.x    += toEnemy * a.spd;
        a.dir   = toEnemy;
        a.state = 'walk';
      } else {
        a.state = 'attack';
        a.atkTimer--;
        if (a.atkTimer <= 0) {
          a.atkTimer = a.atkCd;
          if (a.allyType === 'archer') {
            // 弓兵: プロジェクタイルを発射
            gs.projs.push({
              id: gs.nextId++,
              x: a.x + 20, y: GROUND_Y - 42,
              vx: nearestEnemy.x > a.x ? 9 : -9, vy: 0,
              dmg: a.dmg, isAlly: true, life: 100, color: '#86efac',
            });
            spawnParticles(gs.pts, a.x + 20, GROUND_Y - 42, '#86efac', 3);
          } else if (a.allyType === 'mage') {
            // 魔導師: 射程内の全敵にAOEダメージ
            for (const e2 of gs.enemies) {
              if (e2.state === 'dead') continue;
              if (Math.abs(e2.x - a.x) <= a.range) {
                e2.hp -= a.dmg;
                e2.flash = 5;
                spawnParticles(gs.pts, e2.x, '#67e8f9', 3);
                if (e2.hp <= 0) {
                  e2.state = 'dead';
                  const r2 = e2.isBoss ? 300 : 30 + gs.kills * 2;
                  gs.gold += r2; gs.goldEarned += r2; gs.kills++;
                  spawnParticles(gs.pts, e2.x, e2.color, 10);
                }
              }
            }
            spawnParticles(gs.pts, a.x, '#67e8f9', 10);
          } else {
            // 通常近接攻撃（戦士・重装兵・忍者）
            nearestEnemy.hp -= a.dmg;
            nearestEnemy.flash = 5;
            spawnParticles(gs.pts, nearestEnemy.x, a.allyType === 'ninja' ? '#c084fc' : '#22d3ee', 4);
            if (nearestEnemy.hp <= 0) {
              nearestEnemy.state = 'dead';
              const reward = nearestEnemy.isBoss ? 300 : 30 + gs.kills * 2;
              gs.gold      += reward;
              gs.goldEarned += reward;
              gs.kills++;
              spawnParticles(gs.pts, nearestEnemy.x, nearestEnemy.color, 12);
            }
          }
        }
      }
    }

    // ── Turrets shoot ───────────────────────────────────────────────────────
    for (const t of gs.turrets) {
      t.cd--;
      if (t.cd <= 0) {
        // Find nearest enemy in range
        let target: Unit | null = null;
        let dist = Infinity;
        for (const e of gs.enemies) {
          if (e.state === 'dead') continue;
          const d = Math.abs(e.x - t.x);
          if (d < t.range && d < dist) { dist = d; target = e; }
        }
        if (target) {
          t.cd = t.maxCd;
          gs.projs.push({
            id: gs.nextId++,
            x: t.x, y: GROUND_Y - 40,
            vx: target.x > t.x ? 6 + t.level : -6 - t.level,
            vy: -1,
            dmg: t.dmg,
            isAlly: true,
            life: 120, // 2秒で自動消滅
          });
          spawnParticles(gs.pts, t.x, '#f59e0b', 3);
        }
      }
    }

    // ── Projectiles ─────────────────────────────────────────────────────────
    for (let i = gs.projs.length - 1; i >= 0; i--) {
      const p = gs.projs[i];
      // ☆5 自動追尾 — ally projs home toward nearest enemy
      if (lionelStars >= 5 && p.isAlly) {
        let nearX = -1, nearDist = Infinity;
        for (const e of gs.enemies) {
          if (e.state === 'dead') continue;
          const d = Math.abs(e.x - p.x);
          if (d < nearDist) { nearDist = d; nearX = e.x; }
        }
        if (nearX >= 0) {
          const dir2 = nearX > p.x ? 1 : -1;
          p.vx += dir2 * 0.4;
          if (Math.abs(p.vx) > 14) p.vx = dir2 * 14;
        }
      }
      p.x += p.vx; p.y += p.vy;
      p.life--;
      if (p.life <= 0 || p.x < 0 || p.x > WORLD_W) { gs.projs.splice(i, 1); continue; }
      let hit = false;
      if (p.isAlly) {
        for (const e of gs.enemies) {
          if (e.state === 'dead') continue;
          if (Math.abs(p.x - e.x) < e.w / 2 + 6) {
            e.hp   -= p.dmg;
            e.flash = 5;
            spawnParticles(gs.pts, e.x, '#fbbf24', 4);
            if (e.hp <= 0) {
              e.state = 'dead';
              const reward = e.isBoss ? 300 : 30 + gs.kills * 2;
              gs.gold      += reward;
              gs.goldEarned += reward;
              gs.kills++;
              spawnParticles(gs.pts, e.x, e.color, 10);
            }
            hit = true; break;
          }
        }
      } else {
        // ── 敵のプロジェクタイル: プレイヤー・味方・壁にヒット ──────────────
        // プレイヤーヒット
        if (!hit && gs.pInv <= 0 && gs.pstate !== 'dead' && gs.pRespawnTimer <= 0 && Math.abs(p.x - gs.px) < 16) {
          gs.php   -= p.dmg;
          gs.pInv   = 45;
          gs.pstate = 'hit';
          gs.pTimer = 18;
          const defMul  = Math.max(0.35, 1 - stats.defenseMult);
          const basePow = 5 + p.dmg * 0.6;
          const scale   = 1 + gs.pdamage * 0.015;
          const kbForce = basePow * scale * defMul;
          gs.pvx        = (gs.px <= p.x ? -1 : 1) * Math.min(kbForce, 28);
          gs.pdamage    += p.dmg * 1.2;
          if ((stats.equippedWeapon?.vengefulRage ?? 0) > 0) gs.pPrimordialRageStacks++;
          if ((stats.equippedWeapon?.comboRageBonus ?? 0) > 0) gs.pPrimordialComboCount = 0;
          spawnParticles(gs.pts, gs.px, '#ef4444', 6);
          if (gs.php <= 0) {
            gs.php    = 0;
            gs.pvx    = 0;
            gs.pstate = 'dead';
            if (gs.baseHp > 0) gs.pRespawnTimer = RESPAWN_FRAMES;
          }
          hit = true;
        }
        // 味方ユニットヒット
        if (!hit) {
          const hitAlly = gs.allies.find(a => a.state !== 'dead' && Math.abs(a.x - p.x) < a.w / 2 + 6);
          if (hitAlly) {
            hitAlly.hp -= p.dmg;
            hitAlly.flash = 6;
            spawnParticles(gs.pts, hitAlly.x, '#f87171', 4);
            if (hitAlly.hp <= 0) hitAlly.state = 'dead';
            hit = true;
          }
        }
        // 壁にヒット（敵の矢を遮断）
        if (!hit) {
          const hitWall = gs.walls.find(w => w.hp > 0 && Math.abs(w.x - p.x) < 18);
          if (hitWall) {
            hitWall.hp -= p.dmg;
            spawnParticles(gs.pts, hitWall.x, '#78716c', 3);
            if (hitWall.hp <= 0) hitWall.hp = 0;
            hit = true;
          }
        }
      }
      if (hit) gs.projs.splice(i, 1);
    }

    // ── Particles ───────────────────────────────────────────────────────────
    for (let i = gs.pts.length - 1; i >= 0; i--) {
      const p = gs.pts[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.15;
      p.life--;
      if (p.life <= 0) gs.pts.splice(i, 1);
    }

    // ── Clean dead units ────────────────────────────────────────────────────
    gs.enemies = gs.enemies.filter(e => e.state !== 'dead' || gs.pts.some(p => p.color === e.color));
    gs.allies  = gs.allies.filter(a => a.state !== 'dead');
    gs.walls   = gs.walls.filter(w => w.hp > 0);
    gs.enemies = gs.enemies.filter(e => !(e.state === 'dead'));

    // ── Check victory ─────────────────────────────────────────────────────
    if (gs.eBaseHp <= 0) {
      gs.phase = 'victory';
    }
  }, [stats]);

  // ── Render ────────────────────────────────────────────────────────────────
  const render = useCallback((ctx: CanvasRenderingContext2D) => {
    const gs = gsRef.current;
    if (!gs) return;

    const camX    = Math.max(0, Math.min(WORLD_W - VP_W, gs.px - VP_W / 2));
    const toScreen = (wx: number) => wx - camX;

    ctx.clearRect(0, 0, VP_W, VP_H);

    // ── Sky (戦場スタイル) ─────────────────────────────────────────────────
    const sky = ctx.createLinearGradient(0, 0, 0, VP_H);
    sky.addColorStop(0, '#0f172a');
    sky.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VP_W, VP_H);

    // Stars
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 137 + gs.frame * 0.03) % VP_W);
      const sy = ((i * 97 + 20) % (GROUND_Y - 20));
      ctx.globalAlpha = 0.2 + Math.sin(gs.frame * 0.04 + i) * 0.12;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── Sub-ground fill ────────────────────────────────────────────────────
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, GROUND_Y + 18, VP_W, VP_H - GROUND_Y - 18);

    // ── Ground platform (glowing, like main game) ──────────────────────────
    ctx.save();
    ctx.shadowColor = '#6366f1';
    ctx.shadowBlur  = 18;
    const gGrad = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 20);
    gGrad.addColorStop(0, '#6366f1');
    gGrad.addColorStop(1, '#4338ca');
    ctx.fillStyle = gGrad;
    ctx.beginPath();
    ctx.roundRect(-10, GROUND_Y, VP_W + 20, 20, 4);
    ctx.fill();
    ctx.strokeStyle = '#a5b4fc';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.roundRect(-10, GROUND_Y, VP_W + 20, 20, 4);
    ctx.stroke();
    ctx.restore();

    // ── Player base ────────────────────────────────────────────────────────
    const pbsx = toScreen(P_BASE_X);
    if (pbsx > -BASE_W - 60 && pbsx < VP_W + 60) {
      const hpPct = gs.baseHp / gs.baseMaxHp;
      const bCol  = hpPct > 0.3 ? '#1e3a8a' : '#7f1d1d';
      ctx.save();
      ctx.shadowColor = hpPct > 0.3 ? '#3b82f6' : '#ef4444';
      ctx.shadowBlur  = 12;
      ctx.fillStyle   = bCol;
      // Tower body
      ctx.beginPath();
      ctx.roundRect(pbsx - BASE_W / 2, GROUND_Y - 130, BASE_W, 130, [8, 8, 0, 0]);
      ctx.fill();
      // Battlements
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(pbsx - BASE_W / 2 + i * 28 + 2, GROUND_Y - 148, 18, 22);
      }
      ctx.restore();
      ctx.fillStyle = '#f97316';
      ctx.font      = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🏰', pbsx, GROUND_Y - 95);
      // Label
      ctx.fillStyle = '#fb923c';
      ctx.font      = 'bold 10px monospace';
      ctx.fillText('自拠点', pbsx, GROUND_Y - 156);
      // HP bar
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(pbsx - 42, GROUND_Y - 170, 84, 10, 3); ctx.fill();
      ctx.fillStyle = hpPct > 0.5 ? '#22c55e' : hpPct > 0.2 ? '#eab308' : '#ef4444';
      if (hpPct > 0) { ctx.beginPath(); ctx.roundRect(pbsx - 42, GROUND_Y - 170, 84 * hpPct, 10, 3); ctx.fill(); }
    }

    // ── Enemy base ─────────────────────────────────────────────────────────
    const ebsx = toScreen(E_BASE_X);
    if (ebsx > -BASE_W - 60 && ebsx < VP_W + 60) {
      const hpPct = gs.eBaseHp / gs.eBaseMaxHp;
      ctx.save();
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur  = 12;
      ctx.fillStyle   = '#450a0a';
      ctx.beginPath();
      ctx.roundRect(ebsx - BASE_W / 2, GROUND_Y - 130, BASE_W, 130, [8, 8, 0, 0]);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(ebsx - BASE_W / 2 + i * 28 + 2, GROUND_Y - 148, 18, 22);
      }
      ctx.restore();
      ctx.font      = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💀', ebsx, GROUND_Y - 95);
      ctx.fillStyle = '#f87171';
      ctx.font      = 'bold 10px monospace';
      ctx.fillText('敵拠点', ebsx, GROUND_Y - 156);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(ebsx - 42, GROUND_Y - 170, 84, 10, 3); ctx.fill();
      ctx.fillStyle = '#ef4444';
      if (hpPct > 0) { ctx.beginPath(); ctx.roundRect(ebsx - 42, GROUND_Y - 170, 84 * hpPct, 10, 3); ctx.fill(); }
    }

    // ── Walls ──────────────────────────────────────────────────────────────
    for (const w of gs.walls) {
      const wx = toScreen(w.x);
      if (wx < -20 || wx > VP_W + 20) continue;
      const hpPct = w.hp / w.maxHp;
      const wH    = Math.round(80 * hpPct) + 10;
      ctx.save();
      ctx.shadowColor = '#78716c';
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = hpPct > 0.5 ? '#57534e' : '#44403c';
      ctx.beginPath();
      ctx.roundRect(wx - 14, GROUND_Y - wH, 28, wH, [4, 4, 0, 0]);
      ctx.fill();
      // Crenels
      ctx.fillStyle = hpPct > 0.5 ? '#78716c' : '#57534e';
      ctx.fillRect(wx - 12, GROUND_Y - wH - 10, 10, 12);
      ctx.fillRect(wx + 2,  GROUND_Y - wH - 10, 10, 12);
      ctx.restore();
      // HP bar
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.roundRect(wx - 16, GROUND_Y - wH - 22, 32, 6, 2); ctx.fill();
      ctx.fillStyle = '#22c55e';
      if (hpPct > 0) { ctx.beginPath(); ctx.roundRect(wx - 16, GROUND_Y - wH - 22, 32 * hpPct, 6, 2); ctx.fill(); }
    }

    // ── Turrets ────────────────────────────────────────────────────────────
    for (const t of gs.turrets) {
      const tx  = toScreen(t.x);
      if (tx < -40 || tx > VP_W + 40) continue;
      const pulse = Math.sin(gs.frame * 0.1) * 0.3 + 0.7;
      ctx.save();
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur  = 10 * pulse;
      // Base pillar
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.roundRect(tx - 10, GROUND_Y - 60, 20, 60, [0, 0, 0, 0]);
      ctx.fill();
      // Cannon barrel
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.roundRect(tx + 2, GROUND_Y - 65, 28, 8, 2);
      ctx.fill();
      // Turret head
      ctx.fillStyle = '#fbbf24';
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(tx, GROUND_Y - 60, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.fillStyle = '#fde68a';
      ctx.font      = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Lv${t.level}`, tx, GROUND_Y - 78);
      // HPバー
      const thpPct = t.hp / t.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(tx - 16, GROUND_Y - 71, 32, 5, 2); ctx.fill();
      ctx.fillStyle = thpPct > 0.5 ? '#22c55e' : thpPct > 0.25 ? '#eab308' : '#ef4444';
      if (thpPct > 0) { ctx.beginPath(); ctx.roundRect(tx - 16, GROUND_Y - 71, 32 * thpPct, 5, 2); ctx.fill(); }
    }

    // ── Allies (stick figures via drawFighter) ─────────────────────────────
    for (const a of gs.allies) {
      const ax = toScreen(a.x);
      if (ax < -80 || ax > VP_W + 80) continue;
      const f = makeUnitFighter(a, ax);
      drawFighter(ctx, f, gs.frame);
      // HP bar above head
      const hpPct = a.hp / a.maxHp;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.roundRect(ax - 18, GROUND_Y - 82, 36, 6, 2); ctx.fill();
      ctx.fillStyle = '#22d3ee';
      if (hpPct > 0) { ctx.beginPath(); ctx.roundRect(ax - 18, GROUND_Y - 82, 36 * hpPct, 6, 2); ctx.fill(); }
    }

    // ── Enemies (stick figures via drawFighter) ────────────────────────────
    for (const e of gs.enemies) {
      const ex = toScreen(e.x);
      if (ex < -100 || ex > VP_W + 100) continue;
      if (e.isBoss) {
        // Boss: scaled up stick figure
        ctx.save();
        ctx.translate(ex, GROUND_Y);
        ctx.scale(1.7, 1.7);
        const bossFighter = makeUnitFighter(e, 0);
        bossFighter.pos = { x: 0, y: 0 };
        drawFighter(ctx, bossFighter, gs.frame);
        ctx.restore();
        // Boss label
        ctx.fillStyle = '#c4b5fd';
        ctx.font      = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('👹 BOSS', ex, GROUND_Y - 130);
      } else {
        const f = makeUnitFighter(e, ex);
        drawFighter(ctx, f, gs.frame);
      }
      // HP bar
      const hpPct = e.hp / e.maxHp;
      const barY  = e.isBoss ? GROUND_Y - 120 : GROUND_Y - 82;
      const barW  = e.isBoss ? 54 : 36;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.roundRect(ex - barW / 2, barY, barW, 6, 2); ctx.fill();
      ctx.fillStyle = '#f87171';
      if (hpPct > 0) { ctx.beginPath(); ctx.roundRect(ex - barW / 2, barY, barW * hpPct, 6, 2); ctx.fill(); }
    }

    // ── Player (full drawFighter with weapon/armor) ────────────────────────
    const psx    = toScreen(gs.px);
    if (gs.pstate !== 'dead') {
      const player = makeRenderFighter(gs, stats, psx);
      if (!drawPlayerAsBoss(ctx, player, gs.frame, stats.selectedCharacter, gs.lionelMode)) {
        drawFighter(ctx, player, gs.frame);
      }

      // Player HP bar (above head)
      const phpPct = gs.php / gs.pmaxHp;
      ctx.save();
      ctx.shadowColor = '#3b82f6';
      ctx.shadowBlur  = 6;
      ctx.fillStyle   = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(psx - 22, GROUND_Y - 84, 44, 7, 3); ctx.fill();
      ctx.shadowBlur  = 0;
      ctx.fillStyle   = phpPct > 0.5 ? '#22c55e' : phpPct > 0.25 ? '#eab308' : '#ef4444';
      if (phpPct > 0) { ctx.beginPath(); ctx.roundRect(psx - 22, GROUND_Y - 84, 44 * phpPct, 7, 3); ctx.fill(); }
      ctx.restore();
    }

    // ── Lionel gun gauge ───────────────────────────────────────────────────
    if (stats.selectedCharacter === 'lionel') {
      drawLionelGauge(ctx, gs.lionelReload, GUN_INTERVAL[gs.lionelMode], gs.lionelMode, 8, VP_H - 36, 220);
    }

    // ── 復活カウントダウン ──────────────────────────────────────────────────
    if (gs.pRespawnTimer > 0) {
      const sec   = Math.ceil(gs.pRespawnTimer / 60);
      const pulse = Math.sin(gs.frame * 0.15) * 0.3 + 0.7;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle   = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.roundRect(VP_W / 2 - 140, VP_H - 90, 280, 56, 10); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle   = '#f87171';
      ctx.font        = 'bold 14px monospace';
      ctx.textAlign   = 'center';
      ctx.fillText('💀 戦闘不能', VP_W / 2, VP_H - 66);
      ctx.fillStyle   = '#fbbf24';
      ctx.font        = 'bold 22px monospace';
      ctx.fillText(`${sec}秒後に復活`, VP_W / 2, VP_H - 44);
      ctx.restore();
    }

    // ── Projectiles ────────────────────────────────────────────────────────
    for (const p of gs.projs) {
      const px2  = toScreen(p.x);
      const col  = p.color ?? '#fbbf24';
      const size = p.vy !== 0 ? 8 : 10; // 上昇矢は小さく
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur  = 14;
      const rg = ctx.createRadialGradient(px2, p.y, 0, px2, p.y, size);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.4, col);
      rg.addColorStop(1, col + '00');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(px2, p.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Particles ──────────────────────────────────────────────────────────
    for (const p of gs.pts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.arc(toScreen(p.x), p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Minimap ────────────────────────────────────────────────────────────
    const mmW = 220, mmH = 22, mmX = VP_W / 2 - mmW / 2, mmY = 8;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath(); ctx.roundRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4, 4); ctx.fill();
    ctx.strokeStyle = '#4338ca';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.roundRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4, 4); ctx.stroke();
    const worldToMm = (wx: number) => mmX + (wx / WORLD_W) * mmW;
    // Bases
    ctx.fillStyle = '#f97316';
    ctx.beginPath(); ctx.roundRect(worldToMm(P_BASE_X) - 3, mmY + 2, 6, mmH - 4, 2); ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.roundRect(worldToMm(E_BASE_X) - 3, mmY + 2, 6, mmH - 4, 2); ctx.fill();
    // Enemy dots
    ctx.fillStyle = '#f87171';
    for (const e of gs.enemies) {
      if (e.state !== 'dead') {
        ctx.beginPath(); ctx.arc(worldToMm(e.x), mmY + mmH / 2, e.isBoss ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Ally dots
    ctx.fillStyle = '#22d3ee';
    for (const a of gs.allies) {
      ctx.beginPath(); ctx.arc(worldToMm(a.x), mmY + mmH / 2, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    // Player dot (pulsing)
    const mmPulse = Math.sin(gs.frame * 0.2) * 0.4 + 0.8;
    ctx.save();
    ctx.shadowColor = stats.playerColor;
    ctx.shadowBlur  = 8 * mmPulse;
    ctx.fillStyle   = stats.playerColor;
    ctx.beginPath(); ctx.arc(worldToMm(gs.px), mmY + mmH / 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Camera viewport indicator
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth   = 1;
    const vmx = worldToMm(camX), vmw = (VP_W / WORLD_W) * mmW;
    ctx.beginPath(); ctx.roundRect(vmx, mmY, vmw, mmH, 2); ctx.stroke();
    ctx.restore();

    // ── Stage progress bar (elapsed time & castle hits) ───────────────────
    {
      const elapsed = Math.floor(gs.frame / 60);
      const mm = Math.floor(elapsed / 60);
      const ss = elapsed % 60;
      const timeStr = `${mm}:${ss.toString().padStart(2,'0')}`;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.roundRect(VP_W - 140, 36, 128, 40, 8); ctx.fill();
      ctx.fillStyle = '#a5b4fc';
      ctx.font      = 'bold 11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`⏱ ${timeStr}`, VP_W - 18, 54);
      ctx.fillStyle = gs.castleHits > 0 ? '#fca5a5' : '#6b7280';
      ctx.fillText(`🏰 被弾 ${gs.castleHits}`, VP_W - 18, 70);
      ctx.restore();
    }
  }, [stats]);

  // ── Game loop ─────────────────────────────────────────────────────────────
  const startLoop = useCallback((difficulty: Difficulty) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let uiFrame = 0;

    const loop = () => {
      if (!shopOpenRef.current) {
        tick(difficulty);
      }
      render(ctx);
      uiFrame++;
      if (uiFrame % 6 === 0) setUiTick(f => f + 1); // 10fps HUD update

      const gs = gsRef.current;
      if (gs && (gs.phase === 'victory' || gs.phase === 'defeat')) {
        setGamePhase(gs.phase);
        // ゴールドをExp・コインに変換（1回だけ）
        if (!goldConvertedRef.current) {
          goldConvertedRef.current = true;
          const bonusXp    = Math.floor(gs.gold * 2 / 3);
          const bonusCoins = Math.floor(gs.gold * 1 / 3);
          if (bonusXp > 0 || bonusCoins > 0) {
            const pd = load();
            pd.xp    += bonusXp;
            pd.coins += bonusCoins;
            while (pd.level < 15 && pd.xp >= xpForLevel(pd.level)) {
              pd.xp -= xpForLevel(pd.level);
              pd.level++;
              if (pd.level % 5 === 0) pd.gachaTickets = (pd.gachaTickets ?? 0) + 1;
              pd.pendingLevelUps++;
            }
            save(pd);
          }
          setGoldConvert({ xp: bonusXp, coins: bonusCoins });
        }
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [tick, render]);

  // ── Controls ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameStarted) return;
    const onDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key);
      if (e.key === 'e' || e.key === 'E') {
        setShopOpen(o => !o);
      }
      // Lionel: 1-5 gun mode switch
      if (stats.selectedCharacter === 'lionel' && e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key) - 1;
        const gs = gsRef.current;
        if (gs && GUN_MODES[idx]) { gs.lionelMode = GUN_MODES[idx]; gs.lionelReload = 0; }
      }
      if (e.key === ' ' || e.key === 'ArrowUp') e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [gameStarted]);

  // ── Shop actions ──────────────────────────────────────────────────────────
  const shopBuy = useCallback((action: string, allyDiff?: Difficulty) => {
    const gs = gsRef.current;
    if (!gs) return;

    if (action === 'wall') {
      if (gs.gold < 150) return;
      gs.gold -= 150;
      gs.walls.push({ id: gs.nextId++, x: gs.px, hp: 600, maxHp: 600 });
    }
    if (action === 'turret') {
      if (gs.gold < 250 || gs.turrets.length >= 8) return;
      gs.gold -= 250;
      gs.turrets.push({ id: gs.nextId++, x: gs.px, level: 1, cd: 0, maxCd: 90, dmg: 18, range: 300, hp: 400, maxHp: 400 });
    }
    if (action === 'upgrade-turret') {
      if (gs.gold < 200 || gs.turrets.length === 0) return;
      const t = gs.turrets.reduce((a, b) => Math.abs(a.x - gs.px) < Math.abs(b.x - gs.px) ? a : b);
      if (t.level >= 5) return;
      gs.gold   -= 200;
      t.level++;
      t.dmg     = Math.round(t.dmg * 1.5);
      t.maxCd   = Math.max(30, t.maxCd - 12);
      t.range   += 50;
    }
    if (action === 'heal') {
      if (gs.gold < 100) return;
      gs.gold -= 100;
      gs.php   = Math.min(gs.pmaxHp, gs.php + Math.round(gs.pmaxHp * 0.35));
    }
    if (action === 'wall-reinforce') {
      if (gs.gold < 200) return;
      gs.gold        -= 200;
      gs.baseMaxHp   += 300;
      gs.baseHp       = Math.min(gs.baseMaxHp, gs.baseHp + 200);
    }
    if (action === 'ally' && allyDiff) {
      const cost = ALLY_COST[allyDiff];
      if (gs.gold < cost) return;
      gs.gold -= cost;
      // makeUnit で難易度対応装備を自動付与
      const unit = makeUnit(gs.nextId++, P_BASE_X + BASE_W / 2 + 10, true, 1, false, allyDiff);
      gs.allies.push(unit);
    }
    // ── 新アイテム ────────────────────────────────────────────────────────────
    if (action === 'bomb') {
      if (gs.gold < 350) return;
      gs.gold -= 350;
      // プレイヤー周辺350px内の全敵にダメージ
      const bombRange = 350;
      const bombDmg   = Math.round(200 * stats.attackMult);
      for (const e of gs.enemies) {
        if (e.state === 'dead') continue;
        const d = Math.abs(e.x - gs.px);
        if (d <= bombRange) {
          e.hp -= Math.round(bombDmg * (1 - d / bombRange * 0.5));
          e.flash = 12;
          if (e.hp <= 0) {
            e.state = 'dead';
            const reward = e.isBoss ? 300 : 30 + gs.kills * 2;
            gs.gold       += reward;
            gs.goldEarned += reward;
            gs.kills++;
          }
        }
      }
      // 爆発エフェクト
      for (let i = 0; i < 5; i++) {
        spawnParticles(gs.pts, gs.px + (Math.random() - 0.5) * bombRange, '#f97316', 10);
      }
      spawnParticles(gs.pts, gs.px, '#fbbf24', 20);
    }
    if (action === 'barrier') {
      if (gs.gold < 200) return;
      gs.gold -= 200;
      // 5秒間無敵（300フレーム）
      gs.pInv = 300;
      spawnParticles(gs.pts, gs.px, '#38bdf8', 16);
    }
    if (action === 'repair-wall') {
      const liveWalls = gs.walls.filter(w => w.hp > 0);
      if (gs.gold < 80 || liveWalls.length === 0) return;
      const nearWall = liveWalls.reduce((a, b) =>
        Math.abs(a.x - gs.px) < Math.abs(b.x - gs.px) ? a : b);
      gs.gold -= 80;
      nearWall.hp = Math.min(nearWall.maxHp, nearWall.hp + 300);
      spawnParticles(gs.pts, nearWall.x, '#22c55e', 8);
    }
    if (action === 'repair-turret') {
      if (gs.gold < 100 || gs.turrets.length === 0) return;
      const nearTurret = gs.turrets.reduce((a, b) =>
        Math.abs(a.x - gs.px) < Math.abs(b.x - gs.px) ? a : b);
      gs.gold -= 100;
      nearTurret.hp = nearTurret.maxHp;
      spawnParticles(gs.pts, nearTurret.x, '#f59e0b', 8);
    }
    if (action === 'mass-stun') {
      if (gs.gold < 400) return;
      gs.gold -= 400;
      // 全敵を3秒間スタン（180フレーム）
      for (const e of gs.enemies) {
        if (e.state !== 'dead') {
          e.stunTimer = 180;
          e.state = 'hit';
          e.flash = 10;
        }
      }
      spawnParticles(gs.pts, gs.px, '#a78bfa', 20);
    }
    if (action === 'special-ally') {
      const allyT = (allyDiff as unknown) as AllySpecialType;
      const def = SPECIAL_ALLY_DEFS[allyT];
      if (!def || gs.gold < def.cost) return;
      gs.gold -= def.cost;
      const unit = makeSpecialAlly(gs.nextId++, P_BASE_X + BASE_W / 2 + 10, allyT);
      gs.allies.push(unit);
      spawnParticles(gs.pts, P_BASE_X + BASE_W / 2 + 10, def.color, 8);
    }
    setUiTick(f => f + 1);
  }, []);

  // ── Start ─────────────────────────────────────────────────────────────────
  const handleStart = useCallback((difficulty: Difficulty) => {
    const data = load();
    defUpgradesRef.current = {
      goldLv: data.defenseGoldLv ?? 0,
      atkSpeedLv: data.defenseAtkSpeedLv ?? 0,
    };
    setDiff(difficulty);
    setGamePhase('battle');
    setGameStarted(true);
    setShopOpen(false);
    setGoldConvert(null);
    goldConvertedRef.current = false;
    initGame(difficulty);
    setTimeout(() => startLoop(difficulty), 50);
  }, [initGame, startLoop]);

  useEffect(() => {
    return () => { cancelAnimationFrame(rafRef.current); };
  }, []);

  // ── Render: select screen ─────────────────────────────────────────────────
  if (!gameStarted) {
    return <DefenseSelectPage stats={stats} onStart={handleStart} onBack={onBack} />;
  }

  const gs = gsRef.current;

  // ── Render: game ──────────────────────────────────────────────────────────
  return (
    <div className="w-full h-screen bg-gray-950 flex flex-col items-center justify-center select-none overflow-hidden">
      {/* HUD */}
      <div className="flex gap-3 items-center mb-2 text-xs flex-wrap justify-center">
        {/* Base HP */}
        <div className="flex items-center gap-1 bg-gray-900 rounded-lg px-2 py-1 border border-orange-800/40">
          <span>🏰</span>
          <div className="w-28 h-2.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-orange-500 rounded-full transition-all"
              style={{ width: `${Math.max(0, (gs?.baseHp ?? 0) / (gs?.baseMaxHp ?? 1) * 100)}%` }} />
          </div>
          <span className="text-orange-300 font-bold">{gs?.baseHp ?? 0}</span>
        </div>
        {/* Enemy base HP */}
        <div className="flex items-center gap-1 bg-gray-900 rounded-lg px-2 py-1 border border-red-900/40">
          <span>🔴</span>
          <div className="w-28 h-2.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-red-600 rounded-full transition-all"
              style={{ width: `${Math.max(0, (gs?.eBaseHp ?? 0) / (gs?.eBaseMaxHp ?? 1) * 100)}%` }} />
          </div>
          <span className="text-red-300 font-bold">{gs?.eBaseHp ?? 0}</span>
        </div>
        {/* Elapsed time */}
        {(() => {
          const f = gs?.frame ?? 0;
          const sec = Math.floor(f / 60);
          const mm = Math.floor(sec / 60);
          const ss = sec % 60;
          return (
            <div className="bg-gray-900 rounded-lg px-2 py-1 border border-gray-700 font-bold text-indigo-300 tabular-nums">
              ⏱ {mm}:{ss.toString().padStart(2,'0')}
            </div>
          );
        })()}
        {/* Gold */}
        <div className="bg-gray-900 rounded-lg px-2 py-1 border border-yellow-800/40 font-bold text-yellow-400">
          💰 {gs?.gold ?? 0}G
        </div>
        {/* Kills */}
        <div className="bg-gray-900 rounded-lg px-2 py-1 border border-gray-700 text-gray-300">
          💀 {gs?.kills ?? 0}
        </div>
        {/* Player damage % */}
        {(() => {
          const dmg = gs?.pdamage ?? 0;
          const col = dmg < 50 ? 'text-green-300 border-green-800/40'
                    : dmg < 100 ? 'text-yellow-300 border-yellow-800/40'
                    : dmg < 150 ? 'text-orange-300 border-orange-800/40'
                    : 'text-red-400 border-red-800/60 animate-pulse';
          return (
            <div className={`bg-gray-900 rounded-lg px-2 py-1 border font-black tabular-nums ${col}`}>
              🩸 {Math.round(dmg)}%
            </div>
          );
        })()}
        <button onClick={() => setShopOpen(o => !o)}
          className={`px-3 py-1 rounded-lg font-bold transition-all border ${shopOpen ? 'bg-yellow-700 border-yellow-500 text-white' : 'bg-gray-800 border-gray-600 text-yellow-300 hover:bg-gray-700'}`}>
          🛒 ショップ [E]
        </button>
        <button onClick={() => { cancelAnimationFrame(rafRef.current); onBack(); }}
          className="px-2 py-1 rounded-lg bg-gray-800 border border-gray-600 text-gray-400 hover:text-white">
          ←
        </button>
      </div>

      {/* Canvas */}
      <div className="relative">
        <canvas ref={canvasRef} width={VP_W} height={VP_H}
          className="rounded-xl border border-indigo-900/40 shadow-2xl"
          style={{ maxWidth: '100vw', display: 'block' }} />

        {/* Shop overlay */}
        {shopOpen && (
          <div className="absolute bottom-0 left-0 right-0 bg-gray-950/95 border-t border-yellow-700/40 rounded-b-xl p-3">
            <p className="text-yellow-300 font-black text-sm mb-2 text-center">🛒 ショップ　💰 {gs?.gold ?? 0}G</p>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <ShopButton icon="💊" name="回復" cost={100} gold={gs?.gold ?? 0}
                sub="自分HP+35%" onClick={() => shopBuy('heal')} />
              <ShopButton icon="🛡️" name="バリア" cost={200} gold={gs?.gold ?? 0}
                sub="5秒間無敵" onClick={() => shopBuy('barrier')} />
              <ShopButton icon="💣" name="爆弾" cost={350} gold={gs?.gold ?? 0}
                sub="周囲350px全敵大ダメージ" onClick={() => shopBuy('bomb')} />
              <ShopButton icon="⚡" name="全体スタン" cost={400} gold={gs?.gold ?? 0}
                sub="全敵3秒停止" onClick={() => shopBuy('mass-stun')} />
              <ShopButton icon="🧱" name="壁設置" cost={150} gold={gs?.gold ?? 0}
                sub="現在位置に壁HP600" onClick={() => shopBuy('wall')} />
              <ShopButton icon="🔧" name="壁修理" cost={80} gold={gs?.gold ?? 0}
                sub="最寄壁HP+300" onClick={() => shopBuy('repair-wall')} />
              <ShopButton icon="🏰" name="拠点強化" cost={200} gold={gs?.gold ?? 0}
                sub="+300拠点HP回復" onClick={() => shopBuy('wall-reinforce')} />
              <ShopButton icon="🔫" name="砲台設置" cost={250} gold={gs?.gold ?? 0}
                sub={`現在位置に設置（${gs?.turrets?.length ?? 0}/8）`} onClick={() => shopBuy('turret')} />
              <ShopButton icon="⬆️" name="砲台強化" cost={200} gold={gs?.gold ?? 0}
                sub="最寄砲台をLvUP" onClick={() => shopBuy('upgrade-turret')} />
              <ShopButton icon="🛠️" name="砲台修理" cost={100} gold={gs?.gold ?? 0}
                sub="最寄砲台HPを全回復" onClick={() => shopBuy('repair-turret')} />
            </div>
            <p className="text-cyan-300 text-xs font-bold mb-1 text-center">⚔ 戦士召喚（難易度）</p>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {(['easy','normal','hard','vhard','oni'] as Difficulty[]).map(d => (
                <ShopButton key={d} icon="⚔" name={BOT_CONFIGS[d].label}
                  cost={ALLY_COST[d]} gold={gs?.gold ?? 0}
                  sub={`HP:${ALLY_STATS[d].hp}`}
                  onClick={() => shopBuy('ally', d)} />
              ))}
            </div>
            <p className="text-purple-300 text-xs font-bold mb-1 text-center">✨ 特殊ユニット召喚</p>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.entries(SPECIAL_ALLY_DEFS) as [AllySpecialType, typeof SPECIAL_ALLY_DEFS[AllySpecialType]][]).map(([type, def]) => (
                <ShopButton key={type} icon={def.icon} name={def.nameJa}
                  cost={def.cost} gold={gs?.gold ?? 0}
                  sub={def.desc}
                  onClick={() => shopBuy('special-ally', type as unknown as Difficulty)} />
              ))}
            </div>
          </div>
        )}

        {/* End overlay */}
        {(gamePhase === 'victory' || gamePhase === 'defeat') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl">
            <div className="text-center">
              {gamePhase === 'victory'
                ? <div className="text-6xl font-black text-yellow-400 mb-2">🏆 勝利！</div>
                : <div className="text-6xl font-black text-red-400 mb-2">💀 敗北</div>}
              <div className="text-gray-300 text-sm mb-1">撃破数: {gs?.kills ?? 0}</div>
              <div className="text-yellow-300 text-sm mb-1">獲得ゴールド: {gs?.goldEarned ?? 0}G</div>
              {goldConvert && (gs?.gold ?? 0) > 0 && (
                <div className="bg-yellow-900/40 border border-yellow-600/50 rounded-lg px-4 py-2 mb-3 text-sm">
                  <div className="text-yellow-300 font-bold mb-1">💰 残りゴールド {gs?.gold ?? 0}G を変換</div>
                  <div className="flex gap-4 justify-center text-xs">
                    <span className="text-blue-300">✨ Exp +{goldConvert.xp}</span>
                    <span className="text-yellow-300">🪙 コイン +{goldConvert.coins}</span>
                  </div>
                </div>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={() => { cancelAnimationFrame(rafRef.current); handleStart(diff); }}
                  className="bg-orange-700 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-xl">
                  もう一度
                </button>
                <button onClick={() => { cancelAnimationFrame(rafRef.current); onBack(); }}
                  className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-6 py-2.5 rounded-xl">
                  メニューへ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-gray-600 text-xs">A/D or ←/→: 移動　Z/J: 攻撃/射撃　X/K: 強攻撃　E: ショップ{stats.selectedCharacter === 'lionel' ? '　1-5: 銃モード切替' : ''}</p>
    </div>
  );
}

// ── Shop button component ──────────────────────────────────────────────────
function ShopButton({ icon, name, cost, gold, sub, onClick }: {
  icon: string; name: string; cost: number; gold: number;
  sub?: string; onClick: () => void;
}) {
  const canAfford = gold >= cost;
  return (
    <button onClick={onClick} disabled={!canAfford}
      className={`flex flex-col items-center rounded-xl px-2 py-1.5 border text-center transition-all text-xs
        ${canAfford ? 'border-yellow-700/60 bg-gray-800 hover:bg-gray-700 active:scale-95' : 'border-gray-700 bg-gray-900 opacity-40 cursor-not-allowed'}`}>
      <span className="text-lg">{icon}</span>
      <span className="font-bold text-white text-[11px]">{name}</span>
      <span className="text-yellow-400 font-black">💰{cost}G</span>
      {sub && <span className="text-gray-400 text-[9px] leading-tight mt-0.5">{sub}</span>}
    </button>
  );
}
