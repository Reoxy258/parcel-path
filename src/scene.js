import { WIDTH, HEIGHT, WORLD, ZONES, ENEMY_TYPES, SHOP_STALLS, doorPosition, doorKey } from './world.js?v=5';
import { shopItems } from './adventure.js?v=5';

const round = (ctx,x,y,w,h,r=6) => {ctx.beginPath();ctx.roundRect(x,y,w,h,r);};
function label(ctx,text,x,y,size=12,color='#68795c',align='center') {
  ctx.fillStyle=color;ctx.font=`${size}px "Microsoft YaHei",sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(text,x,y);
}
function ellipse(ctx,x,y,rx,ry,color) {ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}

export async function loadArt() {
  const files={fly:'sprites/fly.png',hopper:'sprites/hopper.png',mushroom:'sprites/mushroom.png',spider:'sprites/spider.png',isaac:'sprites/isaac.png'};
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
// 障碍物统一改用干净的几何图形：六边形多面石、三面立方体货箱、
// 圆形涟漪池塘与三角警示荆棘，配合明亮色块保持晴空花园的基调。
function drawObstacle(ctx,o,run) {
  if(o.hp<=0)return;
  const cx=o.x+o.w/2,cy=o.y+o.h/2;
  if(o.type==='water'){
    ellipse(ctx,cx+2,cy+3,24,22,'#a9c4b4');
    ellipse(ctx,cx,cy,22.5,20.5,'#8ec0bd');
    for(let i=0;i<3;i++){
      const t=(run.time*.5+i/3)%1;
      ctx.globalAlpha=(1-t)*.55;
      ctx.strokeStyle='#eaf6e2';ctx.lineWidth=2;
      ctx.beginPath();ctx.ellipse(cx,cy,6+t*15,5+t*13,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.globalAlpha=1;
    ellipse(ctx,cx-7,cy-6,3.5,2.4,'#f4ffe9');
    ellipse(ctx,cx+8,cy+5,2.6,1.8,'#f4ffe9');
    return;
  }
  if(o.type==='spikes'){
    const phase=(run.time+o.x*.003)%2.8,active=phase<.9;
    round(ctx,cx-19,cy-16,38,33,6);
    ctx.fillStyle=active?'#e7c377':'#dbe4b6';ctx.fill();
    ctx.strokeStyle='#b7a268';ctx.lineWidth=1.5;ctx.stroke();
    for(let i=0;i<3;i++)for(let j=0;j<2;j++){
      const bx=cx-13+i*13,by=cy+8+j*10;
      if(active){
        ctx.fillStyle='#fff4c8';ctx.strokeStyle='#c79c4e';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(bx-5.5,by);ctx.lineTo(bx,by-14);ctx.lineTo(bx+5.5,by);ctx.closePath();ctx.fill();ctx.stroke();
      }else{
        ctx.fillStyle='#96a877';
        ctx.beginPath();ctx.moveTo(bx-5,by-3);ctx.lineTo(bx,by-8);ctx.lineTo(bx+5,by-3);ctx.lineTo(bx,by+2);ctx.closePath();ctx.fill();
      }
    }
    if(phase>2.4){ctx.strokeStyle='#d7b96f';ctx.lineWidth=2;round(ctx,cx-21,cy-18,42,37,7);ctx.stroke();}
    return;
  }
  ellipse(ctx,cx,cy+18,22,6,'#75865c20');
  if(o.type==='rock'){
    const poly=(pts,ox=0,oy=0)=>{ctx.beginPath();pts.forEach(([px,py],i)=>i?ctx.lineTo(cx+px+ox,cy+py+oy):ctx.moveTo(cx+px+ox,cy+py+oy));ctx.closePath();};
    poly([[-17,-1],[-9,-13],[9,-13],[17,-1],[9,12],[-9,12]],0,2);
    ctx.fillStyle='#a9b3a0';ctx.fill();ctx.strokeStyle='#8f9a8a';ctx.lineWidth=1.5;ctx.stroke();
    poly([[-17,-1],[-9,-13],[9,-13],[17,-1],[7,-4],[-6,-4]],0,2);
    ctx.fillStyle='#cdd6c4';ctx.fill();
    ctx.strokeStyle='#9aa78f';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(cx+2,cy-2);ctx.lineTo(cx-3,cy+5);ctx.lineTo(cx+1,cy+11);ctx.stroke();
    ctx.fillStyle='#9db77f';
    ctx.beginPath();ctx.moveTo(cx-12,cy-8);ctx.lineTo(cx-7,cy-12);ctx.lineTo(cx-6,cy-5);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(cx+9,cy-9);ctx.lineTo(cx+14,cy-12);ctx.lineTo(cx+12,cy-4);ctx.closePath();ctx.fill();
  }else{
    ctx.fillStyle='#d9b578';round(ctx,cx-18,cy-8,32,24,3);ctx.fill();
    ctx.fillStyle='#bd9660';ctx.beginPath();ctx.moveTo(cx+14,cy-8);ctx.lineTo(cx+20,cy-14);ctx.lineTo(cx+20,cy+10);ctx.lineTo(cx+14,cy+16);ctx.closePath();ctx.fill();
    ctx.fillStyle='#eccd8f';ctx.beginPath();ctx.moveTo(cx-18,cy-8);ctx.lineTo(cx-12,cy-14);ctx.lineTo(cx+20,cy-14);ctx.lineTo(cx+14,cy-8);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#a97f4c';ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(cx-13,cy-3);ctx.lineTo(cx,cy+12);ctx.moveTo(cx,cy-3);ctx.lineTo(cx-13,cy+12);ctx.stroke();
    ctx.strokeRect(cx-13.5,cy-3.5,14,16);
    label(ctx,'✿',cx-6.5,cy+5,10,'#bc975d');
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
// 主角使用以撒本体精灵图：头身两层按游戏自身的锚点叠加
// （身体 pivot(16,25)@+2、头部 pivot(16,28)@-5），四个朝向共用
// 上下身帧与侧面帧，右向走镜像翻转，冲刺拖尾与无敌闪烁保留。
let heroPhase=0,heroLast={x:0,y:0};
function drawHero(ctx,run,images) {
  const h=run.hero,sprite=images.isaac;
  const dirX=h.x-heroLast.x,dirY=h.y-heroLast.y,moved=Math.hypot(dirX,dirY);
  const useMove=moved>.35;
  heroLast={x:h.x,y:h.y};
  const dashing=h.dashTime>0;
  if(dashing)for(let i=1;i<4;i++)ellipse(ctx,h.x-h.dashX*i*11,h.y+8-h.dashY*i*11,11-i*2.5,8-i*2,'#ffffff55');
  ellipse(ctx,h.x,h.y+17,15,5,'#5a73552b');
  const faceX=useMove?dirX:(h.facingX||0),faceY=useMove?dirY:(h.facingY||0);
  const side=Math.abs(faceX)>Math.abs(faceY),mirror=side&&faceX<0;
  const blink=(run.time%3.7)<.12;
  const frame=useMove?Math.floor(run.time*12)%10:0;
  ctx.save();
  ctx.imageSmoothingEnabled=false;
  if(h.invuln>0 && Math.floor(run.time*15)%2)ctx.globalAlpha=.48;
  ctx.translate(h.x,h.y+15.5);
  if(mirror)ctx.scale(-1,1);
  if(sprite){
    const s=1.5;
    const headX=(side?64:faceY<0?128:0)+(blink?32:0);
    const bodyX=frame<8?frame*32:side?(frame-8)*32:192+(frame-8)*32;
    const bodyY=side?(frame<8?64:96):(frame<8?32:0);
    ctx.drawImage(sprite,bodyX,bodyY,32,32,-16*s,2-25*s,32*s,32*s);
    ctx.drawImage(sprite,headX,0,32,32,-16*s,-5-28*s,32*s,32*s);
  }else{
    // 备用简笔形象：贴图加载失败时保证可玩
    ellipse(ctx,0,-11,12,15,'#7cab84');
    ellipse(ctx,0,-27,13.5,13,'#f6d9b0');
    ellipse(ctx,-5.5,-28,2,2.2,'#3f3a33');ellipse(ctx,5.5,-28,2,2.2,'#3f3a33');
  }
  ctx.restore();
  if(h.dashCd<=0 && !run.scene.enemies.length){ctx.strokeStyle='#b6cc9180';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(h.x,h.y+17,21,7,0,0,Math.PI*2);ctx.stroke();}
}
// 补给站：小个子商人在地毯后招呼，四个货架直接画进画面，
// 商品、价格与售罄状态实时取自 shopItems，走近按 E 即可购买。
function drawMerchant(ctx,run) {
  const items=shopItems(run);
  ellipse(ctx,360,118,96,15,'#b7c79a66');
  ctx.fillStyle='#9bb382';round(ctx,338,74,44,40,13);ctx.fill();
  ellipse(ctx,360,76,18,16.5,'#efd5a5');
  ellipse(ctx,360,63,24,7.5,'#d5b777');
  ellipse(ctx,360,68.5,24.5,2.5,'#c97b62');
  ellipse(ctx,353,76,1.8,1.8,'#7b7158');ellipse(ctx,367,76,1.8,1.8,'#7b7158');
  ctx.strokeStyle='#bb9776';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(360,80,4.5,0,Math.PI);ctx.stroke();
  ellipse(ctx,348,81,2.2,1.5,'#f2b5a0c9');ellipse(ctx,372,81,2.2,1.5,'#f2b5a0c9');
  label(ctx,'欢迎歇脚 ✿',360,128,13,'#6e855f');
  SHOP_STALLS.forEach((s,i)=>{
    const item=items[i];if(!item)return;
    const sold=item.bought>=item.max;
    const lift=Math.sin(run.time*2.1+i*.8)*2.5;
    ellipse(ctx,s.x,s.y+40,30,7,'#75865c22');
    ctx.fillStyle='#a9875a';ctx.fillRect(s.x-29,s.y+20,7,18);ctx.fillRect(s.x+22,s.y+20,7,18);
    ctx.fillStyle='#d9b578';round(ctx,s.x-36,s.y+10,72,12,5);ctx.fill();
    ctx.fillStyle='#eccd8f';round(ctx,s.x-36,s.y+10,72,5,3);ctx.fill();
    ellipse(ctx,s.x,s.y-16+lift,16,16,sold?'#dcdcc6':'#fbf5dd');
    ctx.strokeStyle=sold?'#b8b6a0':'#cfb877';ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(s.x,s.y-16+lift,16,0,Math.PI*2);ctx.stroke();
    label(ctx,item.icon,s.x,s.y-16+lift,21,sold?'#aaa893':'#6c845c');
    label(ctx,item.name,s.x,s.y-36,10.5,sold?'#a5a08a':'#68795c');
    label(ctx,sold?'售罄':`◉ ${item.cost}`,s.x,s.y+6,11,sold?'#a5a08a':'#c79c3e');
    if(sold){ctx.strokeStyle='#c27955';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.x-10,s.y-26+lift);ctx.lineTo(s.x+10,s.y-6+lift);ctx.stroke();}
  });
  label(ctx,'走近货架按 E 购买 · 靠右花门返回前庭',360,300,12,'#6e855f');
  label(ctx,'买到的强化会一直保留',360,318,10,'#879373');
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
  if(room.kind===2)drawMerchant(ctx,run);
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
