import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, step, solve, isWon, isDelivered, isBlocked, cloneState, walkPath, starsFor } from '../src/engine.js';
import { LEVEL_DEFINITIONS, CHAPTERS } from '../src/levels.js';
import { readProgress, saveProgress, unlockedIndex, isLevelUnlocked } from '../src/storage.js';

test('all 30 distinct mechanism levels replay to victory at the published shortest count', () => {
  assert.equal(LEVEL_DEFINITIONS.length, 30);
  assert.equal(CHAPTERS.length, 6);
  assert.equal(new Set(LEVEL_DEFINITIONS.map((level) => level.id)).size, 30);
  assert.equal(new Set(LEVEL_DEFINITIONS.map((level) => level.map.join('\n'))).size, 30);
  for (const definition of LEVEL_DEFINITIONS) {
    const level = parseLevel(definition), answer = solve(level);
    assert.equal(answer.status, 'solved', definition.id);
    assert.equal(answer.path.length, level.par, definition.id);
    let state = cloneState(level.initial), teleports = 0, switches = 0;
    for (const direction of answer.path) {
      const result = step(level, state, direction);
      assert.ok(result.moved, `${definition.id}: solver generated an invalid move`);
      assert.ok(result.state.boxes.every((cell) => !level.walls.has(cell)));
      assert.equal(new Set(result.state.boxes).size, level.initial.boxes.length);
      assert.ok(!result.state.boxes.includes(result.state.player));
      assert.deepEqual(result.state.colors, level.initial.colors);
      teleports += result.teleported; switches += result.switched;
      state = result.state;
    }
    assert.ok(isWon(level, state), definition.id);
    assert.equal(state.moves, level.par);
    if (level.mechanics.includes('portal')) assert.ok(teleports > 0, `${definition.id}: portal must affect the solution`);
    if (level.mechanics.includes('switch')) assert.ok(switches > 0, `${definition.id}: switch must affect the solution`);
  }
});

test('walking, pushing and blocked moves preserve state and counters correctly', () => {
  const level = parseLevel(LEVEL_DEFINITIONS[0]);
  const original = cloneState(level.initial);
  const pushed = step(level, level.initial, 'right');
  assert.equal(pushed.state.moves, 1);
  assert.equal(pushed.state.pushes, 1);
  assert.deepEqual(level.initial, original);
  const won = step(level, pushed.state, 'right');
  assert.ok(isWon(level, won.state));
  assert.equal(step(level, won.state, 'right').moved, false);
  assert.deepEqual(step(level, original, 'unknown').state, original);
  for (const direction of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.equal(step(level, original, direction).moved, false);
    assert.deepEqual(step(level, original, direction).state, original);
  }
  const walked = step(level, original, 'left');
  assert.equal(walked.state.pushes, 0);
  assert.equal(step(level, walked.state, 'left').moved, false);
  // Walking away cannot pull a box.
  assert.deepEqual(step(level, pushed.state, 'left').state.boxes, pushed.state.boxes);
});

test('boxes cannot be pushed through one another or walls', () => {
  const level = parseLevel({ map: ['#######', '#@$$..#', '#######'] });
  assert.equal(step(level, level.initial, 'right').moved, false);
  assert.equal(step(level, level.initial, 'up').moved, false);
});

test('corner deadlocks and search limits are reported without false solutions', () => {
  const dead = parseLevel({ map: ['######', '#$@ .#', '#    #', '######'] });
  assert.equal(solve(dead).status, 'impossible');
  const level = parseLevel(LEVEL_DEFINITIONS[0]);
  assert.equal(solve(level, level.initial, 1).status, 'limit');
  let state = level.initial;
  for (const direction of solve(level).path) state = step(level, state, direction).state;
  assert.deepEqual(solve(level, state).path, []);
});

test('tap-to-walk paths never move parcels and do not cross obstacles', () => {
  const level = parseLevel(LEVEL_DEFINITIONS[2]);
  const target = level.width + 4;
  const path = walkPath(level, level.initial, target);
  assert.ok(path);
  let state = level.initial;
  for (const direction of path) {
    const result = step(level, state, direction);
    assert.ok(result.moved && !result.pushed);
    state = result.state;
  }
  assert.equal(state.player, target);
  assert.equal(walkPath(level, level.initial, level.initial.boxes[0]), null);
});

