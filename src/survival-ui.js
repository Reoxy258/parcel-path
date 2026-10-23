// 晴空幸存者 · UI 接线：输入、HUD、升级三选一、死亡/胜利结算、音效。
// 结构从冒险模式 adventure-ui.js 改编：同样的帧循环、对话框与触屏模式。
import { createSurvivalRun, update, chooseUpgrade, takeEvents, UPGRADES, RUN_SECONDS } from './survival.js?v=1';
import { renderArena, zoneIndexFor } from './survival-scene.js?v=1';
import { loadArt } from './scene.js?v=7';
import { WIDTH, HEIGHT, ZONES, ENEMY_TYPES } from './world.js?v=5';

const $ = id => document.getElementById(id);
let storage;
try { storage = localStorage; } catch { storage = null; }
const BEST_KEY = 'sunlit-survival-best-v1';
const newSeed = () => {
  try { const buf = new Uint32Array(1); crypto.getRandomValues(buf); return buf[0] >>> 0; }
  catch { return Math.floor(Math.random() * 4294967296) >>> 0; }
};
function readBest() {
  try {
    const data = JSON.parse(storage?.getItem(BEST_KEY));
    if (!data || typeof data !== 'object') return null;
    return {
      runs: Number.isFinite(data.runs) ? data.runs : 0,
      wins: Number.isFinite(data.wins) ? data.wins : 0,
      bestTime: Number.isFinite(data.bestTime) ? data.bestTime : 0,
      bestLevel: Number.isFinite(data.bestLevel) ? data.bestLevel : 0,
      bestKills: Number.isFinite(data.bestKills) ? data.bestKills : 0,
    };
  } catch { return null; }
}
function recordRun(run) {
  if (!storage) return;
  const best = readBest() || { runs: 0, wins: 0, bestTime: 0, bestLevel: 0, bestKills: 0 };
  best.runs++;
  if (run.status === 'won') best.wins++;
  best.bestTime = Math.max(best.bestTime, Math.floor(run.time));
  best.bestLevel = Math.max(best.bestLevel, run.level);
  best.bestKills = Math.max(best.bestKills, run.stats.kills);
  try { storage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* 纪录存不下就算了 */ }
}

let run = createSurvivalRun(newSeed()), started = false, images = {};
let lastFrame = 0, lastHud = 0, upgradeSignature = '', choicesSignature = '';
let toastTimer, soundOn = false, audio, lastShotSound = 0, recorded = false;
const held = new Map(), touchHeld = new Set();
let pulses = {};
const canvas = $('game'), ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const dialogs = ['help-dialog', 'reward-dialog', 'restart-dialog'].map($);
const modalOpen = () => dialogs.some(d => d.open);

