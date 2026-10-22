import { WORLD, WIDTH, HEIGHT, ROOM_COUNT, ENEMY_TYPES, doorPosition, opposite, doorKey, choicesFor } from './world.js?v=3';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x-b.x, a.y-b.y);
const unit = (x,y) => { const n=Math.hypot(x,y)||1; return {x:x/n,y:y/n}; };
const freshRecord = () => ({ visited:false, cleared:false, claimed:[], destroyed:[], rewardChosen:false });
export const SAVE_KEY = 'sunlit-ruins-v3';

export function createRun(seed = 104729) {
  const run = {
    version:3, seed:seed >>> 0, room:0, time:0, status:'playing', kills:0, damageTaken:0, deaths:0,
    hero:{x:360,y:328,r:12,hp:120,maxHp:120,attack:10,armor:1,coins:0,yellow:0,blue:0,potions:2,
      invuln:0,shootCd:0,dashCd:0,dashTime:0,dashX:0,dashY:1,facingX:0,facingY:-1},
    records:Array.from({length:ROOM_COUNT},freshRecord), opened:[], relics:{twin:0,swift:0,sun:0,pierce:0,rapid:0,armor:0},
    purchases:{}, pendingReward:null, events:[], scene:null,
  };
  enterRoom(run,0);
  return run;
}

function overlaps(x,y,r,obstacle) {
  return Math.hypot(x-clamp(x,obstacle.x,obstacle.x+obstacle.w),y-clamp(y,obstacle.y,obstacle.y+obstacle.h)) < r;
}
export function blocked(scene,x,y,r=12,flying=false) {
  if (x-r<22 || y-r<22 || x+r>WIDTH-22 || y+r>HEIGHT-22) return true;
  return !flying && scene.obstacles.some(o=>o.type!=='spikes' && o.hp>0 && overlaps(x,y,r,o));
}
export function moveActor(scene,actor,dx,dy,flying=false) {
  const pieces=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/6));
  for(let i=0;i<pieces;i++) {
    if(!blocked(scene,actor.x+dx/pieces,actor.y,actor.r,flying)) actor.x+=dx/pieces;
    if(!blocked(scene,actor.x,actor.y+dy/pieces,actor.r,flying)) actor.y+=dy/pieces;
  }
}
function safePoint(scene,x,y,r=14) {
  if(!blocked(scene,x,y,r)) return {x,y};
  for(let ring=1;ring<12;ring++) for(let i=0;i<16;i++) {
    const px=x+Math.cos(i*Math.PI/8)*ring*12,py=y+Math.sin(i*Math.PI/8)*ring*12;
    if(!blocked(scene,px,py,r)) return {x:px,y:py};
  }
  return {x:360,y:216};
}

function makeEnemy(run,def,i=0) {
  const stats=ENEMY_TYPES[def.type],floor=WORLD[run.room].floor;
  const position=safePoint(run.scene,def.x,def.y,stats.radius);
  const hp=def.type==='guardian' ? 150+floor*60 : Math.round(stats.hp*(1+floor*.22));
  return {...position,id:def.id,type:def.type,r:stats.radius,hp,maxHp:hp,attack:stats.attack+floor*1.8,
    cooldown:.8+i*.27,phase:'idle',phaseTime:0,cycle:0,targetX:0,targetY:0,vx:0,vy:0,flash:0};
}

function addPickup(run,id,type,x,y,value=1) {
  if(run.records[run.room].claimed.includes(id) || run.scene.pickups.some(p=>p.id===id)) return;
  const point=safePoint(run.scene,x,y,9);
  run.scene.pickups.push({id,type,...point,value,age:0});
}
function addClearPickups(run) {
  const room=WORLD[run.room];
  if(room.kind===1) {
    addPickup(run,'yellow','yellow',326,216);addPickup(run,'blue','blue',394,216);addPickup(run,'clear-coins','coin',360,255,3);
  } else if(room.kind===3) {
    addPickup(run,'gem',['attack','armor','vitality'][room.floor%3],360,216,1);
    addPickup(run,'potion','potion',410,216,1);
    addPickup(run,'clear-coins','coin',310,216,4);
  } else if(room.kind===4) addPickup(run,'clear-coins','coin',360,216,6);
  else if(room.kind===0) addPickup(run,'clear-heart','heart',360,216,18);
}

