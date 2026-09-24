import { useRef, useEffect, useState, useCallback } from 'react';
import { computeEffectiveStats, load, recordBattleResult } from '@/store/playerStore';
import { drawPlayerAsBoss } from '@/lib/bossRenderer';
import {
  GUN_MODES, GUN_COLOR, GUN_INTERVAL, GUN_DMG, GUN_SPEED, GUN_KB, drawLionelGauge, getEffectiveReload,
  type GunMode,
} from '@/data/lionelGun';
import { STAGES } from '@/data/stages';
import {
  W, H, FW, FH, BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP, SP_COOLDOWN,
  SP_COLS, LOCKED_STATES, ACTION_STATES, SPECIAL_NAMES,
  DIFF_RARITY, WEAPONS, ARMORS, EQUIP_RARITY_COLOR,
  BOT_CONFIGS,
  makeFighter, respawnFighter, overlap, knockback,
  startSpecial, mkProj, pickRandom,
  getAttackFrames, applyMeleeHit,
  updateFighter, updateBot, updateProjectiles, spawn, updateParticles, applyProjHit,
  drawScene, drawFighter, drawGuardGauge, COUNTER_CD,
  type Fighter, type Particle, type Projectile,
  type EffectiveStats, type Difficulty,
} from '@/lib/gameEngine';

// ─── Constants ────────────────────────────────────────────────────────────────
const SPAWN_INTERVAL = 20 * 60; // 20 seconds at 60fps
const TOTAL_ENEMIES  = 100;

function diffForEnemy(n: number): Difficulty {
  if (n <= 20) return 'easy';
  if (n <= 40) return 'normal';
  if (n <= 60) return 'hard';
  if (n <= 80) return 'vhard';
  return 'oni';
}

const DIFF_LABEL: Record<Difficulty, string> = {
  easy:'かんたん', normal:'ふつう', hard:'むずかしい', vhard:'げきむず', oni:'おにむず',
};
const DIFF_COL: Record<Difficulty, string> = {
  easy:'#4ade80', normal:'#60a5fa', hard:'#facc15', vhard:'#f87171', oni:'#f43f5e',
};
const DIFF_ZONE: Array<[number,number,Difficulty]> = [
  [1,20,'easy'], [21,40,'normal'], [41,60,'hard'], [61,80,'vhard'], [81,100,'oni'],
];

// Alternate spawn X positions so bots don't pile up
const SPAWN_XS = [580, 200, 680, 140, 530, 250];

