import { section, test, assert, assertEqual, seededRng } from './test-harness.js';
import * as game from './game.js';

section('deck and deal');

test('makeDeck produces 52 unique cards', () => {
  const deck = game.makeDeck();
  assertEqual(deck.length, 52, 'deck size:');
  const keys = new Set(deck.map((c) => c.rank + c.suit));
  assertEqual(keys.size, 52, 'unique cards:');
});

test('makeDeck cards are all face down', () => {
  assert(game.makeDeck().every((c) => c.faceUp === false), 'every card face down');
});

test('shuffle preserves the multiset of cards', () => {
  const deck = game.makeDeck();
  const shuffled = game.shuffle(deck, seededRng(42));
  assertEqual(shuffled.length, 52, 'length:');
  const before = deck.map((c) => c.rank + c.suit).sort();
  const after = shuffled.map((c) => c.rank + c.suit).sort();
  assertEqual(after, before, 'same cards:');
});

test('shuffle does not mutate its input', () => {
  const deck = game.makeDeck();
  const first = deck[0].rank + deck[0].suit;
  game.shuffle(deck, seededRng(7));
  assertEqual(deck[0].rank + deck[0].suit, first, 'input unchanged:');
});

test('shuffle actually reorders', () => {
  const deck = game.makeDeck();
  const shuffled = game.shuffle(deck, seededRng(1));
  const same = deck.every((c, i) => c.rank === shuffled[i].rank && c.suit === shuffled[i].suit);
  assert(!same, 'order changed');
});

test('newGame deals 1..7 cards into seven tableau piles', () => {
  const s = game.newGame(seededRng(3));
  assertEqual(s.tableau.length, 7, 'pile count:');
  assertEqual(s.tableau.map((p) => p.length), [1, 2, 3, 4, 5, 6, 7], 'pile sizes:');
});

test('newGame leaves exactly the top card of each tableau pile face up', () => {
  const s = game.newGame(seededRng(3));
  for (const pile of s.tableau) {
    const faceUp = pile.filter((c) => c.faceUp);
    assertEqual(faceUp.length, 1, 'face-up count:');
    assert(pile[pile.length - 1].faceUp, 'top card is the face-up one');
  }
});

test('newGame puts 24 face-down cards in the stock and none elsewhere', () => {
  const s = game.newGame(seededRng(3));
  assertEqual(s.stock.length, 24, 'stock size:');
  assert(s.stock.every((c) => !c.faceUp), 'stock all face down');
  assertEqual(s.waste, [], 'waste:');
  assertEqual(s.foundations, [[], [], [], []], 'foundations:');
});

test('newGame accounts for all 52 cards exactly once', () => {
  const s = game.newGame(seededRng(9));
  const all = [...s.stock, ...s.waste, ...s.foundations.flat(), ...s.tableau.flat()];
  assertEqual(all.length, 52, 'total cards:');
  assertEqual(new Set(all.map((c) => c.rank + c.suit)).size, 52, 'unique cards:');
});

test('newGame starts with zero moves, zero elapsed, not won', () => {
  const s = game.newGame(seededRng(5));
  assertEqual(s.moves, 0, 'moves:');
  assertEqual(s.elapsedMs, 0, 'elapsed:');
  assertEqual(s.won, false, 'won:');
});

test('isRed is true for hearts and diamonds only', () => {
  assert(game.isRed({ rank: 1, suit: 'h' }), 'hearts red');
  assert(game.isRed({ rank: 1, suit: 'd' }), 'diamonds red');
  assert(!game.isRed({ rank: 1, suit: 's' }), 'spades black');
  assert(!game.isRed({ rank: 1, suit: 'c' }), 'clubs black');
});

section('move legality');

// A hand-built state is far easier to reason about than a shuffled one.
function card(rank, suit, faceUp = true) {
  return { rank, suit, faceUp };
}

function emptyState() {
  return {
    stock: [],
    waste: [],
    foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    moves: 0,
    elapsedMs: 0,
    won: false,
  };
}

test('a red card stacks on the next-higher black card', () => {
  const s = emptyState();
  s.tableau[0] = [card(8, 's')];
  s.tableau[1] = [card(7, 'h')];
  assert(
    game.canMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    '7h onto 8s'
  );
});

