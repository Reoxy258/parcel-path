import { parseLevel, solve } from './engine.js';
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, ...solve(parseLevel(data.definition), data.state) });
  } catch {
    self.postMessage({ id: data.id, status: 'error', path: [] });
  }
};
