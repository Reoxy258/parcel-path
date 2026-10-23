import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_TYPES } from '../src/world.js?v=5';
import {
  createSurvivalRun, update, chooseUpgrade, rollChoices, takeEvents,
  UPGRADES, RUN_SECONDS, MAX_ENEMIES, spikesActive,
} from '../src/survival.js?v=1';

// 手工放置的敌人：冻结行为（cooldown 99 / windup 99），只测目标系统
const mkEnemy = (x, y, extra = {}) => ({
  id: `t${x}-${y}`, type: 'fly', x, y, r: 11, hp: 18, maxHp: 18, attack: 8,
  cooldown: 99, phase: 'idle', phaseTime: 0, cycle: 0,
  targetX: 0, targetY: 0, vx: 0, vy: 0, flash: 0, orbitCd: 0, ...extra,
});
const mkBullet = (x, y, damage = 50) => ({ owner: 'hero', x, y, vx: 0, vy: 0, r: 4, damage, ttl: 1, pierce: 0, hits: [] });
const mkGem = (x, y, value = 1) => ({ id: `g${x}-${y}`, type: 'gem', x, y, value, age: 0 });
// 直接把状态推到升级入口（绕过拾取流程），再指定选项应用
const forceLevelUp = (run) => { run.xp = run.xpNext; update(run, {}, 1 / 60); };
const pick = (run, id) => { run.choices = [id]; assert.ok(chooseUpgrade(run, id), `choose ${id}`); };

test('run starts centered, deterministic, with a sane xp curve', () => {
  const run = createSurvivalRun(42);
  assert.equal(run.status, 'playing');
  assert.equal(run.time, 0);
  assert.equal(run.hero.x, 360); assert.equal(run.hero.y, 216);
  assert.equal(run.hero.hp, 100); assert.equal(run.hero.attack, 10);
  assert.equal(run.level, 1); assert.equal(run.xp, 0); assert.equal(run.xpNext, 6);
  assert.equal(RUN_SECONDS, 600); assert.equal(MAX_ENEMIES, 70);
  assert.equal(JSON.stringify(createSurvivalRun(42).scene.obstacles), JSON.stringify(run.scene.obstacles));
});

test('same seed and same input produce identical runs', () => {
  const a = createSurvivalRun(999), b = createSurvivalRun(999);
  const input = (step) => ({ x: Math.cos(step / 90), y: Math.sin(step / 90), dash: step % 300 === 0 });
  for (let step = 0; step < 600; step++) {
    update(a, input(step), 1 / 60); update(b, input(step), 1 / 60);
    if (a.status === 'levelup') chooseUpgrade(a, a.choices[0]);
    if (b.status === 'levelup') chooseUpgrade(b, b.choices[0]);
  }
  const summary = (run) => JSON.stringify({
    t: run.time, x: run.hero.x.toFixed(4), y: run.hero.y.toFixed(4), hp: run.hero.hp,
    k: run.stats.kills, lvl: run.level, xp: run.xp, en: run.scene.enemies.length, gems: run.scene.pickups.length,
  });
  assert.equal(summary(a), summary(b));
});

test('director introduces enemy types on schedule and respects the cap', () => {
  const run = createSurvivalRun(11);
  run.hero.hp = run.hero.maxHp = 1e9; run.xpNext = 1e9; // 摘除死亡与升级，只看出怪
  run.time = 0;
  let sawSpider = false, sawHopper = false, sawMushroom = false;
  for (let i = 0; i < 128 * 20; i++) { // 128 秒，dt=.05
    update(run, {}, .05);
    for (const e of run.scene.enemies) {
      if (e.type === 'spider') sawSpider = true;
      if (e.type === 'hopper') sawHopper = true;
    }
    if (run.time >= 128) break;
  }
  assert.ok(sawSpider, 'spider joins by 60s');
  assert.ok(sawHopper, 'hopper joins by 120s');
  // 终局波次下 10 秒内应堆到接近上限
  run.time = 470; run.spawn.timer = 0;
  for (let i = 0; i < 200; i++) update(run, {}, .05);
  assert.ok(run.scene.enemies.length <= MAX_ENEMIES, `cap respected (${run.scene.enemies.length})`);
  assert.ok(run.scene.enemies.length >= 55, `late waves are dense (${run.scene.enemies.length})`);
  assert.ok(sawMushroom || run.scene.enemies.some(e => e.type === 'mushroom'), 'mushroom joins by 180s');
});

