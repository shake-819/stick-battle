import { apiFetch } from '@/lib/backend';

const TOKEN_KEY = 'stick-smash-auth-token';
const USERNAME_KEY = 'stick-smash-auth-username';

export interface AuthState {
  token: string;
  username: string;
}

export function getAuth(): AuthState | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const username = localStorage.getItem(USERNAME_KEY);
  if (token && username) return { token, username };
  return null;
}

export function setAuth(token: string, username: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

// Safe JSON parser — never throws "unexpected end of JSON input"
async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

const AUTH_PATH = '/api/auth';

export async function apiRegister(username: string, password: string): Promise<AuthState> {
  let res: Response;
  try {
    res = await apiFetch(`${AUTH_PATH}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('サーバーに接続できません。しばらく待ってから再試行してください。');
  }
  const json = await safeJson(res);
  if (!res.ok) throw new Error((json.error as string) ?? '登録に失敗しました');
  if (!json.token) throw new Error('サーバーエラー（レスポンス不正）');
  return { token: json.token as string, username: json.username as string };
}

export async function apiLogin(username: string, password: string): Promise<AuthState> {
  let res: Response;
  try {
    res = await apiFetch(`${AUTH_PATH}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('サーバーに接続できません。しばらく待ってから再試行してください。');
  }
  const json = await safeJson(res);
  if (!res.ok) throw new Error((json.error as string) ?? 'ログインに失敗しました');
  if (!json.token) throw new Error('サーバーエラー（レスポンス不正）');
  return { token: json.token as string, username: json.username as string };
}

export async function apiLogout(token: string): Promise<void> {
  try {
    await apiFetch(`${AUTH_PATH}/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* ignore */ }
}

export async function apiGetSave(token: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await apiFetch(`${AUTH_PATH}/save`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return {};
  }
  if (!res.ok) return {};
  const json = await safeJson(res);
  return (json.data as Record<string, unknown>) ?? {};
}

export async function apiPutSave(token: string, data: unknown): Promise<void> {
  try {
    await apiFetch(`${AUTH_PATH}/save`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ data }),
    });
  } catch { /* ignore */ }
}

export async function apiDeleteAccount(token: string): Promise<void> {
  let res: Response;
  try {
    res = await apiFetch(`${AUTH_PATH}/account`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error('サーバーに接続できません');
  }
  if (!res.ok) {
    const json = await safeJson(res);
    throw new Error((json.error as string) ?? 'アカウント削除に失敗しました');
  }
}
