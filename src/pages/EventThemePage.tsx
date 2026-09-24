import { useEffect, useRef, useState, useCallback } from 'react';
import { load, computeEffectiveStats, recordBattleResult } from '@/store/playerStore';
import { getAuth } from '@/store/authStore';
import { apiFetch } from '@/lib/backend';
import { WEAPONS } from '@/data/equipment';
import type { WeaponDef } from '@/data/equipment';
import { STAGES } from '@/data/stages';
import {
  W, H, BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP,
  BOT_CONFIGS, LOCKED_STATES, ACTION_STATES, SPECIAL_NAMES, SP_COLS,
  makeFighter, respawnFighter, overlap,
  startSpecial, mkProj, getAttackFrames, applyMeleeHit, applyProjHit,
  updateFighter, updateBot, updateProjectiles, spawn, updateParticles,
  drawScene, drawGuardGauge,
  type Fighter, type Particle, type Projectile,
} from '@/lib/gameEngine';
import type { BotConfig } from '@/types/game';
import type { EffectiveStats } from '@/store/playerStore';

interface Props { onBack: () => void; }

type Phase = 'loading' | 'info' | 'fight' | 'result';

interface ThemeStatus {
  themeKey: string;
  seasonKey: string;
  name: string;
  emoji: string;
  weaponType: string | null;
  desc: string;
  myBest: number | null;
  myPlays: number;
  myRank: number | null;
  topList: { username: string; bestScore: number; rank: number }[];
}

const STAGE  = STAGES[0];
const THEME_COLORS: Record<string, string> = {
  fighting: '#f97316',
  sword:    '#3b82f6',
  staff:    '#a855f7',
  spear:    '#22c55e',
};

function getBotCfg(kills: number): BotConfig {
  if (kills < 5)  return { ...BOT_CONFIGS['easy'] };
  if (kills < 10) return { ...BOT_CONFIGS['medium'] };
  return { ...BOT_CONFIGS['hard'] };
}

function getDiffLabel(kills: number) {
  if (kills < 5)  return { label: 'Easy',   color: '#22c55e' };
  if (kills < 10) return { label: 'Medium', color: '#facc15' };
  if (kills < 20) return { label: 'Hard',   color: '#f97316' };
  return { label: 'ULTRA', color: '#a855f7' };
}

function getBotColor(kills: number) {
  if (kills >= 20) return '#a855f7';
  if (kills >= 10) return '#ef4444';
  if (kills >= 5)  return '#f97316';
  return '#ef4444';
}

function getThemeWeapon(weaponType: string | null): WeaponDef | null {
  if (!weaponType) return null;
  const myData   = load();
  const myWeapon = myData.equippedWeaponId
    ? WEAPONS.find(w => w.id === myData.equippedWeaponId) ?? null : null;
  if (myWeapon?.type === weaponType) return myWeapon;
  return WEAPONS.find(w => w.type === weaponType) ?? null;
}

let _spFlash = { text: '', timer: 0 };

