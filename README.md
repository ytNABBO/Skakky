# Skakky

An interactive chess game built with HTML, CSS and JavaScript.

![Chessboard in the standard starting position](docs/preview.png)

## Features

- Legal moves, captures, check, checkmate and stalemate.
- Castling, en passant and pawn promotion.
- Automatic draws, draw claims, draw offers and resignation.
- Responsive board with keyboard support.

## Play

Open `index.html` in a browser. Select a piece and choose a highlighted square. Reload the page to start a new game.

## Tests

Run `node tests/movement.cjs` with Node.js. No extra packages are required.

## Project files

- `index.html` — page structure.
- `style.css` — board and controls.
- `script.js` — chess rules and gameplay.
- `tests/movement.cjs` — movement and game-rule tests.

## Rules and remaining work

Rules are checked against the [FIDE Laws of Chess](https://handbook.fide.com/chapter/E012023), especially Articles 3, 5 and 9. This is a local browser game, not a tournament arbiter.

Resignation requires confirmation; cancellation or Escape keeps the game active. Under Article 5.1.2, resignation is a draw when the opponent cannot checkmate. Material checks cover a bare king, a lone knight against only a king or a king and queens, and positions containing only kings and bishops on one square color. Two knights can give mate with cooperation and do not automatically imply a draw.

Remaining work:

- Detect dead positions and impossible mates that depend on legal move sequences, including blocked pawn structures. Current automatic draws and resignation checks use material only and do not fully implement these exceptional cases.
- Add chess clocks with the same impossible-mate exception for time forfeits (Article 6.9).

Piece selection and cancellable move dialogs are interface conveniences; physical touch-move rules, arbiter penalties and tournament-specific draw restrictions are not enforced.
