// Tiny localStorage cache so the FC portal stays usable offline. Each entry is
// stored with a timestamp so the UI can show how fresh the data is.
const PREFIX = 'mjm.cache.';

export function cacheSet(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch (e) {
    /* storage full / unavailable */
  }
}

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw); // { at, value }
  } catch (e) {
    return null;
  }
}
