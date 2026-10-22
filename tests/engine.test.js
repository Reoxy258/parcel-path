import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLevel, step, solve, isWon, cloneState, walkPath, starsFor } from '../src/engine.js';
import { LEVEL_DEFINITIONS } from '../src/levels.js';
import { readProgress, saveProgress, unlockedIndex } from '../src/storage.js';

test('all twelve original levels are solvable at the published optimal step count', () => {
  assert.equal(LEVEL_DEFINITIONS.length, 12);
  assert.equal(new Set(LEVEL_DEFINITIONS.map((level) => level.id)).size, 12);
  for (const definition of LEVEL_DEFINITIONS) {
    const level = parseLevel(definition), answer = solve(level);
    assert.equal(answer.status, 'solved', definition.id);
    assert.equal(answer.path.length, level.par, definition.id);
    let state = cloneState(level.initial);
    for (const direction of answer.path) {
      const result = step(level, state, direction);
      assert.ok(result.moved, `${definition.id}: solver generated an invalid move`);
      assert.ok(result.state.boxes.every((cell) => !level.walls.has(cell)));
      assert.equal(new Set(result.state.boxes).size, level.initial.boxes.length);
      state = result.state;
    }
    assert.ok(isWon(level, state), definition.id);
    assert.equal(state.moves, level.par);
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
  for (const value of ['', '{bad', 'null', JSON.stringify({ version: 2, completed: {} })]) {
    assert.equal(readProgress({ getItem: () => value }, ids).selected, ids[0]);
  }
  const broken = { getItem() { throw Error('unavailable'); }, setItem() { throw Error('quota'); } };
  assert.deepEqual(readProgress(broken, ids).completed, {});
  assert.equal(saveProgress(broken, {}), false);
  const bad = { version: 1, selected: 'unknown', muted: false, completed: {
    [ids[0]]: { moves: 2, pushes: 2, stars: 3 },
    [ids[1]]: { moves: -1, pushes: 1, stars: 4 },
  } };
  const loaded = readProgress({ getItem: () => JSON.stringify(bad) }, ids);
  assert.deepEqual(Object.keys(loaded.completed), [ids[0]]);
  assert.equal(unlockedIndex(ids, loaded.completed), 1);
  assert.equal(loaded.muted, false);
  assert.equal(loaded.selected, ids[0]);
  const locked = { version: 1, completed: {}, selected: ids.at(-1) };
  assert.equal(readProgress({ getItem: () => JSON.stringify(locked) }, ids).selected, ids[0]);
});

test('star ratings reflect exact optimal steps, not hints or time spent', () => {
  assert.equal(starsFor(10, 10), 3);
  assert.equal(starsFor(11, 10), 2);
  assert.equal(starsFor(16, 10), 2);
  assert.equal(starsFor(17, 10), 1);
});
