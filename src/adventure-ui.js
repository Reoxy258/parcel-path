import {createRun, readRun, saveRun, update, takeEvents, shopItems, buy, chooseRelic, revive, roomCleared} from './adventure.js?v=5';
import {WORLD, ZONES, RELICS, ENEMY_TYPES, choicesFor, doorKey, WIDTH, HEIGHT} from './world.js?v=5';
import {loadArt, render} from './scene.js?v=5';

const $ = id => document.getElementById(id);
let storage;
try { storage = localStorage; } catch { storage = null; }
const restored = storage && readRun(storage);
const newSeed = () => {
  try { const buf=new Uint32Array(1); crypto.getRandomValues(buf); return buf[0]>>>0; }
  catch { return Math.floor(Math.random()*4294967296)>>>0; }
};
let run = restored || createRun(newSeed()), started = false, images = {}, aim = null;
let lastFrame = 0, lastHud = 0, shopSignature = '', mapSignature = '', rewardFloor = null;
let toastTimer, storageWarning = false, soundOn = false, audio, lastShotSound = 0;
const held = new Map(), touchHeld = new Set();
let pulses = {};
const canvas = $('game'), ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dialogs = ['help-dialog','reward-dialog','restart-dialog'].map($);
const modalOpen = () => dialogs.some(d => d.open);

function checkpoint() {
  if (!storage || !saveRun(storage,run)) {
    if (!storageWarning) { toast('浏览器暂时不能保存进度，本次仍可继续游玩。'); storageWarning = true; }
  }
}
function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('toast').classList.remove('visible'),3600);
}
function clearInput() { held.clear(); touchHeld.clear(); pulses = {}; aim = null; }
function focusGame() { canvas.focus({preventScroll:true}); }
function tone(type) {
  if (!soundOn) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime;
    if (type === 'shoot' && now-lastShotSound < .17) return;
    if (type === 'shoot') lastShotSound = now;
    const frequencies = {shoot:470,pickup:880,hit:130,clear:660,relic:784,unlock:520,dash:320,buy:720,win:1046,defeat:260};
    if (!frequencies[type]) return;
    const oscillator=audio.createOscillator(), gain=audio.createGain();
    oscillator.type = type==='hit'?'triangle':'sine';
    oscillator.frequency.setValueAtTime(frequencies[type],now);
    oscillator.frequency.exponentialRampToValueAtTime(frequencies[type]*1.4,now+.09);
    gain.gain.setValueAtTime(type==='shoot'?.012:.035,now); gain.gain.exponentialRampToValueAtTime(.001,now+.12);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now+.13);
  } catch { soundOn=false; $('sound-button').textContent='♪ 声音关'; $('sound-button').setAttribute('aria-pressed','false'); }
}
function processEvents() {
  let save=false;
  for (const event of takeEvents(run)) {
    if (event.type==='checkpoint' || event.type==='win') save=true;
    if (event.text) {
      $('room-status').textContent=event.text;
      if (['note','unlock','heal','buy','relic','clear','floor','win'].includes(event.type)) toast(event.text);
    }
    tone(event.type);
  }
  if (save && started) checkpoint();
}
function resize() {
  const ratio=Math.min(2,window.devicePixelRatio||1);
  canvas.width=WIDTH*ratio; canvas.height=HEIGHT*ratio; ctx.setTransform(ratio,0,0,ratio,0,0);
}
window.addEventListener('resize',resize); resize();

