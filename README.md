# Skakky

An interactive chess game built with HTML, CSS and JavaScript.

![Chessboard in the standard starting position](docs/preview.png)

## Features

- Legal moves, captures, check, checkmate and stalemate.
- Castling, en passant and pawn promotion.
- Automatic draws, draw claims, draw offers and resignation.
- Dead-position draws for proven pawn blockades, including confined bishops and knights.
- Optional chess clocks with Fischer increments and time-forfeit results.
- Responsive board with keyboard support.

## Play

Open `index.html` in a browser. Select a piece and choose a highlighted square. Reload the page to start a new game.

Games are untimed by default. Before the first move, choose 3 minutes + 2 seconds per move, 5 minutes, or 10 minutes + 5 seconds per move and press **Start clock**. White's time starts immediately. Each completed legal move switches the clock automatically and adds the increment. The time control locks when the clock starts or the first untimed move is played.

The clock continues while selecting a promotion, confirming resignation or preparing a draw claim. A valid confirmed claim stops play; preparation can be cancelled. All game results stop both clocks. A player who runs out of time loses unless the opponent cannot checkmate under the material checks described below. Time uses elapsed timestamps, so delayed updates in background tabs do not pause the clock.

## Tests

Run `node tests/movement.cjs`, `node tests/clock.cjs` and `node tests/dead-position.cjs` with Node.js. No extra packages are required.

## Project files

- `index.html` — page structure.
- `style.css` — board and controls.
- `script.js` — chess rules and gameplay.
- `tests/movement.cjs` — movement and game-rule tests.
- `tests/clock.cjs` — deterministic clock and timed-game tests.
- `tests/dead-position.cjs` — pawn, bishop and knight blockade proofs and dead-position tests.

## Development workflow

Keep code, interface text, documentation and commit messages in English. Complete one focused commit at a time, run the relevant checks and push each completed commit.

## Rules and remaining work

Rules are checked against the [FIDE Laws of Chess](https://handbook.fide.com/chapter/E012023), especially Articles 3, 5, 6 and 9. This is a local browser game, not a tournament arbiter.

Resignation requires confirmation; cancellation or Escape keeps the game active. Under Article 5.1.2, resignation is a draw when the opponent cannot checkmate. Material checks cover a bare king, a lone knight against only a king or a king and queens, and positions containing only kings and bishops on one square color. Two knights can give mate with cooperation and do not automatically imply a draw.

Automatic dead-position draws also cover kings-and-pawns positions where every pawn is blocked by a pawn, no pawn captures are available and neither king can ever reach an enemy pawn. This proves that neither side can create checkmate (Article 5.2.2), even though both kings can still move. A double pawn move can complete the blockade immediately when no adjacent opposing pawn can capture en passant; an unusable en passant marker does not postpone the draw.

The same proof can include bishops confined by the pawn structure. A bishop must never be able to capture a pawn, be captured by a pawn or reach any square where it could check the enemy king. Knights are checked through every possible jump and attack square, including jumps over the wall. A knight that might free a pawn or ever check the enemy king prevents a draw. The proof also considers routes that could open after a bishop or knight is captured.

Detection is conservative: a possible en passant capture, a rook or queen, an accessible pawn or a bishop or knight that might give check prevents this rule from declaring a draw.

Remaining work:

- Extend dead-position and impossible-mate detection beyond material checks and proven pawn blockades, including fortresses with rooks or queens, bishop and knight fortresses that permit checks and positions requiring forced-move analysis. Resignation and timeout exceptions still use material checks; other undetected dead positions remain a limitation.

Piece selection and cancellable move dialogs are interface conveniences; physical touch-move rules, arbiter penalties and tournament-specific draw restrictions are not enforced.
