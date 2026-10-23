// 晴空幸存者 · 生存模式模拟核心
// 单屏竞技场 + 怪潮导演 + 晶石经验 + 升级三选一 + 10 分钟一局。
// 敌人行为、冲刺/无敌帧、粒子、伤害公式从冒险模式移植复用。
import { WIDTH, HEIGHT, ENEMY_TYPES, mulberry32, DEFAULT_SEED } from './world.js?v=5';
import { moveActor } from './adventure.js?v=5';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (x, y) => { const n = Math.hypot(x, y) || 1; return { x: x / n, y: y / n }; };
function overlaps(x, y, r, o) {
  return Math.hypot(x - clamp(x, o.x, o.x + o.w), y - clamp(y, o.y, o.y + o.h)) < r;
}
function emit(run, type, text) { run.events.push({ type, text }); }

export const RUN_SECONDS = 600; // 10 分钟
export const MAX_ENEMIES = 70;

// 升级池：被动 8 项 + 武器 2 项 + 兜底治疗。每次升级三选一，构筑分叉的来源。
export const UPGRADES = {
  power:  { name: '磨亮飞信', icon: '➶', color: '#d49b85', max: 5, detail: '攻击力 +4' },
  rapid:  { name: '风铃节拍', icon: '♧', color: '#b2a366', max: 5, detail: '射击间隔缩短 15%' },
  twin:   { name: '双叶飞信', icon: '❧', color: '#79a382', max: 3, detail: '每次多发一枚飞信（伤害 78%）' },
  pierce: { name: '穿叶书签', icon: '✧', color: '#aa96bb', max: 3, detail: '飞信额外穿透一个敌人' },
  swift:  { name: '风行羽毛', icon: '➶', color: '#89adc2', max: 5, detail: '移速 +12，冲刺冷却 −0.15s' },
  sun:    { name: '暖阳徽章', icon: '☀', color: '#d4ad61', max: 5, detail: '体力上限 +20，并恢复 28' },
  magnet: { name: '磁石铃兰', icon: '◎', color: '#76a9c3', max: 3, detail: '晶石拾取范围 +30' },
  armor:  { name: '苔绒披肩', icon: '◈', color: '#87a78a', max: 5, detail: '护甲 +1（减伤递减）' },
  orbit:  { name: '环绕叶片', icon: '✿', color: '#8fbf7f', max: 4, detail: '身边多一片旋转飞叶，碰撞造成伤害' },
  aura:   { name: '荆棘光环', icon: '✜', color: '#c79c4e', max: 4, detail: '周身光环变大变强，周期伤害' },
  feast:  { name: '花间小憩', icon: '♡', color: '#dc9d8c', max: Infinity, detail: '立刻恢复 45% 体力' },
};

// 波次表：t 秒后切换，types 按权重随机出怪，间隔随时间逐渐加密。
const WAVES = [
  { t: 0,   types: ['fly'],                                  every: 1.6,  burst: 2, label: '花种苏醒，守好花园中央。' },
  { t: 30,  types: ['fly'],                                  every: 1.25, burst: 2 },
  { t: 60,  types: ['fly', 'fly', 'spider'],                 every: 1.2,  burst: 2, label: '疾跑小蛛加入怪潮。' },
  { t: 120, types: ['fly', 'spider', 'hopper'],              every: 1.0,  burst: 3, label: '蹦蹦芽从土里弹出来了。' },
  { t: 180, types: ['fly', 'spider', 'hopper', 'mushroom'],  every: .9,   burst: 3 },
  { t: 240, types: ['spider', 'hopper', 'mushroom'],         every: .78,  burst: 4, label: '怪潮渐密，边退边打。' },
  { t: 300, types: ['fly', 'spider', 'hopper', 'mushroom'],  every: .62,  burst: 4, label: '时间过半，顶住。' },
  { t: 380, types: ['spider', 'hopper', 'mushroom', 'mushroom'], every: .52, burst: 5 },
  { t: 460, types: ['fly', 'spider', 'hopper', 'mushroom'],  every: .42,  burst: 5, label: '最后的疯狂，别停下。' },
];
// 3 / 6 / 9 分钟各出一位守卫 boss。
const BOSSES = [
  { t: 180, hp: 1050, attack: 15, label: '第一位花园守卫登场！' },
  { t: 360, hp: 1750, attack: 18, label: '第二位守卫从花丛里站起！' },
  { t: 540, hp: 2500, attack: 21, label: '最终守卫挡在黎明之前！' },
];