function goal() {
  const room=WORLD[run.room];
  if (!roomCleared(run)) return room.kind===4?'击败守卫，选择强化，再从花环前进。':'边走边躲，清空房间后花门会打开。';
  if (room.kind===1) return run.scene.pickups.some(p=>p.type==='yellow'||p.type==='blue')?'捡走黄、蓝钥匙，再从下方返回前庭。':'返回前庭：黄钥匙挑战守卫，蓝钥匙探索宝库。';
  if (room.kind===2) return '走近货架按 E 购买强化，向右返回前庭。';
  if (room.kind===3) return '捡走晶石和药水，向左返回前庭。';
  if (room.kind===4) return '到下方发光花环，按 E '+(room.floor===5?'抵达终点。':'进入下一层。');
  if (!run.records[room.floor*5+1].cleared) return '去上方守钥花坛，取得黄、蓝两种钥匙。';
  return '西侧补给、东侧宝库都能强化；用黄钥匙开启南侧守卫门。';
}
function mapHud() {
  const base=WORLD[run.room].floor*5;
  const signature=JSON.stringify([run.room,run.records.slice(base,base+5),run.opened]);
  if (mapSignature===signature) return; mapSignature=signature;
  const positions=[[2,2],[2,1],[1,2],[3,2],[2,3]], icons=['✳','⚿','♧','✧','☀'];
  $('room-map').replaceChildren(...positions.map(([col,row],kind)=>{
    const id=base+kind, record=run.records[id], cell=document.createElement('div');
    cell.className='map-room'+(id===run.room?' current':'')+(record.cleared?' cleared':'')+(record.visited?' visited':'');
    if ((kind===3||kind===4)&&!run.opened.includes(doorKey(base,id))) cell.classList.add('locked',kind===3?'blue':'yellow');
    cell.style.gridColumn=col; cell.style.gridRow=row;
    const symbol=document.createElement('span'), name=document.createElement('small');
    symbol.textContent=icons[kind]; name.textContent=['前庭','钥匙','补给','宝库','守卫'][kind];
    cell.append(symbol,name); cell.title=WORLD[id].name+(record.cleared?' · 已清空':record.visited?' · 已探索':' · 未探索'); return cell;
  }));
  $('room-map').setAttribute('aria-label',`第 ${WORLD[run.room].floor+1} 层：当前在${WORLD[run.room].name}。上方钥匙，左侧补给，右侧宝库，下方守卫。`);
}
function shopHud() {
  const visible=WORLD[run.room].kind===2 && started; $('shop-panel').hidden=!visible;
  if (!visible) {shopSignature='';return;}
  const signature=JSON.stringify([run.room,run.hero.coins,run.purchases,run.status]);
  if(signature===shopSignature)return;shopSignature=signature;
  $('shop-items').replaceChildren(...shopItems(run).map(item=>{
    const button=document.createElement('button');button.className='shop-item';button.dataset.buy=item.id;
    button.disabled=item.bought>=item.max || run.hero.coins<item.cost || run.status!=='playing';
    const icon=document.createElement('span');icon.className='shop-item-icon';icon.textContent=item.icon;
    const name=document.createElement('strong');name.textContent=item.name;
    const detail=document.createElement('small');detail.textContent=item.detail;
    const cost=document.createElement('b');cost.textContent=item.bought>=item.max?'本层售罄':`◉ ${item.cost} · 余 ${item.max-item.bought}`;
    button.append(icon,name,detail,cost);return button;
  }));
}
function rewardHud() {
  if (!started || run.status!=='reward') return;
  if (rewardFloor!==run.pendingReward) {
    rewardFloor=run.pendingReward;
    $('reward-choices').replaceChildren(...choicesFor(rewardFloor).map(id=>{
      const relic=RELICS[id],button=document.createElement('button');button.className='reward-choice';button.dataset.relic=id;
      const icon=document.createElement('span');icon.className='relic-icon';icon.textContent=relic.icon;icon.style.color=relic.color;
      const name=document.createElement('strong');name.textContent=relic.name;
      const description=document.createElement('p');description.textContent=relic.description;
      const select=document.createElement('small');select.textContent='带上它 →';button.append(icon,name,description,select);return button;
    }));
  }
  if (!modalOpen()) {clearInput();$('reward-dialog').showModal();}
}
function syncHud() {
  const room=WORLD[run.room], h=run.hero, zone=ZONES[room.floor];
  $('floor-count').textContent=`0${room.floor+1} / 06`; $('zone-name').textContent=zone.name; $('zone-note').textContent=zone.title;
  $('objective-text').textContent=goal(); $('room-number').textContent=`ROOM ${String(run.room+1).padStart(2,'0')} / 30`;
  $('room-name').textContent=room.name; $('coin-count').textContent=h.coins; $('yellow-count').textContent=h.yellow; $('blue-count').textContent=h.blue;
  $('health-value').textContent=`${Math.ceil(h.hp)} / ${h.maxHp}`; $('health-fill').style.width=`${h.hp/h.maxHp*100}%`;
  $('health-fill').classList.toggle('low',h.hp<h.maxHp*.3); $('enemy-count').textContent=run.scene.enemies.length?`${run.scene.enemies.length} 位小怪`:'房间已清空';
  $('attack-value').textContent=h.attack; $('armor-value').textContent=h.armor;
  const cleared=run.records.filter(r=>r.cleared).length; $('clear-count').textContent=cleared; $('progress-fill').style.width=`${cleared/30*100}%`;
  const relicSignature=JSON.stringify(run.relics);
  if ($('relic-list').dataset.signature!==relicSignature) {
    $('relic-list').dataset.signature=relicSignature;
    const items=Object.entries(run.relics).filter(([,n])=>n).map(([id,n])=>{const span=document.createElement('span');span.className='relic-chip';span.textContent=`${RELICS[id].icon} ${RELICS[id].name}${n>1?' ×'+n:''}`;span.title=RELICS[id].description;return span;});
    if(items.length)$('relic-list').replaceChildren(...items);
    else {const p=document.createElement('p');p.textContent='每击败一层守卫，可选择一份随行强化。';$('relic-list').replaceChildren(p);}
  }
  $('potion-count').textContent=h.potions; $('potion-button').disabled=!started||run.status!=='playing'||h.potions<1||h.hp>=h.maxHp;
  $('dash-label').textContent=h.dashCd>0?`冷却 ${h.dashCd.toFixed(1)}s`:'SPACE · 就绪';
  $('dash-button').disabled=!started||run.status!=='playing'||h.dashCd>0;
  $('interact-button').disabled=!started||run.status!=='playing';
  const boss=run.scene.enemies.find(e=>e.type==='guardian'); $('boss-bar').hidden=!boss;
  if(boss){$('boss-name').textContent=`${zone.name} · 守卫`; $('boss-health').style.width=`${boss.hp/boss.maxHp*100}%`;}
  $('stage-hint').textContent=roomCleared(run)?room.kind===4?'走到花环旁，按 E 前进':'拾取收获 · 靠近花门按 E': '自动瞄准射击 · 保持移动，留意金色蓄力圈';
  $('stage-hint').hidden=!started||run.status!=='playing';
  $('pause-panel').hidden=!started||run.status!=='paused'||modalOpen(); $('death-panel').hidden=!started||run.status!=='dead'; $('win-panel').hidden=!started||run.status!=='won';
  $('pause-button').textContent=run.status==='paused'?'▶ 继续':'Ⅱ 暂停'; $('pause-button').disabled=!started||!['playing','paused'].includes(run.status)||modalOpen();
  if(run.status==='won')$('win-summary').textContent=`走过六层花园，清空 ${cleared} / 30 间房，击败 ${run.kills} 位小怪。旅途用时 ${Math.floor(run.time/60)} 分 ${Math.floor(run.time%60)} 秒。旅程印记 #${run.seed}。`;
  $('threat-title').textContent=room.kind===2?'花一点金币，让下一程轻松些。':room.kind===4?'等蓄力亮起，再从弹道空隙穿过。':'先看一眼，再往前。';
  const types=[...new Set(room.enemies.map(e=>e.type))];
  $('threat-detail').textContent=room.kind===2?'攻击提升清房速度，护甲抵挡伤害；晴露可以留到战斗中使用。':types.map(type=>ENEMY_TYPES[type].description).join('；')+'。';
  $('enemy-preview').textContent=`➶ ${h.attack} · ◈ ${h.armor}`;
  mapHud();shopHud();rewardHud();
}

