export interface StagePlatform { x: number; y: number; w: number; h: number; }

export interface MovingPlatformGimmick {
  type: 'moving_platform';
  platformIdx: number;
  axis: 'x' | 'y';
  range: number;
  speed: number;
  phaseOffset?: number;
}
export interface HazardGimmick {
  type: 'hazard';
  x: number; y: number; w: number; h: number;
  damage: number;
  color: string;
  label: string;
}
export interface WindGimmick {
  type: 'wind';
  x: number; y: number; w: number; h: number;
  forceX: number;
  color: string;
}
export interface VanishingPlatformGimmick {
  type: 'vanishing_platform';
  platformIdx: number;
  onFrames: number;
  offFrames: number;
  startOffset?: number;
}
export type StageGimmick = MovingPlatformGimmick | HazardGimmick | WindGimmick | VanishingPlatformGimmick;

export interface StageDef {
  id: string;
  nameJa: string;
  descJa: string;
  emoji: string;
  platforms: StagePlatform[];
  mainY: number;
  spawnX: [number, number];
  bgTop: string;
  bgBottom: string;
  platColor1: string;
  platColor2: string;
  platEdge: string;
  glowColor: string;
  accentColor: string;
  gimmicks?: StageGimmick[];
}

export const STAGES: StageDef[] = [
  {
    id: 'battlefield',
    nameJa: '戦場',
    descJa: '定番のバランスステージ。頂上の足場がゆっくり左右に動く。位置取りが重要。',
    emoji: '⚔️',
    platforms: [
      { x: 80,  y: 365, w: 640, h: 20 },
      { x: 200, y: 265, w: 160, h: 12 },
      { x: 440, y: 265, w: 160, h: 12 },
      { x: 305, y: 185, w: 190, h: 12 },
    ],
    mainY: 365,
    spawnX: [220, 580],
    bgTop: '#0f172a', bgBottom: '#1e1b4b',
    platColor1: '#6366f1', platColor2: '#4338ca', platEdge: '#a5b4fc',
    glowColor: '#6366f1', accentColor: '#818cf8',
    gimmicks: [
      { type: 'moving_platform', platformIdx: 3, axis: 'x', range: 70, speed: 0.022 },
    ],
  },
  {
    id: 'skytower',
    nameJa: '天空の塔',
    descJa: '狭い中心から左右に広がる縦長ステージ。横風が常に右へ吹き復帰を難しくする。',
    emoji: '🌙',
    platforms: [
      { x: 280, y: 375, w: 240, h: 20 },
      { x: 50,  y: 278, w: 155, h: 12 },
      { x: 595, y: 278, w: 155, h: 12 },
      { x: 315, y: 168, w: 170, h: 12 },
    ],
    mainY: 375,
    spawnX: [335, 465],
    bgTop: '#05000f', bgBottom: '#130028',
    platColor1: '#7c3aed', platColor2: '#6d28d9', platEdge: '#d8b4fe',
    glowColor: '#9333ea', accentColor: '#a855f7',
    gimmicks: [
      { type: 'wind', x: 0, y: 0, w: 800, h: 500, forceX: 0.65, color: '#a78bfa' },
    ],
  },
  {
    id: 'faultzone',
    nameJa: '断層地帯',
    descJa: '左右に分断された島。中央の亀裂から溶岩が噴出し踏み込むとダメージを受ける。',
    emoji: '🌋',
    platforms: [
      { x: 40,  y: 358, w: 275, h: 20 },
      { x: 485, y: 358, w: 275, h: 20 },
      { x: 320, y: 268, w: 160, h: 12 },
      { x: 65,  y: 192, w: 130, h: 12 },
      { x: 605, y: 192, w: 130, h: 12 },
    ],
    mainY: 358,
    spawnX: [178, 622],
    bgTop: '#1a0200', bgBottom: '#2d0600',
    platColor1: '#dc2626', platColor2: '#991b1b', platEdge: '#fca5a5',
    glowColor: '#ef4444', accentColor: '#f87171',
    gimmicks: [
      { type: 'hazard', x: 295, y: 260, w: 210, h: 240, damage: 10, color: '#f97316', label: '⚠ 溶岩地帯' },
    ],
  },
  {
    id: 'lavafurnace',
    nameJa: '溶岩炉',
    descJa: '両端に溶岩流。中央の動く足場を制する者が勝者になる。端に追い詰めるな危険！',
    emoji: '🔥',
    platforms: [
      { x: 170, y: 360, w: 460, h: 20 },
      { x: 30,  y: 272, w: 140, h: 12 },
      { x: 630, y: 272, w: 140, h: 12 },
      { x: 310, y: 183, w: 180, h: 12 },
    ],
    mainY: 360,
    spawnX: [260, 540],
    bgTop: '#1c0500', bgBottom: '#3b0a00',
    platColor1: '#ea580c', platColor2: '#c2410c', platEdge: '#fed7aa',
    glowColor: '#f97316', accentColor: '#fb923c',
    gimmicks: [
      { type: 'moving_platform', platformIdx: 3, axis: 'x', range: 110, speed: 0.028 },
      { type: 'hazard', x: 0, y: 260, w: 168, h: 240, damage: 10, color: '#f97316', label: '⚠ 溶岩' },
      { type: 'hazard', x: 632, y: 260, w: 168, h: 240, damage: 10, color: '#ef4444', label: '⚠ 溶岩' },
    ],
  },
  {
    id: 'stormcoast',
    nameJa: '嵐の岸',
    descJa: '強い海風が常に右へ押し流す。左端への復帰はほぼ不可能。端の戦いは命取り。',
    emoji: '🌪️',
    platforms: [
      { x: 25,  y: 360, w: 220, h: 20 },
      { x: 555, y: 360, w: 220, h: 20 },
      { x: 50,  y: 245, w: 120, h: 12 },
      { x: 630, y: 245, w: 120, h: 12 },
      { x: 295, y: 295, w: 210, h: 12 },
    ],
    mainY: 360,
    spawnX: [135, 665],
    bgTop: '#0c1a2e', bgBottom: '#0f2847',
    platColor1: '#0ea5e9', platColor2: '#0369a1', platEdge: '#7dd3fc',
    glowColor: '#38bdf8', accentColor: '#7dd3fc',
    gimmicks: [
      { type: 'wind', x: 0, y: 0, w: 800, h: 500, forceX: 0.85, color: '#38bdf8' },
    ],
  },
  {
    id: 'electricfort',
    nameJa: '電磁要塞',
    descJa: '定期的に消える2枚の電磁足場と中央の高電圧ゾーン。タイミングを読んで戦え。',
    emoji: '⚡',
    platforms: [
      { x: 45,  y: 368, w: 200, h: 20 },
      { x: 555, y: 368, w: 200, h: 20 },
      { x: 288, y: 270, w: 224, h: 12 },
      { x: 185, y: 175, w: 430, h: 12 },
    ],
    mainY: 368,
    spawnX: [145, 655],
    bgTop: '#050a0f', bgBottom: '#0a1628',
    platColor1: '#1d4ed8', platColor2: '#1e40af', platEdge: '#93c5fd',
    glowColor: '#facc15', accentColor: '#fde047',
    gimmicks: [
      { type: 'vanishing_platform', platformIdx: 2, onFrames: 200, offFrames: 100, startOffset: 200 },
      { type: 'vanishing_platform', platformIdx: 3, onFrames: 160, offFrames: 120, startOffset: 80 },
      { type: 'hazard', x: 250, y: 150, w: 300, h: 220, damage: 10, color: '#facc15', label: '⚡ 高電圧' },
    ],
  },
  {
    id: 'glacierduel',
    nameJa: '氷上決戦',
    descJa: '3枚の氷の足場がそれぞれ独立して動く。予測不能な揺れに対応できるかが鍵。',
    emoji: '🧊',
    platforms: [
      { x: 0,   y: 348, w: 140, h: 20 },
      { x: 660, y: 348, w: 140, h: 20 },
      { x: 175, y: 290, w: 155, h: 12 },
      { x: 470, y: 290, w: 155, h: 12 },
      { x: 297, y: 195, w: 206, h: 12 },
    ],
    mainY: 348,
    spawnX: [70, 730],
    bgTop: '#071826', bgBottom: '#0f2d45',
    platColor1: '#7dd3fc', platColor2: '#38bdf8', platEdge: '#e0f2fe',
    glowColor: '#38bdf8', accentColor: '#bae6fd',
    gimmicks: [
      { type: 'moving_platform', platformIdx: 2, axis: 'y', range: 55, speed: 0.032 },
      { type: 'moving_platform', platformIdx: 3, axis: 'y', range: 55, speed: 0.032, phaseOffset: Math.PI },
      { type: 'moving_platform', platformIdx: 4, axis: 'x', range: 80, speed: 0.020 },
    ],
  },
];
