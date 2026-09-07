import * as game from './game.js';

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

function boot() {
  state = game.newGame();
  render();
}

boot();
window.addEventListener('resize', () => render());
