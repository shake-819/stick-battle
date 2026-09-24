interface HomeProps {
  onStart: () => void;
}

export default function Home({ onStart }: HomeProps) {
  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white select-none py-8">
      <h1 className="text-6xl font-black mb-2 tracking-tight">
        <span className="text-blue-400">STICK</span>
        <span className="text-red-400"> SMASH</span>
      </h1>
      <p className="text-gray-400 text-lg mb-12">ボットと1対1で戦え！</p>

      <div className="flex gap-16 mb-12 text-sm text-gray-300">
        <div>
          <p className="text-yellow-400 font-bold mb-2 text-base">移動</p>
          <p>← → / A D — 左右移動</p>
          <p>↑ / W — ジャンプ</p>
          <p>↑ 2回 — 二段ジャンプ</p>
        </div>
        <div>
          <p className="text-yellow-400 font-bold mb-2 text-base">攻撃</p>
          <p>Z / J — 通常攻撃</p>
          <p>X / K — 強攻撃（吹き飛ばし大）</p>
          <p>↓ + Z — 下攻撃</p>
          <p>V / U — アッパー攻撃</p>
          <p>空中Z/J — 空中攻撃</p>
          <p>Space — 必殺技</p>
        </div>
        <div>
          <p className="text-yellow-400 font-bold mb-2 text-base">防御</p>
          <p>F <span className="text-gray-400">（長押し）</span>— ガード</p>
          <p>C <span className="text-gray-400">（タップ）</span>— カウンター</p>
        </div>
      </div>

      <div className="flex gap-4 mb-10 text-xs text-gray-500">
        <span className="bg-blue-900 px-3 py-1 rounded-full">自分 = 青い棒人間</span>
        <span className="bg-red-900 px-3 py-1 rounded-full">ボット = 赤い棒人間</span>
      </div>

      <button
        onClick={onStart}
        className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black text-2xl px-16 py-4 rounded-2xl transition-all duration-150 active:scale-95 shadow-lg"
      >
        ゲームスタート
      </button>

      <p className="mt-6 text-gray-600 text-xs">
        ダメージ%が高いほど吹き飛びやすい • 3ストック制
      </p>
    </div>
  );
}
