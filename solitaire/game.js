export const SUITS = ['s', 'h', 'd', 'c'];
const RED_SUITS = new Set(['h', 'd']);

export function isRed(card) {
  return RED_SUITS.has(card.suit);
}

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ rank, suit, faceUp: false });
    }
  }
  return deck;
}

export function shuffle(deck, rng = Math.random) {
  const a = deck.map((c) => ({ ...c }));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function newGame(rng = Math.random) {
  const deck = shuffle(makeDeck(), rng);
  const tableau = [[], [], [], [], [], [], []];
  let next = 0;
  // Deal in columns: pass `col` gives one card to every pile from `col` onward,
  // which leaves pile i holding i+1 cards.
  for (let col = 0; col < 7; col++) {
    for (let pile = col; pile < 7; pile++) {
      tableau[pile].push(deck[next++]);
    }
  }
  for (const pile of tableau) {
    pile[pile.length - 1].faceUp = true;
  }
  return {
    stock: deck.slice(next),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    elapsedMs: 0,
    won: false,
  };
}

export function clone(state) {
  return {
    stock: state.stock.map((c) => ({ ...c })),
    waste: state.waste.map((c) => ({ ...c })),
    foundations: state.foundations.map((p) => p.map((c) => ({ ...c }))),
    tableau: state.tableau.map((p) => p.map((c) => ({ ...c }))),
    moves: state.moves,
    elapsedMs: state.elapsedMs,
    won: state.won,
  };
}

function pileOf(state, ref) {
  if (!ref) return null;
  if (ref.pile === 'tableau') return state.tableau[ref.index] || null;
  if (ref.pile === 'foundation') return state.foundations[ref.index] || null;
  if (ref.pile === 'waste') return state.waste;
  if (ref.pile === 'stock') return state.stock;
  return null;
}

// True when `card` may be placed on top of `onto` in the tableau.
function stacksOn(card, onto) {
  return onto.rank === card.rank + 1 && isRed(onto) !== isRed(card);
}

export function grabbed(state, from) {
  const pile = pileOf(state, from);
  if (!pile || pile.length === 0) return [];
  if (from.pile === 'stock') return [];

  if (from.pile === 'tableau') {
    const start = from.cardIndex == null ? pile.length - 1 : from.cardIndex;
    if (start < 0 || start >= pile.length) return [];
    const run = pile.slice(start);
    if (!run.every((c) => c.faceUp)) return [];
    for (let i = 0; i + 1 < run.length; i++) {
      if (!stacksOn(run[i + 1], run[i])) return [];
    }
    return run;
  }

  // Waste and foundations expose only their top card.
  return [pile[pile.length - 1]];
}

export function canMove(state, from, to) {
  const run = grabbed(state, from);
  if (run.length === 0) return false;
  if (from.pile === to.pile && from.index === to.index) return false;

  const head = run[0];

  if (to.pile === 'foundation') {
    if (run.length !== 1) return false;
    const pile = state.foundations[to.index];
    if (!pile) return false;
    if (pile.length === 0) return head.rank === 1 && SUITS.indexOf(head.suit) === to.index;
    const top = pile[pile.length - 1];
    return top.suit === head.suit && head.rank === top.rank + 1;
  }

  if (to.pile === 'tableau') {
    const pile = state.tableau[to.index];
    if (!pile) return false;
    if (pile.length === 0) return head.rank === 13;
    const top = pile[pile.length - 1];
    if (!top.faceUp) return false;
    return stacksOn(head, top);
  }

  return false;
}

export function isWon(state) {
  return state.foundations.reduce((n, p) => n + p.length, 0) === 52;
}

export function applyMove(state, from, to) {
  if (!canMove(state, from, to)) return null;
  const count = grabbed(state, from).length;
  const next = clone(state);
  const src = pileOf(next, from);
  const dst = pileOf(next, to);
  const moving = src.splice(src.length - count, count);
  for (const c of moving) {
    c.faceUp = true;
    dst.push(c);
  }
  if (from.pile === 'tableau' && src.length > 0 && !src[src.length - 1].faceUp) {
    src[src.length - 1].faceUp = true;
  }
  next.moves += 1;
  next.won = isWon(next);
  return next;
}

export function draw(state) {
  if (state.stock.length === 0 && state.waste.length === 0) return null;
  const next = clone(state);
  if (next.stock.length > 0) {
    const card = next.stock.pop();
    card.faceUp = true;
    next.waste.push(card);
  } else {
    // Unlimited redeals: pour the waste back so the original order repeats.
    while (next.waste.length > 0) {
      const card = next.waste.pop();
      card.faceUp = false;
      next.stock.push(card);
    }
  }
  next.moves += 1;
  return next;
}
