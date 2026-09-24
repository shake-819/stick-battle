/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 動的機能用 API サーバーのオリジン（未設定なら静的モード） */
  readonly VITE_API_BASE?: string;
  /** オンライン対戦用 WebSocket URL（省略時は VITE_API_BASE から自動生成） */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
