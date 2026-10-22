import { parseLevel, cloneState, step, solve, isWon, isDelivered, isBlocked, COLOR_NAMES, walkPath, neighbor, starsFor } from './engine.js';
import { LEVEL_DEFINITIONS, CHAPTERS } from './levels.js';
import { readProgress, saveProgress, isLevelUnlocked } from './storage.js';

const $ = (id) => document.getElementById(id);
const board = $('board');
const levels = LEVEL_DEFINITIONS.map(parseLevel);
const ids = levels.map((level) => level.id);
let storage;
try { storage = window.localStorage; } catch { /* Storage is optional. */ }
const progress = readProgress(storage, ids);
let index = Math.max(0, ids.indexOf(progress.selected));
let level, state, history = [], revision = 0;
let worker = null, hintTimer = 0, hintCell = -1, hintBusy = false;
let walkToken = 0, walking = false, victoryTimer = 0, toastTimer = 0;
let audio = null, pointer = null, suppressClickUntil = 0;
const directionNames = { up: '上', right: '右', down: '下', left: '左' };
const icon = (name, classes = 'icon') => `<svg class="${classes}" aria-hidden="true"><use href="#${name}"/></svg>`;
const colorSymbol = (color) => ({ rose: '✿', mint: '❧', plain: '·' })[color];
const canSelect = (i) => isLevelUnlocked(ids, progress.completed, i);
const mechanicLabels = { match: '花叶匹配', portal: '折叠邮门', switch: '日月桥门' };

function persist() {
  if (!saveProgress(storage, progress)) $('save-note').textContent = '当前浏览器限制了存档；进度会在本次游玩中保留。';
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
}

function sound(kind = 'move') {
  if (progress.muted) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ||= new Audio();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const tone = audio.createOscillator(), gain = audio.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(kind === 'win' ? 660 : kind === 'push' ? 392 : 294, audio.currentTime);
    tone.frequency.exponentialRampToValueAtTime(kind === 'win' ? 880 : 220, audio.currentTime + .12);
    gain.gain.setValueAtTime(.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .17);
    tone.connect(gain); gain.connect(audio.destination);
    tone.start(); tone.stop(audio.currentTime + .18);
  } catch { /* Audio failure never interrupts the game. */ }
}

function updateSound() {
  $('sound-label').textContent = progress.muted ? '声音关' : '声音开';
  $('sound-button').setAttribute('aria-pressed', String(!progress.muted));
  $('sound-button').setAttribute('aria-label', progress.muted ? '开启音效' : '关闭音效');
}

function cancelWalk() { walkToken++; walking = false; }
function cancelHint() {
  worker?.terminate(); worker = null;
  clearTimeout(hintTimer);
  hintCell = -1; hintBusy = false;
  board.querySelectorAll('.hint').forEach((tile) => tile.classList.remove('hint'));
  $('hint-button').disabled = isWon(level, state);
  $('hint-label').textContent = '一点提示';
  $('hint-button').removeAttribute('aria-busy');
}

function openDialog(dialog) {
  clearTimeout(victoryTimer); cancelWalk(); cancelHint();
  document.querySelectorAll('dialog[open]').forEach((other) => { if (other !== dialog) other.close(); });
  if (!dialog.open) dialog.showModal();
}

function cellLabel(cell) {
  const labels = [`第 ${Math.floor(cell / level.width) + 1} 行，第 ${cell % level.width + 1} 列`];
  if (level.walls.has(cell)) labels.push('花墙，不能通行');
  else {
    if (state.player === cell) labels.push('小邮差');
    const boxIndex = state.boxes.indexOf(cell);
    if (boxIndex !== -1) labels.push(`${COLOR_NAMES[state.colors[boxIndex]]}包裹${isDelivered(level, state, cell) ? '，已正确送达' : level.goals.has(cell) ? '，邮戳不匹配' : ''}`);
    if (level.goals.has(cell)) labels.push(`${COLOR_NAMES[level.goalColors.get(cell)]}邮戳`);
    else if (!state.boxes.includes(cell) && state.player !== cell) labels.push('小路');
    if (level.portals.has(cell)) labels.push(`${level.portalLabels.get(cell)} 号邮门，入口被占则不能传送`);
    if (level.switches.has(cell)) labels.push('开关，邮差踏入切换日月桥门');
    if (level.gates.has(cell)) labels.push(`${level.gatePhases.get(cell) ? '日' : '月'}桥，${isBlocked(level, state, cell) ? '已关闭，桥上邮差可离开，包裹需重新开桥后再推' : '已开启'}`);
  }
  return labels.join('，');
}

