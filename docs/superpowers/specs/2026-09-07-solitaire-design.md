# Klondike Solitaire — Design

**Date:** 2026-09-07
**Status:** Approved for planning
**Location:** `solitaire/` in `Carlos-Rojas-CA.github.io`
**Live URL:** `https://carlos-rojas-ca.github.io/solitaire/`

## Purpose

A free, self-hosted Klondike Solitaire that replaces a paywalled mobile app.
It must be playable on a phone, installable to the home screen, and work
offline. It is served as static files from GitHub Pages — no backend, no
build step, no dependencies.

## Success Criteria

1. A full game of Klondike draw-1 is playable start to win on a phone in
   portrait orientation, using taps only.
2. The app can be added to the iOS/Android home screen and launches
   fullscreen with its own icon.
3. After one visit, the app loads and plays with the network disabled.
4. Closing the browser and reopening resumes the exact game in progress.
5. A daily win streak persists across sessions and decays correctly when a
   day is missed.
6. `tests.html` reports all assertions passing.

## Architecture

### File layout

```
solitaire/
  index.html            markup shell + stats panel
  app.css               layout, card styling, responsive rules
  game.js               pure rules engine — no DOM access
  ui.js                 renders state to DOM, translates taps into moves
  storage.js            localStorage persistence: saved game + stats/streak
  manifest.webmanifest  PWA metadata for Add to Home Screen
  sw.js                 service worker, cache-first, version-gated
  icons/
    icon-192.png
    icon-512.png
  tests.html            in-browser assertion runner for game.js + storage.js
```

Loaded as ES modules (`<script type="module">`). GitHub Pages serves these
with correct MIME types; no bundler is involved.

### Module boundaries

**`game.js`** — the rules engine. Exports pure functions that take a state
and return a *new* state; it never mutates and never touches the DOM. This
is what makes undo trivially correct (undo is just keeping a reference to
the previous state) and what lets the rules be tested without simulating a
browser.

**`ui.js`** — the only module that knows elements exist. It renders a state
into the DOM, owns the selection highlight, and turns tap events into calls
on `game.js`. It holds the undo stack and the timer.

**`storage.js`** — reads and writes `localStorage`. Its streak functions are
pure and take today's date as an argument so they can be tested without
mocking the clock.

Dependency direction is one-way: `ui.js` imports `game.js` and
`storage.js`; neither of those imports `ui.js`.

### State model

```js
Card  = { rank: 1..13, suit: 's'|'h'|'d'|'c', faceUp: boolean }

State = {
  stock:       Card[],      // all face-down; draw from the end
  waste:       Card[],      // all face-up; last element is on top
  foundations: Card[][],    // 4 piles, indexed s,h,d,c
  tableau:     Card[][],    // 7 piles; face-down cards precede face-up
  moves:       number,
  elapsedMs:   number,      // accumulated play time, survives reload
  won:         boolean
}
```

A pile reference used by move functions:

```js
Ref = { pile: 'tableau'|'waste'|'foundation'|'stock',
        index?: number,     // which tableau column / foundation
        cardIndex?: number }// first card of the grabbed run
```

### `game.js` public API

| Function | Returns |
|---|---|
| `newGame()` | a freshly shuffled, dealt `State` |
| `draw(state)` | `State` after stock→waste, or after redeal if stock is empty |
| `canMove(state, from, to)` | `boolean` |
| `applyMove(state, from, to)` | new `State`, or `null` if illegal |
| `autoToFoundation(state, from)` | new `State`, or `null` if no legal foundation |
| `canAutoFinish(state)` | `boolean` |
| `autoFinishSteps(state)` | `State[]` — one entry per card, for animation |
| `isWon(state)` | `boolean` |

## Game Rules — Klondike, draw-1

- Standard 52-card deck, Fisher-Yates shuffle.
- Deal 7 tableau piles of 1–7 cards; only the top card of each is face-up.
- 4 foundations build up by suit, Ace through King.
- Tableau builds down in alternating colors (red on black, black on red).
- Only a King may be placed on an empty tableau column.
- A face-up run of correctly-sequenced cards may be moved as a unit.
- Exposing a face-down tableau card flips it automatically.
- Stock deals **one** card at a time to the waste.
- **Unlimited redeals** — an exhausted stock is refilled from the waste.
- Cards may be moved back off a foundation onto the tableau.
- Win when all 52 cards are on the foundations.

## Controls — mobile-first

Tap-to-move, not drag. Drag is unreliable on touch and would need a tap
fallback regardless, so tap is the only interaction model in v1.

- **Tap a card** — selects it plus any valid run beneath it; the selection
  is highlighted.
- **Tap a destination pile** — moves if legal. If illegal but the tapped
  card is itself selectable, selection moves there instead of erroring.
- **Tap the selected card again** — deselects.
- **Double-tap a card** — sends it to a foundation if legal.
- **Tap the stock** — draws one card. Tapping an empty stock redeals.
- **Buttons** — New Game, Undo, Stats.
- **Auto-finish** — a button that appears only when `canAutoFinish` is true.

`canAutoFinish` is true as soon as **no tableau card is face-down**. Because
redeals are unlimited, every card left in the stock or waste is always
reachable at that point, so the game is already mathematically won — making
the player cycle the stock by hand first would be exactly the tedium
auto-finish exists to remove. Pressing it animates every remaining card to
its foundation, drawing from the stock as needed.

Illegal moves give a brief shake animation on the pile that was tapped, no
modal, no sound. Tapping an unplayable card shakes that card's pile; tapping
an incompatible destination while holding a selection shakes the destination.
Shaking whatever the finger landed on is the feedback that reads correctly in
both cases — the source pile is not the thing at fault when the destination
is wrong.