export function enterRoom(run,id,via=null) {
  const room=WORLD[id];if(!room) return false;
  run.room=id;
  const record=run.records[id];record.visited=true;
  run.scene={enemies:[],bullets:[],pickups:[],particles:[],texts:[],doorCd:.65,
    obstacles:room.obstacles.map(o=>({...o,hp:record.destroyed.includes(o.id)?0:o.type==='crate'?24:Infinity}))};
  const spawn=via ? doorPosition(opposite(via)) : [360,328];
  run.hero.x=clamp(spawn[0],70,WIDTH-70);run.hero.y=clamp(spawn[1],70,HEIGHT-70);
  run.hero.invuln=.9;run.hero.dashTime=0;run.hero.shootCd=.2;
  if(!record.cleared) run.scene.enemies=room.enemies.map((e,i)=>makeEnemy(run,e,i));
  else {
    room.enemies.forEach(e=>addPickup(run,`${e.id}-coin`,'coin',e.x,e.y,e.type==='guardian'?5:2));
    record.destroyed.forEach(id=>{ const o=room.obstacles.find(o=>o.id===id);if(o)addPickup(run,`${id}-coin`,'coin',o.x+20,o.y+20); });
    addClearPickups(run);
  }
  if(!record.cleared && room.kind===2) {
    record.cleared=true;run.hero.hp=Math.min(run.hero.maxHp,run.hero.hp+16);
    emit(run,'note','补给站替你恢复了 16 点体力。金币可以换强化，也可以留到下一层。');
  }
  run.events.push({type:'checkpoint'});
  return true;
}

function emit(run,type,text) { run.events.push({type,text}); }
export function takeEvents(run) { return run.events.splice(0); }
export function roomCleared(run) { return run.records[run.room].cleared; }
export function canLeave(run) { return run.status==='playing' && roomCleared(run) && !run.pendingReward; }
export function transition(run,direction) {
  const door=WORLD[run.room].doors.find(d=>d.direction===direction);
  if(!door) return false;
  if(!canLeave(run)) {emit(run,'note','先清空这个房间，小路才会打开。');return false;}
  const key=doorKey(run.room,door.to);
  if(door.type!=='open' && !run.opened.includes(key)) {
    if(run.hero[door.type]<1) {emit(run,'note',door.type==='yellow'?'需要黄色钥匙。上方守钥房清空后会掉落。':'需要蓝色钥匙。清空守钥房可获得一枚。');return false;}
    run.hero[door.type]--;run.opened.push(key);emit(run,'unlock',`${door.type==='yellow'?'黄色':'蓝色'}钥匙打开了花门。`);
  }
  enterRoom(run,door.to,direction);return true;
}

export function interact(run) {
  if(run.status!=='playing') return false;
  const room=WORLD[run.room];
  if(room.kind===4 && distance(run.hero,{x:360,y:338})<66) {
    if(!roomCleared(run)) {emit(run,'note','击败守卫后，传送花环才会亮起。');return false;}
    if(run.pendingReward) return false;
    if(room.floor===5) {run.status='won';emit(run,'win','你带着六枚晴空印记，抵达了花塔的终点。');return true;}
    enterRoom(run,(room.floor+1)*5);emit(run,'floor','走进新的花园。先找钥匙，或去补给站整理收获。');return true;
  }
  const nearby=room.doors.map(d=>({d,p:doorPosition(d.direction)})).sort((a,b)=>distance(run.hero,{x:a.p[0],y:a.p[1]})-distance(run.hero,{x:b.p[0],y:b.p[1]}))[0];
  if(nearby && distance(run.hero,{x:nearby.p[0],y:nearby.p[1]})<68) return transition(run,nearby.d.direction);
  emit(run,'note',room.kind===2?'下方补给清单可以购买强化。靠近花门按 E 返回。':'靠近花门按 E，或向门继续走；清房后才能前进。');return false;
}

