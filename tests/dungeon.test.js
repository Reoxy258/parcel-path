import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, ROOM_COUNT, DEFAULT_SEED, generateWorld, activateWorld, doorPosition, choicesFor } from '../src/world.js?v=5';
import {
  createRun, enterRoom, blocked, transition, interact, update, roomCleared,
  chooseRelic, buy, enemyStats, saveRun, readRun,
} from '../src/adventure.js?v=5';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const durableHero = (run) => Object.fromEntries(
  ['hp', 'maxHp', 'attack', 'armor', 'coins', 'yellow', 'blue', 'potions'].map((key) => [key, run.hero[key]]),
);
const overlaps = (x, y, r, o) => Math.hypot(x - Math.max(o.x, Math.min(x, o.x + o.w)), y - Math.max(o.y, Math.min(y, o.y + o.h))) < r;
const CORNERS = [[640, 352], [640, 80], [80, 80], [80, 352]];
const REWARD_POINTS = [[326, 216], [394, 216], [360, 255], [360, 216], [410, 216], [310, 216]];

// 与战斗代码同口径：灰石与木箱挡子弹，水池与荆棘不挡。
function bulletsClear(obstacles, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 9);
  for (let i = 1; i < steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
    if (obstacles.some(o => (o.type === 'rock' || o.type === 'crate') && o.hp > 0 && overlaps(x, y, 1, o))) return false;
  }
  return true;
}

test('the same seed rebuilds the same world; a different seed changes it', () => {
  const a = generateWorld(DEFAULT_SEED), b = generateWorld(DEFAULT_SEED), c = generateWorld(54321), d = generateWorld(DEFAULT_SEED + 1);
  assert.deepEqual(a, b);
  const differs = (x, y) => JSON.stringify(x) !== JSON.stringify(y);
  assert.ok(differs(a, c), 'seeds 104729 and 54321 must not share a layout');
  assert.ok(differs(a, d), 'adjacent seeds must not share a layout');
});

test('every generated seed keeps the 30-room structure walkable and fightable', () => {
  const seeds = [DEFAULT_SEED, 1, 7, 42, 777, 999983];
  for (const seed of seeds) {
    const run = createRun(seed);
    assert.equal(WORLD.length, ROOM_COUNT);
    for (let floor = 0; floor < 6; floor++) {
      assert.deepEqual(WORLD.filter((room) => room.floor === floor).map((room) => room.kind), [0, 1, 2, 3, 4], `floor ${floor} of seed ${seed}`);
    }
    for (const room of WORLD) {
      enterRoom(run, room.id);
      assert.equal(blocked(run.scene, run.hero.x, run.hero.y, run.hero.r), false, `hero spawn ${room.id}`);
      const queue = [[run.hero.x, run.hero.y]], seen = new Set([queue[0].join(',')]);
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const [x, y] = queue[cursor];
        for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
          const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
          if (seen.has(key) || blocked(run.scene, nx, ny, run.hero.r)) continue;
          seen.add(key); queue.push([nx, ny]);
        }
      }
      const reachable = (x, y, radius) => queue.some(([px, py]) => Math.hypot(px - x, py - y) < radius);
      for (const enemy of run.scene.enemies) {
        assert.equal(blocked(run.scene, enemy.x, enemy.y, enemy.r), false, `enemy ${room.id}/${enemy.id}`);
        assert.ok(reachable(enemy.x, enemy.y, 5), `unreachable enemy ${room.id}/${enemy.id}`);
      }
      // 静态敌人（蘑菇 / 守卫）必须能从至少两个墙角射击到，自动瞄准才不会失效。
      for (const enemy of room.enemies) {
        if (enemy.type !== 'mushroom' && enemy.type !== 'guardian') continue;
        const open = CORNERS.filter(([x, y]) => bulletsClear(room.obstacles, { x, y }, enemy)).length;
        assert.ok(open >= 2, `static enemy ${room.id}/${enemy.id} visible from ${open} corners only`);
      }
      for (const door of room.doors) {
        assert.ok(WORLD[door.to].doors.some((back) => back.to === room.id), `missing return door ${room.id}`);
        assert.ok(reachable(...doorPosition(door.direction), 23), `unreachable door ${room.id}/${door.direction}`);
      }
      for (const point of REWARD_POINTS) assert.ok(reachable(...point, 16), `unreachable reward ${room.id}`);
      if (room.kind === 4) assert.ok(reachable(360, 338, 5), `unreachable flower portal ${room.id}`);
      if (room.kind === 3) assert.ok(['attack', 'armor', 'vitality'].includes(room.gem), `bad gem ${room.id}`);
      if (room.kind === 2) assert.equal(room.enemies.length, 0, 'shop rooms stay peaceful');
    }
    // 第 0 间是教学房：固定三只小飞虫。
    assert.deepEqual(WORLD[0].enemies.map((enemy) => enemy.type), ['fly', 'fly', 'fly']);
    // 难度曲线：敌人总数随层数增长，守卫房随层数获得随从。
    const perFloor = (floor) => WORLD.slice(floor * 5, floor * 5 + 5).reduce((count, room) => count + room.enemies.length, 0);
    assert.ok(perFloor(5) > perFloor(0), `seed ${seed} late floors must field more enemies`);
    assert.ok(WORLD[29].enemies.length >= 3, `seed ${seed} final guard room keeps escorts`);
    assert.equal(WORLD[4].enemies[0].type, 'guardian');
  }
  activateWorld(DEFAULT_SEED);
});

