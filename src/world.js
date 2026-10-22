export const WIDTH = 720, HEIGHT = 432, ROOM_COUNT = 30;
export const DEFAULT_SEED = 104729;

export const ZONES = [
  { name: '晨露花园', color: '#87ad72', floor: '#e9ebc9', wall: '#a7bd83', sky: '#edf3df', title: '先借一点风，吹开第一扇门' },
  { name: '风车回廊', color: '#d3a15b', floor: '#f1e7c9', wall: '#cbb086', sky: '#fbf0d7', title: '会冲刺的小家伙，先躲再还手' },
  { name: '琉璃温室', color: '#6ba79a', floor: '#dfeddb', wall: '#95b9a7', sky: '#e5f5ee', title: '看清弹道，在空隙里前进' },
  { name: '云上庭院', color: '#879ec4', floor: '#e5ebed', wall: '#a4b9ce', sky: '#edf4fa', title: '钥匙和金币，留给真正想要的宝物' },
  { name: '落日果园', color: '#cb956c', floor: '#f4e2c9', wall: '#c6aa80', sky: '#fff0dd', title: '把沿途的收获，变成自己的战斗方式' },
  { name: '晴空花塔', color: '#ad9bc5', floor: '#ece6e6', wall: '#b7b1cd', sky: '#f6f0fa', title: '最后一道花门，通向晴空' },
];

export const ENEMY_TYPES = {
  fly: { name: '巡风小飞虫', hp: 18, attack: 8, speed: 55, radius: 11, sprite: 'fly', description: '轻快地追逐，绕开再射击' },
  hopper: { name: '蹦蹦芽', hp: 28, attack: 12, speed: 0, radius: 13, sprite: 'hopper', description: '圈内蓄力后跳跃，离开落点圈' },
  mushroom: { name: '喷籽蘑菇', hp: 34, attack: 10, speed: 0, radius: 14, sprite: 'mushroom', description: '停在原地，定时发射三颗种子' },
  spider: { name: '疾跑小蛛', hp: 24, attack: 11, speed: 38, radius: 12, sprite: 'spider', description: '闪光蓄力后沿直线冲来' },
  guardian: { name: '花园守卫', hp: 150, attack: 14, speed: 26, radius: 27, sprite: 'mushroom', description: '散射与追踪交替，留意蓄力光环' },
};

export const RELICS = {
  twin: { name: '双叶飞信', icon: '❧', description: '每次多发一枚飞信，每枚伤害为原本的 78%。', color: '#79a382' },
  swift: { name: '风行羽毛', icon: '➶', description: '移动更快，冲刺冷却缩短；攻击力 +2。', color: '#89adc2' },
  sun: { name: '暖阳徽章', icon: '☀', description: '体力上限 +20，清空战斗房间后恢复 8 点体力。', color: '#d4ad61' },
  pierce: { name: '穿叶书签', icon: '✧', description: '飞信可额外穿透一个敌人；攻击力 +1。', color: '#aa96bb' },
  rapid: { name: '风铃节拍', icon: '♧', description: '射击间隔缩短 15%，体力恢复 15 点。', color: '#b2a366' },
  armor: { name: '苔绒披肩', icon: '◈', description: '护甲 +2，拾取小心心时额外恢复 6 点体力。', color: '#87a78a' },
};

export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const titles = ['风铃前庭', '守钥花坛', '旅行补给站', '蓝钥宝库', '守卫的花门'];
const REWARD_POINTS = [[326, 216], [394, 216], [360, 255], [360, 216], [410, 216], [310, 216]];
const SPAWN_ANCHORS = [[192, 120], [528, 312], [528, 120], [192, 312]];
const CORNERS = [{ x: 80, y: 80 }, { x: 640, y: 80 }, { x: 80, y: 352 }, { x: 640, y: 352 }];
const DOOR_POINTS = { north: [360, 30], east: [690, 216], south: [360, 402], west: [30, 216] };

