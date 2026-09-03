const KEY = 'vehiclecheck.recent';
const LIMIT = 8;

export function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r?.rc === 'string') : [];
  } catch {
    return [];
  }
}

export function addRecent(rc, label) {
  try {
    const next = [{ rc, label }, ...readRecent().filter((r) => r.rc !== rc)].slice(0, LIMIT);
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    return readRecent();
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  return [];
}
