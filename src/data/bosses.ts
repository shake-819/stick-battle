export interface BossSkill {
  name: string;
  desc: string;
}

export interface BossDef {
  id: string;
  nameJa: string;
  descJa: string;
  emoji: string;
  color: string;
  bgTop: string;
  bgBottom: string;
  platformGlow: string;
  recommendedLevel: number;
  maxHp: number;
  skills: BossSkill[];
}

export const BOSSES: BossDef[] = [
  {
    id: 'bajiou',
    nameJa: '荒ぶる山賊の王　バジオウ',
    descJa: '山岳地帯を支配する山賊の王。巨大な斧を振るい、傷を負うほど狂暴化する。反撃の一閃は命取りだ。',
    emoji: '🪓',
    color: '#92400e',
    bgTop: '#1c0a00',
    bgBottom: '#2d1a00',
    platformGlow: '#78350f',
    recommendedLevel: 150,
    maxHp: 4500,
    skills: [
      { name: '流血',   desc: '攻撃されると裂傷状態を付与し継続ダメージを与える' },
      { name: '反撃',   desc: '10%の確率で受けた吹き飛ばしを無効化し、敵にダメージを与える' },
      { name: '王の覇気', desc: 'ダメージを負うほど攻撃力がアップ（最大3倍）' },
    ],
  },
  {
    id: 'lionel',
    nameJa: '銃神ライオネル',
    descJa: '5種の銃を自在に操る銃の神。背に羽のごとく広がる10の銃身は圧倒的な火力を誇る。',
    emoji: '🔫',
    color: '#dc2626',
    bgTop: '#0a0a1a',
    bgBottom: '#1a0a0a',
    platformGlow: '#7f1d1d',
    recommendedLevel: 250,
    maxHp: 6000,
    skills: [
      { name: '臨機応変', desc: '5種の銃を戦闘中に切り替える（ピストル・マシンガン・ロケットランチャー・ライフル・双銃）' },
      { name: '跳弾',     desc: '30%の確率で打った弾がプラットフォームに当たると跳ね返る' },
      { name: 'ヘッドショット', desc: '弾が頭に当たった時、5倍ダメージ' },
      { name: 'ロケット・ライフル特化', desc: 'ロケットランチャーとライフルのリロード時間が25%短縮される' },
      { name: '自動追尾弾', desc: '放った弾が敵に向かって自動的に追尾する' },
    ],
  },
  {
    id: 'shinigami',
    nameJa: '冥界からの死者　シニガミ',
    descJa: '冥界より召喚された死の神。大鎌を振るい、傷を癒しながら戦う不死の存在。その鎌は自らの血で強化される。',
    emoji: '💀',
    color: '#7c3aed',
    bgTop: '#050010',
    bgBottom: '#100018',
    platformGlow: '#4c1d95',
    recommendedLevel: 350,
    maxHp: 20000,
    skills: [
      { name: '不死身の体', desc: '時間が経つごとにHPが徐々に回復する' },
      { name: '吸血',       desc: 'ダメージを与えるたびにHPが回復する' },
      { name: '飛び血鎌',   desc: '自身のHPを少し削って強力な鎌を飛ばし、大ダメージを与える' },
      { name: '迅速な血鎌', desc: '飛び血鎌のリロード時間が半分になる' },
      { name: '鎌の呪縛',   desc: '飛び血鎌が敵に当たると血鎌が敵の周りを回転し、最後に当たった鎌から10秒後に全ての血鎌の数×血鎌ダメージを与える' },
    ],
  },
];