function start() {
  started=true; $('start-panel').hidden=true; checkpoint(); processEvents();syncHud();focusGame();
}
if(restored){$('start-title').textContent='你的晴天，还在口袋里。';$('start-note').textContent=`继续第 ${WORLD[run.room].floor+1} 层 · ${WORLD[run.room].name}。房间、钥匙和强化已保存。`;$('start-button').textContent='继续这段旅程 →';}
$('start-button').addEventListener('click',start);
function togglePause() {
  if(!started||modalOpen()||!['playing','paused'].includes(run.status))return;
  run.status=run.status==='paused'?'playing':'paused';clearInput();syncHud();if(run.status==='playing')focusGame();
}
$('pause-button').addEventListener('click',togglePause);$('resume-button').addEventListener('click',togglePause);
$('revive-button').addEventListener('click',()=>{revive(run);processEvents();syncHud();focusGame();});
function showDialog(id) {
  if(modalOpen())return;
  const dialog=$(id);dialog.dataset.resume=String(started&&run.status==='playing');
  if(dialog.dataset.resume==='true')run.status='paused';clearInput();dialog.showModal();syncHud();
}
for(const id of ['help-dialog','restart-dialog']) $(id).addEventListener('close',()=>{
  if($(id).dataset.resume==='true'&&run.status==='paused')run.status='playing';clearInput();syncHud();if(started)focusGame();
});
$('help-button').addEventListener('click',()=>showDialog('help-dialog'));
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
for(const id of ['new-run-button','win-new-button'])$(id).addEventListener('click',()=>showDialog('restart-dialog'));
$('confirm-restart').addEventListener('click',()=>{
  run=createRun(newSeed());rewardFloor=null;mapSignature='';shopSignature='';$('restart-dialog').dataset.resume='false';$('restart-dialog').close();clearInput();start();
});
$('reward-dialog').addEventListener('cancel',event=>event.preventDefault());
$('reward-choices').addEventListener('click',event=>{const button=event.target.closest('[data-relic]');if(button&&chooseRelic(run,button.dataset.relic)){$('reward-dialog').close();processEvents();syncHud();focusGame();}});
$('shop-items').addEventListener('click',event=>{const button=event.target.closest('[data-buy]');if(button&&buy(run,button.dataset.buy)){processEvents();syncHud();}});
$('sound-button').addEventListener('click',()=>{soundOn=!soundOn;$('sound-button').textContent=soundOn?'♪ 声音开':'♪ 声音关';$('sound-button').setAttribute('aria-pressed',String(soundOn));if(soundOn)tone('pickup');});
for(const [id,key] of [['dash-button','dash'],['interact-button','interact'],['potion-button','potion']])$(id).addEventListener('click',()=>{if(started&&!modalOpen()&&run.status==='playing')pulses[key]=true;focusGame();});

