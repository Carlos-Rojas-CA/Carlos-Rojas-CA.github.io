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