function renderBoard() {
  board.style.gridTemplateColumns = `repeat(${level.width}, minmax(0,1fr))`;
  board.setAttribute('aria-rowcount', level.height);
  board.setAttribute('aria-colcount', level.width);
  board.setAttribute('aria-activedescendant', `cell-${state.player}`);
  const boxes = new Set(state.boxes);
  const rows = [];
  for (let y = 0; y < level.height; y++) {
    let row = '<div role="row" class="grid-row">';
    for (let x = 0; x < level.width; x++) {
      const cell = y * level.width + x, wall = level.walls.has(cell), hasBox = boxes.has(cell), goal = level.goals.has(cell);
      const color = goal ? level.goalColors.get(cell) : 'plain';
      row += `<button type="button" role="gridcell" tabindex="-1" id="cell-${cell}" data-cell="${cell}" class="tile${wall ? ' wall' : ''}${isDelivered(level, state, cell) ? ' delivered' : ''}${level.gates.has(cell) ? ` bridge ${isBlocked(level, state, cell) ? 'bridge-closed' : 'bridge-open'}` : ''}${hintCell === cell ? ' hint' : ''}" aria-label="${cellLabel(cell)}"${wall ? ' disabled' : ''}>`;
      if (goal) row += `<span class="goal-mark color-${color}" aria-hidden="true"><b>${colorSymbol(color)}</b></span>`;
      if (level.portals.has(cell)) row += `<span class="portal-mark portal-${level.portalLabels.get(cell)}" aria-hidden="true"><b>${level.portalLabels.get(cell)}</b></span>`;
      if (level.switches.has(cell)) row += `<span class="switch-mark${state.phase ? ' switched-on' : ''}" aria-hidden="true">⏻</span>`;
      if (level.gates.has(cell)) row += `<span class="gate-mark" aria-hidden="true">${level.gatePhases.get(cell) ? '☀' : '☾'}</span>`;
      if (hasBox) {
        const boxColor = state.colors[state.boxes.indexOf(cell)];
        row += icon('parcel', `sprite parcel parcel-${boxColor}`);
        if (boxColor !== 'plain') row += `<span class="parcel-mark color-${boxColor}" aria-hidden="true">${colorSymbol(boxColor)}</span>`;
      }
      if (state.player === cell) row += icon('courier', 'sprite player');
      row += '</button>';
    }
    rows.push(`${row}</div>`);
  }
  board.innerHTML = rows.join('');
  $('move-count').textContent = state.moves;
  $('push-count').textContent = state.pushes;
  const delivered = state.boxes.filter((cell) => isDelivered(level, state, cell)).length;
  $('delivery-count').textContent = `${delivered} / ${level.goals.size} 已送达`;
  $('undo-button').disabled = history.length === 0;
  $('hint-button').disabled = hintBusy || isWon(level, state);
  $('continue-button').hidden = !isWon(level, state);
  $('continue-button').innerHTML = index === levels.length - 1 ? `重访小径 ${icon('i-arrow')}` : `前往下一站 ${icon('i-arrow')}`;
  $('mechanic-status').textContent = level.gates.size ? `桥路状态：☀ 日桥${state.phase ? '开启' : '关闭'} · ☾ 月桥${state.phase ? '关闭' : '开启'}（踏入 ⏻ 切换）` : level.portals.size ? '同号邮门相连 · 邮差与包裹都能传送 · 出口被占不能进入' : '✿ 花朵寄花朵 · ❧ 叶子寄叶子 · 错色不计送达';
}

function renderRoute() {
  const completed = Object.keys(progress.completed).length;
  $('completed-count').textContent = completed;
  $('progress-fill').style.width = `${completed / levels.length * 100}%`;
  $('route-levels').innerHTML = levels.map((entry, i) => entry.chapter !== level.chapter ? '' : `<button class="route-level${i === index ? ' active' : ''}${progress.completed[entry.id] ? ' done' : ''}" data-level="${i}" aria-label="第 ${i + 1} 站，${entry.name}${!canSelect(i) ? '，未解锁' : ''}"${!canSelect(i) ? ' disabled' : ''}${i === index ? ' aria-current="step"' : ''}>${!canSelect(i) ? icon('i-lock') : String(i + 1).padStart(2, '0')}</button>`).join('');
  $('chapter-nav').innerHTML = CHAPTERS.map((chapter, i) => `<button class="chapter-button${level.chapter === i ? ' active' : ''}" data-level="${i * 5}" aria-label="试玩第 ${i + 1} 区，${chapter.name}"${level.chapter === i ? ' aria-current="true"' : ''}><span>0${i + 1} / ${i < 3 ? '新机关' : '组合邮路'}</span><strong>${chapter.name}</strong><small>${chapter.mechanics.map((m) => mechanicLabels[m]).join(' · ')}</small></button>`).join('');
  $('mechanic-badges').innerHTML = level.mechanics.map((m) => `<span>${mechanicLabels[m]}</span>`).join('');
  const record = progress.completed[level.id];
  $('best-label').textContent = record ? '个人最佳' : '最短步数';
  $('best-count').textContent = record?.moves ?? level.par;
}

