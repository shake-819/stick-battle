import { useEffect, useRef, useState, useCallback } from 'react';
import { load, computeEffectiveStats, recordBattleResult } from '@/store/playerStore';
import type { PlayerData } from '@/store/playerStore';
import { getAuth } from '@/store/authStore';
import { apiFetch } from '@/lib/backend';
import { WEAPONS } from '@/data/equipment';
import { BOSSES } from '@/data/bosses';
import type { BotConfig } from '@/types/game';
import { STAGES } from '@/data/stages';
import {
  W, H, FW, FH, BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP,
  BOT_CONFIGS, LOCKED_STATES, ACTION_STATES, SPECIAL_NAMES, SP_COLS, COUNTER_CD,
  makeFighter, respawnFighter, overlap,
  startSpecial, mkProj, getAttackFrames, applyMeleeHit, applyProjHit,
  updateFighter, updateBot, updateProjectiles, knockback, spawn, updateParticles,
  drawScene, drawGuardGauge,
  type Fighter, type Particle, type Projectile,
} from '@/lib/gameEngine';

interface Props { onBack: () => void; }

interface Opponent {
  user_id: number;
  username: string;
  rank: number;
}

interface OpponentDetail {
  user_id: number;
  username: string;
  rank: number;
  snapshot: PlayerData;
  derivedBotConfig?: Partial<BotConfig>;
  logCount?: number;
}

interface BattleStats {
  totalFrames: number;
  guardEvents: number;
  counterEvents: number;
  specialEvents: number;
  attackEvents: number;
  hitFired: number;
  hitLanded: number;
  edgeGuardEvents: number;
  distSum: number;
  distSamples: number;
  prevPlayerState: string;
  prevBotDamage: number;
}

function makeBattleStats(): BattleStats {
  return {
    totalFrames: 0, guardEvents: 0, counterEvents: 0, specialEvents: 0,
    attackEvents: 0, hitFired: 0, hitLanded: 0, edgeGuardEvents: 0,
    distSum: 0, distSamples: 0, prevPlayerState: '', prevBotDamage: 0,
  };
}

type Phase = 'loading' | 'select' | 'fight-loading' | 'fight' | 'result';

const STAGE = STAGES[0];

let _spFlash = { text: '', timer: 0 };

