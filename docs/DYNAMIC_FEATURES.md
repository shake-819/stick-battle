# 動的機能の一覧と復活ガイド

静的サイト版で無効にした機能と、あとから「無理やり」戻すための情報をまとめたものです。
元のプロジェクト（Replit 版）の `artifacts/api-server/` が、これらの動的機能の**実装元（正解）**です。
元の ZIP は捨てずに残しておいてください。

## 1. 基本方針

- クライアント側のコード（各ページ・`authStore.ts`・`gameTransport.ts`）は**削除せず残してある**
- サーバーへの通信はすべて `src/lib/backend.ts` の `apiFetch()` を通る
- `VITE_API_BASE` が空 → 静的モード（通信せず、該当機能はメニューから非表示）
- `VITE_API_BASE` を設定 → 動的機能が画面に戻り、通信も元どおり発生する

フラグは `src/lib/backend.ts` の `FEATURES` にあります。

| フラグ | 制御する機能 |
| --- | --- |
| `accounts` | ログイン画面 / クラウドセーブ / ログアウト / アカウント削除 |
| `rankings` | 限定イベント3種の共有ランキング（OFF の間は端末内の自己ベストのみ） |
| `serverEvents` | 魔王討伐 / 最強のプレイヤー / テーマ縛りランキング |
| `online` | オンライン対戦（`VITE_WS_URL` または `VITE_API_BASE` があれば ON） |

## 2. 機能別の対応表

| 機能 | 静的版の扱い | 関係ファイル | 必要なもの |
| --- | --- | --- | --- |
| ログイン / クラウドセーブ | 廃止（localStorage のみ） | `store/authStore.ts` `pages/AuthPage.tsx` `App.tsx` | 認証 + セーブ保存 |
| 限定イベント3種の記録 | 端末内の自己ベスト | `lib/eventService.ts` `pages/LimitedEventPage.tsx` `pages/Event{Survival,Shinigami}Page.tsx` `pages/GunnerMasterPage.tsx` | スコアの保存と順位取得 |
| 魔王討伐（共有HP） | 非表示 | `pages/EventRaidPage.tsx` | 全員で共有する HP の原子的な減算 |
| 最強のプレイヤー | 非表示 | `pages/EventStrongestPage.tsx` | 他人のセーブのスナップショット、順位の入れ替え |
| テーマ縛りランキング | 非表示 | `pages/EventThemePage.tsx` | 週×テーマ別のベストスコア |
| オンライン対戦 | 非表示 | `pages/OnlineLobbyPage.tsx` `pages/OnlineGamePage.tsx` `lib/gameTransport.ts` | 部屋の作成/参加の仲介（シグナリング） |

## 3. 元 API の仕様（`artifacts/api-server/src`）

認証は `Authorization: Bearer <token>`。トークンは登録/ログイン時に発行される UUID で、`sessions` テーブルで管理されている。

### 認証・セーブ（`routes/auth.ts`）

| メソッド / パス | 内容 |
| --- | --- |
| `POST /api/auth/register` | `{username, password}` → `{token, username}`。ユーザー名は英数字と `_` の3〜20文字、パスワードは4文字以上。重複は 409 |
| `POST /api/auth/login` | `{username, password}` → `{token, username}` |
| `POST /api/auth/logout` | セッション削除 |
| `GET /api/auth/save` | `{data}`（`PlayerData` の JSON） |
| `PUT /api/auth/save` | `{data}` を保存。`App.tsx` の `setSaveHook` により `save()` のたびに呼ばれる |
| `DELETE /api/auth/account` | アカウント削除（関連テーブルは CASCADE） |

14日間ログインが無いアカウントは、サーバー側が1時間ごとに削除する。

### 限定イベント記録（`routes/events.ts`）

| メソッド / パス | 内容 |
| --- | --- |
| `POST /api/events/submit` | `{eventId, score, weaponName, armorName}`。eventId は `survival` / `shinigami-dps` / `gunner-master` |
| `GET /api/events/ranking/:eventId` | `{ranking: [{username, weapon_name, armor_name, score, played_at}]}`（ユーザーごとの最高スコア、上位50） |
| `GET /api/events/my/:eventId` | `{best}`（自分の最高記録、なければ null） |

### 魔王討伐（`routes/raid.ts`）

