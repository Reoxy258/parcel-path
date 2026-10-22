import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, ROOM_COUNT, choicesFor, doorPosition } from '../src/world.js';
import {
  SAVE_KEY, createRun, enterRoom, blocked, moveActor, transition, interact,
  update, roomCleared, chooseRelic, shopItems, buy, revive, usePotion,
  saveRun, readRun,
} from '../src/adventure.js';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const durableHero = (run) => Object.fromEntries(
  ['hp', 'maxHp', 'attack', 'armor', 'coins', 'yellow', 'blue', 'potions'].map((key) => [key, run.hero[key]]),
);

// Fixtures isolate progression from player skill. Damage still goes through the
// production projectile, kill, drop and clear handlers; this is not a balance test.
function fixtureDefeatEnemies(run) {
  run.hero.invuln = 1000;
  for (const enemy of run.scene.enemies) {
    run.scene.bullets.push({ owner: 'hero', x: enemy.x, y: enemy.y,
      vx: 0, vy: 0, r: 4, damage: 1000000, ttl: 1, pierce: 0, hits: [] });
  }
  update(run, {}, .01);
  assert.ok(roomCleared(run));
}

function fixtureCollectPickups(run) {
  for (const pickup of [...run.scene.pickups]) {
    run.hero.x = pickup.x;
    run.hero.y = pickup.y;
    update(run, {}, .01);
  }
}

test('all 30 rooms connect hero, ground monsters, rewards and usable door approaches', () => {
  assert.equal(WORLD.length, 30);
  assert.equal(ROOM_COUNT, 30);
  for (let floor = 0; floor < 6; floor++) {
    assert.deepEqual(WORLD.filter((room) => room.floor === floor).map((room) => room.kind), [0, 1, 2, 3, 4]);
  }
  for (const room of WORLD) {
    const run = createRun();
    enterRoom(run, room.id);
    assert.equal(blocked(run.scene, run.hero.x, run.hero.y, run.hero.r), false, `hero in room ${room.id}`);
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
    for (const door of room.doors) {
      assert.ok(WORLD[door.to].doors.some((back) => back.to === room.id), `missing return door ${room.id}`);
      assert.ok(reachable(...doorPosition(door.direction), 23), `unreachable door ${room.id}/${door.direction}`);
    }
    for (const point of [[326, 216], [394, 216], [360, 255], [360, 216], [410, 216], [310, 216]]) {
      assert.ok(reachable(...point, 16), `unreachable reward ${room.id}/${point}`);
    }
    if (room.kind === 4) assert.ok(reachable(360, 338, 5), `unreachable flower portal ${room.id}`);
  }
});