function loadLevel(next) {
  if (!canSelect(next)) return;
  clearTimeout(victoryTimer); cancelWalk();
  $('win-dialog').close(); $('levels-dialog').close();
  index = next; level = levels[index]; state = cloneState(level.initial); history = []; revision++;
  cancelHint();
  progress.selected = level.id; persist();
  $('area-name').textContent = level.area;
  $('area-number').textContent = String(level.chapter + 1).padStart(2, '0');
  $('level-name').textContent = level.name;
  $('level-note').textContent = level.note;
  $('difficulty').textContent = level.difficulty;
  $('level-number').textContent = String(index + 1).padStart(2, '0');
  $('board-status').textContent = level.note;
  renderBoard(); renderRoute();
}

function completeLevel() {
  const stars = starsFor(state.moves, level.par), previous = progress.completed[level.id];
  if (!previous || state.moves < previous.moves || (state.moves === previous.moves && state.pushes < previous.pushes)) {
    progress.completed[level.id] = { moves: state.moves, pushes: state.pushes, stars };
  }
  persist(); renderRoute(); renderBoard();
  $('board-status').textContent = '所有心意都已送达，做得很棒。';
  const version = revision;
  clearTimeout(victoryTimer);
  victoryTimer = setTimeout(() => {
    if (version !== revision || !isWon(level, state)) return;
    const allComplete = ids.every((id) => progress.completed[id]);
    $('win-title').textContent = allComplete ? `${levels.length} 站邮路，全部走过。` : index === levels.length - 1 ? '星光邮路，顺利送达。' : '心意，顺利送达。';
    $('win-subtitle').textContent = allComplete ? '谢谢你，让每一份温暖都有了去处。' : `${level.name} · ${level.area}`;
    $('win-stars').innerHTML = '★'.repeat(stars) + `<span class="empty">${'★'.repeat(3 - stars)}</span>`;
    $('win-stars').setAttribute('aria-label', `获得 ${stars} 颗星，共 3 颗`);
    $('win-summary').innerHTML = `<span><strong>${state.moves}</strong>步送达</span><span><strong>${state.pushes}</strong>次推动</span><span>最短 <strong>${level.par}</strong>步</span>`;
    $('next-button').innerHTML = `${index === levels.length - 1 ? '查看我的邮路' : '前往下一站'} ${icon('i-arrow')}`;
    sound('win'); openDialog($('win-dialog'));
  }, 220);
}

function move(direction, fromWalk = false) {
  if (isWon(level, state)) return false;
  if (!fromWalk) cancelWalk();
  const result = step(level, state, direction);
  if (!result.moved) {
    board.classList.remove('bump'); void board.offsetWidth; board.classList.add('bump');
    $('board-status').textContent = '这边走不通，换个方向试试看。';
    return false;
  }
  history.push(cloneState(state)); state = result.state; revision++;
  cancelHint(); sound(result.pushed ? 'push' : 'move');
  $('board-status').textContent = result.switched ? `邮路切换：日桥${state.phase ? '开启' : '关闭'}，月桥${state.phase ? '关闭' : '开启'}。` : result.teleported ? '穿过折叠邮门，抵达另一端。' : result.pushed ? '先认符号，再把心意送到对应邮戳。' : level.note;
  renderBoard();
  if (isWon(level, state)) completeLevel();
  return true;
}

function undo() {
  if (!history.length) return;
  clearTimeout(victoryTimer); cancelWalk();
  $('win-dialog').close();
  state = history.pop(); revision++; cancelHint(); renderBoard();
  $('board-status').textContent = '退回一步，新的想法也许就在这里。';
}

async function walkTo(cell) {
  cancelWalk();
  const adjacent = Object.keys(directionNames).find((direction) => neighbor(level, state.player, direction) === cell);
  if (adjacent) { move(adjacent); return; }
  if (state.boxes.includes(cell)) { toast('先走到包裹旁，再朝它移动，就能推动它。'); return; }
  const path = walkPath(level, state, cell);
  if (!path) { toast('这条小路暂时走不过去，换个位置试试。'); return; }
  const token = ++walkToken;
  walking = true;
  for (const direction of path) {
    if (token !== walkToken || !move(direction, true)) break;
    await new Promise((resolve) => setTimeout(resolve, 65));
  }
  if (token === walkToken) walking = false;
}