function generateObstacles(rand) {
  const obstacles = [];
  const defs = [
    { type: 'rock', w: 46, h: 42 }, { type: 'rock', w: 46, h: 42 },
    { type: 'crate', w: 40, h: 36 }, { type: 'crate', w: 40, h: 36 }, { type: 'crate', w: 40, h: 36 },
    { type: 'spikes', w: 44, h: 38 },
  ];
  if (rand() < .55) defs.push({ type: 'water', w: 52, h: 48 });
  for (const def of defs) {
    for (let tries = 0; tries < 40; tries++) {
      const x = 70 + rand() * (WIDTH - 140 - def.w), y = 64 + rand() * (HEIGHT - 128 - def.h);
      const cx = x + def.w / 2, cy = y + def.h / 2;
      if (Math.hypot(cx - WIDTH / 2, cy - HEIGHT / 2) < 110) continue; // 出生点保持空旷
      const margin = Math.max(def.w, def.h) / 2 + 18;
      if (obstacles.some(o => overlaps(cx, cy, margin, o))) continue;
      obstacles.push({ id: `o${obstacles.length}`, type: def.type, x, y, w: def.w, h: def.h, hp: def.type === 'crate' ? 24 : Infinity });
      break;
    }
  }
  return obstacles;
}

export function createSurvivalRun(seed) {
  const s = Number.isFinite(seed) ? seed >>> 0 : DEFAULT_SEED;
  const rand = mulberry32(s);
  return {
    version: 4, seed: s, time: 0, status: 'playing',
    hero: {
      x: WIDTH / 2, y: HEIGHT / 2, r: 12, hp: 100, maxHp: 100, attack: 10, armor: 0,
      speed: 170, magnet: 34, invuln: 0, shootCd: 0, dashCd: 0, dashTime: 0,
      dashX: 0, dashY: 1, facingX: 0, facingY: -1,
    },
    scene: { enemies: [], bullets: [], pickups: [], particles: [], texts: [], obstacles: generateObstacles(rand) },
    level: 1, xp: 0, xpNext: 6, choices: null,
    upgrades: { power: 0, rapid: 0, twin: 0, pierce: 0, swift: 0, sun: 0, magnet: 0, armor: 0, orbit: 0, aura: 0 },
    stats: { kills: 0, gems: 0, levelUps: 0, damageTaken: 0, bosses: 0 },
    spawn: { timer: .8, eliteTimer: 0, wave: -1, bossIndex: 0, spawnId: 0, gemId: 0 },
    orbitAngle: 0, auraTick: .5,
    events: [], rand,
  };
}

function burst(run, x, y, color, count = 9) {
  for (let i = 0; i < count; i++) run.scene.particles.push({ x, y, vx: Math.cos(i * 2.4) * 35, vy: Math.sin(i * 2.4) * 35, life: .45, maxLife: .45, color });
}

function hurtHero(run, amount, from) {
  const h = run.hero;
  if (h.invuln > 0 || h.dashTime > 0 || run.status !== 'playing') return false;
  const reduction = h.armor * 4 / (h.armor * 4 + 40);
  const damage = Math.max(1, Math.round(amount * (1 - reduction)));
  h.hp = Math.max(0, h.hp - damage); h.invuln = .85;
  run.stats.damageTaken += damage;
  run.scene.texts.push({ x: h.x, y: h.y - 35, text: `−${damage}`, life: .8, color: '#c27955' });
  if (from) { const away = unit(h.x - from.x, h.y - from.y); moveActor(run.scene, h, away.x * 15, away.y * 15); }
  burst(run, h.x, h.y, '#efbd7e', 7); emit(run, 'hit');
  if (h.hp === 0) {
    run.status = 'dead'; run.hero.dashTime = 0;
    emit(run, 'death', `倒在第 ${Math.floor(run.time / 60)} 分 ${Math.floor(run.time % 60)} 秒。`);
  }
  return true;
}