test('real auto-fire clears all six floors; keys, rewards and save boundaries do not soft-lock the route', () => {
  let run = createRun();
  const storage = memoryStorage(), corners = [[640, 352], [640, 80], [80, 80], [80, 352]];
  // Real enemies and normal weapon stats are retained. Long invulnerability and
  // periodic placement only make this deterministic enough to test progression.
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
    assert.equal(loaded.room, run.room);
    assert.equal(loaded.status, run.status);
    assert.deepEqual(durableHero(loaded), durableHero(run));
    assert.deepEqual(loaded.opened, run.opened);
    assert.deepEqual(loaded.relics, run.relics);
    const normalize = (records) => records.map((record) => ({ ...record,
      destroyed: [...record.destroyed].sort(), claimed: [...record.claimed].sort() }));
    assert.deepEqual(normalize(loaded.records), normalize(run.records));
    run = loaded;
  };
  for (let floor = 0; floor < 6; floor++) {
    assert.equal(run.room, floor * 5);
    clearFight(); fixtureCollectPickups(run);
    assert.equal(transition(run, 'south'), false, 'yellow gate must stay locked without a key');
    assert.equal(transition(run, 'east'), false, 'blue gate must stay locked without a key');
    assert.equal(transition(run, 'north'), true);
    clearFight(); fixtureCollectPickups(run);
    assert.equal(run.hero.yellow, 1); assert.equal(run.hero.blue, 1); reload();
    assert.equal(transition(run, 'south'), true);
    assert.equal(transition(run, 'west'), true);
    while (buy(run, 'attack')) { /* Spend only legitimately collected coins. */ }
    assert.equal(transition(run, 'east'), true);
    assert.equal(transition(run, 'east'), true); assert.equal(run.hero.blue, 0);
    clearFight(); fixtureCollectPickups(run); reload();
    assert.equal(transition(run, 'west'), true);
    assert.equal(transition(run, 'east'), true); assert.equal(run.hero.blue, 0);
    fixtureCollectPickups(run);
    assert.equal(transition(run, 'west'), true);
    assert.equal(transition(run, 'south'), true); assert.equal(run.hero.yellow, 0);
    clearFight(); assert.equal(run.status, 'reward'); reload();
    const choice = choicesFor(floor)[1];
    assert.equal(chooseRelic(run, 'invalid'), false);
    assert.equal(chooseRelic(run, choice), true);
    assert.equal(chooseRelic(run, choice), false);
    fixtureCollectPickups(run);
    assert.equal(transition(run, 'north'), true);
    assert.equal(transition(run, 'south'), true); assert.equal(run.hero.yellow, 0); reload();
    run.hero.x = 360; run.hero.y = 338;
    assert.equal(interact(run), true);
  }
  assert.equal(run.kills, WORLD.reduce((count, room) => count + room.enemies.length, 0));
  assert.equal(run.records.filter((record) => record.cleared).length, 30);
  assert.equal(run.status, 'won'); reload();
  assert.equal(interact(run), false);
});

test('enemy drops, keys, vault gems and clear rewards cannot be collected twice on re-entry', () => {
  for (const room of WORLD) {
    const run = createRun(); enterRoom(run, room.id); fixtureDefeatEnemies(run);
    if (run.status === 'reward') chooseRelic(run, choicesFor(room.floor)[0]);
    fixtureCollectPickups(run);
    const before = durableHero(run), claimed = [...run.records[room.id].claimed];
    enterRoom(run, room.id); fixtureCollectPickups(run);
    assert.deepEqual(durableHero(run), before, `repeat loot in room ${room.id}`);
    assert.deepEqual(run.records[room.id].claimed, claimed);
  }
});

test('all shop item limits survive saving; invalid purchases never spend coins', () => {
  for (let floor = 0; floor < 6; floor++) {
    const run = createRun(); enterRoom(run, floor * 5 + 2); run.hero.coins = 9999;
    assert.equal(buy(run, 'not-an-item'), false); assert.equal(run.hero.coins, 9999);
    for (const item of shopItems(run)) {
      const coins = run.hero.coins;
      for (let count = 0; count < item.max; count++) assert.equal(buy(run, item.id), true);
      assert.equal(run.hero.coins, coins - item.cost * item.max);
      const hero = durableHero(run);
      assert.equal(buy(run, item.id), false); assert.deepEqual(durableHero(run), hero);
    }
    const storage = memoryStorage(); saveRun(storage, run);
    const loaded = readRun(storage);
    for (const item of shopItems(loaded)) assert.equal(buy(loaded, item.id), false);
  }
  const outside = createRun(); outside.hero.coins = 9999;
  assert.equal(buy(outside, 'attack'), false);
});

test('each guardian requires its one allowed relic choice before the flower portal opens', () => {
  for (let floor = 0; floor < 6; floor++) {
    const run = createRun(); enterRoom(run, floor * 5 + 4);
    run.hero.x = 360; run.hero.y = 338;
    assert.equal(interact(run), false);
    fixtureDefeatEnemies(run);
    assert.equal(run.status, 'reward');
    assert.equal(interact(run), false); assert.equal(transition(run, 'north'), false);
    const storage = memoryStorage(); saveRun(storage, run);
    const loaded = readRun(storage);
    assert.equal(loaded.status, 'reward'); assert.equal(loaded.pendingReward, floor);
    const choice = choicesFor(floor)[0];
    assert.equal(chooseRelic(loaded, 'invalid'), false);
    assert.equal(chooseRelic(loaded, choice), true);
    const hero = durableHero(loaded);
    assert.equal(chooseRelic(loaded, choice), false); assert.deepEqual(durableHero(loaded), hero);
    assert.equal(loaded.records[floor * 5 + 4].rewardChosen, true);
  }
});

