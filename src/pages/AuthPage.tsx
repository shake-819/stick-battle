import { useState } from 'react';
import { apiRegister, apiLogin, apiGetSave, setAuth } from '@/store/authStore';
import { save, load } from '@/store/playerStore';
import type { PlayerData } from '@/store/playerStore';

interface AuthPageProps {
  onSuccess: () => void;
}

type Tab = 'login' | 'register';

export default function AuthPage({ onSuccess }: AuthPageProps) {
  const [tab, setTab]           = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const auth = tab === 'register'
        ? await apiRegister(username.trim(), password)
        : await apiLogin(username.trim(), password);

      setAuth(auth.token, auth.username);

      const serverData = await apiGetSave(auth.token);
      if (serverData && Object.keys(serverData).length > 0) {
        const local = load();
        const merged: PlayerData = { ...local, ...(serverData as Partial<PlayerData>) };
        save(merged);
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full min-h-screen bg-gray-950 flex items-center justify-center select-none px-6">
      <div className="w-full max-w-4xl flex rounded-3xl overflow-hidden shadow-2xl border border-gray-800">

        {/* ── Left panel: branding ── */}
        <div className="hidden md:flex flex-col items-center justify-center flex-1 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-950 px-12 py-16 border-r border-gray-800 relative overflow-hidden">
          {/* background glow blobs */}
          <div className="absolute top-10 left-10 w-48 h-48 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-56 h-56 rounded-full bg-red-600/10 blur-3xl pointer-events-none" />

          <h1 className="text-7xl font-black tracking-tighter mb-3 z-10">
            <span className="text-blue-400">STICK</span>
            <br />
            <span className="text-red-400">SMASH</span>
          </h1>
          <p className="text-gray-500 text-sm text-center z-10 leading-relaxed max-w-xs">
            スティック格闘ゲーム<br />
            ガチャ・ボス戦・オンライン対戦が楽しめる
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3 z-10 w-full max-w-xs">
            {[
              { icon: '⚔️', label: 'バトル' },
              { icon: '🎲', label: 'ガチャ' },
              { icon: '👹', label: 'ボス戦' },
              { icon: '🌐', label: 'オンライン' },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-2 bg-gray-800/50 rounded-xl px-3 py-2 border border-gray-700/50">
                <span className="text-lg">{f.icon}</span>
                <span className="text-gray-300 text-xs font-bold">{f.label}</span>
              </div>
            ))}
          </div>

          <p className="mt-8 text-gray-700 text-xs z-10">セーブデータはサーバーに保存されます</p>
        </div>

        {/* ── Right panel: form ── */}
        <div className="flex flex-col justify-center w-full md:w-96 bg-gray-900 px-8 py-12">
          {/* mobile title */}
          <h1 className="md:hidden text-4xl font-black tracking-tight mb-6 text-center">
            <span className="text-blue-400">STICK</span><span className="text-red-400"> SMASH</span>
          </h1>

          <h2 className="text-white font-black text-2xl mb-1">
            {tab === 'login' ? 'ログイン' : 'アカウント作成'}
          </h2>
          <p className="text-gray-500 text-xs mb-6">
            {tab === 'login' ? 'アカウントにサインインしてください' : 'ユーザ名とパスワードを設定してください'}
          </p>

          {/* Tab switcher */}
          <div className="flex mb-6 rounded-xl overflow-hidden border border-gray-700">
            <button
              onClick={() => { setTab('login'); setError(''); }}
              className={`flex-1 py-2.5 text-sm font-bold transition-all ${tab === 'login' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
              ログイン
            </button>
            <button
              onClick={() => { setTab('register'); setError(''); }}
              className={`flex-1 py-2.5 text-sm font-bold transition-all ${tab === 'register' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
              新規登録
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-bold">ユーザ名</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="3〜20文字 英数字・_"
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500 transition-colors placeholder-gray-600"
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-bold">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="4文字以上"
                className="w-full bg-gray-800 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500 transition-colors placeholder-gray-600"
                autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
                required
              />
            </div>

            {error && (
              <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-2.5 text-red-300 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-all active:scale-95 mt-1 text-base shadow-lg shadow-blue-900/30">
              {loading ? '...' : tab === 'login' ? 'ログイン' : '登録して始める'}
            </button>
          </form>

          {tab === 'register' && (
            <p className="text-gray-600 text-[10px] text-center mt-4 leading-relaxed">
              14日間ログインがないとデータが自動削除されます
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