test('malformed levels fail fast rather than entering the renderer', () => {
  for (const map of [[], ['###', '##', '###'], ['###', '#@#', '###'], ['###', '#?#', '###'], ['###', '#@@', '###']]) {
    assert.throws(() => parseLevel({ map }));
  }
});

test('corrupt or unavailable storage cannot prevent play', () => {
  const ids = LEVEL_DEFINITIONS.map((level) => level.id);
  for (const value of ['', '{bad', 'null', JSON.stringify({ version: 3, completed: {} })]) {
    assert.equal(readProgress({ getItem: () => value }, ids).selected, ids[0]);
  }
  const broken = { getItem() { throw Error('unavailable'); }, setItem() { throw Error('quota'); } };
  assert.deepEqual(readProgress(broken, ids).completed, {});
  assert.equal(saveProgress(broken, {}), false);
  const bad = { version: 2, selected: 'unknown', muted: false, completed: {
    [ids[0]]: { moves: 2, pushes: 2, stars: 3 },
    [ids[1]]: { moves: -1, pushes: 1, stars: 4 },
  } };
  const loaded = readProgress({ getItem: () => JSON.stringify(bad) }, ids);
  assert.deepEqual(Object.keys(loaded.completed), [ids[0]]);
  assert.equal(unlockedIndex(ids, loaded.completed), 1);
  assert.equal(loaded.muted, false);
  assert.equal(loaded.selected, ids[0]);
  const locked = { version: 2, completed: {}, selected: ids.at(-1) };
  assert.equal(readProgress({ getItem: () => JSON.stringify(locked) }, ids).selected, ids[0]);
});

test('a parcel on the wrong colored stamp is not delivered, and identity survives movement', () => {
  const level = parseLevel(LEVEL_DEFINITIONS[1]);
  const stamps = [...level.goals];
  const wrong = { ...cloneState(level.initial), boxes: stamps };
  assert.equal(isWon(level, wrong), false);
  assert.equal(isDelivered(level, wrong, stamps[0]), false);
  const right = { ...wrong, boxes: [...stamps].reverse() };
  assert.equal(isWon(level, right), true);
  const move = step(parseLevel(LEVEL_DEFINITIONS[0]), parseLevel(LEVEL_DEFINITIONS[0]).initial, 'right');
  assert.deepEqual(move.state.colors, ['rose']);
});

test('portal entry is atomic, preserves parcel color and fires once per move', () => {
  const level = parseLevel(LEVEL_DEFINITIONS[5]);
  const entry = level.initial.boxes[0] + 1;
  const exit = level.portals.get(entry);
  const first = step(level, level.initial, 'right');
  assert.ok(first.pushed && first.teleported);
  assert.equal(first.state.boxes[0], exit);
  assert.equal(first.state.player, level.initial.boxes[0]);
  assert.equal(first.state.moves, 1);
  const blocked = cloneState(level.initial);
  blocked.boxes[0] = exit; blocked.player = entry - 1;
  const before = cloneState(blocked);
  const refused = step(level, blocked, 'right');
  assert.equal(refused.moved, false);
  assert.equal(refused.state, blocked);
  assert.deepEqual(blocked, before);
  const away = step(level, { ...blocked, player: exit }, 'down');
  assert.equal(away.teleported, false);
});

test('day and moon gates alternate; only the courier switches them; undo clones phase', () => {
  const level = parseLevel(LEVEL_DEFINITIONS[13]);
  const day = [...level.gates].find((c) => level.gatePhases.get(c));
  const moon = [...level.gates].find((c) => !level.gatePhases.get(c));
  assert.equal(isBlocked(level, level.initial, day), true);
  assert.equal(isBlocked(level, level.initial, moon), false);
  let state = cloneState(level.initial), snapshots = [], flips = 0;
  for (const direction of solve(level).path) {
    snapshots.push(cloneState(state));
    const result = step(level, state, direction); state = result.state; flips += result.switched;
    assert.equal(isBlocked(level, state, day), !state.phase);
    assert.equal(isBlocked(level, state, moon), state.phase);
  }
  assert.equal(flips, 2);
  while (snapshots.length) state = snapshots.pop();
  assert.deepEqual(state, level.initial);
  const boxSwitch = parseLevel({ map: ['########', '#@$s .g#', '#      #', '########'] });
  const pushed = step(boxSwitch, boxSwitch.initial, 'right');
  assert.equal(pushed.state.phase, false);
  assert.equal(pushed.switched, false);
  const gates = [...level.gates];
  for (const gate of gates) {
    const onClosedGate = { ...cloneState(level.initial), player: gate, phase: !level.gatePhases.get(gate) };
    assert.equal(step(level, onClosedGate, 'right').moved, true);
  }
  const onClosedBridge = { ...cloneState(level.initial), boxes: [day], player: day - 1, phase: false };
  assert.equal(step(level, onClosedBridge, 'right').moved, false);
});

