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
};

let state = null;
let selection = null;

// Card height comes from the laid-out stock slot rather than from parsing the
// CSS variables, so the cascade offsets follow whatever the stylesheet decided.
function metrics() {
  const cardH = el.stock.offsetHeight || 1;
  return { cardH, faceOffset: cardH * 0.26, downOffset: cardH * 0.11 };
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

function renderTableau(node, pile, index) {
  const m = metrics();
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

function render() {
  renderTop(el.stock, state.stock, { pile: 'stock' });
  renderTop(el.waste, state.waste, { pile: 'waste' });
  state.foundations.forEach((pile, i) => {
    renderTop(el.foundations[i], pile, { pile: 'foundation', index: i });
  });
  state.tableau.forEach((pile, i) => renderTableau(el.tableau[i], pile, i));
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
  const ref = refFromEvent(event);
  if (!ref) return;

  if (ref.pile === 'stock') {
    selection = null;
    doDraw();
    return;
  }

  // Double tap sends a single card home.
  const key = `${ref.pile}:${ref.index}:${ref.cardIndex}`;
  const now = Date.now();
  if (key === lastTap.key && now - lastTap.time < 350) {
    lastTap = { key: '', time: 0 };
    const next = game.autoToFoundation(state, ref);
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
let confirmingNew = false;
let confirmTimer = null;

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

function afterChange() {
  selection = null;
  syncClock();
  el.undo.disabled = undoStack.length === 0;
  el.autoFinish.hidden = !game.canAutoFinish(state);
  render();
  el.timer.textContent = fmtTime(elapsed());
  if (state.won) {
    if (!winRecorded) {
      winRecorded = true;
      onWin();
    }
  } else {
    store.saveGame(state, undoStack);
  }
}

function onWin() {
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

function undo() {
  if (undoStack.length === 0) return;
  // Undo rewinds the board but never the clock.
  const carried = elapsed();
  state = undoStack.pop();
  state.elapsedMs = carried;
  timerStart = Date.now();
  afterChange();
}

async function autoFinish() {
  const steps = game.autoFinishSteps(state);
  if (steps.length === 0) return;
  undoStack.push(state);
  el.autoFinish.disabled = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const step of steps) {
    state = step;
    render();
    if (!reduced) await new Promise((resolve) => setTimeout(resolve, 55));
  }
  el.autoFinish.disabled = false;
  afterChange();
}

function deal() {
  state = game.newGame();
  undoStack = [];
  winRecorded = false;
  el.winBanner.hidden = true;
  stats = store.recordPlayed(stats);
  store.saveStats(stats);
  startTimer();
  afterChange();
}

// Two taps to abandon a game in progress -- a modal dialog would block the
// page, and an accidental single tap should not wipe the board.
function requestNewGame() {
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
  el.statsDialog.showModal();
}

function boot() {
  stats = store.loadStats();
  renderStreak();
  const saved = store.loadGame();
  if (saved) {
    state = saved.state;
    undoStack = saved.undo;
    winRecorded = false;
    startTimer();
    afterChange();
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
el.winClose.addEventListener('click', deal);

// Pause the clock and flush the save whenever the app goes to the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopTimer();
    if (state && !state.won) store.saveGame(state, undoStack);
  } else if (state && !state.won) {
    startTimer();
    renderStreak();
  }
});

boot();
window.addEventListener('resize', () => render());
