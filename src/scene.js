import { WIDTH, HEIGHT, WORLD, ZONES, ENEMY_TYPES, doorPosition, doorKey } from './world.js?v=3';

const round = (ctx,x,y,w,h,r=6) => {ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
function label(ctx,text,x,y,size=12,color='#68795c',align='center') {
  ctx.fillStyle=color;ctx.font=`${size}px "Microsoft YaHei",sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(text,x,y);
}
function ellipse(ctx,x,y,rx,ry,color) {ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}

export async function loadArt() {
  const files={hero:'courier.svg',fly:'sprites/fly.png',hopper:'sprites/hopper.png',mushroom:'sprites/mushroom.png',spider:'sprites/spider.png'};
  const images={};
  await Promise.allSettled(Object.entries(files).map(([key,file])=>new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{images[key]=image;resolve();};image.onerror=()=>reject(new Error(file));image.src=new URL(`../assets/${file}?v=3`,import.meta.url).href;
  })));
  return images;
}
function drawFloor(ctx,run) {
  const zone=ZONES[WORLD[run.room].floor];
  ctx.fillStyle=zone.floor;ctx.fillRect(0,0,WIDTH,HEIGHT);
  for(let row=0;row<9;row++)for(let col=0;col<15;col++){
    const x=col*48,y=row*48;
    ctx.fillStyle=(row+col)%2?'#ffffff12':'#ffffff24';ctx.fillRect(x+2,y+2,44,44);
    if((row*13+col*7+run.room)%11===0){
      ctx.strokeStyle='#91a56c38';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+30,y+35);ctx.lineTo(x+25,y+29);ctx.moveTo(x+30,y+35);ctx.lineTo(x+34,y+27);ctx.stroke();
    }
  }
  ctx.strokeStyle='#b0bba14d';ctx.lineWidth=1;ctx.strokeRect(22.5,22.5,WIDTH-45,HEIGHT-45);
  // A warm raised garden wall, without dungeon shadows.
  ctx.fillStyle=zone.wall;ctx.fillRect(0,0,WIDTH,23);ctx.fillRect(0,HEIGHT-23,WIDTH,23);ctx.fillRect(0,0,23,HEIGHT);ctx.fillRect(WIDTH-23,0,23,HEIGHT);
  ctx.fillStyle='#ffffff35';ctx.fillRect(0,0,WIDTH,6);ctx.fillRect(0,0,6,HEIGHT);
  for(let x=32;x<WIDTH;x+=48){ellipse(ctx,x,12,15,9,'#ffffff1a');ellipse(ctx,x+9,HEIGHT-10,12,7,'#71875922');}
  const corners=[[32,34],[WIDTH-32,34],[32,HEIGHT-34],[WIDTH-32,HEIGHT-34]];
  for(const [x,y] of corners){ellipse(ctx,x,y,13,9,'#78915a66');ellipse(ctx,x+8,y-4,9,7,'#bdd199');label(ctx,'✿',x-6,y-6,13,'#f7f0c5');}
}
function drawDoor(ctx,run,door) {
  const [x,y]=doorPosition(door.direction),combat=!run.records[run.room].cleared;
  const locked=door.type!=='open' && !run.opened.includes(doorKey(run.room,door.to));
  const color=combat?'#a8b28e':locked?(door.type==='blue'?'#83aebd':'#d2ad66'):'#a5bf91';
  ctx.save();ctx.translate(x,y);if(door.direction==='east'||door.direction==='west')ctx.rotate(Math.PI/2);
  round(ctx,-29,-21,58,42,14);ctx.fillStyle='#f7f3dc';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle=color;ctx.stroke();
  if(combat || locked){ctx.strokeStyle=color;ctx.lineWidth=4;for(let i=-12;i<=12;i+=12){ctx.beginPath();ctx.moveTo(i,-12);ctx.lineTo(i,12);ctx.stroke();}}
  else{ctx.fillStyle='#d7e6bd';round(ctx,-20,-13,40,26,8);ctx.fill();}
  ctx.restore();
  const text=combat?'清房后开门':locked?`${door.type==='blue'?'蓝':'黄'}钥匙 ×1`:door.label;
  const offsets={north:[0,32],south:[0,-32],west:[39,37],east:[-39,37]};
  const o=offsets[door.direction];label(ctx,text,x+o[0],y+o[1],10,combat?'#84916c':'#687e61');
}
function drawObstacle(ctx,o,run) {
  if(o.hp<=0)return;
  const {x,y,w,h}=o;
  if(o.type==='water'){
    round(ctx,x-2,y-2,w+4,h+4,11);ctx.fillStyle='#c0d4bb';ctx.fill();
    round(ctx,x+1,y+1,w-2,h-2,10);ctx.fillStyle='#aad2ce';ctx.fill();
    ctx.strokeStyle='#edf7df';ctx.lineWidth=2;
    for(let i=0;i<2;i++){ctx.beginPath();ctx.moveTo(x+8,y+13+i*12);ctx.quadraticCurveTo(x+18,y+9+i*12,x+29,y+14+i*12);ctx.stroke();}
    return;
  }
  if(o.type==='spikes'){
    const phase=(run.time+o.x*.003)%2.8,active=phase<.9;
    round(ctx,x+2,y+2,w-4,h-4,9);ctx.fillStyle=active?'#dfbc75':'#d5dfb1';ctx.fill();
    for(let i=0;i<3;i++)for(let j=0;j<2;j++){
      if(active){ctx.fillStyle='#fff3c2';ctx.beginPath();ctx.moveTo(x+6+i*11,y+18+j*12);ctx.lineTo(x+11+i*11,y+8+j*12);ctx.lineTo(x+16+i*11,y+18+j*12);ctx.fill();}
      else{ellipse(ctx,x+10+i*10,y+14+j*12,3,2,'#95ad70');}
    }
    if(phase>2.4){ctx.strokeStyle='#d7b96f';ctx.lineWidth=2;round(ctx,x-1,y-1,w+2,h+2,9);ctx.stroke();}
    return;
  }
  ellipse(ctx,x+21,y+38,25,7,'#75865c20');
  if(o.type==='rock'){
    round(ctx,x,y-7,w,h+5,11);ctx.fillStyle='#acb5a1';ctx.fill();
    round(ctx,x+2,y-8,w-4,h-9,10);ctx.fillStyle='#c6cbbb';ctx.fill();
    ctx.strokeStyle='#919e8a';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+8,y+13);ctx.lineTo(x+19,y+8);ctx.lineTo(x+30,y+14);ctx.stroke();
    ellipse(ctx,x+33,y+23,8,4,'#99b77c');ellipse(ctx,x+28,y+29,6,3,'#acbf80');
  }else{
    round(ctx,x+1,y-3,w-2,h+3,5);ctx.fillStyle='#caab74';ctx.fill();
    round(ctx,x+3,y-6,w-6,h-5,4);ctx.fillStyle='#e2c28b';ctx.fill();
    ctx.strokeStyle='#b99662';ctx.lineWidth=2;ctx.strokeRect(x+7,y,w-14,h-13);
    ctx.beginPath();ctx.moveTo(x+7,y);ctx.lineTo(x+w-7,y+h-13);ctx.moveTo(x+w-7,y);ctx.lineTo(x+7,y+h-13);ctx.stroke();
    round(ctx,x+14,y+7,12,13,2);ctx.fillStyle='#fff3d6';ctx.fill();label(ctx,'✿',x+20,y+13,9,'#bc975d');
  }
}
function drawPickup(ctx,p,t) {
  const y=p.y+Math.sin(t*3+p.x)*2;
  ellipse(ctx,p.x,p.y+9,10,3,'#75865c25');
  if(p.type==='coin'){
    ellipse(ctx,p.x,y,9,9,'#dab45a');ellipse(ctx,p.x-1,y-1,6,6,'#f5d990');label(ctx,'·',p.x,y,16,'#b18b3f');
  }else if(p.type==='yellow'||p.type==='blue'){
    const color=p.type==='blue'?'#76a9c3':'#d1a34a';ctx.strokeStyle='#fff5d7';ctx.lineWidth=6;ctx.beginPath();ctx.arc(p.x-4,y-3,5,0,Math.PI*2);ctx.moveTo(p.x,y+1);ctx.lineTo(p.x+9,y+10);ctx.stroke();
    ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x-4,y-3,5,0,Math.PI*2);ctx.moveTo(p.x,y+1);ctx.lineTo(p.x+9,y+10);ctx.moveTo(p.x+6,y+7);ctx.lineTo(p.x+10,y+3);ctx.stroke();
  }else if(p.type==='heart')label(ctx,'♥',p.x,y,23,'#dc9d8c');
  else if(p.type==='potion'){
    round(ctx,p.x-7,y-6,14,18,5);ctx.fillStyle='#bedad2';ctx.fill();ctx.strokeStyle='#709d91';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#c4a16c';ctx.fillRect(p.x-4,y-10,8,5);label(ctx,'+',p.x,y+3,12,'#f5fcdf');
  }else{
    const color={attack:'#d49b85',armor:'#88b8c2',vitality:'#d9b56a'}[p.type];
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(p.x,y-13);ctx.lineTo(p.x+10,y);ctx.lineTo(p.x,y+13);ctx.lineTo(p.x-10,y);ctx.closePath();ctx.fill();ctx.strokeStyle='#fffae7';ctx.lineWidth=2;ctx.stroke();
  }
}
function drawEnemy(ctx,e,images,run) {
  const def=ENEMY_TYPES[e.type],sprite=images[def.sprite],isBoss=e.type==='guardian';
  const size=isBoss?106:e.type==='spider'?62:58;
  ellipse(ctx,e.x,e.y+14,isBoss?33:17,isBoss?10:5,'#67744a25');
  if(e.phase==='windup'){
    ctx.strokeStyle='#dfb65c';ctx.lineWidth=2;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(e.x,e.y,isBoss?39:25,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    if(e.type==='hopper'){ellipse(ctx,e.targetX,e.targetY,23,14,'#e2bd6b39');ctx.strokeStyle='#d6aa58';ctx.beginPath();ctx.ellipse(e.targetX,e.targetY,23,14,0,0,Math.PI*2);ctx.stroke();}
  }
  let sx=0,sy=0,sw=32,sh=32,raise=0;
  if(e.type==='fly')sx=Math.floor(run.time*20)%2*32;
  if(e.type==='hopper'){
    if(e.phase==='jump'){sx=Math.floor(run.time*12)%4*32;raise=Math.sin(Math.max(0,.38-e.phaseTime)/.38*Math.PI)*22;}
    else if(e.phase==='windup')sx=32;
  }
  if(e.type==='spider'){sx=Math.floor(run.time*10)%2*32;sh=16;}
  if(e.type==='mushroom' && e.phase==='windup')sx=32;
  ctx.save();ctx.imageSmoothingEnabled=false;if(e.flash>0)ctx.globalAlpha=.5;
  if(sprite){
    const drawH=e.type==='spider'?size/2:size;
    const offset=e.type==='fly'?size*.39:e.type==='hopper'?size*.63:drawH*.56;
    ctx.drawImage(sprite,sx,sy,sw,sh,e.x-size/2,e.y-offset-raise,size,drawH);
  }else{ellipse(ctx,e.x,e.y,e.r,e.r,'#a9ba86');label(ctx,'✿',e.x,e.y,18,'#fff5dc');}
  ctx.restore();
  if(isBoss){label(ctx,'✦',e.x,e.y-58,22,'#d4b46d');}
  if(e.hp<e.maxHp && !isBoss){
    round(ctx,e.x-17,e.y-35,34,4,2);ctx.fillStyle='#c8cead';ctx.fill();
    round(ctx,e.x-17,e.y-35,34*Math.max(0,e.hp/e.maxHp),4,2);ctx.fillStyle='#8ca36c';ctx.fill();
  }
}
function drawHero(ctx,run,images) {
  const h=run.hero;
  if(h.dashTime>0){for(let i=1;i<5;i++)ellipse(ctx,h.x-h.dashX*i*9,h.y-h.dashY*i*9,12-i*2,8-i,'#ffffff66');}
  ellipse(ctx,h.x,h.y+16,17,5,'#5a73552b');
  ctx.save();if(h.invuln>0 && Math.floor(run.time*15)%2)ctx.globalAlpha=.48;
  if(images.hero)ctx.drawImage(images.hero,h.x-29,h.y-38,58,58);
  else{ellipse(ctx,h.x,h.y,12,14,'#6a9e7d');ellipse(ctx,h.x,h.y-15,11,11,'#f0c499');}
  ctx.restore();
  if(h.dashCd<=0 && !run.scene.enemies.length){ctx.strokeStyle='#b6cc9180';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(h.x,h.y+17,21,7,0,0,Math.PI*2);ctx.stroke();}
}
function drawMerchant(ctx) {
  ellipse(ctx,360,156,35,9,'#9aa67922');
  ctx.fillStyle='#9bb382';round(ctx,333,106,54,47,14);ctx.fill();
  ellipse(ctx,360,110,22,20,'#efd5a5');ellipse(ctx,360,95,29,9,'#d5b777');
  ellipse(ctx,352,110,2,2,'#7b7158');ellipse(ctx,368,110,2,2,'#7b7158');
  ctx.strokeStyle='#bb9776';ctx.lineWidth=2;ctx.beginPath();ctx.arc(360,116,6,0,Math.PI);ctx.stroke();
  round(ctx,320,141,80,35,7);ctx.fillStyle='#d9bb85';ctx.fill();ctx.fillStyle='#f7efd8';ctx.fillRect(327,143,66,8);
  label(ctx,'欢迎歇脚',360,190,12,'#6e855f');label(ctx,'下方清单购买 · 强化会一直保留',360,209,10,'#879373');
}
function drawPortal(ctx,run) {
  const cleared=run.records[run.room].cleared,active=cleared&&!run.pendingReward;
  ctx.save();ctx.translate(360,338);
  ellipse(ctx,0,4,35,15,active?'#f5d88688':'#c6c9ac70');
  ctx.strokeStyle=active?'#cfa85c':'#b2b995';ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,0,31,15,0,0,Math.PI*2);ctx.stroke();
  for(let i=0;i<8;i++){const angle=i*Math.PI/4+(active?run.time*.2:0);ellipse(ctx,Math.cos(angle)*31,Math.sin(angle)*15,5,4,active?'#fff3ca':'#dfe5c9');}
  label(ctx,active?'☀':'✧',0,-3,25,active?'#b98e40':'#a0ae88');
  label(ctx,active?(WORLD[run.room].floor===5?'终点花环 · E':'下一层 · E'):'击败守卫，点亮花环',0,32,11,active?'#9b7d43':'#889775');ctx.restore();
}

export function render(ctx,run,images,{aim=null,reducedMotion=false}={}) {
  ctx.clearRect(0,0,WIDTH,HEIGHT);drawFloor(ctx,run);
  const room=WORLD[run.room];
  room.doors.forEach(door=>drawDoor(ctx,run,door));
  if(room.kind===4)drawPortal(ctx,run);
  for(const o of run.scene.obstacles)if(o.type==='water'||o.type==='spikes')drawObstacle(ctx,o,run);
  if(room.kind===2)drawMerchant(ctx);
  run.scene.pickups.forEach(p=>drawPickup(ctx,p,run.time));
  const layers=[...run.scene.obstacles.filter(o=>o.type==='rock'||o.type==='crate').map(o=>({y:o.y+o.h,draw:()=>drawObstacle(ctx,o,run)})),
    ...run.scene.enemies.map(e=>({y:e.y+10,draw:()=>drawEnemy(ctx,e,images,run)})),{y:run.hero.y+10,draw:()=>drawHero(ctx,run,images)}].sort((a,b)=>a.y-b.y);
  layers.forEach(layer=>layer.draw());
  for(const b of run.scene.bullets){
    if(b.owner==='hero'){
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(Math.atan2(b.vy,b.vx));
      ctx.fillStyle='#fdf7d9';ctx.strokeStyle='#83a078';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-5,-4);ctx.lineTo(-2,0);ctx.lineTo(-5,4);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }else{ellipse(ctx,b.x,b.y,6,6,'#e5b56e');ellipse(ctx,b.x-1,b.y-1,3,3,'#fff0bb');}
  }
  if(!reducedMotion)for(const p of run.scene.particles){ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ellipse(ctx,p.x,p.y,2.5,2,p.color);}ctx.globalAlpha=1;
  for(const text of run.scene.texts){ctx.globalAlpha=Math.min(1,text.life*3);label(ctx,text.text,text.x,text.y,12,text.color);}ctx.globalAlpha=1;
  if(aim){ctx.strokeStyle='#6e91659c';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(aim.x,aim.y,9,0,Math.PI*2);ctx.moveTo(aim.x-14,aim.y);ctx.lineTo(aim.x-6,aim.y);ctx.moveTo(aim.x+6,aim.y);ctx.lineTo(aim.x+14,aim.y);ctx.stroke();}
}