interface HyakuState {
  player: Fighter;
  bots: Fighter[];
  parts: Particle[]; projs: Projectile[];
  frame: number; over: boolean;
  playerDmgDealt: number;
  enemyNum: number;   // next enemy index to spawn (1-based)
  defeated: number;   // total enemies defeated
  spawnTimer: number; // countdown to next spawn
  lionelReload: number;
  lionelMode: GunMode;
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
let _spFlash = { text:'', timer:0 };

function drawHyakuHUD(ctx: CanvasRenderingContext2D, s: HyakuState, stats: EffectiveStats, isLionel: boolean) {
  const { player, bots, enemyNum, defeated, spawnTimer } = s;
  ctx.save();

  // ── Player panel (left) ───────────────────────────────────────────────────
  const dc = player.damage<30?'#22c55e':player.damage<80?'#facc15':'#ef4444';
  ctx.fillStyle='rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(8,H-115,196,103,10); ctx.fill();
  ctx.fillStyle=player.color; ctx.font='bold 13px monospace'; ctx.textAlign='center';
  ctx.fillText('プレイヤー',8+98,H-97);
  ctx.fillStyle=dc; ctx.font=`bold ${Math.min(42,30+player.damage*0.07)}px monospace`;
  ctx.textAlign='center'; ctx.fillText(`${Math.floor(player.damage)}%`,8+98,H-60);
  for(let i=0;i<stats.startingStocks;i++){
    ctx.beginPath();ctx.arc(8+38+i*23,H-38,9,0,Math.PI*2);
    ctx.fillStyle=i<player.stocks?player.color:'#374151';ctx.fill();
  }
  {
    const pct=1-player.specialCooldown/player.maxSPCooldown;
    const ready=player.specialCooldown===0;
    ctx.save();ctx.font='bold 9px monospace';ctx.textAlign='left';
    ctx.fillStyle=ready?'#a78bfa':'#6b7280';ctx.fillText('必殺技 [Q]',8+8,H-18);
    ctx.fillStyle='#1f2937';ctx.beginPath();ctx.roundRect(8+82,H-25,100,9,4);ctx.fill();
    ctx.fillStyle=ready?'#a78bfa':'#4f46e5';ctx.beginPath();ctx.roundRect(8+82,H-25,100*pct,9,4);ctx.fill();
    if(ready){ctx.fillStyle='#c4b5fd';ctx.font='bold 8px monospace';ctx.textAlign='right';ctx.fillText('READY!',8+185,H-17);}
    if(player.weapon){ctx.fillStyle='#9ca3af';ctx.font='9px monospace';ctx.textAlign='left';ctx.fillText(`${player.weapon.emoji}${player.weapon.nameJa}`,8+8,H-8);}
    ctx.restore();
  }
  drawGuardGauge(ctx, player, 16, H-130);

  if (isLionel) {
    drawLionelGauge(ctx, s.lionelReload, GUN_INTERVAL[s.lionelMode], s.lionelMode, 8, H-152);
  }

  // ── Spawn timer bar (center) ──────────────────────────────────────────────
  const cx=W/2;
  ctx.fillStyle='rgba(0,0,0,0.7)';ctx.beginPath();ctx.roundRect(cx-130,6,260,56,8);ctx.fill();

  // Defeated counter
  ctx.fillStyle='#f1f5f9';ctx.font='bold 20px monospace';ctx.textAlign='center';
  const remaining = TOTAL_ENEMIES - defeated;
  ctx.fillText(`討伐 ${defeated}　残 ${Math.max(0, remaining)}`,cx,28);

  // On-field count
  const onField = bots.filter(b=>b.state!=='dead').length;
  const nextNum  = Math.min(enemyNum, TOTAL_ENEMIES);
  const nextDiff = enemyNum <= TOTAL_ENEMIES ? diffForEnemy(nextNum) : null;
  ctx.fillStyle='#9ca3af';ctx.font='bold 10px monospace';ctx.textAlign='center';
  if(enemyNum > TOTAL_ENEMIES){
    ctx.fillStyle='#fbbf24';ctx.fillText(`戦場 ${onField}体 ← 全員倒せ！`,cx,42);
  }else{
    const secStr = Math.ceil(spawnTimer/60)+'s後';
    const col=nextDiff?DIFF_COL[nextDiff]:'#9ca3af';
    ctx.fillStyle=col;ctx.fillText(`戦場 ${onField}体  次の敵 #${nextNum} ${nextDiff?DIFF_LABEL[nextDiff]:''} ${secStr}`,cx,42);
  }

  // Spawn countdown bar
  const barPct = spawnTimer / SPAWN_INTERVAL;
  const barCol = barPct > 0.5 ? '#4ade80' : barPct > 0.25 ? '#facc15' : '#ef4444';
  ctx.fillStyle='#1f2937';ctx.beginPath();ctx.roundRect(cx-120,48,240,9,4);ctx.fill();
  if(enemyNum <= TOTAL_ENEMIES){
    ctx.fillStyle=barCol;ctx.beginPath();ctx.roundRect(cx-120,48,240*barPct,9,4);ctx.fill();
  }

  // ── Enemy count panel (right) ─────────────────────────────────────────────
  const aliveBots=bots.filter(b=>b.state!=='dead');
  ctx.fillStyle='rgba(0,0,0,0.65)';ctx.beginPath();ctx.roundRect(W-172,H-115,164,103,10);ctx.fill();
  ctx.textAlign='center';
  if(aliveBots.length===0){
    ctx.fillStyle='#6b7280';ctx.font='bold 14px monospace';ctx.fillText('敵なし',W-172+82,H-60);
  }else{
    const danger=aliveBots.length>=5;
    ctx.fillStyle=danger?'#f43f5e':'#f1f5f9';
    ctx.font=`bold ${Math.min(64,32+aliveBots.length*4)}px monospace`;
    ctx.fillText(`${aliveBots.length}体`,W-172+82,H-55);
    ctx.fillStyle=danger?'#fca5a5':'#9ca3af';
    ctx.font='bold 11px monospace';
    ctx.fillText(danger?'🔥 大群！':'戦場の敵',W-172+82,H-28);
  }

  // ── Difficulty zone bar (left side, vertical) ─────────────────────────────
  ctx.fillStyle='rgba(0,0,0,0.5)';ctx.beginPath();ctx.roundRect(8,6,180,22,5);ctx.fill();
  let barX=8;
  for(const [from,to,d] of DIFF_ZONE){
    const w=Math.round((to-from+1)/TOTAL_ENEMIES*180);
    const spawned = enemyNum-1; // how many have been spawned
    const active  = spawned>=from;
    ctx.fillStyle=DIFF_COL[d]+(active?'ff':'33');
    ctx.beginPath();ctx.roundRect(barX,8,w,18,3);ctx.fill();
    if(active){
      ctx.fillStyle=spawned>=to?'#ffffff':'#ffffffcc';ctx.font='bold 8px monospace';ctx.textAlign='center';
      ctx.fillText(DIFF_LABEL[d]+(spawned>=to?' ✓':''),barX+w/2,20);
    }
    barX+=w;
  }

  // ── SP flash ─────────────────────────────────────────────────────────────
  if(_spFlash.timer>0){
    _spFlash.timer--;
    ctx.save();ctx.globalAlpha=Math.min(1,_spFlash.timer/20);
    ctx.font='bold 28px sans-serif';ctx.fillStyle='#c4b5fd';ctx.textAlign='center';
    ctx.shadowColor='#818cf8';ctx.shadowBlur=16;
    ctx.fillText(_spFlash.text,W/2,80);ctx.restore();
  }
  ctx.restore();
}

// ─── HyakuPage component ─────────────────────────────────────────────────────
interface HyakuPageProps { onBack: () => void; }

export default function HyakuPage({ onBack }: HyakuPageProps) {
  const stats = computeEffectiveStats(load());
  const stage = STAGES[0];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef   = useRef<Set<string>>(new Set());
  const gsRef     = useRef<HyakuState|null>(null);
  const rafRef    = useRef<number>(0);

  const [overlay, setOverlay] = useState<{
    type: 'defeat'|'complete';
    defeated: number;
    reward: { xpGained:number; coinsGained:number; leveledUp:boolean };
  }|null>(null);

  const spawnBot = useCallback((enemyNum: number, spawnIdx: number): Fighter => {
    const diff    = diffForEnemy(enemyNum);
    const cfg     = BOT_CONFIGS[diff];
    const rarity  = DIFF_RARITY[diff];
    const bw      = rarity ? pickRandom(WEAPONS.filter(w=>w.rarity===rarity)) : null;
    const ba      = rarity ? pickRandom(ARMORS.filter(a=>a.rarity===rarity))  : null;
    const sx      = SPAWN_XS[spawnIdx % SPAWN_XS.length];
    const bot     = makeFighter(sx, true, stats, 1, cfg, bw, ba);
    bot.pos.y     = 60; bot.vel.y = 3;
    return bot;
  },[stats]);

  const initGame = useCallback(()=>{
    _spFlash={text:'',timer:0};
    const [px]=stage.spawnX;
    const firstBot = spawnBot(1, 0);
    gsRef.current={
      player: makeFighter(px,false,stats,stats.startingStocks),
      bots: [firstBot],
      parts:[], projs:[], frame:0, over:false,
      playerDmgDealt:0,
      enemyNum:2,       // next to spawn (first already spawned)
      defeated:0,
      spawnTimer:SPAWN_INTERVAL,
      lionelReload:0, lionelMode:'pistol',
    };
  },[stats,stage,spawnBot]);

  const isLionel = stats.selectedCharacter === 'lionel';
  const lionelStars = isLionel ? ((load().bossUnlockLv ?? {})['lionel'] ?? 0) : 0;

  const fireLionelGun = useCallback((s: NonNullable<typeof gsRef.current>) => {
    const mode = s.lionelMode;
    const player = s.player;
    const spd = GUN_SPEED[mode] * player.dir;
    s.projs.push(mkProj('player', player.pos.x + player.dir*22, player.pos.y-35, spd, GUN_DMG[mode], GUN_KB[mode], stats.attackMult, GUN_COLOR[mode]));
    if (mode === 'dual') {
      s.projs.push(mkProj('player', player.pos.x + player.dir*22, player.pos.y-50, spd, GUN_DMG[mode], GUN_KB[mode], stats.attackMult, GUN_COLOR[mode]));
    }
    s.lionelReload = getEffectiveReload(mode, lionelStars);
  }, [stats.attackMult, lionelStars]);

  const handleKeyDown=useCallback((e:KeyboardEvent)=>{
    keysRef.current.add(e.key);
    const s=gsRef.current;if(!s||s.over)return;
    const {player}=s;const inAction=ACTION_STATES.includes(player.state);

    if(isLionel && e.key>='1' && e.key<='5'){
      const idx=parseInt(e.key)-1;
      if(GUN_MODES[idx]){s.lionelMode=GUN_MODES[idx];s.lionelReload=0;}
    }

    if(e.key==='ArrowUp'||e.key==='w'||e.key==='W'||e.key===' '){
      e.preventDefault();
      if(player.jumpsLeft>0&&!LOCKED_STATES.includes(player.state)){
        const jv=player.jumpsLeft===player.maxJumps?BASE_JUMP:BASE_DJUMP;
        player.vel.y=jv*player.jumpMult;player.jumpsLeft--;player.state='jump';
      }
    }
    if(e.key==='z'||e.key==='Z'||e.key==='j'||e.key==='J'){
      if(isLionel && s.lionelReload<=0){
        fireLionelGun(s);
      } else if(!inAction&&player.state!=='dead'){
        const dn=keysRef.current.has('ArrowDown')||keysRef.current.has('s')||keysRef.current.has('S');
        const inAir=player.state==='jump'||player.state==='fall';
        const t=inAir?'airAttack':dn?'downAttack':'attack';
        player.state=t;player.stateTimer=getAttackFrames(player.weapon,t);player.attackActive=false;
      }
    }
    if(e.key==='x'||e.key==='X'||e.key==='k'||e.key==='K'){
      if(isLionel && s.lionelReload<=0){
        fireLionelGun(s);
      } else if(!inAction&&player.state!=='dead'){
        player.state='strongAttack';player.stateTimer=getAttackFrames(player.weapon,'strongAttack');player.attackActive=false;
      }
    }
    if(e.key==='v'||e.key==='V'||e.key==='u'||e.key==='U'){
      if(!inAction&&player.state!=='dead'){
        player.state='upAttack';player.stateTimer=getAttackFrames(player.weapon,'upAttack');player.attackActive=false;
      }
    }
    if(e.key==='q'||e.key==='Q'){
      if(!inAction&&player.state!=='dead'&&player.specialCooldown===0){
        const kind=startSpecial(player,keysRef.current);
        if(kind){
          _spFlash={text:`✨ ${SPECIAL_NAMES[kind]??kind}`,timer:55};
          if(kind==='specialNeutral')s.projs.push(mkProj('player',player.pos.x+player.dir*22,player.pos.y-40,player.dir*9.5,12,4,player.attackMult,'#818cf8'));
        }
      }
    }
    if(e.key==='c'||e.key==='C'){
      e.preventDefault();
      if(!LOCKED_STATES.includes(player.state)&&player.state!=='dead'&&player.counterCooldown===0&&player.onGround){
        player.state='counter';player.stateTimer=22;player.counterCooldown=COUNTER_CD;
      }
    }
  },[isLionel,fireLionelGun]);
  const handleKeyUp=useCallback((e:KeyboardEvent)=>{keysRef.current.delete(e.key);},[]);

  const runLoop=useCallback((ctx:CanvasRenderingContext2D)=>{
    const platforms=stage.platforms;
    const [px]=stage.spawnX;

    const loop=()=>{
      const s=gsRef.current;if(!s||s.over)return;
      s.frame++;
      if(s.lionelReload>0) s.lionelReload--;
      const {player,parts,projs}=s;

      // ── Spawn timer ──────────────────────────────────────────────────────
      if(s.enemyNum<=TOTAL_ENEMIES){
        s.spawnTimer--;
        if(s.spawnTimer<=0){
          const nb = spawnBot(s.enemyNum, s.enemyNum-1);
          s.bots.push(nb);
          s.enemyNum++;
          s.spawnTimer=SPAWN_INTERVAL;
        }
      }

      // ── Physics: all bots ─────────────────────────────────────────────────
      for(const bot of s.bots){
        if(bot.state==='dead'){updateFighter(bot,keysRef.current,platforms);continue;}
        const diff=diffForEnemy(s.bots.indexOf(bot)+1); // rough diff by spawn order index
        const cfg=BOT_CONFIGS[diff];
        updateBot(bot,player,cfg,projs,platforms);
        updateFighter(bot,keysRef.current,platforms);
        bot.vel.x=Math.max(-15,Math.min(15,bot.vel.x));
      }
      updateFighter(player,keysRef.current,platforms);
      player.vel.x=Math.max(-15,Math.min(15,player.vel.x));

      // ── Melee: player vs each bot ─────────────────────────────────────────
      for(const bot of s.bots){
        const r1=applyMeleeHit(player,bot,parts,projs);
        if(r1.hit) s.playerDmgDealt+=r1.dmgDealt;
        applyMeleeHit(bot,player,parts,projs);
      }

      // ── Projectiles ────────────────────────────────────────────────────────
      for(let i=projs.length-1;i>=0;i--){
        const proj=projs[i];
        const victims=proj.owner==='player'?s.bots:[player];
        let consumed=false;
        for(const vic of victims){
          if(vic.invincible>0||vic.state==='dead')continue;
          const vb={x:vic.pos.x-FW/2,y:vic.pos.y-FH,w:FW,h:FH};
          if(!overlap(proj.pos.x-proj.size,proj.pos.y-proj.size,proj.size*2,proj.size*2,vb.x,vb.y,vb.w,vb.h))continue;
          const hitCols=proj.owner==='player'?SP_COLS.specialNeutral:['#ef4444','#fb923c','#ffffff'];
          const dealt=applyProjHit(vic,proj.pos,proj.vel,proj.atkMult,proj.knockback,proj.damage,parts,undefined,hitCols);
          if(dealt&&proj.owner==='player')s.playerDmgDealt+=proj.damage*proj.atkMult;
          consumed=true;
          break;
        }
        if(consumed)projs.splice(i,1);
      }

      // ── Blast zones ────────────────────────────────────────────────────────
      for(const bot of s.bots){
        if(bot.state==='dead')continue;
        if(bot.pos.x<BLAST_L||bot.pos.x>BLAST_R||bot.pos.y<BLAST_T||bot.pos.y>BLAST_B){
          bot.stocks--;bot.state='dead';bot.stateTimer=90;bot.attackActive=false;
        }
      }
      if(player.state!=='dead'){
        if(player.pos.x<BLAST_L||player.pos.x>BLAST_R||player.pos.y<BLAST_T||player.pos.y>BLAST_B){
          player.stocks--;player.state='dead';player.stateTimer=90;player.attackActive=false;
          if(player.stocks>0)setTimeout(()=>{if(gsRef.current&&!gsRef.current.over)respawnFighter(player,px);},1500);
        }
      }

      // ── Count defeated bots; immediately spawn next enemy on defeat ─────────
      for(let i=s.bots.length-1;i>=0;i--){
        const bot=s.bots[i];
        if(bot.stocks<=0&&bot.state==='dead'&&bot.stateTimer<=0){
          s.defeated++;
          s.bots.splice(i,1);
          if(s.enemyNum<=TOTAL_ENEMIES){
            const nb=spawnBot(s.enemyNum,s.enemyNum-1);
            s.bots.push(nb);
            s.enemyNum++;
            s.spawnTimer=SPAWN_INTERVAL; // reset timer for the next one after that
          }
        }
      }

      // ── Win condition: all 100 spawned & all bots dead ─────────────────────
      if(s.enemyNum>TOTAL_ENEMIES && s.bots.length===0){
        s.over=true;
        const reward=recordBattleResult(true,s.playerDmgDealt);
        setOverlay({type:'complete',defeated:s.defeated,reward});
        return;
      }
      // ── Lose condition ─────────────────────────────────────────────────────
      if(player.stocks<=0&&player.state==='dead'&&player.stateTimer<=0){
        s.over=true;
        const reward=recordBattleResult(false,s.playerDmgDealt);
        setOverlay({type:'defeat',defeated:s.defeated,reward});
        return;
      }

      // ☆5 自動追尾 — steer player projs toward nearest bot
      if (lionelStars >= 5) {
        for (const p of projs) {
          if (p.owner !== 'player') continue;
          let nearest = null as typeof s.bots[0] | null, nd = Infinity;
          for (const b of s.bots) {
            if (b.state === 'dead') continue;
            const dd = Math.hypot(b.pos.x - p.pos.x, (b.pos.y - 40) - p.pos.y);
            if (dd < nd) { nd = dd; nearest = b; }
          }
          if (nearest && nd < Infinity) {
            const dx = nearest.pos.x - p.pos.x, dy = (nearest.pos.y - 40) - p.pos.y;
            const dist = Math.sqrt(dx*dx+dy*dy);
            if (dist > 20) {
              p.vel.x += (dx/dist)*0.25; p.vel.y += (dy/dist)*0.25;
              const spd = Math.sqrt(p.vel.x**2+p.vel.y**2);
              if (spd > 18) { p.vel.x = p.vel.x/spd*18; p.vel.y = p.vel.y/spd*18; }
            }
          }
        }
      }
      updateProjectiles(projs);updateParticles(parts);
      ctx.clearRect(0,0,W,H);

      // Draw scene with all bots (use first alive bot as "bot" for drawScene, draw rest manually)
      const firstAlive=s.bots.find(b=>b.state!=='dead')??s.bots[0]??player;
      const bossId = stats.selectedCharacter && ['lionel','bajiou','shinigami'].includes(stats.selectedCharacter) ? stats.selectedCharacter : undefined;
      const playerOverride = bossId ? (c:CanvasRenderingContext2D,f:typeof player,fr:number) => { drawPlayerAsBoss(c,f,fr,bossId,s.lionelMode); } : undefined;
      drawScene(ctx,player,firstAlive,s.frame,parts,projs,stage,playerOverride);
      // Draw remaining bots on top
      for(const bot of s.bots){
        if(bot!==firstAlive)drawFighter(ctx,bot,s.frame);
      }

      drawHyakuHUD(ctx,s,stats,isLionel);
      rafRef.current=requestAnimationFrame(loop);
    };
    return loop;
  },[stage,stats,spawnBot]);

  useEffect(()=>{
    initGame();
    window.addEventListener('keydown',handleKeyDown);
    window.addEventListener('keyup',handleKeyUp);
    const ctx=canvasRef.current!.getContext('2d')!;
    cancelAnimationFrame(rafRef.current);
    rafRef.current=requestAnimationFrame(runLoop(ctx));
    return ()=>{window.removeEventListener('keydown',handleKeyDown);window.removeEventListener('keyup',handleKeyUp);cancelAnimationFrame(rafRef.current);};
  },[initGame,handleKeyDown,handleKeyUp,runLoop]);

  const restart=()=>{
    setOverlay(null);initGame();
    const ctx=canvasRef.current?.getContext('2d');if(!ctx)return;
    cancelAnimationFrame(rafRef.current);rafRef.current=requestAnimationFrame(runLoop(ctx));
  };

  return (
    <div className="w-full h-screen bg-gray-950 flex flex-col items-center justify-center select-none overflow-hidden">
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H}
          className="rounded-xl border shadow-2xl border-rose-900/50"
          style={{display:'block',maxWidth:'100vw',maxHeight:'80vh',aspectRatio:`${W}/${H}`,boxShadow:'0 0 40px #f43f5e22'}}
        />
        {overlay&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-xl">
            <div className="text-center px-8">
              {overlay.type==='complete'
                ?<>
                  <div className="text-5xl font-black text-yellow-400 mb-1">百人組手　達成！🏆</div>
                  <div className="text-xl text-white mt-1">全{TOTAL_ENEMIES}人を撃破！</div>
                </>
                :<>
                  <div className="text-5xl font-black text-red-400 mb-1">GAME OVER 💀</div>
                  <div className="text-xl text-white mt-1">{overlay.defeated}人撃破 / {TOTAL_ENEMIES}人中</div>
                </>
              }
              <div className="mt-3 mb-2 w-72 mx-auto">
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                    style={{width:`${(overlay.defeated/TOTAL_ENEMIES)*100}%`}}/>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0</span><span>{overlay.defeated}/{TOTAL_ENEMIES}</span><span>100</span>
                </div>
              </div>
              <div className="flex gap-1 justify-center mb-3 text-xs flex-wrap">
                {DIFF_ZONE.map(([from,to,d])=>{
                  const cleared=overlay.defeated>=to;
                  return(
                    <div key={d} className={`flex flex-col items-center px-2 py-0.5 rounded font-bold text-[10px] transition-opacity ${cleared?'opacity-100':'opacity-35'}`}
                      style={{background:DIFF_COL[d]+'22',color:DIFF_COL[d],border:`1px solid ${DIFF_COL[d]}`}}>
                      {DIFF_LABEL[d]}{cleared?' ✓':''}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 mb-4 flex gap-4 justify-center">
                <div className="bg-indigo-900/70 border border-indigo-600 rounded-xl px-5 py-3">
                  <div className="text-indigo-300 text-xs">経験値</div>
                  <div className="text-white font-black text-2xl">+{overlay.reward.xpGained} XP</div>
                </div>
                <div className="bg-yellow-900/70 border border-yellow-600 rounded-xl px-5 py-3">
                  <div className="text-yellow-300 text-xs">コイン</div>
                  <div className="text-white font-black text-2xl">+{overlay.reward.coinsGained} 💰</div>
                </div>
              </div>
              {overlay.reward.leveledUp&&(
                <div className="mb-4 bg-yellow-400/20 border border-yellow-400 rounded-xl px-6 py-2 text-yellow-300 font-black text-lg animate-pulse">⬆ LEVEL UP！</div>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={restart} className="bg-rose-600 hover:bg-rose-500 text-white font-black text-lg px-8 py-3 rounded-xl transition-all active:scale-95">もう一度</button>
                <button onClick={onBack}  className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg px-8 py-3 rounded-xl transition-all active:scale-95">メニューへ</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 text-center">
        <div className="text-rose-400 font-black text-sm mb-1">⚔ 百人組手 ⚔  30秒ごとに敵が増える！</div>
        <div className="flex gap-4 text-xs text-gray-500 flex-wrap justify-center">
          <span>AD/←→: 移動</span><span>W/↑: ジャンプ</span>
          <span>Z/J: 通常攻撃</span><span>X/K: 強攻撃</span><span>↓+Z: 下攻撃</span>
          <span>V/U: アッパー</span><span>空中Z/J: 空中攻撃</span>
          <span className="text-purple-400 font-bold">Space: 必殺技</span>
        </div>
      </div>
    </div>
  );
}