test('relay challenge requires repeated switching on its verified shortest solution', () => {
  const level = parseLevel(LEVEL_DEFINITIONS[24]);
  assert.equal(level.name, '日月之间的接力');
  let state = level.initial, flips = 0;
  for (const direction of solve(level).path) {
    const result = step(level, state, direction); state = result.state; flips += result.switched;
  }
  assert.equal(flips, 6);
  assert.equal(state.moves, 44);
  assert.ok(isWon(level, state));
});

test('walking paths simulate portals and toggles without pushing a parcel', () => {
  for (const index of [5, 6, 13, 24, 28]) {
    const level = parseLevel(LEVEL_DEFINITIONS[index]);
    for (let cell = 0; cell < level.width * level.height; cell++) {
      const path = walkPath(level, level.initial, cell);
      if (!path) continue;
      let state = cloneState(level.initial);
      for (const direction of path) {
        const move = step(level, state, direction);
        assert.ok(move.moved && !move.pushed);
        state = move.state;
      }
      assert.equal(state.player, cell);
      assert.deepEqual(state.boxes, level.initial.boxes);
    }
    assert.equal(walkPath(level, level.initial, -1), null);
    assert.equal(walkPath(level, level.initial, level.width * level.height), null);
  }
});

test('six chapter introductions are open; later stops need the whole chapter prefix', () => {
  const ids = LEVEL_DEFINITIONS.map((level) => level.id);
  for (let index = 0; index < ids.length; index++) assert.equal(isLevelUnlocked(ids, {}, index), index % 5 === 0);
  const completed = { [ids[0]]: {}, [ids[6]]: {} };
  assert.equal(isLevelUnlocked(ids, completed, 1), true);
  assert.equal(isLevelUnlocked(ids, completed, 7), false);
  assert.equal(isLevelUnlocked(ids, completed, -1), false);
  assert.equal(isLevelUnlocked(ids, completed, 30), false);
  const record = { version: 2, completed: {}, selected: ids[25], muted: true };
  assert.equal(readProgress({ getItem: () => JSON.stringify(record) }, ids).selected, ids[25]);
});

test('v1 audio preference migrates without accepting scores from different rules', () => {
  const ids = LEVEL_DEFINITIONS.map((level) => level.id);
  const legacy = { version: 1, completed: { [ids[0]]: { moves: 2, pushes: 2, stars: 3 } }, muted: false };
  const memory = new Map([['parcel-path-v1', JSON.stringify(legacy)]]);
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  const progress = readProgress(storage, ids);
  assert.deepEqual(progress.completed, {});
  assert.equal(progress.muted, false);
  assert.equal(saveProgress(storage, progress), true);
  assert.equal(JSON.parse(memory.get('parcel-path-v2')).version, 2);
  assert.equal(JSON.parse(memory.get('parcel-path-v1')).version, 1);
});

test('unpaired portals, mismatched colors and gates without switches fail early', () => {
  for (const map of [
    ['#######', '#@R b1#', '#######'],
    ['#######', '#@$ .1#', '#######'],
    ['#######', '#@$g .#', '#######'],
  ]) assert.throws(() => parseLevel({ map }));
});

test('star ratings reflect exact optimal steps, not hints or time spent', () => {
  assert.equal(starsFor(10, 10), 3);
  assert.equal(starsFor(11, 10), 2);
  assert.equal(starsFor(16, 10), 2);
  assert.equal(starsFor(17, 10), 1);
});