test('contact respects armor and invulnerability; death and revival preserve durable progress', () => {
  const contact = createRun(); contact.hero.invuln = 0; contact.hero.shootCd = 999;
  contact.scene.enemies = [contact.scene.enemies[0]];
  Object.assign(contact.scene.enemies[0], { x: contact.hero.x, y: contact.hero.y });
  update(contact, {}, .05);
  assert.equal(contact.hero.hp, 113, 'fly attack 8 minus starting armor 1');
  update(contact, {}, .05); assert.equal(contact.hero.hp, 113, 'same contact cannot immediately hit again');

  const run = createRun();
  Object.assign(run.hero, { hp: 1, invuln: 0, shootCd: 999, coins: 101, yellow: 2, blue: 1 });
  run.opened = ['0-4']; run.records[0].cleared = true;
  run.scene.enemies = [run.scene.enemies[0]];
  Object.assign(run.scene.enemies[0], { x: run.hero.x, y: run.hero.y });
  update(run, {}, .05); assert.equal(run.status, 'dead'); assert.equal(run.hero.hp, 0);
  const storage = memoryStorage(); saveRun(storage, run);
  const loaded = readRun(storage); assert.equal(loaded.status, 'dead');
  assert.equal(revive(loaded), true); assert.equal(loaded.status, 'playing');
  assert.equal(loaded.hero.hp, loaded.hero.maxHp); assert.equal(loaded.hero.coins, 80);
  assert.equal(loaded.hero.yellow, 2); assert.equal(loaded.hero.blue, 1);
  assert.deepEqual(loaded.opened, ['0-4']); assert.equal(loaded.records[0].cleared, true);
  assert.equal(loaded.deaths, 1); assert.equal(revive(loaded), false);
});

test('potions only spend when useful and cannot revive a dead hero', () => {
  const run = createRun(); assert.equal(usePotion(run), false); assert.equal(run.hero.potions, 2);
  run.hero.hp = 100; assert.equal(usePotion(run), true); assert.equal(run.hero.hp, 120);
  assert.equal(run.hero.potions, 1);
  run.hero.hp = 0; run.status = 'dead'; assert.equal(usePotion(run), false);
  assert.equal(run.hero.potions, 1);
});

test('large ground movement cannot tunnel through crates; flies can cross them', () => {
  const run = createRun(), crate = run.scene.obstacles.find((obstacle) => obstacle.type === 'crate');
  const actor = { x: crate.x - 20, y: crate.y + 20, r: 12 };
  moveActor(run.scene, actor, 200, 0);
  assert.ok(actor.x <= crate.x - actor.r);
  const fly = { x: crate.x - 20, y: crate.y + 20, r: 12 };
  moveActor(run.scene, fly, 200, 0, true); assert.ok(fly.x > crate.x + crate.w);
  moveActor(run.scene, fly, 10000, 0, true); assert.ok(fly.x + fly.r <= 698);
});

test('destroyed crates persist and grant only one collectible coin', () => {
  const run = createRun(), crate = run.scene.obstacles.find((obstacle) => obstacle.type === 'crate');
  run.hero.invuln = 1000; run.hero.shootCd = 1000;
  for (let shot = 0; shot < 3; shot++) {
    run.scene.bullets.push({ owner: 'hero', x: crate.x + 1, y: crate.y + 20,
      vx: 0, vy: 0, r: 4, damage: 10, ttl: 1, pierce: 0, hits: [] });
    update(run, {}, .01);
  }
  assert.ok(crate.hp <= 0);
  assert.equal(run.records[0].destroyed.filter((id) => id === crate.id).length, 1);
  assert.equal(run.scene.pickups.filter((pickup) => pickup.id === `${crate.id}-coin`).length, 1);
  fixtureCollectPickups(run);
  const coins = run.hero.coins;
  const storage = memoryStorage(); saveRun(storage, run);
  const loaded = readRun(storage);
  assert.ok(loaded.scene.obstacles.find((obstacle) => obstacle.id === crate.id).hp <= 0);
  fixtureCollectPickups(loaded); assert.equal(loaded.hero.coins, coins);
});