function shoot(run, owner, x, y, angle, speed, damage, pierce = 0) {
  run.scene.bullets.push({ owner, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: owner === 'hero' ? 4 : 5, damage, ttl: 3, pierce, hits: [] });
}
function lineClear(scene, a, b) {
  const steps = Math.ceil(distance(a, b) / 9);
  for (let i = 1; i < steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
    if (scene.obstacles.some(o => o.hp > 0 && o.type !== 'spikes' && o.type !== 'water' && overlaps(x, y, 1, o))) return false;
  }
  return true;
}
function fireHero(run) {
  const h = run.hero;
  if (h.shootCd > 0) return;
  const candidates = [...run.scene.enemies].sort((a, b) => distance(a, h) - distance(b, h));
  const target = candidates.find(e => lineClear(run.scene, h, e)) || candidates[0];
  if (!target) return;
  const angle = Math.atan2(target.y - h.y, target.x - h.x), count = 1 + Math.min(3, run.upgrades.twin);
  h.facingX = Math.cos(angle); h.facingY = Math.sin(angle);
  for (let i = 0; i < count; i++) {
    shoot(run, 'hero', h.x + Math.cos(angle) * 18, h.y + Math.sin(angle) * 18,
      angle + (i - (count - 1) / 2) * .17, 350, Math.round(h.attack * (count > 1 ? .78 : 1)), run.upgrades.pierce);
  }
  h.shootCd = Math.max(.11, .3 * Math.pow(.85, run.upgrades.rapid));
  emit(run, 'shoot');
}

// —— 出怪导演：边缘生成、总量上限、精英与守卫时刻表 ——
function spawnEnemy(run, type, elite = false, boss = null) {
  const scene = run.scene, def = ENEMY_TYPES[type], t = run.time, h = run.hero;
  let x = WIDTH / 2, y = 36;
  for (let tries = 0; tries < 10; tries++) {
    const edge = Math.floor(run.rand() * 4);
    const along = 36 + run.rand() * ((edge < 2 ? WIDTH : HEIGHT) - 72);
    const point = edge === 0 ? [along, 36] : edge === 1 ? [along, HEIGHT - 36] : edge === 2 ? [36, along] : [WIDTH - 36, along];
    x = point[0]; y = point[1];
    if (Math.hypot(x - h.x, y - h.y) >= 150) break;
  }
  const hp = boss ? boss.hp : Math.round(def.hp * (1 + t / 150) * (elite ? 5 : 1));
  const attack = Math.round((boss ? boss.attack : def.attack) * (elite ? 1.5 : 1) * (1 + t / 320));
  const e = {
    id: `e${run.spawn.spawnId += 1}`, type, x, y,
    r: Math.round(def.radius * (elite ? 1.15 : 1)), hp, maxHp: hp, attack,
    cooldown: .9 + run.rand() * .5, phase: 'idle', phaseTime: 0, cycle: 0,
    targetX: 0, targetY: 0, vx: 0, vy: 0, flash: 0, orbitCd: 0,
    elite: !!elite, boss: !!boss,
  };
  scene.enemies.push(e);
  return e;
}
function director(run, dt) {
  const t = run.time, spawn = run.spawn;
  let wave = WAVES[0], index = 0;
  for (let i = 0; i < WAVES.length; i++) { if (t >= WAVES[i].t) { wave = WAVES[i]; index = i; } }
  if (index !== spawn.wave) { spawn.wave = index; if (wave.label) emit(run, 'note', wave.label); }
  spawn.timer -= dt;
  if (spawn.timer <= 0) {
    spawn.timer = wave.every;
    for (let i = 0; i < wave.burst; i++) {
      if (run.scene.enemies.length >= MAX_ENEMIES) break;
      spawnEnemy(run, wave.types[Math.floor(run.rand() * wave.types.length)]);
    }
  }
  if (t >= 150) {
    spawn.eliteTimer -= dt;
    if (spawn.eliteTimer <= 0 && run.scene.enemies.length < MAX_ENEMIES) {
      spawn.eliteTimer = t > 300 ? 12 : 20;
      const pool = ['fly', 'spider', 'hopper', 'mushroom'];
      spawnEnemy(run, pool[Math.floor(run.rand() * pool.length)], true);
    }
  }
  const boss = BOSSES[spawn.bossIndex];
  if (boss && t >= boss.t) {
    spawn.bossIndex++;
    spawnEnemy(run, 'guardian', false, boss);
    emit(run, 'boss', `${Math.floor(boss.t / 60)}:00 — ${boss.label}`);
  }
}

