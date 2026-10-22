const KEY = 'parcel-path-v1';
export function readProgress(storage, ids) {
  const fallback = { completed: {}, selected: ids[0], muted: true };
  try {
    const raw = JSON.parse(storage.getItem(KEY));
    if (raw?.version !== 1 || !raw.completed || typeof raw.completed !== 'object') return fallback;
    const completed = {};
    for (const id of ids) {
      const record = raw.completed[id];
      if (record && Number.isSafeInteger(record.moves) && record.moves > 0 &&
        Number.isSafeInteger(record.pushes) && record.pushes >= 0 && record.pushes <= record.moves &&
        Number.isInteger(record.stars) && record.stars >= 1 && record.stars <= 3) {
        completed[id] = { moves: record.moves, pushes: record.pushes, stars: record.stars };
      }
    }
    const selectedIndex = ids.indexOf(raw.selected);
    const selected = selectedIndex >= 0 && selectedIndex <= unlockedIndex(ids, completed) ? raw.selected : ids[0];
    return { completed, selected, muted: raw.muted !== false };
  } catch { return fallback; }
}
export function saveProgress(storage, progress) {
  try { storage.setItem(KEY, JSON.stringify({ ...progress, version: 1 })); return true; }
  catch { return false; }
}
export function unlockedIndex(ids, completed) {
  const missing = ids.findIndex((id) => !completed[id]);
  return missing === -1 ? ids.length - 1 : missing;
}