| メソッド / パス | 内容 |
| --- | --- |
| `GET /api/raid/status` | `{name, bossName, currentHp, totalHp, endAt, myDamage, myPlays, myRank, topList}` |
| `POST /api/raid/contribute` | `{damage}`（0〜50000 に丸める）→ `{ok, newCurrentHp, myTotal}`。ボスHPを減算し、個人の累計ダメージを加算 |

イベントキーは `maou-season1`（HP 10000・30日間）。DB 初期化時にシードされる。

### 最強のプレイヤー（`routes/strongest.ts`）

| メソッド / パス | 内容 |
| --- | --- |
| `GET /api/strongest/neighbors` | 自分の順位と対戦相手（5位以内なら上位5人、それ以外は直上の5人）。初回は最下位に自動登録し、その時点のセーブをスナップショットとして保存 |
| `GET /api/strongest/opponent/:userId` | 相手のスナップショットと、直近5戦のログから算出した `derivedBotConfig` |
| `POST /api/strongest/battle-log` | 戦闘ログ1件を保存（ユーザーごとに直近5件だけ保持） |
| `POST /api/strongest/win` | `{opponentUserId}`。勝利時に順位を入れ替え、自分のスナップショットを更新 |
| `GET/POST /api/strongest/peak` | 週ごとの最高順位（小さいほど上位）の取得 / 更新 |

順位は一意制約付きなので、入れ替えは一時的な負の値を挟んで行っている。

### テーマ縛り（`routes/theme.ts`）

| メソッド / パス | 内容 |
| --- | --- |
| `GET /api/theme/status` | 今週のテーマ（格闘士 / 剣士 / 魔法使い / 槍使い を週番号 % 4 で回す）、自分のベスト・順位、上位10 |
| `POST /api/theme/score` | `{score}`（0〜9999）。ベストスコアを更新 |

テーマの決定は日付だけで決まるので、サーバーがなくてもクライアントで計算できる（保存が必要なのはスコアだけ）。

### オンライン対戦（`rooms.ts`）

WebSocket `/api/ws`。JSON メッセージで、サーバーは部屋ごとに host / guest を中継するだけ。

| メッセージ | 内容 |
| --- | --- |
| `create_room` `{playerData, stageId}` | → `room_created {code}`（4文字コード） |
| `join_room` `{code, playerData}` | → guest に `room_joined {hostData, stageId}`、host に `guest_joined {guestData}` |
| `select_stage` | host のステージ変更 |
| `ping` | → `pong`（プロキシ切断防止） |
| それ以外 | 相手にそのまま転送（入力・ゲーム状態・WebRTC の offer/answer/ICE） |
| （切断時） | 相手に `opponent_disconnected` |

`gameTransport.ts` は、この WebSocket 経由で WebRTC の DataChannel（入力用=信頼/順序あり、状態用=非信頼）を張り、
9秒以内に張れなければ WebSocket にフォールバックする。

## 4. 復活させる方法（おすすめ順）

### A. 元の Express サーバーを別の場所で動かす（最短）

静的フロントは GitHub Pages のまま、`artifacts/api-server` を別ホスティングに置きます。コードは変更不要です。

1. 元 ZIP の `artifacts/api-server` をデプロイする（Render / Fly.io / Railway / Replit Deployments など）
   - Node.js が動く環境。環境変数は `PORT` と、PostgreSQL の接続文字列 `DATABASE_URL`
   - 元のリポジトリ（モノレポ）ごとデプロイするのが楽。`routes/health.ts` が `@workspace/api-zod` を import しているため、`artifacts/api-server` 単体だと `pnpm install` が通らない（health.ts を書き換えれば単体でも可）
   - ビルドは `pnpm --filter @workspace/api-server run build`、起動は `node artifacts/api-server/dist/index.mjs`
   - CORS は `cors()` で全許可済みなので、GitHub Pages のドメインからそのまま呼べる
   - PostgreSQL は Neon / Supabase の無料枠で足りる
   - **`users` `sessions` `save_data` の3テーブルは、ソースのどこにも作成コードが無い**（起動時に作られるのはイベント系のテーブルだけ）。新しい DB では先に手動で作る。コード中のクエリから逆算すると次の形になる（`initTables` が `users` を参照するので、必ずサーバー起動前に）

     ```sql
     CREATE TABLE users (
       id            SERIAL PRIMARY KEY,
       username      VARCHAR(20) UNIQUE NOT NULL,
       password_hash TEXT NOT NULL,
       created_at    TIMESTAMPTZ DEFAULT NOW(),
       last_login_at TIMESTAMPTZ DEFAULT NOW()
     );
     CREATE TABLE sessions (
       token      TEXT PRIMARY KEY,
       user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days'
     );
     CREATE TABLE save_data (
       user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
       data       JSONB NOT NULL DEFAULT '{}',
       updated_at TIMESTAMPTZ DEFAULT NOW()
     );
     ```

     （元の本番 DB の実際の定義とは細部が違う可能性がある。動かなければ元 DB のスキーマを `pg_dump --schema-only` で取って合わせる）