function showHint() {
  if (hintBusy || isWon(level, state)) return;
  cancelWalk();
  const version = revision;
  hintBusy = true; $('hint-button').disabled = true;
  $('hint-button').setAttribute('aria-busy', 'true'); $('hint-label').textContent = '想一想…';
  const accept = (answer) => {
    if (version !== revision || !hintBusy) return;
    cancelHint();
    if (answer.status === 'solved' && answer.path.length) {
      const direction = answer.path[0]; hintCell = neighbor(level, state.player, direction);
      renderBoard();
      $('board-status').textContent = `下一步，向${directionNames[direction]}走。`;
      toast(`试着向${directionNames[direction]}走一步，发光的格子在等你。`);
    } else if (answer.status === 'impossible') toast('这个位置已经送不到了。试试撤销最近的推动，或重来这一站。');
    else toast('这一步暂时没有想出来。试着撤销一步，换个方向。');
  };
  const fallback = () => {
    worker?.terminate(); worker = null;
    setTimeout(() => {
      if (version !== revision || !hintBusy) return;
      try { accept(solve(level, state)); } catch { accept({ status: 'error' }); }
    }, 0);
  };
  try {
    if (!window.Worker) { fallback(); return; }
    worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { if (data.id === version) accept(data); };
    worker.onerror = (event) => { event.preventDefault(); fallback(); };
    worker.postMessage({ id: version, definition: LEVEL_DEFINITIONS[index], state: cloneState(state) });
    hintTimer = setTimeout(fallback, 5000);
  } catch { fallback(); }
}

function showLevelPicker() {
  $('level-picker').innerHTML = CHAPTERS.map((chapter, chapterIndex) => `<section class="picker-chapter"><h3>0${chapterIndex + 1} ${chapter.name}<small>${chapter.subtitle}</small></h3><div class="picker-chapter-levels">${levels.map((entry, i) => {
    if (entry.chapter !== chapterIndex) return '';
    const record = progress.completed[entry.id];
    return `<button class="level-choice${i === index ? ' active' : ''}" data-level="${i}"${!canSelect(i) ? ' disabled' : ''} aria-label="第 ${i + 1} 站，${entry.name}${record ? `，获得 ${record.stars} 颗星` : !canSelect(i) ? '，未解锁' : ''}"><strong>${String(i + 1).padStart(2, '0')}</strong><span>${entry.name}</span><em>${!canSelect(i) ? icon('i-lock') : record ? '★'.repeat(record.stars) : '· · ·'}</em></button>`;
  }).join('')}</div></section>`).join('');
  openDialog($('levels-dialog'));
}

function nextLevel() {
  $('win-dialog').close();
  if (index === levels.length - 1) showLevelPicker();
  else { loadLevel(index + 1); board.focus({ preventScroll: true }); }
}

$('undo-button').addEventListener('click', undo);
$('restart-button').addEventListener('click', () => { loadLevel(index); toast('重新出发，这次也慢慢来。'); });
$('hint-button').addEventListener('click', showHint);
$('help-button').addEventListener('click', () => openDialog($('help-dialog')));
$('levels-button').addEventListener('click', showLevelPicker);
$('next-button').addEventListener('click', nextLevel);
$('continue-button').addEventListener('click', nextLevel);
$('sound-button').addEventListener('click', () => { progress.muted = !progress.muted; updateSound(); persist(); sound(); });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(button.dataset.close).close()));
document.querySelectorAll('[data-direction]').forEach((button) => button.addEventListener('click', () => move(button.dataset.direction)));
for (const container of [$('route-levels'), $('level-picker'), $('chapter-nav')]) {
  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-level]');
    if (button && !button.disabled) { loadLevel(Number(button.dataset.level)); board.focus({ preventScroll: true }); }
  });
}
board.addEventListener('click', (event) => {
  if (Date.now() < suppressClickUntil || isWon(level, state)) return;
  const tile = event.target.closest('[data-cell]');
  if (tile && !tile.disabled) { walkTo(Number(tile.dataset.cell)); board.focus({ preventScroll: true }); }
});
board.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
});
board.addEventListener('pointerup', (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
  pointer = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  suppressClickUntil = Date.now() + 400;
  move(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
});
board.addEventListener('pointercancel', () => { pointer = null; });
window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
  if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  const key = event.key.toLowerCase();
  const direction = { arrowup: 'up', w: 'up', arrowright: 'right', d: 'right', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left' }[key];
  if (direction) { event.preventDefault(); move(direction); }
  else if (['z', 'u', 'r', 'h'].includes(key)) {
    event.preventDefault();
    if (key === 'z' || key === 'u') undo();
    if (key === 'r') loadLevel(index);
    if (key === 'h') showHint();
  }
});

document.querySelectorAll('[data-level-total]').forEach((element) => { element.textContent = levels.length; });
updateSound(); loadLevel(index);