test('guardians arrive at 3, 6 and 9 minutes with escalating health', () => {
  for (const [index, t, hp] of [[0, 180, 1050], [1, 360, 1750], [2, 540, 2500]]) {
    const run = createSurvivalRun(7);
    run.hero.hp = run.hero.maxHp = 1e9; run.xpNext = 1e9;
    run.time = t - 1; run.spawn.bossIndex = index; // 只放当前时刻的守卫
    for (let i = 0; i < 30; i++) update(run, {}, .05); // 推过时刻表
    const boss = run.scene.enemies.find(e => e.boss);
    assert.ok(boss, `boss scheduled at ${t}s`);
    assert.equal(boss.type, 'guardian');
    assert.equal(boss.maxHp, hp);
    const events = takeEvents(run);
    assert.ok(events.some(e => e.type === 'boss' && e.text), 'boss announcement emitted');
  }
});

test('kills drop gems scaled by enemy rank', () => {
  const run = createSurvivalRun(3);
  run.scene.obstacles = []; // 避免种子生成的岩石挡住测试弹道
  run.scene.enemies.push(
    mkEnemy(200, 100),
    mkEnemy(400, 100, { elite: true }),
    mkEnemy(200, 380, { boss: true }),
  );
  run.scene.bullets.push(mkBullet(200, 100), mkBullet(400, 100), mkBullet(200, 380));
  update(run, {}, 1 / 60);
  assert.equal(run.stats.kills, 3);
  const values = run.scene.pickups.filter(p => p.type === 'gem').map(p => p.value).sort((a, b) => a - b);
  assert.deepEqual(values, [1, 10, 50]);
});

test('gems magnetize to the hero and collect into xp', () => {
  const run = createSurvivalRun(5);
  run.hero.shootCd = 99; // 不开火，专注拾取
  run.scene.pickups.push(mkGem(390, 216)); // 距英雄 30 < 磁力 34
  run.scene.pickups.push(mkGem(60, 60));   // 远处晶石不动
  const farX = 60;
  for (let i = 0; i < 8; i++) update(run, {}, 1 / 60);
  assert.equal(run.xp, 1);
  assert.equal(run.stats.gems, 1);
  const far = run.scene.pickups.find(p => p.value === 1);
  assert.ok(far, 'far gem remains');
  assert.equal(far.x, farX, 'out-of-range gem does not move');
  // 磁力升级后范围扩大
  forceLevelUp(run); pick(run, 'magnet');
  assert.equal(run.hero.magnet, 64);
});

test('level ups pause the game and offer three valid choices', () => {
  const run = createSurvivalRun(13);
  forceLevelUp(run);
  assert.equal(run.status, 'levelup');
  assert.equal(run.choices.length, 3);
  for (const id of run.choices) assert.ok(UPGRADES[id], `unknown choice ${id}`);
  assert.ok(rollChoices(run).length === 3);
});

test('each upgrade applies its effect', () => {
  const fresh = () => { const run = createSurvivalRun(17); run.scene.enemies = []; run.scene.obstacles = []; return run; };
  const withPick = (id, mutate) => { const run = fresh(); if (mutate) mutate(run); forceLevelUp(run); pick(run, id); return run; };

  assert.equal(withPick('power').hero.attack, 14);
  const sun = withPick('sun');
  assert.equal(sun.hero.maxHp, 120); assert.equal(sun.hero.hp, 120);
  assert.equal(withPick('swift').hero.speed, 182);
  assert.equal(withPick('armor').hero.armor, 1);

  const rapid = fresh(); rapid.upgrades.rapid = 2; rapid.scene.enemies.push(mkEnemy(200, 100));
  update(rapid, {}, 1 / 60);
  assert.ok(Math.abs(rapid.hero.shootCd - .3 * Math.pow(.85, 2)) < 1e-9, 'rapid shrinks cooldown');

  const twin = fresh(); twin.upgrades.twin = 1; twin.scene.enemies.push(mkEnemy(200, 100));
  update(twin, {}, 1 / 60);
  assert.equal(twin.scene.bullets.filter(b => b.owner === 'hero').length, 2, 'twin fires two arrows');

  const pierce = fresh(); pierce.upgrades.pierce = 2; pierce.scene.enemies.push(mkEnemy(200, 100));
  update(pierce, {}, 1 / 60);
  assert.ok(pierce.scene.bullets.every(b => b.pierce === 2), 'pierce is carried by bullets');

  // 环绕叶片：关掉射击，把敌人放在叶片轨迹上
  const orbit = fresh(); orbit.upgrades.orbit = 1; orbit.hero.shootCd = 99;
  orbit.scene.enemies.push(mkEnemy(424, 216, { hp: 18 }));
  update(orbit, {}, 1 / 60);
  assert.ok(orbit.scene.enemies[0].hp < 18, 'orbit leaf damages on contact');
  assert.ok(orbit.orbitAngle > 0, 'leaves rotate');

  // 荆棘光环：敌人进入半径，等一个 tick
  const aura = fresh(); aura.upgrades.aura = 1; aura.hero.shootCd = 99; aura.auraTick = .01;
  aura.scene.enemies.push(mkEnemy(390, 216, { hp: 34 }));
  update(aura, {}, 1 / 60);
  assert.ok(aura.scene.enemies[0].hp < 34, 'aura ticks damage nearby enemies');

  // 治疗兜底
  const feast = fresh(); feast.hero.hp = 10;
  forceLevelUp(feast); pick(feast, 'feast');
  assert.equal(feast.hero.hp, 10 + 45);
});

