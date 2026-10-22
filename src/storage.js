const KEY = 'parcel-path-v2';
export function readProgress(storage, ids) {
  const fallback = { completed: {}, selected: ids[0], muted: true };
  try {
    const raw = JSON.parse(storage.getItem(KEY));
    if (raw?.version !== 2 || !raw.completed || typeof raw.completed !== 'object') {
      // The new routes have different rules; retain audio preference, not obsolete scores.
      try { fallback.muted = JSON.parse(storage.getItem('parcel-path-v1'))?.muted !== false; } catch { /* Optional. */ }
      return fallback;
    }
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
    const selected = isLevelUnlocked(ids, completed, selectedIndex) ? raw.selected : ids[0];
    return { completed, selected, muted: raw.muted !== false };
  } catch { return fallback; }
}
export function saveProgress(storage, progress) {
  try { storage.setItem(KEY, JSON.stringify({ ...progress, version: 2 })); return true; }
  catch { return false; }
}
export function unlockedIndex(ids, completed) {
  const missing = ids.findIndex((id) => !completed[id]);
  return missing === -1 ? ids.length - 1 : missing;
}

export function isLevelUnlocked(ids, completed, index) {
  if (!Number.isInteger(index) || index < 0 || index >= ids.length) return false;
  const start = Math.floor(index / 5) * 5;
  for (let i = start; i < index; i++) if (!completed[ids[i]]) return false;
  return true;
}