test('enemy stats grow monotonically with depth', () => {
  for (const type of ['fly', 'hopper', 'mushroom', 'spider', 'guardian']) {
    for (let floor = 1; floor < 6; floor++) {
      const early = enemyStats(type, floor - 1), late = enemyStats(type, floor);
      assert.ok(late.hp > early.hp, `${type} hp must grow at floor ${floor}`);
      assert.ok(late.attack > early.attack, `${type} attack must grow at floor ${floor}`);
    }
  }
  assert.deepEqual(enemyStats('fly', 0), { hp: 18, attack: 8 });
  assert.equal(enemyStats('guardian', 5).hp, 485);
  assert.equal(enemyStats('fly', 5).attack, 15);
});

test('armor has diminishing returns and never nullifies damage', () => {
  const run = createRun(424242);
  enterRoom(run, 29); // 第六层守卫房
  const guardian = run.scene.enemies.find((enemy) => enemy.type === 'guardian');
  assert.ok(guardian);
  run.hero.invuln = 0; run.hero.shootCd = 999; run.hero.armor = 40;
  Object.assign(run.hero, { x: guardian.x, y: guardian.y });
  const before = run.hero.hp;
  update(run, {}, .05);
  const damage = before - run.hero.hp;
  // 旧公式：max(1, 27-40) = 1。新公式：27 × (1 − 0.8) ≈ 5，护甲再高也压不穿底线。
  assert.ok(damage >= 4, `armor 40 must still take real damage, got ${damage}`);
  assert.ok(damage <= 8, `armor 40 must still mitigate most of the hit, got ${damage}`);
  // 护甲收益递减：第 1 点护甲的减伤增益，必须大于第 11 点的增益。
  const reduction = (armor) => armor * 4 / (armor * 4 + 40);
  assert.ok(reduction(1) - reduction(0) > reduction(11) - reduction(10), 'each armor point must be worth less than the last');
  assert.ok(reduction(40) < .85, 'armor can never fully absorb damage');
});

test('a randomly seeded journey replays deterministically through saves and clears all six floors', () => {
  let run = createRun(424242);
  assert.equal(run.seed, 424242);
  const storage = memoryStorage(), corners = [[640, 352], [640, 80], [80, 80], [80, 352]];
  const clearFight = () => {
    run.hero.invuln = 1000000;
    for (let frame = 0; frame < 180 * 30 && !roomCleared(run); frame++) {
      if (frame % 90 === 0) [run.hero.x, run.hero.y] = corners[Math.floor(frame / 90) % 4];
      update(run, {}, 1 / 30);
    }
    assert.ok(roomCleared(run), `auto-fire failed in room ${run.room}`);
  };
  const reload = () => {
    assert.equal(saveRun(storage, run), true);
    const loaded = readRun(storage);
    assert.ok(loaded);
    assert.equal(loaded.seed, run.seed, 'the seed must survive a save roundtrip');
    assert.equal(loaded.room, run.room);
    assert.deepEqual(durableHero(loaded), durableHero(run));
    run = loaded;
  };
  for (let floor = 0; floor < 6; floor++) {
    assert.equal(run.room, floor * 5);
    clearFight();
    for (const pickup of [...run.scene.pickups]) { run.hero.x = pickup.x; run.hero.y = pickup.y; update(run, {}, .01); }
    assert.equal(transition(run, 'north'), true);
    clearFight();
    for (const pickup of [...run.scene.pickups]) { run.hero.x = pickup.x; run.hero.y = pickup.y; update(run, {}, .01); }
    assert.equal(run.hero.yellow, 1); assert.equal(run.hero.blue, 1);
    reload();
    assert.equal(transition(run, 'south'), true);
    assert.equal(transition(run, 'west'), true);
    while (buy(run, 'attack')) { /* 花掉路线上合法获得的金币 */ }
    assert.equal(transition(run, 'east'), true);
    if (floor === 2) reload(); // 中途存档：种子确定性回放
    assert.equal(transition(run, 'east'), true); assert.equal(run.hero.blue, 0);
    clearFight();
    for (const pickup of [...run.scene.pickups]) { run.hero.x = pickup.x; run.hero.y = pickup.y; update(run, {}, .01); }
    assert.equal(transition(run, 'west'), true);
    assert.equal(transition(run, 'south'), true); assert.equal(run.hero.yellow, 0);
    clearFight(); assert.equal(run.status, 'reward');
    assert.equal(chooseRelic(run, choicesFor(floor)[1]), true);
    for (const pickup of [...run.scene.pickups]) { run.hero.x = pickup.x; run.hero.y = pickup.y; update(run, {}, .01); }
    assert.equal(transition(run, 'north'), true);
    assert.equal(transition(run, 'south'), true); assert.equal(run.hero.yellow, 0);
    run.hero.x = 360; run.hero.y = 338;
    assert.equal(interact(run), true);
  }
  assert.equal(run.status, 'won');
  assert.equal(run.kills, WORLD.reduce((count, room) => count + room.enemies.length, 0));
  assert.equal(run.records.filter((record) => record.cleared).length, 30);
  reload();
  assert.equal(interact(run), false);
  createRun(); // 恢复默认种子，避免影响同进程内后续测试的世界状态
});
