# Skakky

An interactive chess game built with HTML, CSS and JavaScript.

![Chessboard in the starting position](docs/preview.png)

## Play

Open `index.html` in a browser. Select a piece and choose a highlighted square.

The game includes legal moves, checkmate, stalemate, castling, en passant, promotion, draw claims, draw offers, resignation and optional chess clocks. Clock presets include Chess.com's popular Bullet, Blitz and Rapid controls, plus 10|5 and 15|5. The move list uses FIDE Appendix C notation.

Use **New game** to reset the board and move list.

## Tests

Node.js and no extra packages are required:

```sh
node tests/movement.cjs
node tests/clock.cjs
node tests/dead-position.cjs
node tests/forced-dead.cjs
node tests/notation.cjs
node tests/new-game.cjs
```

## Rules

Skakky follows the [FIDE Laws of Chess](https://handbook.fide.com/chapter/E012023) for the basic rules and common drawn-game cases. Physical touch-move rules, arbiter decisions and tournament-specific restrictions are not enforced.
