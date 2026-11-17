# Skakky

Skakky is an interactive chess project built with HTML, CSS and JavaScript. The goal is to create a complete browser chess game. The current version shows the standard starting position and supports basic moves, captures and alternating turns.

![Chessboard in the standard starting position](docs/preview.png)

## Current features

- Responsive 8×8 board with coordinates and Unicode pieces.
- Basic move and capture generation for all six piece types.
- Alternating turns and keyboard-accessible move selection.

Moves into check are not prevented. Check validation, castling, promotion and en passant are not implemented yet.

## How it works

Select one of your pieces to see its available destinations. Choose a marked square to move or capture, then the turn passes to the other player.

## Run locally

Open `index.html` in a browser. No installation or build step is required.

## Project files

- `index.html` contains the page structure.
- `style.css` styles the board and controls.
- `script.js` stores the position, finds available moves, handles player input and redraws the board.
