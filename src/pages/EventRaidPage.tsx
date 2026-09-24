import { useEffect, useRef, useState, useCallback } from 'react';
import { load, computeEffectiveStats, recordBattleResult } from '@/store/playerStore';
import { getAuth } from '@/store/authStore';
import { apiFetch } from '@/lib/backend';
import { STAGES } from '@/data/stages';
import {
  W, H, BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP,
  LOCKED_STATES, ACTION_STATES, SPECIAL_NAMES, SP_COLS,
  makeFighter, respawnFighter, overlap,
  startSpecial, mkProj, getAttackFrames, applyMeleeHit, applyProjHit,
  updateFighter, updateBot, updateProjectiles, spawn, updateParticles,
  drawScene, drawGuardGauge,
  type Fighter, type Particle, type Projectile,
} from '@/lib/gameEngine';
import type { BotConfig } from '@/types/game';

interface Props { onBack: () => void; }

type Phase = 'loading' | 'info' | 'fight' | 'result';

interface EventStatus {
  name: string;
  bossName: string;
  currentHp: number;
  totalHp: number;
  endAt: string;
  myDamage: number;
  myPlays: number;
  myRank: number | null;
  topList: { username: string; totalDamage: number; rank: number }[];
}

const STAGE = STAGES[0];
const BOSS_COLOR = '#7c3aed';
const BOSS_STOCKS = 3;
const PLAYER_STOCKS = 2;

const MAOU_CFG: BotConfig = {
  label: '魔王', sub: '禍津の魔王', levelEq: 60,
  speedMult: 1.35, attackMult: 1.7,
  decisionMin: 1, decisionMax: 4,
  attackRange: 105, missChance: 0.00,
  usesSpecial: true, edgeGuard: true,
  guardChance: 0.18, counterChance: 0.10,
};

let _spFlash = { text: '', timer: 0 };

function fmtNum(n: number) { return n.toLocaleString('ja-JP'); }
function fmtPct(cur: number, total: number) {
  return ((1 - cur / total) * 100).toFixed(1);
}