// —— 敌人行为：从冒险模式移植的相位机，数值改为随时间缩放 ——
function updateEnemy(run, e, dt) {
  const h = run.hero, scene = run.scene, t = run.time, def = ENEMY_TYPES[e.type];
  e.flash = Math.max(0, e.flash - dt); e.cooldown -= dt; e.phaseTime -= dt; e.orbitCd -= dt;
  const speedScale = 1 + t / 240;
  const dir = unit(h.x - e.x, h.y - e.y);
  if (e.type === 'fly') moveActor(scene, e, dir.x * def.speed * speedScale * dt, dir.y * def.speed * speedScale * dt, true);
  if (e.type === 'hopper') {
    if (e.phase === 'jump') {
      moveActor(scene, e, e.vx * dt, e.vy * dt);
      if (e.phaseTime <= 0) { e.phase = 'idle'; e.cooldown = 1.0; burst(run, e.x, e.y, '#ceb994', 6); }
    } else if (e.phase === 'windup' && e.phaseTime <= 0) {
      const aim = unit(e.targetX - e.x, e.targetY - e.y);
      e.vx = aim.x * (215 + t * .12); e.vy = aim.y * (215 + t * .12); e.phase = 'jump'; e.phaseTime = .38;
    } else if (e.phase === 'idle' && e.cooldown <= 0) {
      e.phase = 'windup'; e.phaseTime = .55;
      e.targetX = clamp(h.x, 45, WIDTH - 45); e.targetY = clamp(h.y, 45, HEIGHT - 45);
    }
  }
  if (e.type === 'spider') {
    if (e.phase === 'charge') {
      moveActor(scene, e, e.vx * dt, e.vy * dt);
      if (e.phaseTime <= 0) { e.phase = 'idle'; e.cooldown = 1.5; }
    } else if (e.phase === 'windup' && e.phaseTime <= 0) {
      e.vx = dir.x * (235 + t * .1); e.vy = dir.y * (235 + t * .1); e.phase = 'charge'; e.phaseTime = .42;
    } else if (e.phase === 'idle') {
      moveActor(scene, e, dir.x * def.speed * speedScale * dt, dir.y * def.speed * speedScale * dt);
      if (e.cooldown <= 0) { e.phase = 'windup'; e.phaseTime = .5; }
    }
  }
  if (e.type === 'mushroom' || e.type === 'guardian') {
    if (e.type === 'guardian') moveActor(scene, e, dir.x * def.speed * (1 + t / 400) * dt, dir.y * def.speed * (1 + t / 400) * dt);
    if (e.phase === 'windup' && e.phaseTime <= 0) {
      const angle = Math.atan2(h.y - e.y, h.x - e.x);
      if (e.type === 'guardian' && e.cycle % 2 === 0) {
        const count = 6 + Math.min(6, Math.floor(t / 80));
        for (let i = 0; i < count; i++) shoot(run, 'enemy', e.x, e.y, angle + i * Math.PI * 2 / count, 120 + t * .08, e.attack);
      } else for (let offset = -1; offset <= 1; offset++) shoot(run, 'enemy', e.x, e.y, angle + offset * .22, 135 + t * .08, e.attack);
      e.phase = 'idle'; e.cooldown = e.type === 'guardian' ? 1.3 : 1.7; e.cycle++;
    } else if (e.phase === 'idle' && e.cooldown <= 0) { e.phase = 'windup'; e.phaseTime = e.type === 'guardian' ? .65 : .5; }
  }
  if (e.phase !== 'jump' && distance(h, e) < h.r + e.r) hurtHero(run, e.attack, e);
}

