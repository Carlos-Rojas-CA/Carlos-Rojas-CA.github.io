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
