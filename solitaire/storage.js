// Pure date and streak logic. Nothing here reads the clock or the DOM --
// callers pass the date in, which is what makes the streak edge cases testable.

export function todayStr(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function previousDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return todayStr(date);
}

export function emptyStats() {
  return {
    played: 0,
    won: 0,
    currentStreak: 0,
    bestStreak: 0,
    lastWinDate: null,
    bestTimeMs: null,
    bestMoves: null,
  };
}

// The displayed streak is derived, not stored, so a missed day decays it the
// next time the app opens without needing any background timer.
export function currentStreak(stats, today) {
  if (!stats.lastWinDate) return 0;
  if (stats.lastWinDate === today || stats.lastWinDate === previousDay(today)) {
    return stats.currentStreak;
  }
  return 0;
}

export function recordWin(stats, today, timeMs, moves) {
  const live = currentStreak(stats, today);
  const next = { ...stats };
  next.won = stats.won + 1;

  if (stats.lastWinDate === today) next.currentStreak = live;
  else if (stats.lastWinDate === previousDay(today)) next.currentStreak = live + 1;
  else next.currentStreak = 1;

  next.lastWinDate = today;
  next.bestStreak = Math.max(stats.bestStreak, next.currentStreak);

  if (timeMs != null && (stats.bestTimeMs == null || timeMs < stats.bestTimeMs)) {
    next.bestTimeMs = timeMs;
  }
  if (moves != null && (stats.bestMoves == null || moves < stats.bestMoves)) {
    next.bestMoves = moves;
  }
  return next;
}

export function recordPlayed(stats) {
  return { ...stats, played: stats.played + 1 };
}

const GAME_KEY = 'solitaire.v1.game';
const STATS_KEY = 'solitaire.v1.stats';
const MAX_UNDO_SAVED = 50;

export function makeMemoryStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

let fallbackStore = null;

// Safari in private browsing exposes localStorage but throws on setItem, so we
// probe rather than feature-detect, and degrade to memory instead of crashing.
function defaultStore() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('solitaire.v1.probe', '1');
      localStorage.removeItem('solitaire.v1.probe');
      return localStorage;
    }
  } catch (e) {
    /* fall through to memory */
  }
  if (!fallbackStore) fallbackStore = makeMemoryStore();
  return fallbackStore;
}

function readJson(key, fallback, store) {
  try {
    const raw = store.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value, store) {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* quota exceeded or storage unavailable -- play continues, nothing saved */
  }
}

export function loadStats(store = defaultStore()) {
  return { ...emptyStats(), ...readJson(STATS_KEY, {}, store) };
}

export function saveStats(stats, store = defaultStore()) {
  writeJson(STATS_KEY, stats, store);
}

export function loadGame(store = defaultStore()) {
  const saved = readJson(GAME_KEY, null, store);
  if (!saved || !saved.state) return null;
  return { state: saved.state, undo: saved.undo || [] };
}

export function saveGame(state, undo, store = defaultStore()) {
  writeJson(GAME_KEY, { state, undo: undo.slice(-MAX_UNDO_SAVED) }, store);
}

export function clearGame(store = defaultStore()) {
  try {
    store.removeItem(GAME_KEY);
  } catch (e) {
    /* nothing to do */
  }
}