// 地形模板：[列, 行, 类型]，列 2–12、行 2–6。
// 阻挡格（rock / crate / water）只放在两翼（列 2–5 与 10–12），
// 中央奖励区、英雄出生点、守卫出生点与四扇门的通路保持畅通；
// 荆棘（spikes）可以出现在整个地带，但避开中央奖励盒（列 6–9 × 行 3–5）。
const COMBAT_PATTERNS = [
  [[3, 2, 'rock'], [11, 2, 'rock'], [4, 6, 'crate'], [10, 6, 'crate'], [5, 2, 'spikes'], [9, 6, 'spikes']],
  [[3, 2, 'rock'], [4, 2, 'rock'], [10, 6, 'rock'], [11, 6, 'rock'], [10, 2, 'water'], [4, 6, 'water']],
  [[4, 2, 'water'], [5, 2, 'water'], [9, 6, 'water'], [10, 6, 'water'], [3, 6, 'crate'], [11, 2, 'crate']],
  [[3, 3, 'rock'], [3, 5, 'rock'], [11, 3, 'rock'], [11, 5, 'rock'], [5, 6, 'spikes'], [9, 2, 'spikes']],
  [[4, 2, 'crate'], [10, 2, 'crate'], [4, 6, 'crate'], [10, 6, 'crate'], [5, 5, 'spikes'], [9, 3, 'spikes']],
  [[2, 2, 'water'], [12, 6, 'water'], [4, 5, 'rock'], [10, 3, 'rock'], [5, 2, 'spikes'], [9, 6, 'spikes']],
  [[2, 3, 'rock'], [12, 5, 'rock'], [4, 2, 'crate'], [10, 6, 'crate'], [6, 2, 'spikes'], [8, 6, 'spikes']],
  [[2, 4, 'crate'], [12, 4, 'crate'], [5, 3, 'water'], [5, 5, 'water'], [10, 3, 'water'], [10, 5, 'water'], [6, 6, 'spikes'], [8, 2, 'spikes']],
  [[3, 2, 'crate'], [11, 6, 'crate'], [5, 4, 'rock'], [10, 4, 'rock'], [7, 2, 'spikes'], [7, 6, 'spikes']],
  [[2, 2, 'rock'], [2, 6, 'rock'], [12, 2, 'rock'], [12, 6, 'rock'], [6, 2, 'spikes'], [8, 6, 'spikes'], [8, 2, 'spikes'], [6, 6, 'spikes']],
  [[4, 3, 'crate'], [4, 5, 'crate'], [10, 3, 'crate'], [10, 5, 'crate'], [5, 2, 'spikes'], [9, 6, 'spikes'], [3, 6, 'water'], [11, 2, 'water']],
  [[3, 4, 'water'], [4, 4, 'water'], [10, 4, 'water'], [11, 4, 'water'], [5, 2, 'rock'], [9, 6, 'spikes']],
  [[2, 3, 'spikes'], [12, 3, 'spikes'], [5, 5, 'crate'], [10, 5, 'crate'], [5, 2, 'water'], [10, 2, 'water']],
  [[3, 3, 'crate'], [11, 5, 'crate'], [3, 5, 'water'], [11, 3, 'water'], [6, 2, 'spikes'], [8, 6, 'spikes'], [7, 2, 'spikes'], [7, 6, 'spikes']],
];
const GUARD_PATTERNS = [
  [[3, 2, 'rock'], [11, 2, 'rock'], [3, 6, 'crate'], [11, 6, 'crate']],
  [[4, 2, 'crate'], [10, 6, 'crate'], [3, 4, 'rock'], [11, 4, 'rock']],
  [[2, 2, 'rock'], [12, 6, 'rock'], [4, 6, 'water'], [10, 2, 'water'], [6, 2, 'spikes'], [8, 6, 'spikes']],
  [[3, 3, 'crate'], [11, 5, 'crate'], [5, 2, 'spikes'], [9, 6, 'spikes']],
  [[2, 4, 'water'], [12, 4, 'water'], [4, 2, 'crate'], [10, 6, 'crate'], [7, 2, 'spikes'], [7, 6, 'spikes']],
];
const FIRST_ROOM = [[4, 2, 'crate'], [10, 6, 'crate'], [3, 6, 'rock'], [11, 2, 'rock']];

