# Skakky

Skakky is an interactive chess project built with HTML, CSS and JavaScript. The goal is to create a complete browser chess game. The current version shows the standard starting position and supports basic moves, captures and alternating turns.

![Chessboard in the standard starting position](docs/preview.png)

## Current features

- Responsive 8×8 board with coordinates and Unicode pieces.
- Basic move and capture generation for all six piece types.
- Check detection and move validation that keeps the moving player's king safe.
- Checkmate and stalemate detection with a result that ends the game.
- Pawn promotion to a queen, rook, bishop or knight for either color.
- Kingside and queenside castling for either color.
- En passant captures for either color.
- Automatic draws under the 75-move rule and fivefold repetition.
- Draw claims under the 50-move rule, including claims based on an intended move.
- Alternating turns and keyboard-accessible move selection.

## How it works

Select one of your pieces to see its available destinations. Choose a marked square to move or capture, then the turn passes to the other player.

When you select a destination on the last rank for a pawn, choose the piece to promote it to. Cancel or press Escape to return to the board and choose a move again.

To castle, select the king and move it two squares toward the rook. The rook moves automatically. The king and rook must never have moved, the squares between them must be empty and the king cannot start in, move through or end in check.

To capture en passant, move your adjacent pawn diagonally onto the square the opposing pawn just passed over in its two-square advance. The capture is available only on your immediate reply.

Blue dots mark moves without captures. Red rings mark capture targets, including the empty destination for en passant.
During play, a checked king's square is shaded red and the turn indicator says "in check". Only moves that get the king out of check are available.
If the player to move has no legal moves, the game ends. Checkmate gives the win to the opponent. Stalemate is a draw because the king is safe but the player cannot move.
The game ends in a draw when the same position occurs five times, including the starting position if it repeats. To match, the pieces, side to move, castling rights and any legal en passant capture must agree.
The game also ends in a draw after 75 moves by each player without a pawn move or capture. Checkmate on the final move takes precedence. See [FIDE Laws of Chess, article 9.6](https://handbook.fide.com/chapter/e012023).
Choose **Claim draw (50-move rule)** when available. You can claim after 50 moves by each player without a pawn move or capture. If one qualifying move is still needed, choose your intended move in the dialog to claim before playing it. See [FIDE Laws of Chess, article 9.3](https://handbook.fide.com/chapter/e012023).
Use Tab or Shift+Tab to reach pieces and highlighted destinations, then press Enter or Space to activate them.
Press Escape to cancel the selection. Reload the page to restore the starting position.

## Run locally

Open `index.html` in a browser. No installation or build step is required.

## Check movement rules

With Node.js installed, run:

```sh
node tests/movement.cjs
```

The test compares all six piece types, both colors and every starting square against an independent movement calculation on empty boards and boards with obstacles. It also checks king safety, special moves and game results. It requires no extra packages.

## Project files

- `index.html` contains the page structure.
- `style.css` styles the board and controls.
- `script.js` stores the position, finds available moves, handles player input and redraws the board.
- `tests/movement.cjs` checks move generation, king safety and game results.

## Roadmap

- Draw claims for threefold repetition, including claims based on an intended move.
- Automatic draws in dead positions where neither player can give checkmate by any legal sequence.
- Resignation and draw offers.
- Optional chess clocks and results when a player runs out of time.