function addGem(run, x, y, value) {
  if (run.scene.pickups.length >= 170) {
    const gem = run.scene.pickups.find(p => p.type === 'gem');
    if (gem) { gem.value += value; return; }
  }
  run.scene.pickups.push({ id: `g${run.spawn.gemId += 1}`, type: 'gem', x: clamp(x, 30, WIDTH - 30), y: clamp(y, 30, HEIGHT - 30), value, age: 0 });
}
function defeatEnemy(run, e) {
  run.stats.kills++;
  addGem(run, e.x, e.y, e.boss ? 50 : e.elite ? 10 : 1);
  burst(run, e.x, e.y, e.boss ? '#e8c979' : '#b2c98a', e.boss ? 26 : 10);
  emit(run, 'defeat');
  if (e.boss) { run.stats.bosses++; emit(run, 'bossdown', '守卫倒下了，晴空又亮了一点！'); }
}
function updateBullets(run, dt) {
  for (const b of run.scene.bullets) {
    b.ttl -= dt;
    const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 5));
    for (let part = 0; part < steps && b.ttl > 0; part++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (b.x < 20 || b.y < 20 || b.x > WIDTH - 20 || b.y > HEIGHT - 20) { b.ttl = 0; break; }
      const obstacle = run.scene.obstacles.find(o => o.hp > 0 && o.type !== 'spikes' && o.type !== 'water' && overlaps(b.x, b.y, b.r, o));
      if (obstacle) {
        b.ttl = 0;
        if (b.owner === 'hero' && obstacle.type === 'crate') {
          obstacle.hp -= b.damage;
          if (obstacle.hp <= 0) { addGem(run, obstacle.x + 20, obstacle.y + 20, 2); burst(run, obstacle.x + 20, obstacle.y + 20, '#c7a168', 9); }
        }
        break;
      }
      if (b.owner === 'hero') {
        for (const enemy of run.scene.enemies) {
          if (enemy.hp <= 0 || b.hits.includes(enemy.id) || distance(b, enemy) > enemy.r + b.r) continue;
          enemy.hp -= b.damage; enemy.flash = .12; b.hits.push(enemy.id);
          run.scene.texts.push({ x: enemy.x, y: enemy.y - 28, text: String(Math.round(b.damage)), life: .55, color: '#688953' });
          burst(run, b.x, b.y, '#dde8ac', 3); emit(run, 'impact');
          if (enemy.hp <= 0) defeatEnemy(run, enemy);
          if (b.pierce > 0) b.pierce--; else b.ttl = 0;
          break;
        }
      } else if (distance(b, run.hero) < b.r + run.hero.r) { hurtHero(run, b.damage, b); b.ttl = 0; }
    }
  }
  run.scene.bullets = run.scene.bullets.filter(b => b.ttl > 0);
  run.scene.enemies = run.scene.enemies.filter(e => e.hp > 0);
}

// —— 环绕叶片：VS 式新武器，绕英雄公转、触碰造成伤害 ——
function updateOrbit(run, dt) {
  const lv = run.upgrades.orbit;
  if (lv < 1) return;
  run.orbitAngle += dt * (2.4 - lv * .15);
  const count = 1 + lv, damage = 9 + run.hero.attack * .55, h = run.hero;
  let killed = false;
  for (let i = 0; i < count; i++) {
    const angle = run.orbitAngle + i * Math.PI * 2 / count;
    const lx = h.x + Math.cos(angle) * 62, ly = h.y + Math.sin(angle) * 62;
    for (const e of run.scene.enemies) {
      if (e.hp <= 0 || e.orbitCd > 0) continue;
      if (Math.hypot(lx - e.x, ly - e.y) < 13 + e.r) {
        e.hp -= damage; e.orbitCd = .5; e.flash = .12;
        run.scene.texts.push({ x: e.x, y: e.y - 28, text: String(Math.round(damage)), life: .55, color: '#8fbf7f' });
        burst(run, lx, ly, '#b7d9a0', 3);
        if (e.hp <= 0) { defeatEnemy(run, e); killed = true; }
      }
    }
  }
  if (killed) run.scene.enemies = run.scene.enemies.filter(e => e.hp > 0);
}

