export const DIRECTIONS = Object.freeze({
  up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0],
});

export function parseLevel(definition) {
  const { map } = definition;
  if (!Array.isArray(map) || map.length < 3) throw new Error('Invalid map');
  const width = map[0].length;
  if (width < 3 || map.some((row) => row.length !== width)) throw new Error('Map must be rectangular');
  const walls = new Set(), goals = new Set(), boxes = [];
  let player = -1;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < width; x++) {
      const tile = map[y][x], cell = y * width + x;
      if (!'# .@$*+'.includes(tile)) throw new Error(`Unknown tile ${tile}`);
      if ((x === 0 || y === 0 || x === width - 1 || y === map.length - 1) && tile !== '#') {
        throw new Error('Map must have a closed boundary');
      }
      if (tile === '#') walls.add(cell);
      if ('.*+'.includes(tile)) goals.add(cell);
      if ('$*'.includes(tile)) boxes.push(cell);
      if ('@+'.includes(tile)) {
        if (player !== -1) throw new Error('Map needs exactly one player');
        player = cell;
      }
    }
  }
  if (player < 0 || boxes.length === 0 || boxes.length !== goals.size) throw new Error('Invalid player/box/goal count');
  return { ...definition, width, height: map.length, walls, goals,
    initial: { player, boxes: boxes.sort((a, b) => a - b), moves: 0, pushes: 0 } };
}

export function cloneState(state) {
  return { ...state, boxes: [...state.boxes] };
}

export function neighbor(level, cell, direction) {
  if (!Object.hasOwn(DIRECTIONS, direction)) return -1;
  const delta = DIRECTIONS[direction];
  if (!delta) return -1;
  const x = cell % level.width + delta[0], y = Math.floor(cell / level.width) + delta[1];
  return x < 0 || y < 0 || x >= level.width || y >= level.height ? -1 : y * level.width + x;
}

export function isWon(level, state) {
  return state.boxes.length === level.goals.size && state.boxes.every((cell) => level.goals.has(cell));
}

export function step(level, state, direction) {
  const destination = neighbor(level, state.player, direction);
  if (destination < 0 || level.walls.has(destination)) return { moved: false, pushed: false, state };
  const boxIndex = state.boxes.indexOf(destination);
  let boxes = state.boxes;
  if (boxIndex !== -1) {
    const beyond = neighbor(level, destination, direction);
    if (beyond < 0 || level.walls.has(beyond) || boxes.includes(beyond)) return { moved: false, pushed: false, state };
    boxes = boxes.map((cell, index) => index === boxIndex ? beyond : cell).sort((a, b) => a - b);
  } else boxes = [...boxes];
  return { moved: true, pushed: boxIndex !== -1,
    state: { player: destination, boxes, moves: state.moves + 1, pushes: state.pushes + (boxIndex !== -1 ? 1 : 0) } };
}

function staticCorner(level, cell) {
  if (level.goals.has(cell)) return false;
  const blocked = (dir) => {
    const next = neighbor(level, cell, dir);
    return next < 0 || level.walls.has(next);
  };
  return (blocked('up') || blocked('down')) && (blocked('left') || blocked('right'));
}

const key = (state) => `${state.player}|${state.boxes.join(',')}`;

// Breadth-first search returns a shortest sequence of walking/pushing steps.
// Runs in a Worker in the browser; no heuristic changes the game rules.
export function solve(level, start = level.initial, maxStates = 150000) {
  if (isWon(level, start)) return { status: 'solved', path: [], visited: 1 };
  if (start.boxes.some((cell) => staticCorner(level, cell))) return { status: 'impossible', path: [], visited: 0 };
  const nodes = [{ state: start, parent: -1, direction: null }];
  const visited = new Set([key(start)]);
  for (let cursor = 0; cursor < nodes.length; cursor++) {
    const current = nodes[cursor];
    for (const direction of Object.keys(DIRECTIONS)) {
      const result = step(level, current.state, direction);
      if (!result.moved || (result.pushed && result.state.boxes.some((cell) => staticCorner(level, cell)))) continue;
      const stateKey = key(result.state);
      if (visited.has(stateKey)) continue;
      if (visited.size >= maxStates) return { status: 'limit', path: [], visited: visited.size };
      visited.add(stateKey);
      const index = nodes.push({ state: result.state, parent: cursor, direction }) - 1;
      if (isWon(level, result.state)) {
        const path = [];
        for (let node = nodes[index]; node.parent !== -1; node = nodes[node.parent]) path.push(node.direction);
        return { status: 'solved', path: path.reverse(), visited: visited.size };
      }
    }
  }
  return { status: 'impossible', path: [], visited: visited.size };
}

export function walkPath(level, state, destination) {
  if (level.walls.has(destination) || state.boxes.includes(destination)) return null;
  const queue = [{ cell: state.player, path: [] }], seen = new Set([state.player]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (current.cell === destination) return current.path;
    for (const direction of Object.keys(DIRECTIONS)) {
      const cell = neighbor(level, current.cell, direction);
      if (cell < 0 || seen.has(cell) || level.walls.has(cell) || state.boxes.includes(cell)) continue;
      seen.add(cell);
      queue.push({ cell, path: [...current.path, direction] });
    }
  }
  return null;
}

export function starsFor(moves, par) {
  return moves <= par ? 3 : moves <= par + 6 ? 2 : 1;
}