export default function EventThemePage({ onBack }: Props) {
  const [phase,      setPhase]      = useState<Phase>('loading');
  const [status,     setStatus]     = useState<ThemeStatus | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [startKey,   setStartKey]   = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [newBest,    setNewBest]    = useState<number | null>(null);

  const canvasRef       = useRef<HTMLCanvasElement>(null);
  const keysRef         = useRef<Set<string>>(new Set());
  const gsRef           = useRef<{
    player: Fighter; bot: Fighter;
    parts: Particle[]; projs: Projectile[];
    frame: number; over: boolean; killCount: number;
  } | null>(null);
  const rafRef          = useRef<number>(0);
  const scoreRef        = useRef(0);
  const botBaseStatsRef = useRef<EffectiveStats | null>(null);
  const themeWeaponRef  = useRef<WeaponDef | null>(null);

  const auth   = getAuth();
  const accent = THEME_COLORS[status?.themeKey ?? 'sword'] ?? '#3b82f6';

  const loadStatus = useCallback(async () => {
    if (!auth) { setError('ログインが必要です'); setPhase('info'); return; }
    try {
      const r = await apiFetch('/api/theme/status', { headers: { Authorization: `Bearer ${auth.token}` } });
      const j = await r.json();
      setStatus(j);
      setPhase('info');
    } catch {
      setError('テーマ情報の取得に失敗しました');
      setPhase('info');
    }
  }, [auth?.token]);

  useEffect(() => { loadStatus(); }, []);

  // ── Spawn a fresh bot ────────────────────────────────────────────────────
  const spawnBot = useCallback((kills: number, bx: number): Fighter => {
    const base = botBaseStatsRef.current!;
    const cfg  = getBotCfg(kills);
    const botWeapon = WEAPONS.find(w => w.type === 'sword') ?? null;
    const bot = makeFighter(bx, true, base, 1, cfg, botWeapon, null);
    const scale = kills >= 20 ? 1.5 : kills >= 10 ? 1.3 : kills >= 5 ? 1.15 : 1.0;
    bot.attackMult  = (bot.attackMult  ?? 1) * scale;
    bot.defenseMult = (bot.defenseMult ?? 1) * (1 + (scale - 1) * 0.5);
    bot.speedMult   = (bot.speedMult   ?? 1) * (1 + (scale - 1) * 0.3);
    bot.color       = getBotColor(kills);
    bot.invincible  = 40;
    return bot;
  }, []);

  // ── Game init ─────────────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    _spFlash = { text: '', timer: 0 };
    const myData  = load();
    const myStats = computeEffectiveStats(myData);
    botBaseStatsRef.current = myStats;

    const weaponType  = status?.weaponType ?? null;
    const themeWeapon = getThemeWeapon(weaponType);
    themeWeaponRef.current = themeWeapon;

    const [px, bx] = STAGE.spawnX;
    const player = makeFighter(px, false, myStats, 1, undefined, themeWeapon, myStats.equippedArmor);
    const bot    = spawnBot(0, bx);

    gsRef.current = { player, bot, parts: [], projs: [], frame: 0, over: false, killCount: 0 };
    scoreRef.current = 0;
  }, [status, spawnBot]);

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keysRef.current.add(e.key);
    const s = gsRef.current; if (!s || s.over) return;
    const { player } = s;
    const inAction = ACTION_STATES.includes(player.state);

    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      if (player.jumpsLeft > 0 && !LOCKED_STATES.includes(player.state)) {
        player.vel.y = player.jumpsLeft === player.maxJumps ? BASE_JUMP : BASE_DJUMP;
        player.vel.y *= player.jumpMult;
        player.jumpsLeft--; player.state = 'jump';
      }
    }
    if (e.key === 'z' || e.key === 'Z' || e.key === 'j' || e.key === 'J') {
      if (!inAction && player.state !== 'dead') {
        const dn  = keysRef.current.has('ArrowDown') || keysRef.current.has('s') || keysRef.current.has('S');
        const air = player.state === 'jump' || player.state === 'fall';
        const t   = air ? 'airAttack' : dn ? 'downAttack' : 'attack';
        player.state = t; player.stateTimer = getAttackFrames(player.weapon, t); player.attackActive = false;
      }
    }
    if (e.key === 'x' || e.key === 'X' || e.key === 'k' || e.key === 'K') {
      if (!inAction && player.state !== 'dead') {
        player.state = 'strongAttack'; player.stateTimer = getAttackFrames(player.weapon, 'strongAttack'); player.attackActive = false;
      }
    }
    if (e.key === 'v' || e.key === 'V' || e.key === 'u' || e.key === 'U') {
      if (!inAction && player.state !== 'dead') {
        player.state = 'upAttack'; player.stateTimer = getAttackFrames(player.weapon, 'upAttack'); player.attackActive = false;
      }
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (!inAction && player.state !== 'dead' && player.specialCooldown === 0) {
        const kind = startSpecial(player, keysRef.current);
        if (kind) {
          _spFlash = { text: `✨ ${SPECIAL_NAMES[kind] ?? kind}`, timer: 55 };
          if (kind === 'specialNeutral')
            s.projs.push(mkProj('player', player.pos.x + player.dir * 22, player.pos.y - 40, player.dir * 9.5, 12, 4, player.attackMult, '#818cf8'));
        }
      }
    }
    if ((e.key === 'c' || e.key === 'C') && !LOCKED_STATES.includes(player.state) && player.state !== 'dead' && player.counterCooldown === 0 && player.onGround) {
      e.preventDefault();
      player.state = 'counter'; player.stateTimer = 22;
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => { keysRef.current.delete(e.key); }, []);

  // ── Game loop ─────────────────────────────────────────────────────────────
  const runLoop = useCallback((ctx: CanvasRenderingContext2D, onGameOver: (kills: number) => void) => {
    const platforms  = STAGE.platforms;
    const [px, bx]   = STAGE.spawnX;

    const loop = () => {
      const s = gsRef.current; if (!s || s.over) return;
      s.frame++;

      // ── Bot respawn: if bot fully dead, immediately spawn next ─────────────
      if (s.bot.stocks <= 0 && s.bot.state === 'dead' && s.bot.stateTimer <= 0) {
        s.killCount++;
        scoreRef.current = s.killCount;
        s.bot = spawnBot(s.killCount, bx);
        s.projs = s.projs.filter(p => p.owner === 'player');
      }

      const { player, parts, projs } = s;
      const bot = s.bot;

      const cfg = getBotCfg(s.killCount);
      updateBot(bot, player, cfg, projs, platforms);
      updateFighter(player, keysRef.current, platforms);
      updateFighter(bot,    new Set(),       platforms);
      player.vel.x = Math.max(-15, Math.min(15, player.vel.x));
      bot.vel.x    = Math.max(-15, Math.min(15, bot.vel.x));

      applyMeleeHit(player, bot,    parts, projs);
      applyMeleeHit(bot,    player, parts, projs);

      for (let i = projs.length - 1; i >= 0; i--) {
        const proj = projs[i];
        const vic  = proj.owner === 'player' ? bot : player;
        if (vic.invincible > 0 || vic.state === 'dead') continue;
        if (!overlap(proj.pos.x - proj.size, proj.pos.y - proj.size, proj.size * 2, proj.size * 2,
                     vic.pos.x - 14, vic.pos.y - 60, 28, 60)) continue;
        const hitCols = proj.owner === 'player' ? SP_COLS.specialNeutral : ['#ef4444', '#fca5a5', '#fff'];
        applyProjHit(vic, proj.pos, proj.vel, proj.atkMult, proj.knockback, proj.damage, parts, undefined, hitCols);
        projs.splice(i, 1);
      }
      updateProjectiles(projs);

      // ── Blast zones ──────────────────────────────────────────────────────
      const checkBlast = (f: Fighter, isPlayer: boolean) => {
        if (f.state === 'dead') return;
        if (f.pos.x < BLAST_L || f.pos.x > BLAST_R || f.pos.y < BLAST_T || f.pos.y > BLAST_B) {
          f.stocks--;
          f.state = 'dead';
          f.stateTimer = isPlayer ? 90 : 35; // bot dies fast, player has brief pause
          f.attackActive = false;
          // Respawn player if stocks remain
          if (isPlayer && f.stocks > 0)
            setTimeout(() => { if (gsRef.current && !gsRef.current.over) respawnFighter(f, px); }, 1500);
          // Bot respawn is handled at start of next loop iteration
        }
      };
      checkBlast(player, true);
      checkBlast(bot,    false);

      // ── Game over: player out of stocks ──────────────────────────────────
      if (player.stocks <= 0 && player.state === 'dead' && player.stateTimer <= 0) {
        s.over = true;
        onGameOver(s.killCount);
        return;
      }

      updateParticles(parts);
      ctx.clearRect(0, 0, W, H);
      drawScene(ctx, player, bot, s.frame, parts, projs, STAGE);

      // ── HUD ──────────────────────────────────────────────────────────────
      ctx.save();
      const diff = getDiffLabel(s.killCount);

      const drawPanel = (f: Fighter, label: string, hx: number) => {
        const dc = f.damage < 30 ? '#22c55e' : f.damage < 80 ? '#facc15' : '#ef4444';
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(hx, H - 112, 190, 100, 10); ctx.fill();
        ctx.fillStyle = f.color; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
        ctx.fillText(label, hx + 95, H - 94);
        ctx.fillStyle = dc; ctx.font = `bold ${Math.min(40, 28 + f.damage * 0.07)}px monospace`;
        ctx.textAlign = 'center'; ctx.fillText(`${Math.floor(f.damage)}%`, hx + 95, H - 56);
        ctx.beginPath(); ctx.arc(hx + 60, H - 34, 7, 0, Math.PI * 2);
        ctx.fillStyle = f.stocks > 0 ? f.color : '#374151'; ctx.fill();
      };
      drawPanel(player, `あなた`, 8);
      drawPanel(bot,    `敵 #${s.killCount + 1}`, W - 198);
      drawGuardGauge(ctx, player, 16, H - 128);

      // Kill count + difficulty HUD (top center)
      ctx.fillStyle = accent + '33'; ctx.strokeStyle = accent; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(W / 2 - 120, 6, 240, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`${status?.emoji ?? ''} ${status?.name ?? ''} | 撃破: ${s.killCount}体`, W / 2, 21);

      // Difficulty badge (top right)
      ctx.fillStyle = diff.color + '33'; ctx.strokeStyle = diff.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(W - 74, 6, 68, 22, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = diff.color; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(diff.label, W - 40, 21);

      // Weapon restriction label
      ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      const wLabel = status?.weaponType ? `武器縛り: ${status.weaponType}` : '武器縛り: 素手のみ';
      ctx.fillText(wLabel, W / 2, 36);

      if (_spFlash.timer > 0) {
        _spFlash.timer--;
        ctx.globalAlpha = Math.min(1, _spFlash.timer / 20);
        ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = accent; ctx.textAlign = 'center';
        ctx.shadowColor = accent; ctx.shadowBlur = 16;
        ctx.fillText(_spFlash.text, W / 2, 62);
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };
    return loop;
  }, [status, accent, spawnBot]);

  // ── Start game ────────────────────────────────────────────────────────────
  const startGame = () => {
    scoreRef.current = 0;
    setStartKey(k => k + 1);
    setPhase('fight');
  };

  // ── Fight effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'fight' || !canvasRef.current) return;

    initGame();
    const ctx = canvasRef.current.getContext('2d')!;

    const handleGameOver = async (kills: number) => {
      cancelAnimationFrame(rafRef.current);
      recordBattleResult(false, 0);
      setFinalScore(kills);
      if (auth) {
        try {
          const r = await apiFetch('/api/theme/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ score: kills }),
          });
          if (r.ok) { const j = await r.json(); setNewBest(j.newBest); }
        } catch { /* ignore */ }
      }
      setPhase('result');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup',   handleKeyUp);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(runLoop(ctx, handleGameOver));

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',   handleKeyUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase, startKey]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">⚔️</div>
          <div className="text-white font-bold text-lg">読み込み中...</div>
        </div>
      </div>
    );
  }

  // ── Render: info ──────────────────────────────────────────────────────────
  if (phase === 'info') {
    return (
      <div className="min-h-screen flex flex-col items-center py-6 px-4 select-none"
           style={{ background: 'linear-gradient(to bottom, #0a0a10, #0f172a)' }}>
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-5">
            <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">← 戻る</button>
            <div>
              <h1 className="text-2xl font-black text-white">
                {status?.emoji ?? '⚔️'} {status?.name ?? 'テーマランキング'}
              </h1>
              <p className="text-gray-500 text-xs">{status?.desc ?? ''} ・週替わりランキング</p>
            </div>
          </div>

          {error && <div className="mb-4 bg-red-900/40 border border-red-700 rounded-xl p-3 text-red-300 text-sm">{error}</div>}

          {/* Theme info */}
          <div className="mb-5 rounded-2xl border p-4" style={{ background: 'rgba(0,0,0,0.5)', borderColor: accent + '55' }}>
            <div className="text-xs text-gray-400 mb-3">今週のルール</div>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-5xl">{status?.emoji ?? '⚔️'}</span>
              <div>
                <div className="text-white font-black text-lg">{status?.name ?? '—'}</div>
                <div className="text-sm font-bold" style={{ color: accent }}>{status?.desc ?? ''}</div>
              </div>
            </div>
            <div className="text-xs text-gray-400 leading-relaxed space-y-1">
              <div>⚡ 敵は倒すとすぐ次が出現（待ち時間なし）</div>
              <div>📈 5体→Medium / 10体→Hard / 20体→ULTRA</div>
              <div>💀 負けた時点で終了。スコア = 倒した数</div>
              <div>🏆 ベストスコアのみ記録（何度でも挑戦可）</div>
            </div>
          </div>

          {/* My stats */}
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { label: '自己ベスト', value: status?.myBest != null ? `${status.myBest}体` : '未プレイ' },
              { label: '参加回数',   value: `${status?.myPlays ?? 0}回` },
              { label: 'ランク',     value: status?.myRank != null ? `#${status.myRank}` : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-gray-700 p-3 text-center bg-gray-900/40">
                <div className="text-[10px] text-gray-400 mb-0.5">{label}</div>
                <div className="text-white font-black text-base">{value}</div>
              </div>
            ))}
          </div>

          {/* Leaderboard */}
          {(status?.topList.length ?? 0) > 0 && (
            <div className="mb-5">
              <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">🏆 今週のランキング</div>
              <div className="space-y-1.5">
                {status!.topList.map((p, i) => (
                  <div key={p.username} className="flex items-center gap-2 rounded-xl px-3 py-2 border border-gray-700 bg-gray-900/40">
                    <span className={`font-black text-sm w-6 text-center ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${p.rank}`}
                    </span>
                    <span className="text-white text-sm font-bold flex-1">{p.username}</span>
                    <span className="text-sm font-black" style={{ color: accent }}>{p.bestScore}体</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={startGame}
            className="w-full font-black text-lg py-4 rounded-2xl transition-all active:scale-95 text-white"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)`, boxShadow: `0 0 24px ${accent}44` }}>
            {status?.emoji ?? '⚔️'} 出陣する
          </button>
          <p className="text-center text-gray-600 text-xs mt-3">来週は別のテーマに変わります</p>
        </div>
      </div>
    );
  }

  // ── Render: result ────────────────────────────────────────────────────────
  if (phase === 'result') {
    const prevBest   = status?.myBest ?? 0;
    const isNewBest  = newBest !== null && (prevBest === null || newBest > prevBest);
    const diff       = getDiffLabel(finalScore);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 select-none"
           style={{ background: 'linear-gradient(to bottom, #0a0a10, #0f172a)' }}>
        <div className="w-full max-w-md text-center">
          <div className="text-6xl mb-3">💀</div>
          <h2 className="text-3xl font-black text-white mb-1">力尽きた</h2>
          <p className="text-gray-400 text-sm mb-6">お疲れ様でした！</p>

          <div className="rounded-2xl border p-5 mb-4" style={{ background: 'rgba(0,0,0,0.5)', borderColor: accent + '55' }}>
            <div className="text-xs text-gray-400 mb-1">撃破数</div>
            <div className="text-6xl font-black mb-1" style={{ color: accent }}>{finalScore}</div>
            <div className="text-gray-400 text-sm mb-3">体</div>
            <div className="inline-block rounded-lg px-3 py-1 text-sm font-black mb-3"
                 style={{ background: diff.color + '22', color: diff.color, border: `1px solid ${diff.color}66` }}>
              最高難易度: {diff.label}
            </div>
            {isNewBest && (
              <div className="block bg-yellow-900/40 border border-yellow-600 rounded-xl px-4 py-1 text-yellow-300 font-black text-sm">
                🎉 自己ベスト更新！
              </div>
            )}
            {!isNewBest && prevBest > 0 && (
              <div className="text-gray-500 text-sm">自己ベスト: {prevBest}体</div>
            )}
          </div>

          <div className="space-y-3">
            <button onClick={startGame}
              className="w-full font-black text-base py-3 rounded-xl text-white active:scale-95"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }}>
              もう一度挑戦
            </button>
            <button onClick={() => { loadStatus(); }}
              className="w-full font-black text-base py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white border border-gray-600 active:scale-95">
              📊 ランキングを確認
            </button>
            <button onClick={onBack} className="w-full text-gray-400 hover:text-gray-200 text-sm py-2">
              ← イベント一覧へ戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: fight ─────────────────────────────────────────────────────────
  return (
    <div className="w-full h-screen flex flex-col items-center justify-center select-none overflow-hidden"
         style={{ background: 'linear-gradient(to bottom, #0a0a10, #0f172a)' }}>
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H}
          className="rounded-xl border shadow-2xl"
          style={{
            display: 'block', maxWidth: '100vw', maxHeight: '80vh',
            aspectRatio: `${W}/${H}`,
            borderColor: accent + '44',
            boxShadow: `0 0 40px ${accent}22`,
          }}
        />
      </div>
      <div className="mt-3 flex gap-4 text-xs text-gray-600 flex-wrap justify-center">
        <span>← → 移動</span><span>↑/W ジャンプ</span>
        <span>Z 攻撃</span><span>X 強攻撃</span><span>V 上攻撃</span>
        <span>Space スペシャル</span><span>C カウンター</span>
      </div>
    </div>
  );
}