// —— 荆棘光环：周身周期性范围伤害 ——
function updateAura(run, dt) {
  const lv = run.upgrades.aura;
  if (lv < 1) return;
  run.auraTick -= dt;
  if (run.auraTick > 0) return;
  run.auraTick = .55;
  const h = run.hero, radius = 42 + 16 * lv, damage = 5 + 3.5 * lv + h.attack * .3;
  let hitAny = false;
  for (const e of run.scene.enemies) {
    if (e.hp <= 0) continue;
    if (distance(e, h) < radius + e.r) {
      e.hp -= damage; e.flash = .12; hitAny = true;
      run.scene.texts.push({ x: e.x, y: e.y - 28, text: String(Math.round(damage)), life: .55, color: '#c79c4e' });
      if (e.hp <= 0) defeatEnemy(run, e);
    }
  }
  if (hitAny) { run.scene.enemies = run.scene.enemies.filter(e => e.hp > 0); emit(run, 'impact'); }
}

export const spikesActive = (run, o) => (run.time + o.x * .003) % 2.8 < .9;
function updateSpikeDamage(run, dt) {
  const h = run.hero;
  for (const o of run.scene.obstacles) {
    if (o.type !== 'spikes' || !spikesActive(run, o)) continue;
    if (overlaps(h.x, h.y, h.r - 3, o)) hurtHero(run, 13 + run.time * .012, o);
    for (const e of run.scene.enemies) {
      if (e.type === 'fly' || e.hp <= 0 || e.phase === 'jump') continue;
      if (overlaps(e.x, e.y, e.r, o)) { e.hp -= 24 * dt; e.flash = .1; if (e.hp <= 0) defeatEnemy(run, e); }
    }
  }
  run.scene.enemies = run.scene.enemies.filter(e => e.hp > 0);
}

// —— 晶石：磁吸 + 拾取升级 ——
function updatePickups(run, dt) {
  const h = run.hero;
  for (const p of run.scene.pickups) {
    p.age += dt;
    const d0 = distance(p, h);
    if (d0 < h.magnet) {
      const pull = unit(h.x - p.x, h.y - p.y);
      const speed = Math.min(430, 150 + p.age * 40 + d0 * 2);
      p.x += pull.x * speed * dt; p.y += pull.y * speed * dt;
    }
    if (distance(p, h) < h.r + 11) {
      run.xp += p.value; run.stats.gems += p.value; p.collected = true;
      burst(run, p.x, p.y, '#8fd0bd', 4); emit(run, 'pickup');
    }
  }
  run.scene.pickups = run.scene.pickups.filter(p => !p.collected);
}

function separateEnemies(run) {
  const list = run.scene.enemies;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const dx = b.x - a.x, dy = b.y - a.y, rr = (a.r + b.r) * .82;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || .01, push = (rr - d) * .22, ux = dx / d, uy = dy / d;
    a.x = clamp(a.x - ux * push, 26, WIDTH - 26); a.y = clamp(a.y - uy * push, 26, HEIGHT - 26);
    b.x = clamp(b.x + ux * push, 26, WIDTH - 26); b.y = clamp(b.y + uy * push, 26, HEIGHT - 26);
  }
}