export function usePotion(run) {
  if(run.status!=='playing' || run.hero.potions<1 || run.hero.hp>=run.hero.maxHp) return false;
  run.hero.potions--;run.hero.hp=Math.min(run.hero.maxHp,run.hero.hp+45);emit(run,'heal','使用一瓶晴露，恢复 45 点体力。');run.events.push({type:'checkpoint'});return true;
}
export function shopItems(run) {
  const floor=WORLD[run.room].floor;
  return [
    {id:'attack',name:'磨亮飞信',detail:'攻击力 +3',cost:8+floor*2,max:2,icon:'➶'},
    {id:'armor',name:'加厚披肩',detail:'护甲 +1',cost:7+floor*2,max:2,icon:'◈'},
    {id:'potion',name:'一瓶晴露',detail:'携带药水，Q 恢复 45 体力',cost:4,max:3,icon:'♧'},
    {id:'vitality',name:'口袋暖阳',detail:'体力上限 +15，并恢复 25',cost:9+floor*2,max:1,icon:'☀'},
  ].map(item=>({...item,bought:run.purchases[`${floor}-${item.id}`]||0}));
}
export function buy(run,id) {
  if(run.status!=='playing' || WORLD[run.room].kind!==2) return false;
  const item=shopItems(run).find(i=>i.id===id);
  if(!item || item.bought>=item.max || run.hero.coins<item.cost) return false;
  run.hero.coins-=item.cost;run.purchases[`${WORLD[run.room].floor}-${id}`]=item.bought+1;
  if(id==='attack')run.hero.attack+=3;
  if(id==='armor')run.hero.armor++;
  if(id==='potion')run.hero.potions++;
  if(id==='vitality'){run.hero.maxHp+=15;run.hero.hp=Math.min(run.hero.maxHp,run.hero.hp+25);}
  emit(run,'buy',`收下${item.name}，祝你一路晴朗。`);run.events.push({type:'checkpoint'});return true;
}
export function chooseRelic(run,id) {
  if(run.status!=='reward' || run.pendingReward===null || !choicesFor(run.pendingReward).includes(id))return false;
  const record=run.records[run.pendingReward*5+4];if(record.rewardChosen)return false;
  run.relics[id]++;
  if(id==='swift')run.hero.attack+=2;
  if(id==='sun'){run.hero.maxHp+=20;run.hero.hp=Math.min(run.hero.maxHp,run.hero.hp+28);}
  if(id==='pierce')run.hero.attack++;
  if(id==='rapid')run.hero.hp=Math.min(run.hero.maxHp,run.hero.hp+15);
  if(id==='armor')run.hero.armor+=2;
  record.rewardChosen=true;run.pendingReward=null;run.status='playing';
  emit(run,'relic','新的小巧思装进口袋了。到下方花环按 E 前进。');run.events.push({type:'checkpoint'});return true;
}

function burst(run,x,y,color,count=9) {
  for(let i=0;i<count;i++)run.scene.particles.push({x,y,vx:Math.cos(i*2.4)*35,vy:Math.sin(i*2.4)*35,life:.45,maxLife:.45,color});
}
function hurtHero(run,amount,from) {
  const h=run.hero;if(h.invuln>0 || h.dashTime>0 || run.status!=='playing')return false;
  const damage=Math.max(1,Math.round(amount-h.armor));h.hp=Math.max(0,h.hp-damage);h.invuln=.85;
  run.damageTaken+=damage;run.scene.texts.push({x:h.x,y:h.y-35,text:`−${damage}`,life:.8,color:'#c27955'});
  if(from){const away=unit(h.x-from.x,h.y-from.y);moveActor(run.scene,h,away.x*15,away.y*15);}
  burst(run,h.x,h.y,'#efbd7e',7);emit(run,'hit');
  if(h.hp===0){run.status='dead';run.hero.dashTime=0;emit(run,'death','歇一下，再出发。已完成的房间和强化都会保留。');run.events.push({type:'checkpoint'});}
  return true;
}
export function revive(run) {
  if(run.status!=='dead')return false;
  run.deaths++;run.hero.coins=Math.floor(run.hero.coins*.8);run.hero.hp=run.hero.maxHp;run.hero.dashCd=0;
  run.status='playing';run.pendingReward=null;enterRoom(run,WORLD[run.room].floor*5);
  emit(run,'note','回到前庭，体力恢复。已完成的房间、钥匙和强化保留，金币减少 20%。');return true;
}

