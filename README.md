# Skakky

Skakky is an interactive chess project built with HTML, CSS and JavaScript. The goal is to create a complete browser chess game. The current version shows the standard starting position and supports basic moves, captures and alternating turns.

![Chessboard in the standard starting position](docs/preview.png)

## Current features

- Responsive 8×8 board with coordinates and Unicode pieces.
- Basic move and capture generation for all six piece types.
- Check detection and move validation that keeps the moving player's king safe.
- Checkmate and stalemate detection with a result that ends the game.
- Alternating turns and keyboard-accessible move selection.

Castling, promotion, en passant and other draw conditions are still to come.

## How it works

Select one of your pieces to see its available destinations. Choose a marked square to move or capture, then the turn passes to the other player.

Blue dots mark empty destinations; red rings mark capture targets.
During play, a checked king's square is shaded red and the turn indicator says "in check". Only moves that get the king out of check are available.
If the player to move has no legal moves, the game ends. Checkmate gives the win to the opponent. Stalemate is a draw because the king is safe but the player cannot move.
Use Tab or Shift+Tab to reach pieces and highlighted destinations, then press Enter or Space to activate them.
Press Escape to cancel the selection. Reload the page to restore the starting position.

## Run locally

Open `index.html` in a browser. No installation or build step is required.

## Check movement rules

With Node.js installed, run:

```sh
node tests/movement.cjs
```

The test compares all six piece types, both colors and every starting square against an independent movement calculation on empty boards and boards with obstacles. It also checks selected positions for king safety, checkmate and stalemate. It requires no extra packages.

## Project files

- `index.html` contains the page structure.
- `style.css` styles the board and controls.
- `script.js` stores the position, finds available moves, handles player input and redraws the board.
- `tests/movement.cjs` checks move generation, king safety and game results.
