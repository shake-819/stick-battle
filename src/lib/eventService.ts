/**
 * eventService.ts — 限定イベント（サバイバル / 戦神 / ガンナー）の記録サービス
 *
 * - 静的モード（既定）: この端末の localStorage に自己ベスト履歴を保存する。
 *   ランキングは「この端末の記録」だけが並ぶ。
 * - サーバー設定時（VITE_API_BASE あり）: 元の API（/api/events/*）に送受信する。
 *
 * 共有ランキングを別のバックエンド（Supabase / Firebase / GAS など）で
 * 実装したくなったら、このファイルの 3 関数の中身を差し替えるだけでよい。
 */
import { apiFetch, FEATURES } from '@/lib/backend';
import { getAuth } from '@/store/authStore';

export interface RankRow {
  username: string;
  weapon_name: string | null;
  armor_name: string | null;
  score: number;
  played_at: string;
}

const LOCAL_KEY = 'stick-smash-event-records-v1';
const LOCAL_LIMIT = 20;
const LOCAL_NAME = 'あなた';

type LocalStore = Record<string, RankRow[]>;

function readLocal(): LocalStore {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as LocalStore;
    }
  } catch { /* ignore */ }
  return {};
}

function writeLocal(store: LocalStore): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}

function nowLabel(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** スコアを記録する。失敗したら throw する。 */
export async function submitEventScore(
  eventId: string,
  score: number,
  weaponName: string | null,
  armorName: string | null,
): Promise<void> {
  if (FEATURES.rankings) {
    const auth = getAuth();
    if (!auth) throw new Error('ログインが必要です');
    const res = await apiFetch('/api/events/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ eventId, score, weaponName, armorName }),
    });
    if (!res.ok) throw new Error('送信失敗');
    return;
  }

  const store = readLocal();
  const list = store[eventId] ?? [];
  list.push({
    username: LOCAL_NAME,
    weapon_name: weaponName,
    armor_name: armorName,
    score,
    played_at: nowLabel(),
  });
  list.sort((a, b) => b.score - a.score);
  store[eventId] = list.slice(0, LOCAL_LIMIT);
  writeLocal(store);
}

/** ランキング（スコア降順）を取得する。 */
export async function fetchEventRanking(eventId: string): Promise<RankRow[]> {
  if (FEATURES.rankings) {
    const r = await apiFetch(`/api/events/ranking/${eventId}`);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.ranking ?? []) as RankRow[];
  }
  return readLocal()[eventId] ?? [];
}

/** 自分のベスト記録を取得する。無ければ null。 */
export async function fetchMyBest(eventId: string): Promise<RankRow | null> {
  if (FEATURES.rankings) {
    const auth = getAuth();
    if (!auth) return null;
    const r = await apiFetch(`/api/events/my/${eventId}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return (j.best ?? null) as RankRow | null;
  }
  return (readLocal()[eventId] ?? [])[0] ?? null;
}

/** 端末内に保存した自己ベスト履歴を全消去する（「新規作成」時に使用）。 */
export function clearLocalEventRecords(): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch { /* ignore */ }
}
