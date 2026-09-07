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