test('a cleared room still allows manual shots and automatically shoots a visible crate', () => {
  const manual = createRun(); enterRoom(manual, 2);
  manual.hero.shootCd = 0;
  update(manual, { aim: { x: 500, y: 216 } }, .01);
  assert.equal(manual.scene.enemies.length, 0);
  assert.equal(manual.scene.bullets.filter((bullet) => bullet.owner === 'hero').length, 1);

  const automatic = createRun();
  automatic.scene.enemies = []; automatic.records[0].cleared = true;
  Object.assign(automatic.hero, { x: 160, y: 120, shootCd: 0 });
  const crate = automatic.scene.obstacles.find((obstacle) => obstacle.id === 'o0');
  assert.equal(crate.type, 'crate');
  for (let frame = 0; frame < 120 && crate.hp > 0; frame++) update(automatic, {}, 1 / 60);
  assert.ok(crate.hp <= 0, 'target crate must not block its own line of sight');
  assert.ok(automatic.records[0].destroyed.includes(crate.id));
  assert.equal(automatic.scene.pickups.filter((pickup) => pickup.id === `${crate.id}-coin`).length, 1);
});

test('each of the three obtainable twin relics adds a projectile, including the third upgrade', () => {
  const run = createRun();
  for (const [index, floor] of [0, 2, 4].entries()) {
    enterRoom(run, floor * 5 + 4); fixtureDefeatEnemies(run);
    assert.equal(chooseRelic(run, 'twin'), true);
    assert.equal(run.relics.twin, index + 1);
    enterRoom(run, floor * 5 + 2); run.hero.shootCd = 0;
    update(run, { aim: { x: 500, y: 216 } }, .01);
    const volley = run.scene.bullets.filter((bullet) => bullet.owner === 'hero');
    assert.equal(volley.length, [2, 3, 4][index]);
    assert.equal(new Set(volley.map((bullet) => Math.atan2(bullet.vy, bullet.vx))).size, volley.length);
    assert.ok(volley.every((bullet) => Math.abs(bullet.damage - 7.8) < 1e-9));
  }
});

test('clearing the final enemy removes hostile bullets before post-combat looting', () => {
  const run = createRun();
  run.scene.bullets.push({ owner: 'enemy', x: 80, y: 80, vx: 50, vy: 0,
    r: 5, damage: 30, ttl: 3, pierce: 0, hits: [] });
  fixtureDefeatEnemies(run);
  assert.equal(run.scene.enemies.length, 0); assert.equal(roomCleared(run), true);
  assert.equal(run.scene.bullets.some((bullet) => bullet.owner === 'enemy'), false);
});

test('a lethal spike on the last-enemy frame cannot be overwritten by guardian rewards', () => {
  const run = createRun(); enterRoom(run, 14);
  Object.assign(run.hero, { x: 264, y: 120, hp: 1, invuln: 0 });
  run.time = 2.2;
  run.scene.enemies = [];
  update(run, {}, 1 / 60);
  assert.equal(run.status, 'dead');
  assert.equal(run.hero.hp, 0);
  assert.equal(run.pendingReward, null);
  assert.equal(run.records[14].cleared, false);
});

test('missing, corrupt, obsolete and out-of-range saves fail safely', () => {
  const storage = memoryStorage();
  const invalid = [null, {}, [], { version: 2 },
    { version: 3, room: -1, records: Array(30).fill({}) },
    { version: 3, room: 30, records: Array(30).fill({}) },
    { version: 3, room: 0, records: [] }];
  for (const value of invalid) { storage.setItem(SAVE_KEY, JSON.stringify(value)); assert.equal(readRun(storage), null); }
  for (const value of ['', '{bad', 'undefined']) { storage.setItem(SAVE_KEY, value); assert.equal(readRun(storage), null); }
  assert.equal(readRun({ getItem() { throw Error('unavailable'); } }), null);
  assert.equal(saveRun({ setItem() { throw Error('quota'); } }, createRun()), false);
});