test('overflow xp chains level ups back to back', () => {
  const run = createSurvivalRun(19);
  run.xp = 20; // 6 + 8 之后还剩 6
  update(run, {}, 1 / 60);
  assert.equal(run.status, 'levelup');
  run.choices = ['power']; chooseUpgrade(run, 'power');
  assert.equal(run.status, 'levelup', 'second level up is queued immediately');
  assert.equal(run.level, 3);
  run.choices = ['armor']; chooseUpgrade(run, 'armor');
  assert.equal(run.status, 'playing');
});

test('exhausted upgrade pool falls back to feast', () => {
  const run = createSurvivalRun(23);
  for (const id of Object.keys(run.upgrades)) run.upgrades[id] = UPGRADES[id].max;
  assert.deepEqual(rollChoices(run), ['feast', 'feast', 'feast']);
});

test('spikes hurt ground enemies that walk into them', () => {
  const run = createSurvivalRun(29);
  run.hero.shootCd = 99;
  run.scene.obstacles.push({ id: 'sp1', type: 'spikes', x: 100, y: 200, w: 44, h: 38, hp: Infinity });
  assert.ok(spikesActive(run, run.scene.obstacles.at(-1)), 'spikes phase starts active at t=0');
  run.scene.enemies.push(mkEnemy(118, 218, { type: 'spider', phase: 'windup', phaseTime: 99, hp: 24 }));
  for (let i = 0; i < 210; i++) update(run, {}, 1 / 60); // 荆棘周期 2.8s，需要跨过第二个激活窗口
  assert.equal(run.stats.kills, 1, 'spike grinding kills the enemy');
  assert.ok(run.scene.pickups.some(p => p.type === 'gem'));
});

test('gem overflow at the pickup cap merges into existing gems', () => {
  const run = createSurvivalRun(31);
  run.scene.obstacles = [];
  for (let i = 0; i < 170; i++) run.scene.pickups.push(mkGem(40 + i * .1, 40));
  const before = run.scene.pickups.reduce((sum, p) => sum + p.value, 0);
  run.scene.enemies.push(mkEnemy(560, 300));
  run.scene.bullets.push(mkBullet(560, 300));
  update(run, {}, 1 / 60);
  assert.equal(run.stats.kills, 1);
  assert.equal(run.scene.pickups.length, 170, 'no new pickup object beyond cap');
  assert.equal(run.scene.pickups.reduce((sum, p) => sum + p.value, 0), before + 1, 'value merged into existing gem');
});

test('hero death ends the run and reports the clock', () => {
  const run = createSurvivalRun(37);
  run.time = 125;
  run.hero.hp = 5;
  run.scene.enemies.push(mkEnemy(360, 216, { phase: 'idle' }));
  update(run, {}, 1 / 60);
  assert.equal(run.status, 'dead');
  assert.ok(run.stats.damageTaken > 0);
  const events = takeEvents(run);
  assert.ok(events.some(e => e.type === 'death' && e.text.includes('2 分')), 'death message reports elapsed time');
});

test('surviving to 600 seconds wins the run', () => {
  const run = createSurvivalRun(41);
  run.time = RUN_SECONDS - .05;
  update(run, {}, .05);
  assert.equal(run.status, 'won');
  assert.ok(takeEvents(run).some(e => e.type === 'win'));
});

test('ninety seconds of auto-battle stays fun and fair', () => {
  const run = createSurvivalRun(218);
  const priority = ['sun', 'armor', 'orbit', 'aura', 'magnet', 'pierce', 'twin', 'rapid', 'power', 'swift'];
  for (let step = 0; step < 90 * 60; step++) {
    const a = step / 60 * .9; // 绕圈走位
    update(run, { x: Math.cos(a), y: Math.sin(a), dash: step % 360 === 0 }, 1 / 60);
    if (run.status === 'levelup') {
      const best = run.choices.find(id => priority.includes(id)) ?? run.choices[0];
      chooseUpgrade(run, best);
    }
    if (run.status !== 'playing') break;
  }
  assert.equal(run.status, 'playing', `hero should survive 90s (hp ${run.hero.hp})`);
  assert.ok(run.level >= 3, `leveling feels frequent (Lv ${run.level})`);
  assert.ok(run.stats.kills > 30, `combat stays busy (kills ${run.stats.kills})`);
  assert.ok(Number.isFinite(run.hero.x) && Number.isFinite(run.hero.y));
});
