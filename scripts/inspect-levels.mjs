import { parseLevel, solve } from '../src/engine.js';
import { LEVEL_DEFINITIONS } from '../src/levels.js';
for (const definition of LEVEL_DEFINITIONS) {
  const result = solve(parseLevel(definition));
  console.log(definition.id, result.status, result.path.length, result.visited, result.path.join(','));
}
