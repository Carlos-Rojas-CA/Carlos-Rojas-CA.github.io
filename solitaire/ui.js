import * as game from './game.js';
import * as store from './storage.js';

const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
const NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

const el = {
  board: document.getElementById('board'),
  stock: document.querySelector('[data-pile="stock"]'),
  waste: document.querySelector('[data-pile="waste"]'),
  foundations: [...document.querySelectorAll('[data-pile="foundation"]')],
  tableau: [...document.querySelectorAll('[data-pile="tableau"]')],
  newGame: document.getElementById('new-game'),
  undo: document.getElementById('undo'),
  autoFinish: document.getElementById('auto-finish'),
  timer: document.getElementById('timer'),
  moves: document.getElementById('moves'),
  streak: document.getElementById('streak'),
  statsBtn: document.getElementById('stats-btn'),
  statsDialog: document.getElementById('stats-dialog'),
  statsClose: document.getElementById('stats-close'),
  winBanner: document.getElementById('win-banner'),
  winSummary: document.getElementById('win-summary'),
  winClose: document.getElementById('win-close'),
  updatePill: document.getElementById('update-pill'),
  checkUpdate: document.getElementById('check-update'),
  updateStatus: document.getElementById('update-status'),
};

let state = null;
let selection = null;

const FACE_RATIO = 0.26;
const DOWN_RATIO = 0.11;
// Fixed spread. This is deliberately NOT adaptive: sizing the cascades to the
// free space meant every move that changed a pile's height re-flowed the whole
// board, and cards visibly drifted into the gap. A constant keeps every card
// still unless it was actually played. 1.5 is the largest value where even a
// 19-card pile still fits a phone screen without scrolling, and it still turns
// an 18px tap strip into 27px.
const SPREAD = 1.5;
// How long a card takes to travel to its new pile. Tune here -- this is the
// one number that controls how the game feels when you play a card.
const MOVE_MS = 280;

// Card height comes from the laid-out stock slot rather than from parsing the
// CSS variables, so the cascade offsets follow whatever the stylesheet decided.
function metrics() {
  const cardH = el.stock.offsetHeight || 1;
  return {
    cardH,
    faceOffset: cardH * FACE_RATIO * SPREAD,
    downOffset: cardH * DOWN_RATIO * SPREAD,
  };
}

function label(card) {
  return (RANK_LABEL[card.rank] || String(card.rank)) + GLYPH[card.suit];
}

function cardEl(card, ref) {
  const node = document.createElement('div');
  node.className = card.faceUp ? 'card' : 'card down';
  node.dataset.pile = ref.pile;
  if (ref.index != null) node.dataset.index = String(ref.index);
  if (ref.cardIndex != null) node.dataset.cardIndex = String(ref.cardIndex);
  if (card.faceUp) {
    node.dataset.color = game.isRed(card) ? 'red' : 'black';
    // Identity key for the move animation. Only face-up cards get one --
    // keying a face-down card would leak its identity into the DOM.
    node.dataset.key = `${card.rank}${card.suit}`;
    const text = label(card);
    node.innerHTML =
      `<span class="corner tl">${text}</span>` +
      `<span class="pip">${GLYPH[card.suit]}</span>` +
      `<span class="corner br">${text}</span>`;
    node.setAttribute('aria-label', `${RANK_LABEL[card.rank] || card.rank} of ${NAME[card.suit]}`);
  } else {
    node.setAttribute('aria-label', 'face down card');
  }
  return node;
}

function sameRef(a, b) {
  return !!a && !!b && a.pile === b.pile && a.index === b.index && a.cardIndex === b.cardIndex;
}

// Stock, waste and foundations only ever show their top card.
function renderTop(node, pile, ref) {
  node.textContent = '';
  if (pile.length === 0) return;
  const card = pile[pile.length - 1];
  const cardRef = { ...ref, cardIndex: pile.length - 1 };
  const child = cardEl(card, cardRef);
  if (sameRef(selection, cardRef) || sameRef(selection, ref)) child.classList.add('selected');
  node.appendChild(child);
}