function cellAllowed([col, row, type]) {
  if (col < 2 || col > 12 || row < 2 || row > 6) return false;
  if (type === 'spikes') return !(col >= 6 && col <= 9 && row >= 3 && row <= 5);
  return col <= 5 || col >= 10;
}
function transformPattern(cells, mirrorX, mirrorY) {
  return cells
    .map(([col, row, type]) => [mirrorX ? 14 - col : col, mirrorY ? 8 - row : row, type])
    .filter(cellAllowed);
}
function obstaclesFrom(cells) {
  return cells.map(([col, row, type], i) => ({ id: `o${i}`, type, x: col * 48 + 4, y: row * 48 + 4, w: 40, h: 40 }));
}
function overlapsBox(x, y, r, o) {
  return Math.hypot(x - Math.max(o.x, Math.min(x, o.x + o.w)), y - Math.max(o.y, Math.min(y, o.y + o.h))) < r;
}
function terrainBlocked(obstacles, x, y, r) {
  if (x - r < 22 || y - r < 22 || x + r > WIDTH - 22 || y + r > HEIGHT - 22) return true;
  return obstacles.some(o => o.type !== 'spikes' && overlapsBox(x, y, r, o));
}
function settleAnchor(obstacles, x, y, r) {
  if (!terrainBlocked(obstacles, x, y, r)) return { x, y };
  for (let ring = 1; ring < 12; ring++) for (let i = 0; i < 16; i++) {
    const px = x + Math.cos(i * Math.PI / 8) * ring * 12, py = y + Math.sin(i * Math.PI / 8) * ring * 12;
    if (!terrainBlocked(obstacles, px, py, r)) return { x: px, y: py };
  }
  return { x: 360, y: 216 };
}
function reachableMap(obstacles) {
  const start = [360, 216];
  if (terrainBlocked(obstacles, start[0], start[1], 12)) return null;
  const step = 6, seen = new Set(['60,36']), queue = [start];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const [x, y] = queue[cursor];
    for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = x + dx, ny = y + dy, key = `${Math.round(nx / step)},${Math.round(ny / step)}`;
      if (seen.has(key) || nx < 26 || ny < 26 || nx > WIDTH - 26 || ny > HEIGHT - 26) continue;
      if (terrainBlocked(obstacles, nx, ny, 12)) continue;
      seen.add(key); queue.push([nx, ny]);
    }
  }
  return (x, y, r) => queue.some(([px, py]) => Math.hypot(px - x, py - y) <= r);
}
function bulletsClear(obstacles, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 9);
  for (let i = 1; i < steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
    if (obstacles.some(o => (o.type === 'rock' || o.type === 'crate') && overlapsBox(x, y, 1, o))) return false;
  }
  return true;
}
function layoutReachable(obstacles) {
  const reach = reachableMap(obstacles);
  if (!reach) return false;
  if (!REWARD_POINTS.every(([x, y]) => reach(x, y, 16))) return false;
  if (!reach(360, 338, 28) || !reach(360, 328, 20) || !reach(360, 120, 26)) return false;
  return Object.values(DOOR_POINTS).every(([x, y]) => reach(x, y, 24));
}
function enemyTypesFor(rand, floor, kind, id) {
  if (kind === 2) return [];
  if (id === 0) return ['fly', 'fly'];
  if (kind === 4) {
    const types = ['guardian'];
    if (floor >= 1) types.push('fly');
    if (floor >= 3) types.push(rand() < .5 ? 'spider' : 'fly');
    if (floor >= 5) types.push(rand() < .5 ? 'hopper' : 'spider');
    return types;
  }
  const count = [2, 2, 3, 3, 4, 4][floor];
  const pool = floor === 0 ? ['fly', 'hopper', 'mushroom']
    : floor === 1 ? ['fly', 'hopper', 'mushroom', 'spider']
      : ['fly', 'spider', 'mushroom', 'hopper'];
  const types = [];
  for (let i = 0; i < count; i++) {
    let type = pool[Math.floor(rand() * pool.length)];
    if (type === 'mushroom' && types.filter(t => t === 'mushroom').length >= 2) type = 'fly';
    types.push(type);
  }
  return types;
}
const LINGING_SPOTS = [[360, 110], [360, 320], [110, 216], [610, 216], [360, 160], [360, 270], [300, 216], [420, 216], [360, 216]];
function ensureLining(obstacles, enemy, rand) {
  if (enemy.type !== 'mushroom' && enemy.type !== 'guardian') return enemy;
  const score = (x, y) => CORNERS.filter(c => bulletsClear(obstacles, c, { x, y })).length;
  if (score(enemy.x, enemy.y) >= 2) return enemy;
  const spots = [...SPAWN_ANCHORS.map(([x, y]) => [x, y]), ...LINGING_SPOTS];
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  let best = null, bestScore = score(enemy.x, enemy.y);
  for (const [ax, ay] of spots) {
    const spot = settleAnchor(obstacles, ax, ay, enemy.type === 'guardian' ? 26 : 14);
    const s = score(spot.x, spot.y);
    if (s > bestScore) { best = spot; bestScore = s; }
    if (s >= 2) break;
  }
  return best ? { ...enemy, x: Math.round(best.x), y: Math.round(best.y) } : enemy;
}