export default function EventRaidPage({ onBack }: Props) {
  const [phase, setPhase]       = useState<Phase>('loading');
  const [status, setStatus]     = useState<EventStatus | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [runDamage, setRunDamage] = useState(0);
  const [didWin, setDidWin]     = useState(false);
  const [newMyTotal, setNewMyTotal] = useState(0);
  const [newCommunityHp, setNewCommunityHp] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef   = useRef<Set<string>>(new Set());
  const gsRef     = useRef<{
    player: Fighter; bot: Fighter;
    parts: Particle[]; projs: Projectile[];
    frame: number; over: boolean;
    playerDmgDealt: number;
  } | null>(null);
  const rafRef = useRef<number>(0);

  const auth = getAuth();

  const loadStatus = useCallback(async () => {
    if (!auth) { setError('ログインが必要です'); setPhase('info'); return; }
    try {
      const r = await apiFetch('/api/raid/status', {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      const j = await r.json();
      setStatus(j);
      setPhase('info');
    } catch {
      setError('イベント情報の取得に失敗しました');
      setPhase('info');
    }
  }, [auth?.token]);

  useEffect(() => { loadStatus(); }, []);

  // ── Game init ─────────────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    _spFlash = { text: '', timer: 0 };
    const myData  = load();
    const myStats = computeEffectiveStats(myData);
    const [px, bx] = STAGE.spawnX;
    const player = makeFighter(px, false, myStats, PLAYER_STOCKS);
    const boss   = makeFighter(bx, true, myStats, BOSS_STOCKS, MAOU_CFG, null, null);
    boss.attackMult  = 2.0;
    boss.defenseMult = 1.6;
    boss.speedMult   = 1.3;
    boss.jumpMult    = 1.1;
    boss.berserker   = false;
    boss.color       = BOSS_COLOR;
    gsRef.current = { player, bot: boss, parts: [], projs: [], frame: 0, over: false, playerDmgDealt: 0 };
  }, []);

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    keysRef.current.add(e.key);
    const s = gsRef.current; if (!s || s.over) return;
    const { player } = s;
    const inAction = ACTION_STATES.includes(player.state);

    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      if (player.jumpsLeft > 0 && !LOCKED_STATES.includes(player.state)) {
        const jv = player.jumpsLeft === player.maxJumps ? BASE_JUMP : BASE_DJUMP;
        player.vel.y = jv * player.jumpMult;
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
  const runLoop = useCallback((ctx: CanvasRenderingContext2D, onGameOver: (won: boolean, dmg: number) => void) => {
    const platforms = STAGE.platforms;
    const [px, bx]  = STAGE.spawnX;

    const loop = () => {
      const s = gsRef.current; if (!s || s.over) return;
      s.frame++;
      const { player, bot, parts, projs } = s;

      updateBot(bot, player, MAOU_CFG, projs, platforms);
      updateFighter(player, keysRef.current, platforms);
      updateFighter(bot,    new Set(),       platforms);
      player.vel.x = Math.max(-15, Math.min(15, player.vel.x));
      bot.vel.x    = Math.max(-15, Math.min(15, bot.vel.x));

      // player → boss
      const r1 = applyMeleeHit(player, bot, parts, projs);
      if (r1.hit) s.playerDmgDealt += r1.dmgDealt;

      // boss → player
      applyMeleeHit(bot, player, parts, projs);

      // projectiles
      for (let i = projs.length - 1; i >= 0; i--) {
        const proj = projs[i];
        const vic  = proj.owner === 'player' ? bot : player;
        if (vic.invincible > 0 || vic.state === 'dead') continue;
        const { pos, weapon } = vic as Fighter & { weapon: unknown };
        void weapon;
        if (!overlap(proj.pos.x - proj.size, proj.pos.y - proj.size, proj.size * 2, proj.size * 2,
                     vic.pos.x - 14, vic.pos.y - 60, 28, 60)) continue;
        const hitCols = proj.owner === 'player' ? SP_COLS.specialNeutral : ['#7c3aed', '#a78bfa', '#ffffff'];
        const dealt = applyProjHit(vic, proj.pos, proj.vel, proj.atkMult, proj.knockback, proj.damage, parts, undefined, hitCols);
        if (dealt && proj.owner === 'player') s.playerDmgDealt += proj.damage * proj.atkMult;
        projs.splice(i, 1);
      }
      updateProjectiles(projs);

      // blast zones
      const checkBlast = (f: Fighter, isP: boolean) => {
        if (f.state === 'dead') return;
        if (f.pos.x < BLAST_L || f.pos.x > BLAST_R || f.pos.y < BLAST_T || f.pos.y > BLAST_B) {
          f.stocks--; f.state = 'dead'; f.stateTimer = 90; f.attackActive = false;
          if (f.stocks > 0) setTimeout(() => { if (gsRef.current && !gsRef.current.over) respawnFighter(f, isP ? px : bx); }, 1500);
        }
      };
      checkBlast(player, true); checkBlast(bot, false);

      const playerDead = player.stocks <= 0 && player.state === 'dead' && player.stateTimer <= 0;
      const botDead    = bot.stocks    <= 0 && bot.state    === 'dead' && bot.stateTimer    <= 0;
      if (playerDead || botDead) {
        s.over = true;
        onGameOver(botDead, s.playerDmgDealt);
        return;
      }

      updateParticles(parts);
      ctx.clearRect(0, 0, W, H);
      drawScene(ctx, player, bot, s.frame, parts, projs, STAGE);

      // HUD panels
      ctx.save();
      const drawPanel = (f: Fighter, label: string, hx: number) => {
        const dc = f.damage < 30 ? '#22c55e' : f.damage < 80 ? '#facc15' : '#ef4444';
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(hx, H - 115, 196, 103, 10); ctx.fill();
        ctx.fillStyle = f.color; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
        ctx.fillText(label, hx + 98, H - 97);
        ctx.fillStyle = dc; ctx.font = `bold ${Math.min(42, 30 + f.damage * 0.07)}px monospace`;
        ctx.textAlign = 'center'; ctx.fillText(`${Math.floor(f.damage)}%`, hx + 98, H - 60);
        const maxS = f === player ? PLAYER_STOCKS : BOSS_STOCKS;
        for (let i = 0; i < Math.min(5, maxS + 1); i++) {
          ctx.beginPath(); ctx.arc(hx + 26 + i * 20, H - 38, 8, 0, Math.PI * 2);
          ctx.fillStyle = i < f.stocks ? f.color : '#374151'; ctx.fill();
        }
        if (!f.botAI && f.weapon) {
          ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
          ctx.fillText(`${f.weapon.emoji}${f.weapon.nameJa}`, hx + 8, H - 8);
        }
      };
      drawPanel(player, 'あなた', 8);
      drawPanel(bot, '👹 魔王', W - 204);
      drawGuardGauge(ctx, player, 16, H - 130);

      // Event label + community boss HP bar
      ctx.fillStyle = '#7c3aed33'; ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(W / 2 - 100, 6, 200, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a78bfa'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`👹 魔王討伐イベント`, W / 2, 21);

      // This-run damage counter
      ctx.fillStyle = '#f3f4f6'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`今戦ダメージ: ${Math.floor(s.playerDmgDealt)}`, W / 2, 38);

      if (_spFlash.timer > 0) {
        _spFlash.timer--;
        ctx.globalAlpha = Math.min(1, _spFlash.timer / 20);
        ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#c4b5fd'; ctx.textAlign = 'center';
        ctx.shadowColor = '#7c3aed'; ctx.shadowBlur = 16;
        ctx.fillText(_spFlash.text, W / 2, 62); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };
    return loop;
  }, []);

  // ── Start fight ───────────────────────────────────────────────────────────
  const startFight = () => {
    initGame();
    setPhase('fight');
  };

  useEffect(() => {
    if (phase !== 'fight' || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;

    const handleGameOver = async (won: boolean, dmgDealt: number) => {
      const dmg = Math.floor(dmgDealt);
      recordBattleResult(won, dmgDealt * 0.05);
      setRunDamage(dmg);
      setDidWin(won);

      if (auth) {
        try {
          const r = await apiFetch('/api/raid/contribute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ damage: dmg }),
          });
          if (r.ok) {
            const j = await r.json();
            setNewMyTotal(j.myTotal);
            setNewCommunityHp(j.newCurrentHp);
          }
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
  }, [phase]);

  // ── Render: loading ───────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">👹</div>
          <div className="text-white font-bold text-lg">読み込み中...</div>
        </div>
      </div>
    );
  }

  // ── Render: info ──────────────────────────────────────────────────────────
  if (phase === 'info') {
    const cur   = status?.currentHp  ?? 10000;
    const total = status?.totalHp    ?? 10000;
    const pct   = Math.max(0, Math.min(100, (1 - cur / total) * 100));
    const remaining = Math.max(0, cur);
    const daysLeft  = status ? Math.max(0, Math.ceil((new Date(status.endAt).getTime() - Date.now()) / 86400000)) : 0;

    return (
      <div className="min-h-screen flex flex-col items-center py-6 px-4 select-none"
           style={{ background: 'linear-gradient(to bottom, #0a0a10, #1a0a2e)' }}>
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">← 戻る</button>
            <div>
              <h1 className="text-2xl font-black text-white">👹 魔王討伐イベント</h1>
              <p className="text-gray-500 text-xs">全員の力で魔王を倒せ！残り{daysLeft}日</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 bg-red-900/40 border border-red-700 rounded-xl p-3 text-red-300 text-sm">{error}</div>
          )}

          {/* Community boss HP */}
          <div className="mb-5 rounded-2xl border border-purple-700/50 p-4"
               style={{ background: 'rgba(124,58,237,0.08)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-purple-300 font-black text-sm">魔王の体力</span>
              <span className="text-purple-400 text-xs font-bold">{fmtPct(cur, total)}% 討伐済</span>
            </div>
            <div className="w-full h-5 bg-gray-800 rounded-full overflow-hidden mb-1">
              <div className="h-full rounded-full transition-all duration-700"
                   style={{
                     width: `${pct}%`,
                     background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                     boxShadow: '0 0 12px #7c3aed88',
                   }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>残り {fmtNum(remaining)} HP</span>
              <span>全体 {fmtNum(total)} HP</span>
            </div>
          </div>

          {/* My stats */}
          <div className="mb-5 grid grid-cols-3 gap-2">
            {[
              { label: '自分の貢献', value: fmtNum(status?.myDamage ?? 0), sub: 'ダメージ' },
              { label: '出陣回数',   value: `${status?.myPlays ?? 0}回`,    sub: '' },
              { label: '貢献ランク', value: status?.myRank != null ? `#${status.myRank}` : '未参加', sub: '' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-xl border border-purple-700/30 p-3 text-center"
                   style={{ background: 'rgba(0,0,0,0.4)' }}>
                <div className="text-[10px] text-gray-400 mb-0.5">{label}</div>
                <div className="text-white font-black text-base leading-tight">{value}</div>
                {sub && <div className="text-purple-400 text-[10px]">{sub}</div>}
              </div>
            ))}
          </div>

          {/* Top 10 */}
          {(status?.topList.length ?? 0) > 0 && (
            <div className="mb-5">
              <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">🏆 貢献ランキング TOP10</div>
              <div className="space-y-1.5">
                {status!.topList.map((p, i) => (
                  <div key={p.username} className="flex items-center gap-2 rounded-xl px-3 py-2 border"
                       style={{ background: 'rgba(0,0,0,0.4)', borderColor: i < 3 ? '#7c3aed44' : '#374151' }}>
                    <span className={`font-black text-sm w-6 text-center ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${p.rank}`}
                    </span>
                    <span className="text-white text-sm font-bold flex-1">{p.username}</span>
                    <span className="text-purple-300 text-xs font-bold">{fmtNum(p.totalDamage)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fight button */}
          <button
            onClick={startFight}
            className="w-full font-black text-lg py-4 rounded-2xl transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', boxShadow: '0 0 24px #7c3aed55' }}>
            ⚔️ 出陣する
          </button>
          <p className="text-center text-gray-600 text-xs mt-3">
            負けてもダメージは貢献されます。何度でも挑戦できます。
          </p>
        </div>
      </div>
    );
  }

  // ── Render: result ────────────────────────────────────────────────────────
  if (phase === 'result') {
    const total     = status?.totalHp ?? 10000;
    const pctBefore = fmtPct(status?.currentHp ?? total, total);
    const pctAfter  = fmtPct(newCommunityHp, total);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center py-6 px-4 select-none"
           style={{ background: 'linear-gradient(to bottom, #0a0a10, #1a0a2e)' }}>
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-6xl mb-3">{didWin ? '🎉' : '💀'}</div>
            <h2 className="text-3xl font-black text-white">{didWin ? '討伐成功！' : '力尽きた…'}</h2>
            <p className="text-gray-400 text-sm mt-1">{didWin ? '見事魔王を撃破した！' : 'ダメージは確実に蓄積されている'}</p>
          </div>

          {/* This-run stats */}
          <div className="rounded-2xl border border-purple-700/50 p-5 mb-4"
               style={{ background: 'rgba(124,58,237,0.1)' }}>
            <div className="text-center mb-4">
              <div className="text-xs text-gray-400 mb-1">今回の貢献ダメージ</div>
              <div className="text-4xl font-black text-purple-300">+{fmtNum(runDamage)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="text-xs text-gray-400">累計貢献</div>
                <div className="text-white font-black text-lg">{fmtNum(newMyTotal)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400">討伐進捗</div>
                <div className="text-purple-300 font-black text-lg">{pctBefore}% → {pctAfter}%</div>
              </div>
            </div>
          </div>

          {/* Community HP bar */}
          <div className="rounded-xl border border-purple-700/30 p-3 mb-5"
               style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="text-xs text-gray-400 mb-1.5">魔王残HP</div>
            <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full"
                   style={{
                     width: `${fmtPct(newCommunityHp, total)}%`,
                     background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                   }} />
            </div>
            <div className="text-right text-xs text-purple-400 mt-1">{fmtNum(Math.max(0, newCommunityHp))} HP 残り</div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => { setPhase('fight'); initGame(); }}
              className="w-full font-black text-base py-3 rounded-xl transition-all active:scale-95"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}>
              ⚔️ もう一度出陣
            </button>
            <button
              onClick={() => { loadStatus(); }}
              className="w-full font-black text-base py-3 rounded-xl transition-all active:scale-95 bg-gray-800 hover:bg-gray-700 text-white border border-gray-600">
              📊 ランキングを確認
            </button>
            <button
              onClick={onBack}
              className="w-full text-gray-400 hover:text-gray-200 text-sm py-2">
              ← イベント一覧へ戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: fight ─────────────────────────────────────────────────────────
  return (
    <div className="w-full h-screen bg-gray-950 flex flex-col items-center justify-center select-none overflow-hidden"
         style={{ background: 'linear-gradient(to bottom, #0a0a10, #1a0a2e)' }}>
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H}
          className="rounded-xl border shadow-2xl"
          style={{
            display: 'block', maxWidth: '100vw', maxHeight: '80vh',
            aspectRatio: `${W}/${H}`,
            borderColor: '#7c3aed44',
            boxShadow: '0 0 40px #7c3aed22',
          }}
        />
      </div>
      <div className="mt-3 flex gap-4 text-xs text-gray-600 flex-wrap justify-center">
        <span>← → 移動</span><span>↑/W ジャンプ</span>
        <span>Z 攻撃</span><span>X 強攻撃</span>
        <span>V 上攻撃</span><span>Space スペシャル</span>
        <span>C カウンター</span>
      </div>
    </div>
  );
}
