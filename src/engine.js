export const DIRECTIONS = Object.freeze({
  up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0],
});

export const COLOR_NAMES = { plain: '普通', rose: '花朵', mint: '叶子' };

export function parseLevel(definition) {
  const { map } = definition;
  if (!Array.isArray(map) || map.length < 3) throw new Error('Invalid map');
  const width = map[0].length;
  if (width < 3 || map.some((row) => row.length !== width)) throw new Error('Map must be rectangular');
  const walls = new Set(), goals = new Set(), goalColors = new Map();
  const boxes = [], colors = [], switches = new Set(), gates = new Set(), gatePhases = new Map(), portalGroups = new Map();
  let player = -1;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < width; x++) {
      const tile = map[y][x], cell = y * width + x;
      if (!'# .@$*+RBrbsgh123456789'.includes(tile)) throw new Error(`Unknown tile ${tile}`);
      if ((x === 0 || y === 0 || x === width - 1 || y === map.length - 1) && tile !== '#') {
        throw new Error('Map must have a closed boundary');
      }
      if (tile === '#') walls.add(cell);
      if ('.*+rb'.includes(tile)) {
        goals.add(cell); goalColors.set(cell, tile === 'r' ? 'rose' : tile === 'b' ? 'mint' : 'plain');
      }
      if ('$*RB'.includes(tile)) {
        boxes.push(cell); colors.push(tile === 'R' ? 'rose' : tile === 'B' ? 'mint' : 'plain');
      }
      if (tile === 's') switches.add(cell);
      if ('gh'.includes(tile)) { gates.add(cell); gatePhases.set(cell, tile === 'g'); }
      if (/[1-9]/.test(tile)) {
        if (!portalGroups.has(tile)) portalGroups.set(tile, []);
        portalGroups.get(tile).push(cell);
      }
      if ('@+'.includes(tile)) {
        if (player !== -1) throw new Error('Map needs exactly one player');
        player = cell;
      }
    }
  }
  if (player < 0 || boxes.length === 0 || boxes.length !== goals.size) throw new Error('Invalid player/box/goal count');
  for (const color of Object.keys(COLOR_NAMES)) {
    if (colors.filter((c) => c === color).length !== [...goalColors.values()].filter((c) => c === color).length) {
      throw new Error('Parcel colors must match the available stamps');
    }
  }
  if (gates.size && !switches.size) throw new Error('Gate needs a switch');
  const portals = new Map(), portalLabels = new Map();
  for (const [label, cells] of portalGroups) {
    if (cells.length !== 2) throw new Error('Portals must be paired');
    portals.set(cells[0], cells[1]); portals.set(cells[1], cells[0]);
    cells.forEach((cell) => portalLabels.set(cell, label));
  }
  return { ...definition, width, height: map.length, walls, goals, goalColors, switches, gates, gatePhases, portals, portalLabels,
    initial: { player, boxes, colors, phase: false, moves: 0, pushes: 0 } };
}

export function cloneState(state) {
  return { ...state, boxes: [...state.boxes], colors: [...state.colors] };
}

export function neighbor(level, cell, direction) {
  if (!Object.hasOwn(DIRECTIONS, direction)) return -1;
  const delta = DIRECTIONS[direction];
  const x = cell % level.width + delta[0], y = Math.floor(cell / level.width) + delta[1];
  return x < 0 || y < 0 || x >= level.width || y >= level.height ? -1 : y * level.width + x;
}

export function isDelivered(level, state, cell) {
  const box = state.boxes.indexOf(cell);
  return box !== -1 && level.goals.has(cell) && level.goalColors.get(cell) === state.colors[box];
}

export function isWon(level, state) {
  return state.boxes.length === level.goals.size && state.boxes.every((cell) => isDelivered(level, state, cell));
}

export function isBlocked(level, state, cell) {
  return cell < 0 || cell >= level.width * level.height || level.walls.has(cell) || (level.gates.has(cell) && state.phase !== level.gatePhases.get(cell));
}

export function step(level, state, direction) {
  const no = { moved: false, pushed: false, teleported: false, switched: false, state };
  const destination = neighbor(level, state.player, direction);
  if (isBlocked(level, state, destination)) return no;
  const boxIndex = state.boxes.indexOf(destination);
  const boxes = [...state.boxes];
  let teleported = false;
  if (boxIndex !== -1) {
    const entry = neighbor(level, destination, direction);
    if (isBlocked(level, state, entry) || boxes.includes(entry)) return no;
    const exit = level.portals.get(entry) ?? entry;
    // An occupied exit blocks entry, even if that occupant would otherwise move this turn.
    if (isBlocked(level, state, exit) || boxes.includes(exit) || exit === state.player) return no;
    boxes[boxIndex] = exit;
    teleported = entry !== exit;
  }
  const player = level.portals.get(destination) ?? destination;
  if (isBlocked(level, state, player) || boxes.includes(player)) return no;
  teleported ||= player !== destination;
  const switched = level.switches.has(player);
  return { moved: true, pushed: boxIndex !== -1, teleported, switched,
    state: { player, boxes, colors: [...state.colors], phase: switched ? !state.phase : state.phase,
      moves: state.moves + 1, pushes: state.pushes + (boxIndex !== -1 ? 1 : 0) } };
}

function staticCorner(level, cell) {
  if (level.goals.has(cell)) return false;
  const blocked = (dir) => {
    const next = neighbor(level, cell, dir);
    return next < 0 || level.walls.has(next);
  };
  return (blocked('up') || blocked('down')) && (blocked('left') || blocked('right'));
}

const key = (state) => `${state.player}|${state.phase ? 1 : 0}|${state.boxes.map((cell, i) => `${state.colors[i]}:${cell}`).sort().join(',')}`;

// Exact BFS uses the same atomic movement as play, including color identity and switch state.
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

// Walking simulates switches and portals too; a geometric path alone is no longer safe.
export function walkPath(level, state, destination) {
  if (destination < 0 || destination >= level.width * level.height || level.walls.has(destination) || state.boxes.includes(destination)) return null;
  const queue = [{ state, path: [] }], seen = new Set([`${state.player}|${state.phase}`]);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (current.state.player === destination) return current.path;
    for (const direction of Object.keys(DIRECTIONS)) {
      const result = step(level, current.state, direction);
      if (!result.moved || result.pushed) continue;
      const stateKey = `${result.state.player}|${result.state.phase}`;
      if (seen.has(stateKey)) continue;
      seen.add(stateKey);
      queue.push({ state: result.state, path: [...current.path, direction] });
    }
  }
  return null;
}

export function starsFor(moves, par) {
  return moves <= par ? 3 : moves <= par + 6 ? 2 : 1;
}