test('same-color stacking is rejected', () => {
  const s = emptyState();
  s.tableau[0] = [card(8, 's')];
  s.tableau[1] = [card(7, 'c')];
  assert(
    !game.canMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    '7c onto 8s rejected'
  );
});

test('wrong-rank stacking is rejected', () => {
  const s = emptyState();
  s.tableau[0] = [card(8, 's')];
  s.tableau[1] = [card(6, 'h')];
  assert(
    !game.canMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    '6h onto 8s rejected'
  );
});

test('only a King may move to an empty tableau column', () => {
  const s = emptyState();
  s.tableau[1] = [card(13, 'h')];
  s.tableau[2] = [card(12, 'h')];
  assert(
    game.canMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    'King accepted'
  );
  assert(
    !game.canMove(s, { pile: 'tableau', index: 2, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    'Queen rejected'
  );
});

test('a face-down top card cannot be stacked upon', () => {
  const s = emptyState();
  s.tableau[0] = [card(8, 's', false)];
  s.tableau[1] = [card(7, 'h')];
  assert(
    !game.canMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    'rejected'
  );
});

test('an empty foundation accepts only the Ace of its own suit', () => {
  const s = emptyState();
  s.waste = [card(1, 'h')];
  assert(game.canMove(s, { pile: 'waste' }, { pile: 'foundation', index: 1 }), 'Ah to foundation 1');
  assert(!game.canMove(s, { pile: 'waste' }, { pile: 'foundation', index: 0 }), 'Ah not to foundation 0');
  s.waste = [card(2, 'h')];
  assert(!game.canMove(s, { pile: 'waste' }, { pile: 'foundation', index: 1 }), '2h rejected on empty');
});

test('a foundation builds up in suit and rejects gaps or wrong suits', () => {
  const s = emptyState();
  s.foundations[1] = [card(1, 'h')];
  s.waste = [card(2, 'h')];
  assert(game.canMove(s, { pile: 'waste' }, { pile: 'foundation', index: 1 }), '2h onto Ah');
  s.waste = [card(3, 'h')];
  assert(!game.canMove(s, { pile: 'waste' }, { pile: 'foundation', index: 1 }), '3h rejected');
  s.waste = [card(2, 'd')];
  assert(!game.canMove(s, { pile: 'waste' }, { pile: 'foundation', index: 1 }), '2d rejected');
});

test('a multi-card run moves only when internally valid', () => {
  const s = emptyState();
  s.tableau[0] = [card(9, 'h')];
  s.tableau[1] = [card(8, 's'), card(7, 'h')];
  assert(
    game.canMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    'valid run moves'
  );
  // 7c on 8s is same-colour, so this is not a valid run and cannot be grabbed
  // from its head, even though 8s itself would be legal on 9h.
  s.tableau[1] = [card(8, 's'), card(7, 'c')];
  assertEqual(
    game.grabbed(s, { pile: 'tableau', index: 1, cardIndex: 0 }),
    [],
    'broken run is not grabbable:'
  );
  assert(
    !game.canMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    'broken run cannot move'
  );
});

test('a run containing a face-down card is not grabbable', () => {
  const s = emptyState();
  s.tableau[1] = [card(8, 's', false), card(7, 'h')];
  assertEqual(game.grabbed(s, { pile: 'tableau', index: 1, cardIndex: 0 }), [], 'not grabbable:');
  assertEqual(
    game.grabbed(s, { pile: 'tableau', index: 1, cardIndex: 1 }).length,
    1,
    'top card grabbable:'
  );
});

test('only one card at a time may go to a foundation', () => {
  const s = emptyState();
  s.foundations[0] = [card(1, 's')];
  s.tableau[1] = [card(2, 's'), card(1, 'h')];
  assert(
    !game.canMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'foundation', index: 0 }),
    'two-card run rejected'
  );
});