function clearRoom(run) {
  if(run.status!=='playing')return;
  const record=run.records[run.room];if(record.cleared)return;
  record.cleared=true;addClearPickups(run);
  run.scene.bullets=run.scene.bullets.filter(b=>b.owner==='hero');
  run.hero.hp=Math.min(run.hero.maxHp,run.hero.hp+run.relics.sun*8);
  burst(run,360,216,'#b2ca7f',18);emit(run,'clear','房间清空！花门打开了，记得带走地上的收获。');
  if(WORLD[run.room].kind===4 && !record.rewardChosen) {
    run.pendingReward=WORLD[run.room].floor;run.status='reward';
  }
  run.events.push({type:'checkpoint'});
}
function collect(run,pickup) {
  const h=run.hero;
  if(pickup.type==='coin')h.coins+=pickup.value;
  else if(pickup.type==='heart')h.hp=Math.min(h.maxHp,h.hp+pickup.value+run.relics.armor*6);
  else if(pickup.type==='yellow' || pickup.type==='blue')h[pickup.type]+=pickup.value;
  else if(pickup.type==='potion')h.potions+=pickup.value;
  else if(pickup.type==='attack'){h.attack+=3;emit(run,'note','红芽晶石：攻击力 +3。');}
  else if(pickup.type==='armor'){h.armor+=2;emit(run,'note','蓝叶晶石：护甲 +2。');}
  else if(pickup.type==='vitality'){h.maxHp+=15;h.hp=Math.min(h.maxHp,h.hp+25);emit(run,'note','暖阳晶石：体力上限 +15。');}
  run.records[run.room].claimed.push(pickup.id);pickup.collected=true;
  burst(run,pickup.x,pickup.y,'#d6b96a',5);emit(run,'pickup');run.events.push({type:'checkpoint'});
}

function shoot(run,owner,x,y,angle,speed,damage,pierce=0) {
  run.scene.bullets.push({owner,x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,r:owner==='hero'?4:5,damage,ttl:3,pierce,hits:[]});
}
function lineClear(scene,a,b,ignore=null) {
  const steps=Math.ceil(distance(a,b)/9);
  for(let i=1;i<steps;i++){
    const x=a.x+(b.x-a.x)*i/steps,y=a.y+(b.y-a.y)*i/steps;
    if(scene.obstacles.some(o=>o!==ignore && o.hp>0 && o.type!=='spikes' && o.type!=='water' && overlaps(x,y,1,o)))return false;
  }
  return true;
}
function fireHero(run,input) {
  const h=run.hero;if(h.shootCd>0)return;
  const candidates=[...run.scene.enemies].sort((a,b)=>distance(a,h)-distance(b,h));
  const crates=run.scene.obstacles.filter(o=>o.type==='crate' && o.hp>0).map(o=>({x:o.x+o.w/2,y:o.y+o.h/2,obstacle:o})).sort((a,b)=>distance(a,h)-distance(b,h));
  const target=input.aim || candidates.find(e=>lineClear(run.scene,h,e)) || candidates[0] || crates.find(e=>lineClear(run.scene,h,e,e.obstacle));
  if(!target)return;
  const angle=Math.atan2(target.y-h.y,target.x-h.x),count=1+Math.min(3,run.relics.twin);
  h.facingX=Math.cos(angle);h.facingY=Math.sin(angle);
  for(let i=0;i<count;i++)shoot(run,'hero',h.x+Math.cos(angle)*18,h.y+Math.sin(angle)*18,angle+(i-(count-1)/2)*.17,350,h.attack*(count>1?.78:1),run.relics.pierce);
  h.shootCd=Math.max(.12,.3*Math.pow(.85,run.relics.rapid));emit(run,'shoot');
}