export function generateWorld(seed) {
  const rand = mulberry32(seed);
  const world = [];
  for (let id = 0; id < ROOM_COUNT; id++) {
    const floor = Math.floor(id / 5), kind = id % 5;
    let obstacles = [];
    if (kind !== 2) {
      if (id === 0) obstacles = obstaclesFrom(FIRST_ROOM);
      else {
        const pool = kind === 4 ? GUARD_PATTERNS : COMBAT_PATTERNS;
        let cells = null;
        for (let attempt = 0; attempt < 12 && cells === null; attempt++) {
          const candidate = transformPattern(pool[Math.floor(rand() * pool.length)], rand() < .5, rand() < .5);
          if (layoutReachable(obstaclesFrom(candidate))) cells = candidate;
        }
        obstacles = obstaclesFrom(cells ?? pool[0]);
      }
    }
    const enemies = enemyTypesFor(rand, floor, kind, id).map((type, i) => {
      const point = type === 'guardian'
        ? { x: 360, y: 120 }
        : { x: SPAWN_ANCHORS[i % 4][0] + Math.round((rand() * 2 - 1) * 32), y: SPAWN_ANCHORS[i % 4][1] + Math.round((rand() * 2 - 1) * 32) };
      const settled = settleAnchor(obstacles, point.x, point.y, type === 'guardian' ? 26 : 14);
      return ensureLining(obstacles, { id: `e${i}`, type, x: Math.round(settled.x), y: Math.round(settled.y) }, rand);
    });
    const base = floor * 5;
    const doors = kind === 0 ? [
      { direction: 'north', to: base + 1, type: 'open', label: '守钥花坛' },
      { direction: 'west', to: base + 2, type: 'open', label: '补给站' },
      { direction: 'east', to: base + 3, type: 'blue', label: '蓝钥宝库' },
      { direction: 'south', to: base + 4, type: 'yellow', label: '层末守卫' },
    ] : [{ direction: ['', 'south', 'east', 'west', 'north'][kind], to: base, type: 'open', label: '返回前庭' }];
    const gem = kind === 3 ? ['attack', 'armor', 'vitality'][Math.floor(rand() * 3)] : null;
    world.push({ id, floor, kind, name: titles[kind], obstacles, enemies, doors, gem });
  }
  return world;
}

export let WORLD = generateWorld(DEFAULT_SEED);
let activeSeed = DEFAULT_SEED;
export function activateWorld(seed) {
  const next = Number.isFinite(seed) ? seed >>> 0 : DEFAULT_SEED;
  if (next !== activeSeed) { WORLD = generateWorld(next); activeSeed = next; }
  return WORLD;
}

export function doorPosition(direction) {
  return { north: [360, 30], east: [690, 216], south: [360, 402], west: [30, 216] }[direction];
}
export function opposite(direction) { return { north: 'south', south: 'north', east: 'west', west: 'east' }[direction]; }
export function doorKey(from, to) { return [from, to].sort((a, b) => a - b).join('-'); }
export function choicesFor(floor) { return [['twin', 'swift', 'sun'], ['pierce', 'rapid', 'armor'], ['twin', 'sun', 'pierce'], ['swift', 'armor', 'rapid'], ['twin', 'pierce', 'sun'], ['swift', 'rapid', 'armor']][floor]; }