function toast(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3600);
}
function clearInput() { held.clear(); touchHeld.clear(); pulses = {}; }
function focusGame() { canvas.focus({ preventScroll: true }); }
function tone(type) {
  if (!soundOn) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const now = audio.currentTime;
    if (type === 'shoot' && now - lastShotSound < .17) return;
    if (type === 'shoot') lastShotSound = now;
    const frequencies = { shoot: 470, pickup: 880, hit: 130, dash: 320, defeat: 260, impact: 520, levelup: 784, relic: 784, boss: 392, bossdown: 660, win: 1046, death: 180, note: 640 };
    if (!frequencies[type]) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = type === 'hit' || type === 'death' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequencies[type], now);
    oscillator.frequency.exponentialRampToValueAtTime(frequencies[type] * 1.4, now + .09);
    gain.gain.setValueAtTime(type === 'shoot' ? .012 : .035, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .12);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now + .13);
  } catch { soundOn = false; $('sound-button').textContent = '♪ 声音关'; $('sound-button').setAttribute('aria-pressed', 'false'); }
}
function processEvents() {
  for (const event of takeEvents(run)) {
    if (event.text) {
      $('room-status').textContent = event.text;
      if (['note', 'levelup', 'relic', 'boss', 'bossdown', 'win', 'death'].includes(event.type)) toast(event.text);
    }
    tone(event.type);
  }
}
function resize() {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = WIDTH * ratio; canvas.height = HEIGHT * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener('resize', resize); resize();

const pad = n => String(n).padStart(2, '0');
const formatTime = t => `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}`;

function bestLine() {
  const best = readBest();
  if (!best || !best.runs) return '—';
  return best.wins ? `守住 ${best.wins} 次 · Lv.${best.bestLevel} · 击败 ${best.bestKills}` : `最久 ${formatTime(best.bestTime)} · Lv.${best.bestLevel} · 击败 ${best.bestKills}`;
}

function levelupHud() {
  if (!started || run.status !== 'levelup') { choicesSignature = ''; return; }
  const signature = JSON.stringify(run.choices);
  if (choicesSignature !== signature) {
    choicesSignature = signature;
    $('reward-choices').replaceChildren(...run.choices.map(id => {
      const up = UPGRADES[id], button = document.createElement('button');
      button.className = 'reward-choice'; button.dataset.upgrade = id;
      const icon = document.createElement('span'); icon.className = 'relic-icon'; icon.textContent = up.icon; icon.style.color = up.color;
      const name = document.createElement('strong'); name.textContent = up.name;
      const description = document.createElement('p'); description.textContent = up.detail;
      const meta = document.createElement('small');
      meta.textContent = id === 'feast' || !(id in run.upgrades) ? '新能力' : `Lv.${run.upgrades[id]} → ${run.upgrades[id] + 1}`;
      button.append(icon, name, description, meta); return button;
    }));
  }
  if (!modalOpen()) { clearInput(); $('reward-dialog').showModal(); }
}

function syncHud() {
  const h = run.hero, zone = ZONES[zoneIndexFor(run.time)];
  $('timer-value').textContent = formatTime(Math.max(0, RUN_SECONDS - run.time));
  $('zone-name').textContent = zone.name; $('zone-note').textContent = zone.title;
  $('room-number').textContent = `SURVIVE ${formatTime(RUN_SECONDS)}`;
  $('room-name').textContent = `${zone.name} · 怪潮`;
  $('level-value').textContent = run.level;
  $('xp-fill').style.width = `${Math.min(100, run.xp / run.xpNext * 100)}%`;
  $('kill-count').textContent = run.stats.kills; $('kill-badge').textContent = run.stats.kills;
  $('level-badge').textContent = run.level; $('gem-badge').textContent = run.stats.gems;
  $('health-value').textContent = `${Math.ceil(h.hp)} / ${h.maxHp}`;
  $('health-fill').style.width = `${h.hp / h.maxHp * 100}%`;
  $('health-fill').classList.toggle('low', h.hp < h.maxHp * .3);
  $('enemy-count').textContent = run.scene.enemies.length ? `${run.scene.enemies.length} 位小怪` : '风平浪静';
  $('attack-value').textContent = h.attack; $('armor-value').textContent = h.armor;
  $('best-line').textContent = bestLine();
  const signature = JSON.stringify(run.upgrades);
  if ($('upgrade-list').dataset.signature !== signature) {
    $('upgrade-list').dataset.signature = signature;
    const items = Object.entries(run.upgrades).filter(([, n]) => n).map(([id, n]) => {
      const span = document.createElement('span'); span.className = 'relic-chip';
      span.innerHTML = `<i style="color:${UPGRADES[id].color}">${UPGRADES[id].icon}</i> ${UPGRADES[id].name}<small>Lv.${n}</small>`;
      span.title = UPGRADES[id].detail; return span;
    });
    if (items.length) $('upgrade-list').replaceChildren(...items);
    else { const p = document.createElement('p'); p.textContent = '每次升级三选一，强化陪到这一局结束。'; $('upgrade-list').replaceChildren(p); }
  }
  $('dash-label').textContent = h.dashCd > 0 ? `冷却 ${h.dashCd.toFixed(1)}s` : 'SPACE · 就绪';
  $('dash-button').disabled = !started || run.status !== 'playing' || h.dashCd > 0;
  const boss = run.scene.enemies.find(e => e.boss);
  $('boss-bar').hidden = !boss;
  if (boss) { $('boss-name').textContent = `花园守卫 · ${formatTime(run.time)}`; $('boss-health').style.width = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`; }
  $('stage-hint').textContent = run.scene.pickups.length > 8 ? '晶石散落一地 · 走过去吸收' : '飞信自动瞄准 · 捡起晶石升级';
  $('stage-hint').hidden = !started || run.status !== 'playing';
  $('pause-panel').hidden = !started || run.status !== 'paused' || modalOpen();
  $('death-panel').hidden = !started || run.status !== 'dead';
  $('win-panel').hidden = !started || run.status !== 'won';
  if (run.status === 'dead') {
    $('death-summary').textContent = `坚持到 ${formatTime(run.time)} · 等级 ${run.level} · 击败 ${run.stats.kills} · 吸收晶石 ${run.stats.gems} · 承伤 ${Math.round(run.stats.damageTaken)}。印记 #${run.seed}。`;
  }
  if (run.status === 'won') {
    $('win-summary').textContent = `守住 10 分钟 · 等级 ${run.level} · 击败 ${run.stats.kills} · 守卫 ${run.stats.bosses} 位 · 承伤 ${Math.round(run.stats.damageTaken)}。印记 #${run.seed}。`;
  }
  $('pause-button').textContent = run.status === 'paused' ? '▶ 继续' : 'Ⅱ 暂停';
  $('pause-button').disabled = !started || !['playing', 'paused', 'levelup'].includes(run.status) || modalOpen();
  const types = [...new Set(run.scene.enemies.map(e => e.type))];
  $('threat-title').textContent = boss ? '守卫在场：躲开弹环，输出别停。' : types.length > 2 ? '怪潮成型：绕圈走，别站桩。' : '先看一眼，再往前。';
  $('threat-detail').textContent = types.map(t => ENEMY_TYPES[t].description).join('；') || '花丛安静，风暴将至。';
  $('enemy-preview').textContent = `➶ ${h.attack} · ◈ ${h.armor}${run.upgrades.orbit ? ` · ✿ ${1 + run.upgrades.orbit}` : ''}${run.upgrades.aura ? ` · ✜ ${run.upgrades.aura}` : ''}`;
  levelupHud();
}

function start() {
  started = true; $('start-panel').hidden = true; processEvents(); syncHud(); focusGame();
}
$('start-button').addEventListener('click', start);
function restart() {
  if (started && !recorded) recordRun(run);
  recorded = false;
  run = createSurvivalRun(newSeed());
  choicesSignature = ''; upgradeSignature = '';
  clearInput(); start();
}
function togglePause() {
  if (!started || modalOpen() || !['playing', 'paused'].includes(run.status)) return;
  run.status = run.status === 'paused' ? 'playing' : 'paused';
  clearInput(); syncHud(); if (run.status === 'playing') focusGame();
}
$('pause-button').addEventListener('click', togglePause);
$('resume-button').addEventListener('click', togglePause);
$('death-restart').addEventListener('click', restart);
for (const id of ['new-run-button', 'win-new-button']) $(id).addEventListener('click', () => showDialog('restart-dialog'));
function showDialog(id) {
  if (modalOpen()) return;
  const dialog = $(id);
  dialog.dataset.resume = String(started && run.status === 'playing');
  if (dialog.dataset.resume === 'true') run.status = 'paused';
  clearInput(); dialog.showModal(); syncHud();
}
for (const id of ['help-dialog', 'restart-dialog']) $(id).addEventListener('close', () => {
  if ($(id).dataset.resume === 'true' && run.status === 'paused') run.status = 'playing';
  clearInput(); syncHud(); if (started) focusGame();
});
$('help-button').addEventListener('click', () => showDialog('help-dialog'));
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
$('confirm-restart').addEventListener('click', () => {
  $('restart-dialog').dataset.resume = 'false'; $('restart-dialog').close(); restart();
});
$('reward-dialog').addEventListener('cancel', event => event.preventDefault());
$('reward-choices').addEventListener('click', event => {
  const button = event.target.closest('[data-upgrade]');
  if (button && chooseUpgrade(run, button.dataset.upgrade)) {
    $('reward-dialog').close(); processEvents(); syncHud(); focusGame();
  }
});
$('sound-button').addEventListener('click', () => {
  soundOn = !soundOn;
  $('sound-button').textContent = soundOn ? '♪ 声音开' : '♪ 声音关';
  $('sound-button').setAttribute('aria-pressed', String(soundOn));
  if (soundOn) tone('pickup');
});
$('dash-button').addEventListener('click', () => { if (started && !modalOpen() && run.status === 'playing') pulses.dash = true; focusGame(); });

const moves = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
document.addEventListener('keydown', event => {
  if (event.target.matches('input,textarea,select') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (modalOpen()) return;
  if (event.code === 'KeyP' || event.code === 'Escape') { event.preventDefault(); if (!event.repeat) togglePause(); return; }
  if (!started || run.status !== 'playing') return;
  if (moves[event.code]) { event.preventDefault(); held.set(event.code, Infinity); }
  else if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) pulses.dash = true; }
});
document.addEventListener('keyup', event => { if (held.has(event.code)) held.set(event.code, performance.now() + 45); });
for (const button of document.querySelectorAll('[data-move]')) {
  button.addEventListener('pointerdown', event => {
    if (!started || modalOpen() || run.status !== 'playing') return;
    event.preventDefault(); button.setPointerCapture(event.pointerId);
    touchHeld.add(button.dataset.move); button.classList.add('pressed');
  });
  const release = () => { touchHeld.delete(button.dataset.move); button.classList.remove('pressed'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
canvas.addEventListener('pointerdown', event => { if (!started || modalOpen() || run.status !== 'playing') return; event.preventDefault(); focusGame(); });
function backgroundPause() {
  clearInput();
  if (started && run.status === 'playing') { run.status = 'paused'; syncHud(); }
}
window.addEventListener('blur', backgroundPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) backgroundPause(); });

function settle() {
  if (recorded || (run.status !== 'dead' && run.status !== 'won')) return;
  recorded = true; recordRun(run);
}
function frame(now) {
  const dt = lastFrame ? Math.min(.05, (now - lastFrame) / 1000) : 1 / 60;
  lastFrame = now;
  const directions = new Set(touchHeld);
  for (const [key, until] of held) { if (until < now) held.delete(key); else directions.add(moves[key]); }
  if (started && !modalOpen() && run.status === 'playing') {
    update(run, {
      x: Number(directions.has('right')) - Number(directions.has('left')),
      y: Number(directions.has('down')) - Number(directions.has('up')),
      ...pulses,
    }, dt);
    processEvents();
  }
  pulses = {};
  settle();
  renderArena(ctx, run, images, { reducedMotion });
  if (now - lastHud > 90) { syncHud(); lastHud = now; }
  requestAnimationFrame(frame);
}
loadArt().then(loaded => { images = loaded; if (Object.keys(images).length < 5) toast('部分图片未加载，已用备用图形继续显示。'); });
syncHud(); requestAnimationFrame(frame);
