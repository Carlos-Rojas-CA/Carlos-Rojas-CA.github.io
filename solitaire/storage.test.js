import { section, test, assert, assertEqual } from './test-harness.js';
import * as store from './storage.js';

section('dates');

test('todayStr formats a local date with zero padding', () => {
  assertEqual(store.todayStr(new Date(2026, 0, 5)), '2026-01-05', 'january:');
  assertEqual(store.todayStr(new Date(2026, 11, 25)), '2026-12-25', 'december:');
});

test('previousDay steps back one day', () => {
  assertEqual(store.previousDay('2026-09-07'), '2026-09-06', 'mid-month:');
});

test('previousDay crosses a month boundary', () => {
  assertEqual(store.previousDay('2026-03-01'), '2026-02-28', 'march to february:');
});

test('previousDay crosses a year boundary', () => {
  assertEqual(store.previousDay('2026-01-01'), '2025-12-31', 'new year:');
});

section('daily streak');

test('a fresh stats object has no streak', () => {
  assertEqual(store.currentStreak(store.emptyStats(), '2026-09-07'), 0, 'streak:');
});

test('currentStreak returns the stored value when the last win was today', () => {
  const s = { ...store.emptyStats(), currentStreak: 4, lastWinDate: '2026-09-07' };
  assertEqual(store.currentStreak(s, '2026-09-07'), 4, 'streak:');
});

test('currentStreak returns the stored value when the last win was yesterday', () => {
  const s = { ...store.emptyStats(), currentStreak: 4, lastWinDate: '2026-09-06' };
  assertEqual(store.currentStreak(s, '2026-09-07'), 4, 'streak:');
});

test('currentStreak decays to zero once a whole day is missed', () => {
  const s = { ...store.emptyStats(), currentStreak: 9, lastWinDate: '2026-09-05' };
  assertEqual(store.currentStreak(s, '2026-09-07'), 0, 'streak:');
});

test('the first ever win starts the streak at 1', () => {
  const next = store.recordWin(store.emptyStats(), '2026-09-07', 60000, 100);
  assertEqual(next.currentStreak, 1, 'streak:');
  assertEqual(next.lastWinDate, '2026-09-07', 'last win:');
});

test('a win on the next day increments the streak', () => {
  const s = { ...store.emptyStats(), currentStreak: 3, bestStreak: 3, lastWinDate: '2026-09-06' };
  assertEqual(store.recordWin(s, '2026-09-07', 1, 1).currentStreak, 4, 'streak:');
});

test('a second win on the same day does not increment the streak', () => {
  const s = { ...store.emptyStats(), currentStreak: 3, bestStreak: 3, lastWinDate: '2026-09-07' };
  const next = store.recordWin(s, '2026-09-07', 1, 1);
  assertEqual(next.currentStreak, 3, 'streak:');
  assertEqual(next.won, 1, 'wins still counted:');
});

test('a win after a gap restarts the streak at 1', () => {
  const s = { ...store.emptyStats(), currentStreak: 8, bestStreak: 8, lastWinDate: '2026-09-01' };
  assertEqual(store.recordWin(s, '2026-09-07', 1, 1).currentStreak, 1, 'streak:');
});

test('a stale stored streak cannot be resurrected by a later win', () => {
  // The stored value says 8, but it decayed days ago; the new win must start over.
  const s = { ...store.emptyStats(), currentStreak: 8, bestStreak: 8, lastWinDate: '2026-08-20' };
  const next = store.recordWin(s, '2026-09-07', 1, 1);
  assertEqual(next.currentStreak, 1, 'streak:');
  assertEqual(next.bestStreak, 8, 'best preserved:');
});

test('bestStreak only ever rises', () => {
  let s = { ...store.emptyStats(), currentStreak: 2, bestStreak: 7, lastWinDate: '2026-09-06' };
  s = store.recordWin(s, '2026-09-07', 1, 1);
  assertEqual(s.bestStreak, 7, 'unchanged:');
  s = { ...store.emptyStats(), currentStreak: 7, bestStreak: 7, lastWinDate: '2026-09-06' };
  s = store.recordWin(s, '2026-09-07', 1, 1);
  assertEqual(s.bestStreak, 8, 'raised:');
});

test('recordWin counts the win and tracks personal bests', () => {
  let s = store.recordWin(store.emptyStats(), '2026-09-07', 90000, 150);
  assertEqual(s.won, 1, 'wins:');
  assertEqual(s.bestTimeMs, 90000, 'best time:');
  assertEqual(s.bestMoves, 150, 'best moves:');
  s = store.recordWin(s, '2026-09-08', 120000, 120);
  assertEqual(s.bestTimeMs, 90000, 'slower time ignored:');
  assertEqual(s.bestMoves, 120, 'fewer moves recorded:');
});

test('recordWin does not mutate its input', () => {
  const s = store.emptyStats();
  const before = JSON.stringify(s);
  store.recordWin(s, '2026-09-07', 1, 1);
  assertEqual(JSON.stringify(s), before, 'unchanged:');
});

test('recordPlayed increments the games-played count', () => {
  assertEqual(store.recordPlayed(store.emptyStats()).played, 1, 'played:');
});
