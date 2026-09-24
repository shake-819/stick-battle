# STICK SMASH（スティックスマッシュ）

棒人間の1v1対戦アクション。バトル / 百人組手 / ボス戦 / 防衛戦 / ガチャ・装備 / 限定イベントを収録。
**静的サイト版**です。サーバーなしで GitHub Pages にそのまま公開できます。

- フレームワーク: React 19 + Vite 7 + Tailwind CSS 4（TypeScript）
- ゲーム本体は Canvas（`src/lib/gameEngine.ts`）
- セーブデータは各端末の `localStorage` に保存

## GitHub Pages で公開する手順

1. GitHub で新しいリポジトリを作る（Public 推奨）
2. このリポジトリの全ファイルを、フォルダ構成そのままアップロードする
   - Web 画面の **Add file → Upload files** はフォルダごとドラッグ＆ドロップできる
   - `.github/workflows/deploy.yml` は隠しフォルダで上げにくいので、
     **Add file → Create new file** の名前欄に `.github/workflows/deploy.yml` と入力して中身を貼り付けるのが確実
3. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする（最初の1回だけ）
4. **Actions** タブで `Deploy to GitHub Pages` が緑になるのを待つ（初回は 1〜3 分）
5. `https://<ユーザー名>.github.io/<リポジトリ名>/` でプレイできる

`main` ブランチに push するたびに自動で再ビルド・再公開されます。

## ローカルで動かす

```bash
npm install
npm run dev        # 開発サーバー
npm run build      # dist/ に静的ファイルを出力
npm run preview    # ビルド結果の確認
npm run typecheck  # 型チェック
```

## 静的サイト版で変わったところ

| 機能 | 静的版での扱い |
| --- | --- |
| ログイン / クラウドセーブ | 廃止。ログイン画面なしで開始し、セーブは端末内のみ（メニューの「新規作成」で全消去） |
| オンライン対戦 | 非表示（サーバー中継が必要） |
| 魔王討伐（全員共有HP） | 非表示 |
| 最強のプレイヤー | 非表示 |
| テーマ縛りランキング（週替わり） | 非表示 |
| エンドレスサバイバル / 戦神チャレンジ / ガンナーマスター | **遊べる**。ランキングは「この端末の自己ベスト履歴」になる |
| バトル / 百人組手 / ボス戦 / 防衛戦 / ガチャ / 装備 / 図鑑 / レベルアップ | そのまま遊べる |

> ブラウザのデータ消去や別端末への移行でセーブは引き継がれません。

## 削除した動的機能を復活させたいとき

動的機能のクライアント側コードは**削除せず残してあり**、フラグで隠しているだけです。
`src/lib/backend.ts` の `VITE_API_BASE`（API サーバーの URL）を設定してビルドすると、その機能が画面に戻ります。

詳しい手順・元 API の仕様・サーバーなしで実装する方法は **[docs/DYNAMIC_FEATURES.md](docs/DYNAMIC_FEATURES.md)** を見てください。

## フォルダ構成

```
├─ index.html
├─ package.json / tsconfig.json / vite.config.ts
├─ .github/workflows/deploy.yml   GitHub Pages への自動デプロイ
├─ docs/DYNAMIC_FEATURES.md       動的機能の一覧と復活ガイド
├─ public/favicon.svg
└─ src/
   ├─ main.tsx / App.tsx          画面遷移（state 管理）
   ├─ index.css
   ├─ lib/
   │  ├─ backend.ts               ★ バックエンド有無・機能フラグ・apiFetch
   │  ├─ eventService.ts          ★ イベント記録の保存/取得（端末内 or API）
   │  ├─ gameEngine.ts            物理・戦闘・ボットAI
   │  ├─ bossRenderer.ts
   │  └─ gameTransport.ts         オンライン用の通信ラッパー（WS / WebRTC）
   ├─ store/                      playerStore（セーブ）/ authStore（認証API）
   ├─ data/                       ステージ・ボス・装備・ガチャ
   ├─ types/
   └─ pages/                      各画面
```