test('a card cannot move onto its own pile', () => {
  const s = emptyState();
  s.tableau[0] = [card(13, 's')];
  assert(
    !game.canMove(s, { pile: 'tableau', index: 0, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    'self-move rejected'
  );
});

section('move application');

test('applyMove returns a new state and leaves the original untouched', () => {
  const s = emptyState();
  s.tableau[0] = [card(8, 's')];
  s.tableau[1] = [card(7, 'h')];
  const next = game.applyMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 });
  assert(next !== s, 'new object');
  assertEqual(s.tableau[0].length, 1, 'original source untouched:');
  assertEqual(s.tableau[1].length, 1, 'original dest untouched:');
  assertEqual(next.tableau[0].length, 2, 'new dest:');
  assertEqual(next.tableau[1].length, 0, 'new source:');
});

test('applyMove increments the move counter', () => {
  const s = emptyState();
  s.tableau[0] = [card(8, 's')];
  s.tableau[1] = [card(7, 'h')];
  const next = game.applyMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 });
  assertEqual(next.moves, 1, 'moves:');
});

test('applyMove returns null for an illegal move', () => {
  const s = emptyState();
  s.tableau[0] = [card(8, 's')];
  s.tableau[1] = [card(7, 'c')];
  assertEqual(
    game.applyMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 }),
    null,
    'illegal:'
  );
});

test('exposing a face-down tableau card flips it', () => {
  const s = emptyState();
  s.tableau[0] = [card(8, 's')];
  s.tableau[1] = [card(4, 'c', false), card(7, 'h')];
  const next = game.applyMove(s, { pile: 'tableau', index: 1, cardIndex: 1 }, { pile: 'tableau', index: 0 });
  assert(next.tableau[1][0].faceUp, 'exposed card flipped');
});

test('a whole run moves as a unit', () => {
  const s = emptyState();
  s.tableau[0] = [card(9, 'h')];
  s.tableau[1] = [card(8, 's'), card(7, 'h'), card(6, 's')];
  const next = game.applyMove(s, { pile: 'tableau', index: 1, cardIndex: 0 }, { pile: 'tableau', index: 0 });
  assertEqual(next.tableau[0].map((c) => c.rank), [9, 8, 7, 6], 'destination:');
  assertEqual(next.tableau[1].length, 0, 'source emptied:');
});

test('a card can be pulled back off a foundation onto the tableau', () => {
  const s = emptyState();
  s.foundations[1] = [card(1, 'h'), card(2, 'h')];
  s.tableau[0] = [card(3, 's')];
  const next = game.applyMove(s, { pile: 'foundation', index: 1 }, { pile: 'tableau', index: 0 });
  assert(next !== null, 'move allowed');
  assertEqual(next.foundations[1].length, 1, 'foundation shrank:');
  assertEqual(next.tableau[0].map((c) => c.rank), [3, 2], 'tableau grew:');
});

section('win detection');

test('isWon is true only when all 52 cards are on foundations', () => {
  const s = emptyState();
  assert(!game.isWon(s), 'empty game not won');
  for (let i = 0; i < 4; i++) {
    s.foundations[i] = Array.from({ length: 13 }, (_, k) => card(k + 1, game.SUITS[i]));
  }
  assert(game.isWon(s), 'full foundations won');
  s.foundations[0].pop();
  assert(!game.isWon(s), '51 cards not won');
});

test('the prior state survives a move untouched, which is what undo relies on', () => {
  const s = emptyState();
  s.tableau[0] = [card(8, 's')];
  s.tableau[1] = [card(4, 'c', false), card(7, 'h')];
  const snapshot = JSON.stringify(s);
  const next = game.applyMove(s, { pile: 'tableau', index: 1, cardIndex: 1 }, { pile: 'tableau', index: 0 });
  assert(next !== null, 'move applied');
  assert(next.tableau[1][0].faceUp, 'card was flipped in the new state');
  assertEqual(JSON.stringify(s), snapshot, 'restoring the prior state is exact:');
});

test('applyMove sets won when the last card lands', () => {
  const s = emptyState();
  for (let i = 0; i < 4; i++) {
    s.foundations[i] = Array.from({ length: 13 }, (_, k) => card(k + 1, game.SUITS[i]));
  }
  s.foundations[3].pop();
  s.waste = [card(13, 'c')];
  const next = game.applyMove(s, { pile: 'waste' }, { pile: 'foundation', index: 3 });
  assert(next.won, 'won flag set');
});
