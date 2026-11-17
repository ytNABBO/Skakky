# Skakky

An interactive chess game built with HTML, CSS and JavaScript.

![Chessboard in the standard starting position](docs/preview.png)

## Features

- Legal moves, captures, check, checkmate and stalemate.
- Castling, en passant and pawn promotion.
- Automatic draws, draw claims and draw offers.
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

Resignation, chess clocks and some rare dead positions are not implemented yet.