## Stats and the daily streak

Two `localStorage` keys:

```
solitaire.v1.game   → { state, undo: State[] }   // undo trimmed to last 50
solitaire.v1.stats  → { played, won, currentStreak, bestStreak,
                        lastWinDate: 'YYYY-MM-DD',
                        bestTimeMs, bestMoves }
```

The saved game is written after every move (debounced) so closing the tab
and returning resumes exactly where play stopped.

### Streak semantics

The streak counts **consecutive calendar days on which at least one game was
won**, in the device's local timezone. Dates are formatted `YYYY-MM-DD` from
local `getFullYear`/`getMonth`/`getDate` — never UTC, or the streak would
roll over at the wrong hour.

Recording a win (`recordWin(stats, todayStr)`):

- `lastWinDate === today` → streak unchanged (extra wins in a day don't stack)
- `lastWinDate === yesterday` → streak + 1
- otherwise → streak resets to 1
- `bestStreak` is raised to match if exceeded
- `lastWinDate` is set to today

Reading the streak for display (`currentStreak(stats, todayStr)`):

- `lastWinDate` is today or yesterday → the stored `currentStreak`
- otherwise → `0`

Display is computed lazily rather than stored, so a missed day decays the
streak the next time the app opens without needing any background timer.
`recordWin` uses this same computed value as its base, so a stale stored
streak can never be resurrected by a later win.

Starting a new game or abandoning one carries **no penalty**. Deals may be
restarted freely.

## PWA

`manifest.webmanifest` declares the name, icons, `display: standalone`,
theme colors, and `start_url: "/solitaire/"`. This yields the home-screen
icon and a fullscreen launch with no browser chrome.

`sw.js` is a cache-first service worker registered with scope `/solitaire/`.
Its cache name embeds a `CACHE_VERSION` constant. On `activate` it deletes
every cache whose name doesn't match the current version.

**The staleness hazard:** a cache-first worker will happily serve an old
build forever. `CACHE_VERSION` must be bumped in the same commit as any
change to the cached files. This is a required step in the release process,
not an optional one.

Scoping to the subfolder is deliberate — the worker controls only
`/solitaire/` and cannot affect the rest of the portfolio site.

## Layout and visual design

All sizing derives from one CSS custom property, `--card-w`, computed so
that seven tableau columns plus their gaps fit the viewport width. Every
other dimension — card height, corner radius, font size, cascade offset —
is expressed as a multiple of it, so the whole board scales from a small
phone to a desktop with one value changing.

Cards are drawn entirely in CSS: rounded rectangles with Unicode suit glyphs
(♠ ♥ ♦ ♣) and a rank in the corners. No image files, crisp at any size,
and restyling is a color change. Face-down cards get a repeating CSS
gradient back.

- Top row: 4 foundations, then stock and waste.
- Below: 7 tableau columns, face-up cards cascading with a larger offset
  than face-down ones.
- Table felt is a deep green; buttons and the selection highlight use the
  site's teal `#4aaaa5` to tie the app to the portfolio.
- Heights honor `env(safe-area-inset-*)` so the board clears a notch and the
  iOS home indicator. The board is not constrained to the viewport height: a
  long tableau column scrolls the page, which keeps every card reachable
  rather than compressing the cascade to fit.
- Landscape caps `--card-w` and centers the board rather than stretching.
- Touch targets are at least 44px in their smallest dimension.
- Animations are disabled under `prefers-reduced-motion`.

## Testing

`solitaire/tests.html` loads `game.js` and `storage.js`, runs assertions in
the browser, and prints a pass/fail list to the page. No test framework, no
runner, no npm — open the file to see results.

Coverage:

**Deck and deal** — a new game holds exactly 52 unique cards; tableau piles
hold 1–7 cards; exactly one card per tableau pile is face-up; the stock
holds 24.

**Move legality** — descending alternating color accepted, same color
rejected, wrong rank rejected; King onto empty column accepted, non-King
rejected; Ace onto empty foundation accepted, others rejected; foundation
builds ascending in suit and rejects out-of-suit or out-of-order cards;
multi-card runs move only when internally valid.

**Mechanics** — exposing a face-down card flips it; drawing moves exactly
one card; an exhausted stock redeals the full waste; `applyMove` returns a
new object and leaves the input state untouched.

**Undo** — undo after any move restores a state deep-equal to the prior one;
undo at the start of a game is a no-op.

**Win and auto-finish** — `isWon` true only with 52 cards on foundations;
`canAutoFinish` false while any tableau card is face-down, and true with a
fully face-up tableau even when the stock and waste still hold cards;
`autoFinishSteps` ends in a won state.

**Streak** — win on consecutive days increments; a second win the same day
does not; a win after a two-day gap resets to 1; display returns 0 once
`lastWinDate` is older than yesterday; `bestStreak` only ever rises; a win
following a decayed streak restarts at 1 rather than resuming the old count.

Touch behavior is verified manually on a phone: tap-select, tap-move,
double-tap to foundation, Add to Home Screen, and a plays-with-airplane-mode
check.

## Integration with the existing site

A link to `solitaire/` is added to the shared nav in `index.html`,
`portfolio.html`, and `contact.html`, styled to match the existing
list-inline nav. The game's own pages do not load Bootstrap — the board is
self-contained CSS.

## Out of scope for v1

Drag-and-drop, hints, a draw-3 toggle, limited-redeal variants, themes,
sound, scoring beyond time and move count, other solitaire variants, and any
cross-device sync. Stats are local to the browser that played the games.
