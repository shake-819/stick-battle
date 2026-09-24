/**
 * backend.ts — 動的機能（サーバー通信）の切替ポイント
 *
 * GitHub Pages のような静的ホスティングにはサーバーが無いため、
 * 既定では「バックエンドなし（静的モード）」で動作する。
 *
 * 後から動的機能を復活させたいときは、ビルド時に環境変数を渡すだけでよい:
 *   VITE_API_BASE = https://your-api.example.com   （末尾スラッシュなし）
 *   VITE_WS_URL   = wss://your-api.example.com/api/ws  （省略時は API_BASE から自動生成）
 *
 * GitHub Actions では リポジトリの Settings → Secrets and variables →
 * Actions → Variables に VITE_API_BASE を登録すれば反映される。
 * 詳細は docs/DYNAMIC_FEATURES.md を参照。
 */

const rawApiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const rawWsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? '';

/** API サーバーのオリジン（例: https://example.com）。未設定なら空文字。 */
export const API_BASE: string = rawApiBase.trim().replace(/\/+$/, '');

/** バックエンドが設定されているか */
export const BACKEND_ENABLED: boolean = API_BASE.length > 0;

/** オンライン対戦用 WebSocket の URL。未設定なら空文字。 */
export const WS_URL: string =
  rawWsUrl.trim() || (BACKEND_ENABLED ? `${API_BASE.replace(/^http/, 'ws')}/api/ws` : '');

/**
 * 機能フラグ。false の機能は画面に出ず、通信も発生しない。
 * 個別に切り替えたい場合は、ここの式を書き換えればよい。
 */
export const FEATURES = {
  /** ログイン / クラウドセーブ / アカウント削除 */
  accounts: BACKEND_ENABLED,
  /** 限定イベント（サバイバル・戦神・ガンナー）の共有ランキング。false の間は端末内の自己ベストのみ */
  rankings: BACKEND_ENABLED,
  /** 魔王討伐（全員共有HP）・最強のプレイヤー・テーマ縛りランキング */
  serverEvents: BACKEND_ENABLED,
  /** オンライン対戦（WebSocket / WebRTC） */
  online: WS_URL.length > 0,
} as const;

/** バックエンド未設定時に apiFetch が投げるエラー */
export class BackendDisabledError extends Error {
  constructor() {
    super('バックエンドが設定されていません（静的モード）');
    this.name = 'BackendDisabledError';
  }
}

/**
 * fetch のラッパー。path は '/api/...' 形式で渡す。
 * バックエンド未設定なら通信せずに reject する（既存の try/catch がそのまま効く）。
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!BACKEND_ENABLED) return Promise.reject(new BackendDisabledError());
  return fetch(`${API_BASE}${path}`, init);
}