function renderTableau(node, pile, index, m) {
  node.textContent = '';
  let top = 0;
  let selectedFrom = Infinity;
  if (selection && selection.pile === 'tableau' && selection.index === index) {
    selectedFrom = selection.cardIndex;
  }
  pile.forEach((card, i) => {
    const child = cardEl(card, { pile: 'tableau', index, cardIndex: i });
    child.style.top = `${top}px`;
    if (i >= selectedFrom) child.classList.add('selected');
    node.appendChild(child);
    top += card.faceUp ? m.faceOffset : m.downOffset;
  });
  const lastOffset = pile.length ? top - (pile[pile.length - 1].faceUp ? m.faceOffset : m.downOffset) : 0;
  node.style.height = `${Math.max(m.cardH, lastOffset + m.cardH)}px`;
}

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// FLIP: record where every face-up card is, let render() rebuild the board,
// then transform each moved card back to where it was and release it. The
// cards slide to their new homes instead of teleporting.
function snapshot() {
  const seen = new Map();
  if (reducedMotion()) return seen;
  for (const node of el.board.querySelectorAll('.card[data-key]')) {
    const box = node.getBoundingClientRect();
    seen.set(node.dataset.key, { x: box.left, y: box.top });
  }
  return seen;
}

function playMoves(before, duration = MOVE_MS) {
  if (before.size === 0) return;

  // Read every position first, then write. Interleaving a style write with the
  // next card's getBoundingClientRect forces a synchronous layout per card --
  // 52 of them per move instead of one.
  const flights = [];
  for (const node of el.board.querySelectorAll('.card[data-key]')) {
    const was = before.get(node.dataset.key);
    if (!was) continue;
    const box = node.getBoundingClientRect();
    const dx = was.x - box.left;
    const dy = was.y - box.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    flights.push({ node, dx, dy });
  }
  if (flights.length === 0) return;

  for (const { node, dx, dy } of flights) {
    node.style.transition = 'none';
    node.style.transform = `translate(${dx}px, ${dy}px)`;
    node.style.zIndex = '40';        // fly above the piles it crosses
    node.style.willChange = 'transform';  // only for the ~140ms it is moving
  }
  requestAnimationFrame(() => {
    for (const { node } of flights) {
      node.style.transition = `transform ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
      node.style.transform = '';
      // Hand the layer back once the card has landed.
      node.addEventListener(
        'transitionend',
        () => {
          node.style.willChange = '';
          node.style.transition = '';
          node.style.zIndex = '';
        },
        { once: true }
      );
    }
  });
}

// Re-render, animating any card that changed position.
function renderAnimated(duration = MOVE_MS) {
  const before = snapshot();
  render();
  playMoves(before, duration);
}

function render() {
  renderTop(el.stock, state.stock, { pile: 'stock' });
  renderTop(el.waste, state.waste, { pile: 'waste' });
  state.foundations.forEach((pile, i) => {
    renderTop(el.foundations[i], pile, { pile: 'foundation', index: i });
  });
  // One measurement for the whole board: metrics() reads offsetHeight, and
  // calling it per column forced a synchronous layout seven times per render.
  const m = metrics();
  state.tableau.forEach((pile, i) => renderTableau(el.tableau[i], pile, i, m));
  el.moves.textContent = String(state.moves);
}

let undoStack = [];
let lastTap = { key: '', time: 0 };

function refFromEvent(event) {
  const cardNode = event.target.closest('.card');
  if (cardNode) {
    return {
      pile: cardNode.dataset.pile,
      index: cardNode.dataset.index != null ? Number(cardNode.dataset.index) : undefined,
      cardIndex: cardNode.dataset.cardIndex != null ? Number(cardNode.dataset.cardIndex) : undefined,
    };
  }
  const pileNode = event.target.closest('.pile');
  if (pileNode) {
    return {
      pile: pileNode.dataset.pile,
      index: pileNode.dataset.index != null ? Number(pileNode.dataset.index) : undefined,
    };
  }
  return null;
}

function shake(ref) {
  const node =
    ref.pile === 'tableau' ? el.tableau[ref.index]
    : ref.pile === 'foundation' ? el.foundations[ref.index]
    : ref.pile === 'waste' ? el.waste
    : el.stock;
  if (!node) return;
  node.classList.remove('shake');
  void node.offsetWidth; // restart the animation
  node.classList.add('shake');
}

function commit(next) {
  // First move of the game starts the clock.
  if (!clockStarted) {
    clockStarted = true;
    startTimer();
  }
  undoStack.push(state);
  if (undoStack.length > 200) undoStack.shift();
  state = next;
  afterChange();
}

function doDraw() {
  const next = game.draw(state);
  if (next) commit(next);
  else shake({ pile: 'stock' });
}

function onBoardClick(event) {
  if (animating) return;
  const ref = refFromEvent(event);
  if (!ref) return;

  if (ref.pile === 'stock') {
    selection = null;
    doDraw();
    return;
  }

  // Double tap plays the card without dragging it anywhere.
  const key = `${ref.pile}:${ref.index}:${ref.cardIndex}`;
  const now = Date.now();
  if (key === lastTap.key && now - lastTap.time < 350) {
    lastTap = { key: '', time: 0 };
    const next = smartMove(ref);
    if (next) {
      commit(next);
      return;
    }
  }
  lastTap = { key, time: now };

  if (selection) {
    const next = game.applyMove(state, selection, { pile: ref.pile, index: ref.index });
    if (next) {
      commit(next);
      return;
    }
    if (sameRef(selection, ref)) {
      selection = null;
      render();
      return;
    }
  }

  if (game.grabbed(state, ref).length > 0) {
    selection = ref;
    render();
  } else {
    selection = null;
    render();
    shake(ref);
  }
}

let stats = store.emptyStats();
let timerStart = null;
let tickHandle = null;
let winRecorded = false;
// The clock does not run until the first move, so a board can sit untouched
// without accruing time.
let clockStarted = false;
let animating = false;
let confirmingNew = false;
let confirmTimer = null;
let saveHandle = null;

function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function elapsed() {
  return state.elapsedMs + (timerStart == null ? 0 : Date.now() - timerStart);
}

// Fold the time since the last tick into the state so whatever we persist is
// always current.
function syncClock() {
  if (timerStart != null) {
    state.elapsedMs += Date.now() - timerStart;
    timerStart = Date.now();
  }
}

// Restart the clock only if this game's clock has actually begun, is not
// finished, the app is in the foreground, and no dialog is covering the board.
function resumeTimer() {
  if (!clockStarted) return;
  if (!state || state.won) return;
  if (document.hidden) return;
  if (el.statsDialog.open) return;
  startTimer();
}

function startTimer() {
  timerStart = Date.now();
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    el.timer.textContent = fmtTime(elapsed());
  }, 500);
}

function stopTimer() {
  syncClock();
  timerStart = null;
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function renderStreak() {
  el.streak.textContent = `\u{1F525} ${store.currentStreak(stats, store.todayStr())}`;
}

// The saved game runs to ~100KB with its undo tail, and localStorage writes
// are synchronous. Coalesce bursts of taps into one write rather than paying
// that cost per card.
function scheduleSave() {
  if (saveHandle !== null) clearTimeout(saveHandle);
  saveHandle = setTimeout(() => {
    saveHandle = null;
    store.saveGame(state, undoStack);
  }, 250);
}

// Anything that must not lose the last move -- backgrounding, a win -- flushes.
function flushSave() {
  if (saveHandle !== null) {
    clearTimeout(saveHandle);
    saveHandle = null;
  }
  store.saveGame(state, undoStack);
}

function afterChange() {
  selection = null;
  syncClock();
  el.undo.disabled = undoStack.length === 0 || state.won;
  el.autoFinish.hidden = state.won || !game.canAutoFinish(state);
  renderAnimated();
  el.timer.textContent = fmtTime(elapsed());
  if (state.won) {
    if (!winRecorded) {
      winRecorded = true;
      onWin();
    }
  } else {
    scheduleSave();
  }
}

function onWin() {
  if (saveHandle !== null) { clearTimeout(saveHandle); saveHandle = null; }
  stopTimer();
  const today = store.todayStr();
  stats = store.recordWin(stats, today, state.elapsedMs, state.moves);
  store.saveStats(stats);
  store.clearGame();
  renderStreak();
  el.winSummary.textContent =
    `${fmtTime(state.elapsedMs)} · ${state.moves} moves · ` +
    `streak ${store.currentStreak(stats, today)}`;
  el.winBanner.hidden = false;
}

// Which tableau column a given card was sent to last, so repeated double taps
// walk it around its options instead of parking it on the first one.
let cycle = { key: '', index: 0 };

// Double tap: send the card home if it can go, otherwise drop it on a column it
// legally fits. A card with two homes -- a red 4 with a black 5 either side --
// alternates between them on repeated taps.
function smartMove(ref) {
  const run = game.grabbed(state, ref);
  if (run.length === 0) return null;

  // Foundations win outright: finishing beats rearranging. A multi-card run
  // cannot go home, so autoToFoundation declines it and we fall through.
  const home = game.autoToFoundation(state, ref);
  if (home) {
    cycle = { key: '', index: 0 };
    return home;
  }

  // Moving a whole column onto another empty column is legal but achieves
  // nothing, and it makes double-tapping a lone King shuffle it around the
  // board. Skip those.
  const movingWholeColumn =
    ref.pile === 'tableau' && (ref.cardIndex == null || ref.cardIndex === 0);

  const targets = [];
  for (let i = 0; i < el.tableau.length; i++) {
    if (ref.pile === 'tableau' && ref.index === i) continue;
    if (movingWholeColumn && state.tableau[i].length === 0) continue;
    if (game.canMove(state, ref, { pile: 'tableau', index: i })) targets.push(i);
  }
  if (targets.length === 0) return null;

  // Identity of the run's head, so the rotation follows the card rather than
  // the position it happens to occupy.
  const id = `${run[0].rank}${run[0].suit}`;
  const index = cycle.key === id ? (cycle.index + 1) % targets.length : 0;
  cycle = { key: id, index };
  return game.applyMove(state, ref, { pile: 'tableau', index: targets[index] });
}

function undo() {
  if (animating) return;
  if (undoStack.length === 0) return;
  // Undo rewinds the board but never the clock.
  const carried = elapsed();
  state = undoStack.pop();
  state.elapsedMs = carried;
  timerStart = Date.now();
  afterChange();
}

async function autoFinish() {
  if (animating) return;
  const steps = game.autoFinishSteps(state);
  if (steps.length === 0) return;
  undoStack.push(state);
  animating = true;
  el.autoFinish.disabled = true;
  selection = null;
  try {
    const reduced = reducedMotion();
    // Each step re-renders, which replaces the flying card's node -- so a
    // card's flight is capped at the step delay. Keep the win cascade brisk
    // (52 cards) rather than using the full MOVE_MS.
    const stepMs = 120;
    for (const step of steps) {
      state = step;
      if (reduced) render();
      else renderAnimated(stepMs);
      if (!reduced) await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
  } finally {
    animating = false;
    el.autoFinish.disabled = false;
  }
  afterChange();
}

function deal() {
  // Stop the clock BEFORE swapping the state in: stopTimer folds the time
  // since the last tick into `state`, and doing that after the swap charged
  // the new game for the previous one's seconds.
  stopTimer();
  clockStarted = false;

  state = game.newGame();
  undoStack = [];
  winRecorded = false;
  cycle = { key: '', index: 0 };
  el.winBanner.hidden = true;
  stats = store.recordPlayed(stats);
  store.saveStats(stats);
  el.timer.textContent = fmtTime(0);
  afterChange();
}

// Two taps to abandon a game in progress -- a modal dialog would block the
// page, and an accidental single tap should not wipe the board.
function requestNewGame() {
  if (animating) return;
  if (state && !state.won && state.moves > 0 && !confirmingNew) {
    confirmingNew = true;
    el.newGame.textContent = 'Sure?';
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      confirmingNew = false;
      el.newGame.textContent = 'New';
    }, 3000);
    return;
  }
  clearTimeout(confirmTimer);
  confirmingNew = false;
  el.newGame.textContent = 'New';
  deal();
}

function showStats() {
  const today = store.todayStr();
  const set = (id, value) => {
    document.getElementById(id).textContent = value;
  };
  set('stat-streak', String(store.currentStreak(stats, today)));
  set('stat-best-streak', String(stats.bestStreak));
  set('stat-won', String(stats.won));
  set('stat-played', String(stats.played));
  set('stat-rate', stats.played ? `${Math.round((stats.won / stats.played) * 100)}%` : '—');
  set('stat-time', stats.bestTimeMs == null ? '—' : fmtTime(stats.bestTimeMs));
  set('stat-moves', stats.bestMoves == null ? '—' : String(stats.bestMoves));
  // Reading your stats should not cost you time.
  stopTimer();
  el.statsDialog.showModal();
}

function boot() {
  stats = store.loadStats();
  renderStreak();
  const saved = store.loadGame();
  if (saved) {
    try {
      state = saved.state;
      undoStack = saved.undo;
      winRecorded = false;
      // A saved game with moves on it was already being timed.
      clockStarted = state.moves > 0 || state.elapsedMs > 0;
      resumeTimer();
      afterChange();
    } catch (e) {
      // A structurally corrupt save must not take the app down with it.
      store.clearGame();
      deal();
    }
  } else {
    deal();
  }
}

el.board.addEventListener('click', onBoardClick);
el.undo.addEventListener('click', undo);
el.newGame.addEventListener('click', requestNewGame);
el.autoFinish.addEventListener('click', autoFinish);
el.statsBtn.addEventListener('click', showStats);
el.statsClose.addEventListener('click', () => el.statsDialog.close());
// Fires for the Close button and for Esc alike.
el.statsDialog.addEventListener('close', resumeTimer);
el.winClose.addEventListener('click', deal);

// Pause the clock and flush the save whenever the app goes to the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTimer();
    if (state && !state.won) flushSave();
  } else if (state && !state.won) {
    resumeTimer();
    renderStreak();
  }
});

boot();
window.addEventListener('resize', () => render());

// --- staying up to date -------------------------------------------------
//
// The service worker is cache-first so the game works offline, which means an
// installed device will happily serve an old build forever. Rather than rely on
// remembering to bump CACHE_VERSION and hoping the phone notices, the app asks
// for a fresh copy on every launch and offers a reload when one lands.

let swRegistration = null;

function showUpdatePill() {
  el.updatePill.hidden = false;
}

// A new worker taking control means new files are cached; the open page is
// still running the old ones, so it needs a reload to pick them up.
function watchForUpdate(reg) {
  if (!reg) return;
  if (reg.waiting) showUpdatePill();
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // controller check: on a first-ever install there is nothing to replace.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdatePill();
      }
    });
  });
}

async function checkForUpdate() {
  if (!swRegistration) {
    el.updateStatus.textContent = 'Offline support is not active in this browser.';
    return;
  }
  el.updateStatus.textContent = 'Checking\u2026';
  el.checkUpdate.disabled = true;
  try {
    await swRegistration.update();
    // update() resolves once the check is done; an update that was found is
    // reported by the updatefound listener above.
    el.updateStatus.textContent = el.updatePill.hidden
      ? 'You have the latest version.'
      : 'Update ready \u2014 tap Reload.';
  } catch (e) {
    el.updateStatus.textContent = 'Could not check right now.';
  } finally {
    el.checkUpdate.disabled = false;
  }
}

el.updatePill.addEventListener('click', () => {
  // Flush the in-progress game first: reloading must not cost the player moves.
  if (state && !state.won) flushSave();
  location.reload();
});
el.checkUpdate.addEventListener('click', checkForUpdate);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        swRegistration = reg;
        watchForUpdate(reg);
        return reg.update().catch(() => {});
      })
      .catch(() => {
        /* offline support is optional; the game works without it */
      });
  });
}