// —— 升级三选一 ——
export function rollChoices(run) {
  const pool = Object.keys(UPGRADES).filter(id => id !== 'feast' && run.upgrades[id] < UPGRADES[id].max);
  const picks = [];
  const m = Math.min(3, pool.length);
  for (let i = 0; i < m; i++) {
    const j = i + Math.floor(run.rand() * (pool.length - i));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    picks.push(pool[i]);
  }
  while (picks.length < 3) picks.push('feast');
  return picks;
}
function checkLevelUp(run) {
  if (run.status !== 'playing' || run.xp < run.xpNext) return;
  run.xp -= run.xpNext; run.level++; run.xpNext = 4 + run.level * 2;
  run.status = 'levelup'; run.choices = rollChoices(run);
  run.scene.texts.push({ x: run.hero.x, y: run.hero.y - 42, text: `LV ${run.level}`, life: 1, color: '#d4ad61' });
  burst(run, run.hero.x, run.hero.y, '#f5d886', 14);
  emit(run, 'levelup', `升到 Lv.${run.level} — 挑一份强化。`);
}
export function chooseUpgrade(run, id) {
  if (run.status !== 'levelup' || !Array.isArray(run.choices) || !run.choices.includes(id)) return false;
  applyUpgrade(run, id);
  run.choices = null; run.status = 'playing';
  run.stats.levelUps++;
  emit(run, 'relic', id === 'feast' ? '花间小憩：恢复了一点体力。' : `${UPGRADES[id].name} → Lv.${run.upgrades[id]}`);
  checkLevelUp(run); // 经验溢出时连续升级
  return true;
}
function applyUpgrade(run, id) {
  if (id === 'feast') { run.hero.hp = Math.min(run.hero.maxHp, run.hero.hp + Math.round(run.hero.maxHp * .45)); return; }
  run.upgrades[id]++;
  const h = run.hero;
  if (id === 'power') h.attack += 4;
  if (id === 'sun') { h.maxHp += 20; h.hp = Math.min(h.maxHp, h.hp + 28); }
  if (id === 'swift') h.speed += 12;
  if (id === 'magnet') h.magnet += 30;
  if (id === 'armor') h.armor++;
}

export function update(run, input = {}, seconds = 1 / 60) {
  if (run.status !== 'playing') return;
  const dt = clamp(Number.isFinite(seconds) ? seconds : 0, 0, .05);
  if (!dt) return;
  run.time += dt;
  if (run.time >= RUN_SECONDS) { run.status = 'won'; emit(run, 'win', '十分钟守住了，晴空属于你！'); return; }
  const h = run.hero, scene = run.scene;
  h.invuln = Math.max(0, h.invuln - dt); h.shootCd -= dt; h.dashCd = Math.max(0, h.dashCd - dt); h.dashTime = Math.max(0, h.dashTime - dt);
  let dx = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0, dy = Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
  if (input.dash && h.dashCd <= 0) {
    const dir = magnitude > .1 ? unit(dx, dy) : unit(h.facingX, h.facingY);
    h.dashX = dir.x; h.dashY = dir.y; h.dashTime = .17; h.invuln = Math.max(h.invuln, .27);
    h.dashCd = Math.max(.7, 2.1 - run.upgrades.swift * .15); emit(run, 'dash');
  }
  const speed = h.speed || 170;
  moveActor(scene, h, h.dashTime > 0 ? h.dashX * 470 * dt : dx * speed * dt, h.dashTime > 0 ? h.dashY * 470 * dt : dy * speed * dt);
  if (magnitude > .1 && !scene.enemies.length) { h.facingX = dx; h.facingY = dy; }
  director(run, dt);
  fireHero(run);
  for (const e of scene.enemies) { if (run.status !== 'playing') break; updateEnemy(run, e, dt); }
  if (run.status === 'playing') {
    separateEnemies(run);
    updateOrbit(run, dt);
    updateAura(run, dt);
    updateBullets(run, dt);
    updateSpikeDamage(run, dt);
    updatePickups(run, dt);
  }
  for (const p of scene.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  scene.particles = scene.particles.filter(p => p.life > 0);
  for (const text of scene.texts) { text.life -= dt; text.y -= dt * 24; }
  scene.texts = scene.texts.filter(t => t.life > 0);
  checkLevelUp(run);
}

export function takeEvents(run) { return run.events.splice(0); }