export default function EventStrongestPage({ onBack }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [myRank, setMyRank] = useState(0);
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [selectedOpp, setSelectedOpp] = useState<OpponentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ won: boolean; newRank?: number; oldRank?: number } | null>(null);
  const [rankSwapDone, setRankSwapDone] = useState(false);
  const [peakRank, setPeakRank] = useState<number | null>(null);
  const [topPeaks, setTopPeaks] = useState<{ username: string; peakRank: number; seasonRank: number }[]>([]);

  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const keysRef        = useRef<Set<string>>(new Set());
  const gsRef          = useRef<{
    player: Fighter; bot: Fighter;
    parts: Particle[]; projs: Projectile[];
    frame: number; over: boolean;
    playerDmgDealt: number;
  } | null>(null);
  const rafRef         = useRef<number>(0);
  const botCfgRef      = useRef<BotConfig>({ ...BOT_CONFIGS['hard'] });
  const battleStatsRef = useRef<BattleStats>(makeBattleStats());

  const auth = getAuth();

  const playerData = load();
  const weapon     = playerData.equippedWeaponId ? WEAPONS.find(w => w.id === playerData.equippedWeaponId) ?? null : null;
  const isBow      = weapon?.type === 'bow';
  const isBossChar = BOSSES.some(b => b.id === playerData.selectedCharacter);
  const canPlay    = !isBow && !isBossChar;

  // ── Phase: loading – fetch neighbors ────────────────────────────────────
  useEffect(() => {
    if (!auth) { setError('ログインが必要です'); setPhase('select'); return; }
    Promise.all([
      apiFetch('/api/strongest/neighbors', { headers: { Authorization: `Bearer ${auth.token}` } }).then(r => r.json()),
      apiFetch('/api/strongest/peak',      { headers: { Authorization: `Bearer ${auth.token}` } }).then(r => r.json()),
    ])
    .then(([neighbors, peak]) => {
      setMyRank(neighbors.myRank);
      setOpponents(neighbors.opponents ?? []);
      setPeakRank(peak.myPeakRank ?? null);
      setTopPeaks(peak.topPeaks ?? []);
      setPhase('select');
    })
    .catch(() => { setError('ランキング取得に失敗しました'); setPhase('select'); });
  }, []);

  // ── Select opponent ──────────────────────────────────────────────────────
  const handleSelectOpponent = async (opp: Opponent) => {
    setPhase('fight-loading');
    try {
      const r = await apiFetch(`/api/strongest/opponent/${opp.user_id}`);
      const j = await r.json();
      // Merge derived config (from opponent's battle logs) on top of 'hard' base
      const derived: Partial<BotConfig> = j.derivedBotConfig ?? {};
      botCfgRef.current = { ...BOT_CONFIGS['hard'], ...derived };
      setSelectedOpp({
        user_id: opp.user_id, username: j.username, rank: j.rank,
        snapshot: j.snapshot as PlayerData,
        derivedBotConfig: derived, logCount: j.logCount ?? 0,
      });
      setResult(null);
      setRankSwapDone(false);
      setPhase('fight');
    } catch {
      setError('対戦相手の情報取得に失敗しました');
      setPhase('select');
    }
  };

  // ── Game init ────────────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    if (!selectedOpp) return;
    _spFlash = { text: '', timer: 0 };
    battleStatsRef.current = makeBattleStats();

    const myData  = load();
    const myStats = computeEffectiveStats(myData);
    const oppData = selectedOpp.snapshot;
    const oppStats = computeEffectiveStats(oppData);

    const [px, bx] = STAGE.spawnX;
    const player = makeFighter(px, false, myStats, myStats.startingStocks);

    // Use derived BotConfig (merged with 'hard' base) to mimic opponent's playstyle
    const botCfg = botCfgRef.current;
    const bot = makeFighter(bx, true, oppStats, 3, botCfg, oppStats.equippedWeapon, oppStats.equippedArmor);
    bot.attackMult  = oppStats.attackMult;
    bot.defenseMult = oppStats.defenseMult;
    bot.speedMult   = oppStats.speedMult;
    bot.jumpMult    = oppStats.jumpMult;
    bot.berserker   = oppStats.berserker;
    bot.color       = '#ef4444';

    gsRef.current = { player, bot, parts: [], projs: [], frame: 0, over: false, playerDmgDealt: 0 };
  }, [selectedOpp]);

  // ── Input handlers ───────────────────────────────────────────────────────
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
        const dn = keysRef.current.has('ArrowDown') || keysRef.current.has('s') || keysRef.current.has('S');
        const inAir = player.state === 'jump' || player.state === 'fall';
        const t = inAir ? 'airAttack' : dn ? 'downAttack' : 'attack';
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
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      if (!LOCKED_STATES.includes(player.state) && player.state !== 'dead' && player.counterCooldown === 0 && player.onGround) {
        player.state = 'counter'; player.stateTimer = 22; player.counterCooldown = COUNTER_CD;
      }
    }
  }, []);

  const handleKeyUp = useCallback((e: KeyboardEvent) => { keysRef.current.delete(e.key); }, []);

  // ── Game loop ────────────────────────────────────────────────────────────
  const runLoop = useCallback((ctx: CanvasRenderingContext2D, onGameOver: (won: boolean, dmg: number) => void) => {
    const platforms = STAGE.platforms;
    const [px, bx] = STAGE.spawnX;

    const loop = () => {
      const s = gsRef.current; if (!s || s.over) return;
      s.frame++;
      const { player, bot, parts, projs } = s;

      // ── Battle stats tracking ──────────────────────────────────────────────
      const bs = battleStatsRef.current;
      bs.totalFrames++;

      // Track state transitions for player
      const curState = player.state;
      if (curState !== bs.prevPlayerState) {
        if (curState === 'guard') {
          bs.guardEvents++;
        } else if (curState === 'counter') {
          bs.counterEvents++;
        } else if (curState === 'specialNeutral' || curState === 'specialDown' || curState === 'specialSide') {
          bs.specialEvents++;
        } else if (curState === 'attack' || curState === 'strongAttack' || curState === 'airAttack' || curState === 'upAttack' || curState === 'downAttack') {
          bs.attackEvents++;
          bs.hitFired++;
          // Edge guard: player attacks while bot is off stage
          if (bot.pos.x < 120 || bot.pos.x > W - 120) bs.edgeGuardEvents++;
        }
        bs.prevPlayerState = curState;
      }

      // Detect hit: bot damage increased
      if (bot.damage > bs.prevBotDamage) bs.hitLanded++;
      bs.prevBotDamage = bot.damage;

      // Sample distance every 30 frames
      if (s.frame % 30 === 0) {
        bs.distSum += Math.abs(player.pos.x - bot.pos.x);
        bs.distSamples++;
      }

      const cfg = botCfgRef.current;
      updateBot(bot, player, cfg, projs, platforms);
      updateFighter(player, keysRef.current, platforms);
      updateFighter(bot, keysRef.current, platforms);
      player.vel.x = Math.max(-15, Math.min(15, player.vel.x));
      bot.vel.x    = Math.max(-15, Math.min(15, bot.vel.x));

      // player → bot
      const r1 = applyMeleeHit(player, bot, parts, projs);
      if (r1.hit) s.playerDmgDealt += r1.dmgDealt;

      // bot → player
      applyMeleeHit(bot, player, parts, projs);

      // projectiles
      for (let i = projs.length - 1; i >= 0; i--) {
        const proj = projs[i];
        const vic = proj.owner === 'player' ? bot : player;
        if (vic.invincible > 0 || vic.state === 'dead') continue;
        const vb = { x: vic.pos.x - FW / 2, y: vic.pos.y - FH, w: FW, h: FH };
        if (!overlap(proj.pos.x - proj.size, proj.pos.y - proj.size, proj.size * 2, proj.size * 2, vb.x, vb.y, vb.w, vb.h)) continue;
        const hitCols = proj.owner === 'player' ? SP_COLS.specialNeutral : ['#ef4444', '#fb923c', '#ffffff'];
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
      const botDead    = bot.stocks <= 0 && bot.state === 'dead' && bot.stateTimer <= 0;
      if (playerDead || botDead) {
        const won = botDead;
        s.over = true;
        onGameOver(won, s.playerDmgDealt);
        return;
      }

      updateParticles(parts);
      ctx.clearRect(0, 0, W, H);
      drawScene(ctx, player, bot, s.frame, parts, projs, STAGE);

      // HUD
      ctx.save();
      const drawPanel = (f: Fighter, label: string, hx: number) => {
        const dc = f.damage < 30 ? '#22c55e' : f.damage < 80 ? '#facc15' : '#ef4444';
        ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(hx, H - 115, 196, 103, 10); ctx.fill();
        ctx.fillStyle = f.color; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
        ctx.fillText(label, hx + 98, H - 97);
        ctx.fillStyle = dc; ctx.font = `bold ${Math.min(42, 30 + f.damage * 0.07)}px monospace`;
        ctx.textAlign = 'center'; ctx.fillText(`${Math.floor(f.damage)}%`, hx + 98, H - 60);
        const maxS = f === player ? player.maxJumps : 3;
        for (let i = 0; i < Math.min(3, maxS + 2); i++) {
          ctx.beginPath(); ctx.arc(hx + 38 + i * 23, H - 38, 9, 0, Math.PI * 2);
          ctx.fillStyle = i < f.stocks ? f.color : '#374151'; ctx.fill();
        }
        if (!f.botAI && f.weapon) {
          ctx.fillStyle = '#9ca3af'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
          ctx.fillText(`${f.weapon.emoji}${f.weapon.nameJa}`, hx + 8, H - 8);
        }
        if (f.botAI && f.weapon) {
          ctx.fillStyle = '#ef4444'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
          ctx.fillText(`${f.weapon.emoji}${f.weapon.nameJa}`, hx + 8, H - 8);
        }
      };
      drawPanel(player, 'あなた', 8);
      drawPanel(bot, selectedOpp?.username ?? '相手', W - 204);
      drawGuardGauge(ctx, player, 16, H - 130);
      drawGuardGauge(ctx, bot, W - 200, H - 130);

      // Event label
      ctx.fillStyle = '#fbbf2422'; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(W / 2 - 90, 6, 180, 22, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText(`👑 最強のプレイヤー　Rank #${selectedOpp?.rank ?? '?'}`, W / 2, 21);

      if (_spFlash.timer > 0) {
        _spFlash.timer--;
        ctx.globalAlpha = Math.min(1, _spFlash.timer / 20);
        ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#c4b5fd'; ctx.textAlign = 'center';
        ctx.shadowColor = '#818cf8'; ctx.shadowBlur = 16;
        ctx.fillText(_spFlash.text, W / 2, 62); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      }
      ctx.restore();

      rafRef.current = requestAnimationFrame(loop);
    };
    return loop;
  }, [selectedOpp]);

  // ── Start fight when phase=fight ─────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'fight' || !canvasRef.current || !selectedOpp) return;
    initGame();
    const ctx = canvasRef.current.getContext('2d')!;

    const handleGameOver = async (won: boolean, dmgDealt: number) => {
      const reward = recordBattleResult(won, dmgDealt);
      setResult({ won });

      // Post battle log (fire-and-forget)
      if (auth) {
        const bs = battleStatsRef.current;
        const avgDist = bs.distSamples > 0 ? bs.distSum / bs.distSamples : 100;
        apiFetch('/api/strongest/battle-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({
            totalFrames: bs.totalFrames, guardEvents: bs.guardEvents,
            counterEvents: bs.counterEvents, specialEvents: bs.specialEvents,
            attackEvents: bs.attackEvents, hitFired: bs.hitFired,
            hitLanded: bs.hitLanded, edgeGuardEvents: bs.edgeGuardEvents,
            avgDist,
          }),
        }).catch(() => {});
      }

      if (won && auth && !rankSwapDone) {
        setRankSwapDone(true);
        try {
          const r = await apiFetch('/api/strongest/win', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ opponentUserId: selectedOpp.user_id ?? 0 }),
          });
          if (r.ok) {
            const j = await r.json();
            setResult({ won: true, newRank: j.newRank, oldRank: j.oldRank });
            // Record season peak (fire-and-forget)
            apiFetch('/api/strongest/peak', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
              body: JSON.stringify({ rank: j.newRank }),
            }).then(r2 => r2.json()).then(j2 => { if (j2.ok) setPeakRank(j2.peakRank); }).catch(() => {});
          }
        } catch { /* ignore */ }
      }
      void reward;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(runLoop(ctx, handleGameOver));

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase, selectedOpp]);

  const restart = () => {
    setResult(null);
    setRankSwapDone(false);
    initGame();
    const ctx = canvasRef.current?.getContext('2d'); if (!ctx) return;
    cancelAnimationFrame(rafRef.current);
    const handleGameOver = async (won: boolean, dmgDealt: number) => {
      const reward = recordBattleResult(won, dmgDealt);
      setResult({ won });

      // Post battle log (fire-and-forget)
      if (auth) {
        const bs = battleStatsRef.current;
        const avgDist = bs.distSamples > 0 ? bs.distSum / bs.distSamples : 100;
        apiFetch('/api/strongest/battle-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({
            totalFrames: bs.totalFrames, guardEvents: bs.guardEvents,
            counterEvents: bs.counterEvents, specialEvents: bs.specialEvents,
            attackEvents: bs.attackEvents, hitFired: bs.hitFired,
            hitLanded: bs.hitLanded, edgeGuardEvents: bs.edgeGuardEvents,
            avgDist,
          }),
        }).catch(() => {});
      }

      if (won && auth && !rankSwapDone) {
        setRankSwapDone(true);
        try {
          const r = await apiFetch('/api/strongest/win', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ opponentUserId: selectedOpp?.user_id ?? 0 }),
          });
          if (r.ok) {
            const j = await r.json();
            setResult({ won: true, newRank: j.newRank, oldRank: j.oldRank });
            apiFetch('/api/strongest/peak', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
              body: JSON.stringify({ rank: j.newRank }),
            }).then(r2 => r2.json()).then(j2 => { if (j2.ok) setPeakRank(j2.peakRank); }).catch(() => {});
          }
        } catch { /* ignore */ }
      }
      void reward;
    };
    rafRef.current = requestAnimationFrame(runLoop(ctx, handleGameOver));
  };

  // ── Render: loading ──────────────────────────────────────────────────────
  if (phase === 'loading' || phase === 'fight-loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-spin">👑</div>
          <div className="text-white font-bold text-lg">読み込み中...</div>
        </div>
      </div>
    );
  }

  // ── Render: select ───────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <div className="min-h-screen flex flex-col items-center py-6 px-4 select-none"
           style={{ background: 'linear-gradient(to bottom, #0a0a10, #0f172a)' }}>
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <button onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">← 戻る</button>
            <div>
              <h1 className="text-2xl font-black text-white">👑 最強のプレイヤー</h1>
              <p className="text-gray-500 text-xs">相手を倒してランクを奪え</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 bg-red-900/40 border border-red-700 rounded-xl p-3 text-red-300 text-sm">{error}</div>
          )}

          {/* Bow / boss restriction warning */}
          {(isBow || isBossChar) && (
            <div className="mb-4 bg-red-950/60 border border-red-700 rounded-xl p-3 text-red-300 text-sm">
              ⛔ {isBow ? '弓武器は禁止です。装備を変更してください。' : ''}
              {isBossChar ? 'ボスキャラは禁止です。キャラ選択を変更してください。' : ''}
            </div>
          )}

          {/* My rank */}
          {myRank > 0 && (
            <div className="mb-3 rounded-2xl border border-yellow-500/30 p-4"
                 style={{ background: 'rgba(0,0,0,0.5)' }}>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-gray-400 mb-1">あなたの現在のランク</div>
                  <div className="text-4xl font-black text-yellow-400">#{myRank}</div>
                </div>
                {peakRank != null && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500 mb-0.5">今シーズン最高</div>
                    <div className="text-yellow-300 font-black text-2xl">#{peakRank}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Season peak leaderboard */}
          {topPeaks.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">🏆 シーズン最高ランク TOP10</div>
              <div className="space-y-1.5">
                {topPeaks.map((p, i) => (
                  <div key={p.username} className="flex items-center gap-2 rounded-xl px-3 py-2 border border-gray-700 bg-gray-900/40">
                    <span className={`font-black text-sm w-6 text-center ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500'}`}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${p.seasonRank}`}
                    </span>
                    <span className="text-white text-sm font-bold flex-1">{p.username}</span>
                    <span className="text-yellow-400 text-xs font-bold">最高 #{p.peakRank}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Opponents list */}
          <div className="mb-3">
            <div className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">
              {myRank <= 5 ? '🏆 TOP 5' : `上位 ${opponents.length} 人 (あなたより上)`}
            </div>
            {opponents.length === 0 ? (
              <div className="rounded-2xl border border-gray-700 bg-gray-900/50 p-6 text-center text-gray-500 text-sm">
                あなたより上位のプレイヤーがいません。<br />あなたが最強です！
              </div>
            ) : (
              <div className="space-y-2">
                {opponents.map((opp) => (
                  <button
                    key={opp.user_id}
                    onClick={() => canPlay && handleSelectOpponent(opp)}
                    disabled={!canPlay}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${canPlay ? 'border-amber-700/40 active:scale-95 hover:border-amber-500/60' : 'border-gray-700/40 cursor-not-allowed opacity-50'}`}
                    style={{ background: 'rgba(0,0,0,0.5)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-black text-yellow-400 w-10">#{opp.rank}</span>
                        <span className="text-white font-bold text-base">{opp.username}</span>
                      </div>
                      <span className={`font-black text-sm px-3 py-1.5 rounded-xl border ${canPlay ? 'text-amber-400 bg-amber-900/30 border-amber-700/40' : 'text-gray-500 bg-gray-800/30 border-gray-700/40'}`}>
                        {canPlay ? '⚔️ 挑戦' : '⛔'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-center text-gray-600 text-xs mt-4">
            勝利するとランクが入れ替わります
          </p>
        </div>
      </div>
    );
  }

  // ── Render: fight ────────────────────────────────────────────────────────
  return (
    <div className="w-full h-screen bg-gray-950 flex flex-col items-center justify-center select-none overflow-hidden">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H}
          className="rounded-xl border shadow-2xl"
          style={{
            display: 'block', maxWidth: '100vw', maxHeight: '80vh',
            aspectRatio: `${W}/${H}`,
            borderColor: '#fbbf2444',
            boxShadow: '0 0 40px #fbbf2422',
          }}
        />

        {/* Result overlay */}
        {result && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl">
            <div className="text-center px-6">
              {result.won
                ? <div className="text-5xl font-black text-yellow-400 mb-2">YOU WIN! 👑</div>
                : <div className="text-5xl font-black text-red-400 mb-2">GAME OVER 💀</div>}

              {result.won && result.newRank !== undefined && (
                <div className="mb-4 bg-yellow-900/40 border border-yellow-500 rounded-2xl px-6 py-3">
                  <div className="text-yellow-300 text-sm font-bold mb-1">ランク上昇！</div>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-gray-400 text-2xl font-black">#{result.oldRank}</span>
                    <span className="text-yellow-400 text-xl">→</span>
                    <span className="text-yellow-400 text-3xl font-black">#{result.newRank}</span>
                  </div>
                </div>
              )}
              {!result.won && (
                <div className="mb-4 text-gray-400 text-sm">
                  ランクは変わりません。もう一度挑戦してください。
                </div>
              )}

              <div className="flex gap-3 justify-center mt-2">
                {!result.won && (
                  <button onClick={restart}
                    className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black text-base px-6 py-3 rounded-xl transition-all active:scale-95">
                    もう一度
                  </button>
                )}
                <button onClick={() => setPhase('select')}
                  className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-base px-6 py-3 rounded-xl transition-all active:scale-95">
                  対戦相手を選ぶ
                </button>
                <button onClick={onBack}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-sm px-4 py-3 rounded-xl transition-all active:scale-95">
                  メニュー
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-4 text-xs text-gray-500 flex-wrap justify-center">
        <span>AD/←→: 移動</span><span>W/↑: ジャンプ</span>
        <span>Z/J: 通常攻撃</span><span>X/K: 強攻撃</span><span>↓+Z: 下攻撃</span>
        <span>V/U: アッパー</span><span>空中Z/J: 空中攻撃</span>
        <span className="text-purple-400 font-bold">Space: 必殺技</span>
        <span className="text-amber-400 font-bold">C: カウンター</span>
      </div>
    </div>
  );
}