2. GitHub のリポジトリで **Settings → Secrets and variables → Actions → Variables** に登録
   - `VITE_API_BASE` = `https://あなたのAPI.example.com`（末尾スラッシュなし）
   - 必要なら `VITE_WS_URL` = `wss://あなたのAPI.example.com/api/ws`
3. Actions の `Deploy to GitHub Pages` を再実行する

これで全機能が元どおりになります。無料枠のサーバーはスリープするため、初回アクセスが遅くなる点に注意してください。

> 元 ZIP の `artifacts/api-server/.env.local` には DB の接続文字列が入っています。
> ZIP や `.git` を公開リポジトリに上げていた場合は、DB のパスワードを再発行してください。

### B. 機能ごとにサーバーレス / BaaS へ置き換える

自前サーバーを持たず、無料の BaaS（Supabase / Firebase）や Cloudflare Workers + D1、
Google Apps Script + スプレッドシートなどで代替します。差し替えの入口は次のとおりです。

| 機能 | 差し替える場所 | 実装のヒント |
| --- | --- | --- |
| クラウドセーブ | `store/authStore.ts` の `apiGetSave` / `apiPutSave` | Supabase Auth や Firebase Auth + 1ユーザー1ドキュメント。`App.tsx` の `setSaveHook` はそのまま使える |
| イベントのランキング | `lib/eventService.ts` の3関数 | **この3関数だけ書き換えればよい**（返す型は `RankRow`）。`FEATURES.rankings` を ON にする |
| 魔王討伐 | `pages/EventRaidPage.tsx` の `apiFetch` 2か所 | 共有HPの減算は原子的でなければならない（Firestore の `increment`、Supabase の RPC など） |
| 最強のプレイヤー | `pages/EventStrongestPage.tsx` の `apiFetch` 各所 | 順位の入れ替えはトランザクション / RPC で。スナップショット = セーブの JSON |
| テーマ縛り | `pages/EventThemePage.tsx` の `apiFetch` 2か所 | テーマ算出は日付だけ。スコア保存のみサーバーが必要 |

いずれも `apiFetch('/api/...')` の呼び出し箇所を、各サービスの SDK 呼び出しに置き換えれば済みます
（レスポンスの形は「3. 元 API の仕様」に合わせるのが一番楽です）。

### C. サーバーなしでできる範囲

- **セーブのエクスポート / インポート**: `localStorage` の `stick-smash-v2` を JSON で書き出し・読み込みする画面を足せば、別端末への引き継ぎができる
- **オンライン対戦（P2P）**: 中継サーバーの役目は「部屋コードで相手を見つけ、WebRTC の offer/answer/ICE を交換する」ことだけ。次のどちらかで代替できる
  - PeerJS の公開シグナリング（部屋コード = Peer ID）
  - 手動シグナリング（offer/answer を文字列でコピー＆ペースト）。完全にサーバー不要
  - `GameTransport` は `{dcInput, dcState, pc}` を直接受け取れるので、DataChannel さえ張れれば `OnlineGamePage` はそのまま動く。書き換えが必要なのは `OnlineLobbyPage.tsx` の接続部分（`connect()` 以降の部屋作成 / 参加処理）だけ
  - 対戦相手の NAT によっては STUN だけでは繋がらないことがある（TURN が必要）

## 5. 復活させるときの確認ポイント

- `VITE_API_BASE` は**ビルド時**に埋め込まれる。変更したら再ビルド（Actions の再実行）が必要
- API が別オリジンになるので、`https` の Pages から呼ぶ API も `https`（WebSocket は `wss`）にする
- トークンは `localStorage` に保存している（`stick-smash-auth-token`）。静的版でも同じキー名
- 端末内のイベント記録（`stick-smash-event-records-v1`）はサーバー版に移行されない