const moves={KeyW:'up',ArrowUp:'up',KeyS:'down',ArrowDown:'down',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
const actions={Space:'dash',KeyE:'interact',KeyQ:'potion'};
document.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select')||event.ctrlKey||event.metaKey||event.altKey)return;
  if(modalOpen())return;
  if(event.code==='KeyP'||event.code==='Escape'){event.preventDefault();if(!event.repeat)togglePause();return;}
  if(!started||run.status!=='playing')return;
  if(moves[event.code]||actions[event.code]){
    event.preventDefault();
    if(moves[event.code])held.set(event.code,Infinity);
    if(actions[event.code]&&!event.repeat)pulses[actions[event.code]]=true;
  }
});
document.addEventListener('keyup',event=>{if(held.has(event.code))held.set(event.code,performance.now()+45);});
for(const button of document.querySelectorAll('[data-move]')) {
  button.addEventListener('pointerdown',event=>{if(!started||modalOpen()||run.status!=='playing')return;event.preventDefault();button.setPointerCapture(event.pointerId);touchHeld.add(button.dataset.move);button.classList.add('pressed');});
  const release=()=>{touchHeld.delete(button.dataset.move);button.classList.remove('pressed');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
function pointerAim(event) {const rect=canvas.getBoundingClientRect();aim={x:(event.clientX-rect.left)*WIDTH/rect.width,y:(event.clientY-rect.top)*HEIGHT/rect.height};}
canvas.addEventListener('pointerdown',event=>{if(!started||modalOpen()||run.status!=='playing')return;event.preventDefault();focusGame();canvas.setPointerCapture(event.pointerId);pointerAim(event);});
canvas.addEventListener('pointermove',event=>{if(aim)pointerAim(event);});
canvas.addEventListener('pointerup',()=>{aim=null;});canvas.addEventListener('pointercancel',()=>{aim=null;});
function backgroundPause() {clearInput();if(started&&run.status==='playing'){run.status='paused';checkpoint();syncHud();}}
window.addEventListener('blur',backgroundPause);document.addEventListener('visibilitychange',()=>{if(document.hidden)backgroundPause();});
window.addEventListener('pagehide',()=>{if(started)checkpoint();});
function frame(now) {
  const dt=lastFrame?Math.min(.05,(now-lastFrame)/1000):1/60;lastFrame=now;
  const directions=new Set(touchHeld);
  for(const [key,until] of held){if(until<now)held.delete(key);else directions.add(moves[key]);}
  if(started&&!modalOpen()) {
    update(run,{x:Number(directions.has('right'))-Number(directions.has('left')),y:Number(directions.has('down'))-Number(directions.has('up')),aim,...pulses},dt);
    processEvents();
  }
  pulses={};render(ctx,run,images,{aim,reducedMotion});
  if(now-lastHud>90){syncHud();lastHud=now;}requestAnimationFrame(frame);
}
loadArt().then(loaded=>{images=loaded;if(Object.keys(images).length<4)toast('部分图片未加载，已用备用图形继续显示。');});
syncHud();requestAnimationFrame(frame);
