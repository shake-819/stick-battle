import { useRef, useEffect, useState, useCallback } from 'react';
import { recordBattleResult, load } from '@/store/playerStore';
import { drawPlayerAsBoss } from '@/lib/bossRenderer';
import { STAGES } from '@/data/stages';
import {
  GUN_MODES, GUN_COLOR, GUN_INTERVAL, GUN_DMG, GUN_SPEED, GUN_KB, drawLionelGauge, getEffectiveReload,
  type GunMode,
} from '@/data/lionelGun';
import {
  W, H, FW, FH, BLAST_L, BLAST_R, BLAST_T, BLAST_B,
  BASE_JUMP, BASE_DJUMP, SP_COOLDOWN,
  SP_COLS, LOCKED_STATES, ACTION_STATES, SPECIAL_NAMES,
  DIFF_RARITY, WEAPONS, ARMORS, EQUIP_RARITY_COLOR, EQUIP_RARITY_LABEL,
  BOT_CONFIGS,
  makeFighter, respawnFighter, overlap,
  startSpecial, mkProj, pickRandom,
  getAttackFrames, applyMeleeHit,
  updateFighter, updateBot, updateProjectiles, knockback, spawn, updateParticles, applyProjHit,
  drawScene, drawGuardGauge, COUNTER_CD,
  type Vec2, type Fighter, type Particle, type Projectile,
  type EffectiveStats, type Difficulty, type StageDef,
} from '@/lib/gameEngine';

// ─── HUD ──────────────────────────────────────────────────────────────────────
let _spFlash = { text:'', timer:0 };

function drawHUD(
  ctx:CanvasRenderingContext2D,
  player:Fighter, bot:Fighter,
  stats:EffectiveStats, difficulty:Difficulty, stage:StageDef,
  lionelReload:number, lionelMaxReload:number, lionelMode:GunMode,
) {
  ctx.save();
  const isLionel = stats.selectedCharacter === 'lionel';
  const panel=(f:Fighter,label:string,hx:number)=>{
    const dc=f.damage<30?'#22c55e':f.damage<80?'#facc15':'#ef4444';
    ctx.fillStyle='rgba(0,0,0,0.65)';ctx.beginPath();ctx.roundRect(hx,H-115,196,103,10);ctx.fill();
    ctx.fillStyle=f.color;ctx.font='bold 13px monospace';ctx.textAlign='center';
    ctx.fillText(label,hx+98,H-97);
    ctx.fillStyle=dc;ctx.font=`bold ${Math.min(42,30+f.damage*0.07)}px monospace`;
    ctx.textAlign='center';ctx.fillText(`${Math.floor(f.damage)}%`,hx+98,H-60);
    const maxS=f===player?stats.startingStocks:3;
    for(let i=0;i<maxS;i++){ctx.beginPath();ctx.arc(hx+38+i*23,H-38,9,0,Math.PI*2);ctx.fillStyle=i<f.stocks?f.color:'#374151';ctx.fill();}
    if(!f.botAI){
      const pct=1-f.specialCooldown/f.maxSPCooldown;
      const ready=f.specialCooldown===0;
      ctx.save();ctx.font='bold 9px monospace';ctx.textAlign='left';
      ctx.fillStyle=ready?'#a78bfa':'#6b7280';ctx.fillText('必殺技 [Space]',hx+8,H-18);
      ctx.fillStyle='#1f2937';ctx.beginPath();ctx.roundRect(hx+82,H-25,100,9,4);ctx.fill();
      ctx.fillStyle=ready?'#a78bfa':'#4f46e5';ctx.beginPath();ctx.roundRect(hx+82,H-25,100*pct,9,4);ctx.fill();
      if(ready){ctx.fillStyle='#c4b5fd';ctx.font='bold 8px monospace';ctx.textAlign='right';ctx.fillText('READY!',hx+185,H-17);}
      if(f.weapon){ctx.fillStyle='#9ca3af';ctx.font='9px monospace';ctx.textAlign='left';ctx.fillText(`${f.weapon.emoji}${f.weapon.nameJa}`,hx+8,H-8);}
      ctx.restore();
    }
    if(f.botAI){
      ctx.save();ctx.textAlign='left';
      let ey=H-18;
      if(f.weapon){ctx.fillStyle=EQUIP_RARITY_COLOR[f.weapon.rarity];ctx.font='bold 9px monospace';ctx.fillText(`${f.weapon.emoji}${f.weapon.nameJa}`,hx+8,ey);ey+=12;}
      if(f.armor) {ctx.fillStyle=EQUIP_RARITY_COLOR[f.armor.rarity]; ctx.font='bold 9px monospace';ctx.fillText(`${f.armor.emoji}${f.armor.nameJa}`,hx+8,ey);}
      ctx.restore();
    }
  };
  panel(player,'プレイヤー',8);panel(bot,'ボット',W-204);
  drawGuardGauge(ctx, player, 16, H-130);
  drawGuardGauge(ctx, bot, W-200, H-130);

  if (isLionel) {
    drawLionelGauge(ctx, lionelReload, lionelMaxReload, lionelMode, 8, H-152);
    ctx.save();
    ctx.fillStyle='#6b7280';ctx.font='8px monospace';ctx.textAlign='left';
    ctx.fillText('1-5:弾種切替',10,H-155+4);
    ctx.restore();
  }

  const dlbl:Record<Difficulty,string>={easy:'かんたん',normal:'ふつう',hard:'むずかしい',vhard:'げきむず',oni:'おにむず'};
  ctx.fillStyle=stage.glowColor+'22';ctx.strokeStyle=stage.glowColor;ctx.lineWidth=1.5;
  ctx.beginPath();ctx.roundRect(W/2-72,6,144,22,6);ctx.fill();ctx.stroke();
  ctx.fillStyle=stage.accentColor;ctx.font='bold 10px monospace';ctx.textAlign='center';
  ctx.fillText(`${stage.emoji} ${stage.nameJa}　${dlbl[difficulty]}`,W/2,21);
  ctx.restore();

  if(_spFlash.timer>0){
    _spFlash.timer--;
    ctx.save();ctx.globalAlpha=Math.min(1,_spFlash.timer/20);
    ctx.font='bold 28px sans-serif';ctx.fillStyle='#c4b5fd';ctx.textAlign='center';
    ctx.shadowColor='#818cf8';ctx.shadowBlur=16;
    ctx.fillText(_spFlash.text,W/2,62);ctx.restore();
  }
}