function updateEnemy(run,e,dt) {
  const h=run.hero,scene=run.scene,floor=WORLD[run.room].floor,def=ENEMY_TYPES[e.type];
  e.flash=Math.max(0,e.flash-dt);e.cooldown-=dt;e.phaseTime-=dt;
  const dir=unit(h.x-e.x,h.y-e.y);
  if(e.type==='fly') moveActor(scene,e,dir.x*(def.speed+floor*4)*dt,dir.y*(def.speed+floor*4)*dt,true);
  if(e.type==='hopper') {
    if(e.phase==='jump'){
      moveActor(scene,e,e.vx*dt,e.vy*dt);
      if(e.phaseTime<=0){e.phase='idle';e.cooldown=1.1;burst(run,e.x,e.y,'#ceb994',6);}
    } else if(e.phase==='windup' && e.phaseTime<=0){
      const aim=unit(e.targetX-e.x,e.targetY-e.y);e.vx=aim.x*210;e.vy=aim.y*210;e.phase='jump';e.phaseTime=.38;
    } else if(e.phase==='idle' && e.cooldown<=0){
      e.phase='windup';e.phaseTime=.55;e.targetX=clamp(h.x,45,WIDTH-45);e.targetY=clamp(h.y,45,HEIGHT-45);
    }
  }
  if(e.type==='spider') {
    if(e.phase==='charge'){
      moveActor(scene,e,e.vx*dt,e.vy*dt);
      if(e.phaseTime<=0){e.phase='idle';e.cooldown=1.65;}
    } else if(e.phase==='windup' && e.phaseTime<=0){e.vx=dir.x*230;e.vy=dir.y*230;e.phase='charge';e.phaseTime=.42;}
    else if(e.phase==='idle'){
      moveActor(scene,e,dir.x*(def.speed+floor*3)*dt,dir.y*(def.speed+floor*3)*dt);
      if(e.cooldown<=0){e.phase='windup';e.phaseTime=.5;}
    }
  }
  if(e.type==='mushroom' || e.type==='guardian') {
    if(e.type==='guardian')moveActor(scene,e,dir.x*(def.speed+floor*2)*dt,dir.y*(def.speed+floor*2)*dt);
    if(e.phase==='windup' && e.phaseTime<=0){
      const angle=Math.atan2(h.y-e.y,h.x-e.x);
      if(e.type==='guardian' && e.cycle%2===0){
        const count=6+floor;
        for(let i=0;i<count;i++)shoot(run,'enemy',e.x,e.y,angle+i*Math.PI*2/count,116+floor*7,e.attack);
      } else for(let offset=-1;offset<=1;offset++)shoot(run,'enemy',e.x,e.y,angle+offset*.22,130+floor*8,e.attack);
      e.phase='idle';e.cooldown=e.type==='guardian'?1.45:1.8;e.cycle++;
    } else if(e.phase==='idle' && e.cooldown<=0){e.phase='windup';e.phaseTime=e.type==='guardian'?.65:.5;}
  }
  if(e.phase!=='jump' && distance(h,e)<h.r+e.r)hurtHero(run,e.attack,e);
}

