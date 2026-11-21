# Skakky

An interactive chess game built with HTML, CSS and JavaScript.

![Chessboard in the standard starting position](docs/preview.png)

## Features

- Legal moves, captures, check, checkmate and stalemate.
- Castling, en passant and pawn promotion.
- A numbered move list in FIDE algebraic notation.
- PGN downloads for finished and unfinished games.
- Automatic draws, draw claims, draw offers and resignation.
- Dead-position draws for proven pawn blockades and bounded continuations.
- Optional chess clocks with Fischer increments and time-forfeit results.
- Start a new game with confirmation, without reloading.
- Responsive board with keyboard support.

## Play

Open `index.html` in a browser. Select a piece and choose a highlighted square. Press **New game** and confirm to start again without reloading. The current board and move list are cleared, so download the PGN first to keep a record. Each new game starts with White to move and clocks off.

The **Moves** table records each completed legal move in White and Black columns. It uses the English piece letters, `x` for captures, `+` for check and `#` for checkmate. Following FIDE Appendix C, castling appears as `0-0` or `0-0-0` and promotion as, for example, `e8Q`. An offer sent with a move is marked `(=)`. Illegal moves, cancelled dialogs and simulated analysis add no entries. The list remains visible after the game ends and is cleared when a new game starts or the page is reloaded.

Press **Download PGN** to save the current game as a `.pgn` file. The export contains only completed moves, the result (`*` while play continues), the game's start date and time control. Unknown player names and site use `?`. The visible notation is converted to PGN SAN (`O-O`, `e8=Q`), and draw offers become comments, following the [PGN specification](https://www.saremba.de/chessgml/standards/pgn/pgn-complete.htm). Downloading keeps the game running; an overdue clock is settled before the file's result is chosen.

Games are untimed by default. Before the first move, choose 3 minutes + 2 seconds per move, 5 minutes, or 10 minutes + 5 seconds per move and press **Start clock**. White's time starts immediately. Each completed legal move switches the clock automatically and adds the increment. The time control locks when the clock starts or the first untimed move is played.

The clock continues while selecting a promotion, confirming resignation, preparing a draw claim or deciding whether to start a new game. If time expires during the new-game confirmation, the dialog closes and the result stays visible until you start a new game. A valid confirmed claim stops play; preparation can be cancelled. All game results stop both clocks. A player who runs out of time loses unless the opponent cannot checkmate under the proofs described below. Time uses elapsed timestamps, so delayed updates in background tabs do not pause the clock.

## Tests

Run these commands with Node.js. No extra packages are required.

```sh
node tests/movement.cjs
node tests/clock.cjs
node tests/dead-position.cjs
node tests/forced-dead.cjs
node tests/notation.cjs
node tests/pgn.cjs
node tests/new-game.cjs
```

## Project files

- `index.html` — page structure.
- `style.css` — board and controls.
- `script.js` — chess rules and gameplay.
- `tests/movement.cjs` — movement and game-rule tests.
- `tests/clock.cjs` — deterministic clock and timed-game tests.
- `tests/dead-position.cjs` — pawn, bishop and knight blockade proofs and dead-position tests.
- `tests/forced-dead.cjs` — forced and branching continuations, search limits and analysis state preservation.
- `tests/notation.cjs` — move notation, disambiguation and move-list integrity.
- `tests/pgn.cjs` — PGN serialization, results, metadata and download behavior.
- `tests/new-game.cjs` — confirmation, complete game resets and stale timer/dialog protection.

## Development workflow

Keep code, interface text, documentation and commit messages in English. Complete one focused commit at a time, run the relevant checks and push each completed commit.

## Rules and remaining work

Rules are checked against the [FIDE Laws of Chess](https://handbook.fide.com/chapter/E012023), especially Articles 3, 5, 6, 8 and 9 and Appendix C. This is a local browser game, not a tournament arbiter.

Either player may resign, including during the opponent's turn. Press **Resign**, choose **White** or **Black** in **Resigning player**, then confirm. The dialog defaults to the player to move each time it opens. Cancellation or Escape keeps the game active and restores focus to **Resign**. The active clock continues until confirmation; a timeout that occurs first takes precedence.

Under Article 5.1.2, resignation is a draw when the opponent cannot checkmate. Material checks cover a bare king, a lone knight against only a king or a king and queens, and positions containing only kings and bishops on one square color. Two knights can give mate with cooperation and do not automatically imply a draw.

Automatic dead-position draws also cover kings-and-pawns positions where every pawn is blocked by a pawn, no pawn captures are available and neither king can ever reach an enemy pawn. This proves that neither side can create checkmate (Article 5.2.2), even though both kings can still move. A double pawn move can complete the blockade immediately when no adjacent opposing pawn can capture en passant; an unusable en passant marker does not postpone the draw.

The same proof can include bishops confined by the pawn structure. A bishop must never be able to capture a pawn, be captured by a pawn or reach any square where it could check the enemy king. Knights are checked through every possible jump and attack square, including jumps over the wall. A knight that might free a pawn or ever check the enemy king prevents a draw. The proof also considers routes that could open after a bishop or knight is captured.

The blockade proof is conservative: a possible en passant capture, a rook or queen, an accessible pawn or a bishop or knight that might give check prevents that proof from declaring a draw.

A separate proof considers all legal continuations, including all four promotion choices, up to eight half-moves and 64 analyzed positions. Every branch must end in a known dead position, stalemate or a closed cycle without an unproved exit. If any branch can still reach checkmate or remains unproved when a limit is reached, this check does not declare a draw. Simulated moves are never played. For example, if both replies to a check capture the last mating piece and leave a king and bishop against a king, the draw is declared before either capture.

Resignation and time forfeits use the material checks and the same bounded search for the specific opponent (Articles 5.1.2 and 6.9). For example, if the only legal move would checkmate the opponent, that opponent has no possible mating continuation. Resigning or running out of time in that position is a draw, even if the opponent has a rook or other mating material. The position remains playable until resignation or flag-fall because the active player can still give checkmate. Unproved cases retain the usual loss result.

Remaining work:

- Extend dead-position and impossible-mate detection beyond material checks and proven pawn blockades, including fortresses with rooks or queens, fortresses that permit checks, continuations beyond the eight-half-move or 64-position search limits. Undetected dead positions and one-sided impossible mates beyond these proofs remain a limitation.

Piece selection and cancellable move dialogs are interface conveniences; physical touch-move rules, arbiter penalties and tournament-specific draw restrictions are not enforced.