// ─── Game component ───────────────────────────────────────────────────────────
interface GamePageProps { stats:EffectiveStats; difficulty:Difficulty; stage:StageDef; onBack:()=>void; }

export default function GamePage({ stats, difficulty, stage, onBack }:GamePageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef   = useRef<Set<string>>(new Set());

  // ── Boss unlock levels (only apply if playing that character) ────────────
  const playerData = load();
  const bajiouStars    = stats.selectedCharacter === 'bajiou'    ? ((playerData.bossUnlockLv ?? {})['bajiou']    ?? 0) : 0;
  const shinigamiStars = stats.selectedCharacter === 'shinigami' ? ((playerData.bossUnlockLv ?? {})['shinigami'] ?? 0) : 0;
  const lionelStars    = stats.selectedCharacter === 'lionel'    ? ((playerData.bossUnlockLv ?? {})['lionel']    ?? 0) : 0;

  const gsRef     = useRef<{
    player:Fighter;bot:Fighter;parts:Particle[];projs:Projectile[];
    frame:number;over:boolean;winner:string|null;playerDmgDealt:number;
    lionelReload:number; lionelMode:GunMode;
    // Bajiou bleed on bot
    playerBleedDmg:number; playerBleedTicks:number; playerBleedTimer:number;
    // Shinigami regen / scythe
    playerRegenTimer:number; playerScytheCooldown:number;
    // Shinigami ★5 orbiting scythes (around bot)
    botOrbitingScythes:{ angle:number; addedAt:number }[];
    // Stage gimmick state
    vanishTimers:Record<number,number>;
    vanishOn:Record<number,boolean>;
  }|null>(null);
  const rafRef  = useRef<number>(0);
  const [overlay, setOverlay] = useState<{winner:string;reward:{xpGained:number;coinsGained:number;leveledUp:boolean}}|null>(null);
  const cfg = BOT_CONFIGS[difficulty];
  const isLionel = stats.selectedCharacter === 'lionel';

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

  const initGame = useCallback(()=>{
    _spFlash={text:'',timer:0};
    const [px,bx]=stage.spawnX;
    const botRarity=DIFF_RARITY[difficulty];
    const botWeapon=botRarity?pickRandom(WEAPONS.filter(w=>w.rarity===botRarity)):null;
    const botArmor =botRarity?pickRandom(ARMORS.filter(a=>a.rarity===botRarity)):null;
    gsRef.current={
      player:makeFighter(px,false,stats,stats.startingStocks),
      bot:   makeFighter(bx,true,stats,3,cfg,botWeapon,botArmor),
      parts:[],projs:[],frame:0,over:false,winner:null,playerDmgDealt:0,
      lionelReload:0, lionelMode:'pistol',
      playerBleedDmg:0, playerBleedTicks:0, playerBleedTimer:0,
      playerRegenTimer:120, playerScytheCooldown:0,
      botOrbitingScythes:[],
      vanishTimers:{}, vanishOn:{},
    };
    // Initialize vanishing platform timers from stage gimmicks
    for (const g of (stage.gimmicks ?? [])) {
      if (g.type === 'vanishing_platform') {
        gsRef.current!.vanishTimers[g.platformIdx] = g.startOffset ?? g.onFrames;
        gsRef.current!.vanishOn[g.platformIdx] = true;
      }
    }
  },[stats,cfg,stage,difficulty]);

  const handleKeyDown=useCallback((e:KeyboardEvent)=>{
    keysRef.current.add(e.key);
    const s=gsRef.current;if(!s||s.over)return;
    const {player}=s;const inAction=ACTION_STATES.includes(player.state);

    // 1-5: Lionel gun mode switch
    if(isLionel && e.key>='1' && e.key<='5'){
      const idx=parseInt(e.key)-1;
      if(GUN_MODES[idx]){s.lionelMode=GUN_MODES[idx];s.lionelReload=0;}
    }

    if(e.key==='ArrowUp'||e.key==='w'||e.key==='W'){
      e.preventDefault();
      if(player.jumpsLeft>0&&!LOCKED_STATES.includes(player.state)){
        const jv=player.jumpsLeft===player.maxJumps?BASE_JUMP:BASE_DJUMP;
        player.vel.y=jv*player.jumpMult;player.jumpsLeft--;player.state='jump';
      }
    }
    if(e.key==='z'||e.key==='Z'||e.key==='j'||e.key==='J'){
      if(isLionel && s.lionelReload<=0) {
        fireLionelGun(s);
      } else if(!inAction&&player.state!=='dead'){
        const dn=keysRef.current.has('ArrowDown')||keysRef.current.has('s')||keysRef.current.has('S');
        const inAir=player.state==='jump'||player.state==='fall';
        const t=inAir?'airAttack':dn?'downAttack':'attack';
        player.state=t;player.stateTimer=getAttackFrames(player.weapon,t);player.attackActive=false;
      }
    }
    if(e.key==='x'||e.key==='X'||e.key==='k'||e.key==='K'){
      if(isLionel && s.lionelReload<=0) {
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
    if(e.key===' '){
      e.preventDefault();
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
    // ── 飛び血鎌 [E] — Shinigami ★3 ─────────────────────────────────────────
    if(e.key==='e'||e.key==='E'){
      if(shinigamiStars>=3 && s.playerScytheCooldown<=0 && player.state!=='dead'){
        const spd=13*player.dir;
        s.projs.push(mkProj('player',player.pos.x+player.dir*20,player.pos.y-35,spd,45,7,player.attackMult,'#a78bfa'));
        player.damage=Math.min(player.damage+6,999);
        s.playerScytheCooldown = shinigamiStars >= 4 ? 45 : 90;
      }
    }
  },[isLionel,fireLionelGun,shinigamiStars]);
  const handleKeyUp=useCallback((e:KeyboardEvent)=>{keysRef.current.delete(e.key);},[]);

  const runLoop=useCallback((ctx:CanvasRenderingContext2D)=>{
    const rawPlatforms=stage.platforms;const [px,bx]=stage.spawnX;
    const stageGimmicks=stage.gimmicks??[];
    const loop=()=>{
      const s=gsRef.current;if(!s||s.over)return;
      s.frame++;
      if(s.lionelReload>0) s.lionelReload--;
      if(s.playerScytheCooldown>0) s.playerScytheCooldown--;

      const {player,bot,parts,projs}=s;

      // ── Stage Gimmick Processing ───────────────────────────────────────────
      // Build effective (mutable) platforms with gimmick modifications
      const effectivePlatforms = rawPlatforms.map(p=>({...p}));
      const hiddenPlatformIdxs = new Set<number>();

      for (const g of stageGimmicks) {
        if (g.type === 'moving_platform') {
          const ep = effectivePlatforms[g.platformIdx];
          const orig = rawPlatforms[g.platformIdx];
          const offset = Math.sin(s.frame * g.speed + (g.phaseOffset ?? 0)) * g.range;
          if (g.axis === 'x') ep.x = orig.x + offset;
          else ep.y = orig.y + offset;
        }
        if (g.type === 'vanishing_platform') {
          const idx = g.platformIdx;
          s.vanishTimers[idx] = (s.vanishTimers[idx] ?? g.onFrames) - 1;
          if (s.vanishTimers[idx] <= 0) {
            s.vanishOn[idx] = !s.vanishOn[idx];
            s.vanishTimers[idx] = s.vanishOn[idx] ? g.onFrames : g.offFrames;
          }
          if (!s.vanishOn[idx]) hiddenPlatformIdxs.add(idx);
        }
        if (g.type === 'hazard') {
          if (s.frame % 30 === 0) {
            for (const f of [player, bot]) {
              if (f.state !== 'dead' && f.invincible === 0 &&
                  overlap(f.pos.x-14, f.pos.y-65, 28, 65, g.x, g.y, g.w, g.h)) {
                f.damage = Math.min(f.damage + g.damage, 999);
                spawn(parts, f.pos.x, f.pos.y-20, [g.color,'#ffffff'], 6);
              }
            }
          }
        }
        if (g.type === 'wind') {
          for (const f of [player, bot]) {
            if (f.state !== 'dead' &&
                overlap(f.pos.x-14, f.pos.y-65, 28, 65, g.x, g.y, g.w, g.h)) {
              f.vel.x = Math.max(-22, Math.min(22, f.vel.x + g.forceX));
            }
          }
        }
      }
      const activePlatforms = effectivePlatforms.filter((_,i) => !hiddenPlatformIdxs.has(i));

      // ── Shinigami ★1: passive damage% reduction (regen) ──────────────────
      if(shinigamiStars>=1 && player.state!=='dead'){
        s.playerRegenTimer--;
        if(s.playerRegenTimer<=0){
          player.damage=Math.max(0,player.damage-3);
          s.playerRegenTimer=120;
        }
      }

      // ── Bajiou ★3: scale player atk with own damage% (King's Aura) ───────
      if(bajiouStars>=3){
        player.attackMult=stats.attackMult*(1+Math.min(player.damage,150)/75);
      } else {
        player.attackMult=stats.attackMult;
      }

      // ── Bajiou ★1: bleed DOT tick on bot ─────────────────────────────────
      if(bajiouStars>=1 && s.playerBleedTicks>0){
        s.playerBleedTimer--;
        if(s.playerBleedTimer<=0){
          bot.damage=Math.min(bot.damage+s.playerBleedDmg,999);
          s.playerBleedTicks--;
          s.playerBleedTimer=s.playerBleedTicks>0?20:0;
          spawn(parts,bot.pos.x+(Math.random()-0.5)*30,bot.pos.y-20,['#ef4444','#f87171','#fca5a5'],8);
        }
      }

      updateBot(bot,player,cfg,projs,activePlatforms);
      updateFighter(player,keysRef.current,activePlatforms);
      updateFighter(bot,keysRef.current,activePlatforms);
      player.vel.x=Math.max(-15,Math.min(15,player.vel.x));
      bot.vel.x   =Math.max(-15,Math.min(15,bot.vel.x));

      // ── Player → bot ──────────────────────────────────────────────────────
      {
        const r1=applyMeleeHit(player,bot,parts,projs);
        if(r1.hit){
          s.playerDmgDealt+=r1.dmgDealt;
          // Bajiou ★1: apply bleed to bot
          if(bajiouStars>=1){
            s.playerBleedDmg=5;
            s.playerBleedTicks=Math.max(s.playerBleedTicks,5);
            if(s.playerBleedTimer<=0) s.playerBleedTimer=20;
          }
          // Shinigami ★2: lifesteal (reduce player's own damage%)
          if(shinigamiStars>=2){
            player.damage=Math.max(0,player.damage-5);
          }
        }
      }

      // ── Bot → player ──────────────────────────────────────────────────────
      {
        const r2=applyMeleeHit(bot,player,parts,projs);
        // Bajiou ★2: counter chance when bot hits player
        if(r2.hit && bajiouStars>=2 && Math.random()<0.10){
          knockback(bot,player.pos,1.0,6,0.3,10);
          bot.vel.y=Math.min(bot.vel.y,-2);
          spawn(parts,(player.pos.x+bot.pos.x)/2,player.pos.y-30,['#f59e0b','#fbbf24','#ffffff'],22);
        }
      }

      // ── Projectile hits ───────────────────────────────────────────────────
      for(let i=projs.length-1;i>=0;i--){
        const proj=projs[i];const vic=proj.owner==='player'?bot:player;
        if(vic.invincible>0||vic.state==='dead')continue;
        const vb={x:vic.pos.x-FW/2,y:vic.pos.y-FH,w:FW,h:FH};
        if(!overlap(proj.pos.x-proj.size,proj.pos.y-proj.size,proj.size*2,proj.size*2,vb.x,vb.y,vb.w,vb.h))continue;
        const hitCols=proj.owner==='player'?SP_COLS.specialNeutral:['#ef4444','#fb923c','#ffffff'];
        // Lionel ★3: headshot check (player projs only)
        let projDmg=proj.damage, projKB=proj.knockback;
        if(proj.owner==='player' && lionelStars>=3){
          const headTop=vic.pos.y-67, headBot=vic.pos.y-43;
          if(proj.pos.y>=headTop && proj.pos.y<=headBot){
            projDmg=proj.damage*5; projKB=proj.knockback*5;
            spawn(parts,vic.pos.x,vic.pos.y-55,['#a78bfa','#c4b5fd','#ffffff'],20);
          }
        }
        const dealt=applyProjHit(vic,proj.pos,proj.vel,proj.atkMult,projKB,projDmg,parts,undefined,hitCols);
        if(dealt&&proj.owner==='player') s.playerDmgDealt+=projDmg*proj.atkMult;
        // ★5 鎌の呪縛: attach orbiting scythe when player scythe hits bot
        if(dealt&&proj.owner==='player'&&shinigamiStars>=5&&proj.color==='#a78bfa'){
          s.botOrbitingScythes.push({angle:Math.random()*Math.PI*2,addedAt:s.frame});
        }
        projs.splice(i,1);
      }

      const checkBlast=(f:Fighter,isP:boolean)=>{
        if(f.state==='dead')return;
        if(f.pos.x<BLAST_L||f.pos.x>BLAST_R||f.pos.y<BLAST_T||f.pos.y>BLAST_B){
          f.stocks--;f.state='dead';f.stateTimer=90;f.attackActive=false;
          if(f.stocks>0)setTimeout(()=>{if(gsRef.current&&!gsRef.current.over)respawnFighter(f,isP?px:bx);},1500);
        }
      };
      checkBlast(player,true);checkBlast(bot,false);

      if((player.stocks<=0&&player.state==='dead'&&player.stateTimer<=0)||(bot.stocks<=0&&bot.state==='dead'&&bot.stateTimer<=0)){
        const won=bot.stocks<=0||player.stocks>0;
        s.over=true;s.winner=won?'player':'bot';
        const reward=recordBattleResult(won,s.playerDmgDealt);
        setOverlay({winner:s.winner,reward});
      }

      // ── Projectile update: Lionel ★2 ricochet for player projs ───────────
      if(lionelStars>=2){
        for(let i=projs.length-1;i>=0;i--){
          const p=projs[i];
          p.trail.push({x:p.pos.x,y:p.pos.y});
          if(p.trail.length>7) p.trail.shift();
          // ☆5 自動追尾
          if(lionelStars>=5 && p.owner==='player'){
            const tx=bot.pos.x, ty=bot.pos.y-40;
            const dx=tx-p.pos.x, dy=ty-p.pos.y;
            const dist=Math.sqrt(dx*dx+dy*dy);
            if(dist>20){
              p.vel.x+=(dx/dist)*0.25; p.vel.y+=(dy/dist)*0.25;
              const spd=Math.sqrt(p.vel.x**2+p.vel.y**2);
              if(spd>18){p.vel.x=p.vel.x/spd*18;p.vel.y=p.vel.y/spd*18;}
            }
          }
          const prevY=p.pos.y;
          p.pos.x+=p.vel.x; p.pos.y+=p.vel.y; p.life--;
          if(p.owner==='player' && !(p as any)._bounced){
            for(const pl of activePlatforms){
              const inX=p.pos.x>pl.x+4 && p.pos.x<pl.x+pl.w-4;
              if(inX && prevY<=pl.y && p.pos.y>=pl.y){
                if(Math.random()<0.30){
                  p.vel.y=-Math.abs(p.vel.y)*0.75; p.vel.x*=0.85;
                  p.life+=60; p.pos.y=pl.y-1; (p as any)._bounced=true;
                } else { p.life=0; }
                break;
              }
            }
          }
          if(p.life<=0||p.pos.x<-120||p.pos.x>W+120||p.pos.y<-250||p.pos.y>H+120)
            projs.splice(i,1);
        }
      } else {
        updateProjectiles(projs);
      }

      // ── ★5 Orbiting scythes on bot: rotate & detonate ───────────────────────
      if(shinigamiStars>=5 && s.botOrbitingScythes.length>0){
        for(const os of s.botOrbitingScythes) os.angle+=0.06;
        const lastAdded=Math.max(...s.botOrbitingScythes.map(os=>os.addedAt));
        if(s.frame-lastAdded>=600){
          const cnt=s.botOrbitingScythes.length;
          bot.damage=Math.min(bot.damage+cnt*45*player.attackMult,999);
          s.playerDmgDealt+=cnt*45;
          spawn(parts,bot.pos.x,bot.pos.y-30,['#dc2626','#a78bfa','#c4b5fd','#fff'],cnt*12);
          s.botOrbitingScythes=[];
        }
      }

      updateParticles(parts);
      ctx.clearRect(0,0,W,H);
      const bossId = stats.selectedCharacter && ['lionel','bajiou','shinigami'].includes(stats.selectedCharacter) ? stats.selectedCharacter : undefined;
      const playerOverride = bossId ? (c:CanvasRenderingContext2D,f:typeof player,fr:number) => { drawPlayerAsBoss(c,f,fr,bossId,s.lionelMode); } : undefined;
      // Pass effective (gimmick-modified) platforms to drawScene by temporarily patching stage
      const origPlatforms = stage.platforms;
      (stage as any).platforms = effectivePlatforms.filter((_,i) => !hiddenPlatformIdxs.has(i));
      drawScene(ctx,player,bot,s.frame,parts,projs,stage,playerOverride);
      (stage as any).platforms = origPlatforms;

      // ── Gimmick overlays ─────────────────────────────────────────────────
      for (const g of stageGimmicks) {
        if (g.type === 'hazard') {
          const pulse = Math.sin(s.frame * 0.12) * 0.25 + 0.65;
          ctx.save();
          ctx.globalAlpha = 0.38 * pulse;
          ctx.fillStyle = g.color;
          ctx.shadowColor = g.color; ctx.shadowBlur = 24;
          ctx.fillRect(g.x, g.y, g.w, g.h);
          // Animated bubbles/sparks
          for (let i = 0; i < 6; i++) {
            const bx = g.x + ((s.frame * 3.7 + i * 49) % g.w);
            const by = g.y + 4 + Math.abs(Math.sin(s.frame * 0.13 + i * 1.1)) * (g.h * 0.55);
            ctx.globalAlpha = 0.7 * pulse;
            ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI*2); ctx.fill();
          }
          ctx.restore();
          ctx.save();
          ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
          ctx.fillStyle = g.color; ctx.globalAlpha = pulse;
          ctx.shadowColor = g.color; ctx.shadowBlur = 10;
          ctx.fillText(g.label, g.x + g.w/2, g.y - 4);
          ctx.restore();
        }
        if (g.type === 'wind') {
          const pulse = Math.abs(Math.sin(s.frame * 0.06)) * 0.18 + 0.06;
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = g.color;
          ctx.fillRect(g.x, g.y, g.w, g.h);
          ctx.globalAlpha = pulse * 4;
          ctx.strokeStyle = g.color; ctx.lineWidth = 1.8;
          const dir = g.forceX > 0 ? 1 : -1;
          const spacing = 90;
          const offset = (s.frame * Math.abs(g.forceX) * 4) % spacing;
          for (let ax = g.x + offset; ax < g.x + g.w; ax += spacing) {
            for (let row = 0; row < 5; row++) {
              const ay = g.y + 50 + row * 80;
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + dir*32, ay); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(ax + dir*32, ay); ctx.lineTo(ax + dir*20, ay-7); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(ax + dir*32, ay); ctx.lineTo(ax + dir*20, ay+7); ctx.stroke();
            }
          }
          // Wind label
          ctx.globalAlpha = 0.55;
          ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = g.color;
          ctx.fillText(g.forceX > 0 ? '→ 風 →' : '← 風 ←', W/2, 22);
          ctx.restore();
        }
        if (g.type === 'vanishing_platform') {
          const idx = g.platformIdx;
          if (s.vanishOn[idx]) {
            const timer = s.vanishTimers[idx] ?? g.onFrames;
            if (timer < 90) {
              const warn = (s.frame % 20 < 10) ? 0.55 : 0.1;
              const ep = effectivePlatforms[idx];
              ctx.save();
              ctx.globalAlpha = warn;
              ctx.fillStyle = '#facc15';
              ctx.shadowColor = '#facc15'; ctx.shadowBlur = 14;
              ctx.fillRect(ep.x, ep.y, ep.w, ep.h + 4);
              ctx.restore();
            }
          }
        }
      }

      // Draw ★5 orbiting scythes around bot
      if(shinigamiStars>=5&&s.botOrbitingScythes.length>0){
        for(const os of s.botOrbitingScythes){
          const r=62;
          const sx=bot.pos.x+Math.cos(os.angle)*r;
          const sy=(bot.pos.y-35)+Math.sin(os.angle)*r;
          ctx.save();ctx.translate(sx,sy);ctx.rotate(os.angle+Math.PI);
          ctx.shadowColor='#dc2626';ctx.shadowBlur=18;
          ctx.strokeStyle='#dc2626';ctx.lineWidth=3.5;
          ctx.beginPath();ctx.arc(0,0,9,Math.PI*0.4,Math.PI*1.6,false);ctx.stroke();
          ctx.strokeStyle='#a78bfa';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(0,0,6,Math.PI*0.5,Math.PI*1.5,false);ctx.stroke();
          ctx.strokeStyle='#4c1d95';ctx.lineWidth=2;
          ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(4,0);ctx.stroke();
          ctx.restore();
        }
      }
      drawHUD(ctx,player,bot,stats,difficulty,stage,s.lionelReload,getEffectiveReload(s.lionelMode,lionelStars),s.lionelMode);
      rafRef.current=requestAnimationFrame(loop);
    };
    return loop;
  },[cfg,stats,difficulty,stage,bajiouStars,shinigamiStars,lionelStars]);

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
          className="rounded-xl border shadow-2xl"
          style={{display:'block',maxWidth:'100vw',maxHeight:'80vh',aspectRatio:`${W}/${H}`,borderColor:stage.glowColor+'66',boxShadow:`0 0 40px ${stage.glowColor}22`}}
        />
        {overlay&&(
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 rounded-xl">
            <div className="text-center">
              {overlay.winner==='player'
                ?<div className="text-6xl font-black text-yellow-400 mb-1">YOU WIN! 🏆</div>
                :<div className="text-6xl font-black text-red-400 mb-1">GAME OVER 💀</div>}
              <div className="mt-3 mb-4 flex gap-4 justify-center">
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
                <div className="mb-4 bg-yellow-400/20 border border-yellow-400 rounded-xl px-6 py-2 text-yellow-300 font-black text-lg animate-pulse">⬆ LEVEL UP！メニューで能力を選択</div>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={restart} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-black text-lg px-8 py-3 rounded-xl transition-all active:scale-95">もう一度</button>
                <button onClick={onBack}  className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg px-8 py-3 rounded-xl transition-all active:scale-95">メニューへ</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-gray-500 flex-wrap justify-center">
        <span>AD/←→: 移動</span><span>W/↑: ジャンプ</span>
        <span>Z/J: 通常攻撃</span><span>X/K: 強攻撃</span><span>↓+Z: 下攻撃</span>
        <span>V/U: アッパー</span><span>空中Z/J: 空中攻撃</span>
        {isLionel && <span className="text-amber-400 font-bold">🔫 J/K: 射撃(ゲージ満タン時) 1-5: 弾種切替</span>}
        {shinigamiStars>=3 && <span className="text-purple-400 font-bold">E: 飛び血鎌</span>}
        <span className="text-purple-400 font-bold">Space: 必殺技（方向キー同時押しで変化）</span>
      </div>
    </div>
  );
}