function updateBullets(run,dt) {
  for(const b of run.scene.bullets) {
    b.ttl-=dt;
    const steps=Math.max(1,Math.ceil(Math.hypot(b.vx,b.vy)*dt/5));
    for(let part=0;part<steps && b.ttl>0;part++) {
      b.x+=b.vx*dt/steps;b.y+=b.vy*dt/steps;
      if(b.x<20 || b.y<20 || b.x>WIDTH-20 || b.y>HEIGHT-20){b.ttl=0;break;}
      const obstacle=run.scene.obstacles.find(o=>o.hp>0 && o.type!=='spikes' && o.type!=='water' && overlaps(b.x,b.y,b.r,o));
      if(obstacle){
        b.ttl=0;
        if(b.owner==='hero' && obstacle.type==='crate'){
          obstacle.hp-=b.damage;
          if(obstacle.hp<=0){run.records[run.room].destroyed.push(obstacle.id);addPickup(run,`${obstacle.id}-coin`,'coin',obstacle.x+20,obstacle.y+20);burst(run,obstacle.x+20,obstacle.y+20,'#c7a168',9);}
        }
        break;
      }
      if(b.owner==='hero') {
        for(const enemy of run.scene.enemies) {
          if(enemy.hp<=0 || b.hits.includes(enemy.id) || distance(b,enemy)>enemy.r+b.r)continue;
          enemy.hp-=b.damage;enemy.flash=.12;b.hits.push(enemy.id);
          run.scene.texts.push({x:enemy.x,y:enemy.y-28,text:String(Math.round(b.damage)),life:.55,color:'#688953'});
          burst(run,b.x,b.y,'#dde8ac',3);emit(run,'impact');
          if(enemy.hp<=0){run.kills++;addPickup(run,`${enemy.id}-coin`,'coin',enemy.x,enemy.y,enemy.type==='guardian'?5:2);burst(run,enemy.x,enemy.y,'#b2c98a',12);emit(run,'defeat');}
          if(b.pierce>0)b.pierce--;else b.ttl=0;
          break;
        }
      } else if(distance(b,run.hero)<b.r+run.hero.r){hurtHero(run,b.damage,b);b.ttl=0;}
    }
  }
  run.scene.bullets=run.scene.bullets.filter(b=>b.ttl>0);
  run.scene.enemies=run.scene.enemies.filter(e=>e.hp>0);
}

export function update(run,input={},seconds=1/60) {
  if(run.status!=='playing')return;
  const dt=clamp(Number.isFinite(seconds)?seconds:0,0,.05);if(!dt)return;
  run.time+=dt;
  const h=run.hero,scene=run.scene;
  h.invuln=Math.max(0,h.invuln-dt);h.shootCd-=dt;h.dashCd=Math.max(0,h.dashCd-dt);h.dashTime=Math.max(0,h.dashTime-dt);scene.doorCd=Math.max(0,scene.doorCd-dt);
  let dx=Number.isFinite(input.x)?clamp(input.x,-1,1):0,dy=Number.isFinite(input.y)?clamp(input.y,-1,1):0;
  const magnitude=Math.hypot(dx,dy);if(magnitude>1){dx/=magnitude;dy/=magnitude;}
  if(input.potion)usePotion(run);
  if(input.dash && h.dashCd<=0){
    const dir=magnitude>.1?unit(dx,dy):unit(h.facingX,h.facingY);
    h.dashX=dir.x;h.dashY=dir.y;h.dashTime=.17;h.invuln=Math.max(h.invuln,.27);h.dashCd=Math.max(.7,2.1-run.relics.swift*.25);emit(run,'dash');
  }
  const speed=170+run.relics.swift*12;
  moveActor(scene,h,h.dashTime>0?h.dashX*470*dt:dx*speed*dt,h.dashTime>0?h.dashY*470*dt:dy*speed*dt);
  if(magnitude>.1 && !scene.enemies.length){h.facingX=dx;h.facingY=dy;}
  fireHero(run,input);
  for(const e of scene.enemies){if(run.status!=='playing')break;updateEnemy(run,e,dt);}
  if(run.status==='playing')updateBullets(run,dt);
  if(run.status==='playing') {
    for(const o of scene.obstacles)if(o.type==='spikes' && (run.time+o.x*.003)%2.8<.9 && overlaps(h.x,h.y,h.r-3,o))hurtHero(run,12+WORLD[run.room].floor,o);
    if(run.status==='playing' && !scene.enemies.length && !roomCleared(run))clearRoom(run);
  }
  if(run.status==='playing')for(const p of scene.pickups){p.age+=dt;if(distance(h,p)<h.r+13)collect(run,p);}
  scene.pickups=scene.pickups.filter(p=>!p.collected);
  for(const p of scene.particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;}
  scene.particles=scene.particles.filter(p=>p.life>0);
  for(const text of scene.texts){text.life-=dt;text.y-=dt*24;}
  scene.texts=scene.texts.filter(t=>t.life>0);
  if(input.interact && run.status==='playing'){interact(run);return;}
  if(canLeave(run) && scene.doorCd<=0 && magnitude>.1) {
    const door=WORLD[run.room].doors.find(d=>{const p=doorPosition(d.direction);const forward={north:dy<-.1,south:dy>.1,east:dx>.1,west:dx<-.1}[d.direction];return forward && distance(h,{x:p[0],y:p[1]})<24;});
    if(door){scene.doorCd=1;transition(run,door.direction);}
  }
}

export function exportSave(run) {
  return {version:3,seed:run.seed,room:run.room,time:run.time,status:run.status,hero:{...run.hero},records:run.records,
    opened:run.opened,relics:run.relics,purchases:run.purchases,pendingReward:run.pendingReward,kills:run.kills,damageTaken:run.damageTaken,deaths:run.deaths};
}
export function saveRun(storage,run) {
  try{storage.setItem(SAVE_KEY,JSON.stringify(exportSave(run)));return true;}catch{return false;}
}
export function readRun(storage) {
  try{
    const data=JSON.parse(storage.getItem(SAVE_KEY));
    if(data?.version!==3 || !Number.isInteger(data.room) || data.room<0 || data.room>=ROOM_COUNT || !Array.isArray(data.records) || data.records.length!==ROOM_COUNT)return null;
    const run=createRun(Number(data.seed)||104729);
    const bounds={hp:[0,1000],maxHp:[120,1000],attack:[10,200],armor:[1,40],coins:[0,9999],yellow:[0,12],blue:[0,12],potions:[0,99]};
    for(const [key,[lo,hi]] of Object.entries(bounds))if(Number.isFinite(data.hero?.[key]))run.hero[key]=clamp(Math.floor(data.hero[key]),lo,hi);
    run.hero.hp=Math.min(run.hero.hp,run.hero.maxHp);
    run.records=data.records.map((record,i)=>({visited:record?.visited===true,cleared:record?.cleared===true,
      rewardChosen:i%5===4 && record?.rewardChosen===true,
      claimed:Array.isArray(record?.claimed)?[...new Set(record.claimed.filter(x=>typeof x==='string' && /^(e\d+-coin|o\d+-coin|yellow|blue|clear-coins|clear-heart|gem|potion)$/.test(x)))]:[],
      destroyed:Array.isArray(record?.destroyed)?WORLD[i].obstacles.filter(o=>o.type==='crate' && record.destroyed.includes(o.id)).map(o=>o.id):[]}));
    for(const key of Object.keys(run.relics))if(Number.isInteger(data.relics?.[key]))run.relics[key]=clamp(data.relics[key],0,6);
    const validDoors=WORLD.flatMap(r=>r.doors.filter(d=>d.type!=='open').map(d=>doorKey(r.id,d.to)));
    run.opened=Array.isArray(data.opened)?[...new Set(data.opened.filter(k=>validDoors.includes(k)))]:[];
    for(let floor=0;floor<6;floor++)for(const item of ['attack','armor','potion','vitality']){
      const key=`${floor}-${item}`,n=data.purchases?.[key];if(Number.isInteger(n))run.purchases[key]=clamp(n,0,3);
    }
    for(const key of ['kills','damageTaken','deaths','time'])if(Number.isFinite(data[key]))run[key]=clamp(data[key],0,1e7);
    enterRoom(run,data.room);run.events=[];
    if(data.status==='dead' || run.hero.hp<=0)run.status='dead';
    else if(data.status==='won' && run.records[29].cleared && run.records[29].rewardChosen)run.status='won';
    else if(WORLD[run.room].kind===4 && run.records[run.room].cleared && !run.records[run.room].rewardChosen){run.pendingReward=WORLD[run.room].floor;run.status='reward';}
    return run;
  }catch{return null;}
}
