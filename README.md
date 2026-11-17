# Skakky
A personal chess project built with HTML, CSS and JavaScript, one small step at a time.

![White knight on f3 showing L-shaped moves and a capture on e5](docs/preview.png)

## Current progress

- English page text and document language.
- A responsive 8×8 chessboard with alternating light and dark squares.
- Starts with all 32 pieces in their standard positions, with White at the bottom.
- File labels (`a`–`h`) and rank labels (`8`–`1`) along the board edges.
- Unicode piece symbols with English accessible names that include their square coordinates.
- Alternating turns, starting with White, with an indicator showing whose turn it is.
- A blue outline on hovered squares for devices with hover support, with reduced-motion preferences respected.
- Only the current player's pieces can be selected with a click, Enter or Space, with a green selection outline and an announced status message.
- White and black pawns can advance to the blue-dot squares, including the initial two-square advance when both squares are empty.
- Pawns can capture an opposing piece one square diagonally forward, marked with a red ring and listed in the status message.
- Knights of both colors can jump in an L shape, pass over other pieces and capture opposing pieces on their destination squares.
- After a successful move, the board and turn indicator update, and keyboard focus passes to a piece of the next player.
- Bishop, rook, queen and king movement, en passant, promotion and check validation are not implemented yet.

## Run locally

Open `index.html` in a web browser on Linux or Windows. No installation or build step is required.

Hover over a square to see its coordinate, such as `a8` or `h1`, and a blue outline.
The blue outline is visual feedback only; it does not indicate a legal move.
White plays first. Click a piece of the current player to select it, or use Tab to focus it and press Enter or Space.
The selected square has a green outline. Activate the same piece again or press Escape while focus is on the board to clear the selection.
Selecting another piece of the current player replaces the previous selection.
For a pawn or knight, blue dots mark empty destinations and red rings mark opposing pieces it can capture. The status message lists the same coordinates.
Click a blue-dot square to move or a red-ring square to capture, or reach it with Tab or Shift+Tab and press Enter or Space.
Empty squares and opponent pieces are enabled only when they are available destinations for the selected piece.
White pawns advance toward rank 8; black pawns advance toward rank 1.
Both squares must be empty for the initial two-square advance from rank 2 for White or rank 7 for Black.
After leaving its starting rank, a pawn can advance only one square at a time.
Each successful move changes the turn. Selecting, deselecting or attempting an unavailable move keeps the same turn.
A pawn cannot capture forward, backward, onto an empty diagonal or onto a friendly piece. Kings cannot be captured.
A knight moves two squares along one axis and one along the other, in any direction. It can jump over pieces but cannot land on a friendly piece.
En passant, promotion and king safety are not implemented yet. Reload the page to restore the starting position.
Unicode piece shapes may vary slightly depending on the fonts installed on your system.

## Files

- `index.html` defines the page structure and the turn indicator.
- `style.css` defines the page layout and square colors.
- `script.js` handles pawn and knight moves, captures and alternating turns using a mutable copy of the starting position.
  `getMoveOptions()` chooses the movement rules for the selected piece, and `movePiece()` checks and applies a destination.
  It uses `renderBoard()` to create the 64 squares and display the current position.
  The function clears the previous squares before drawing the board again.

## Learning reference

[Chess tutorial on YouTube](https://www.youtube.com/watch?v=SS5amIbX0Mo).
This project is developed in small steps as a personal learning exercise.
Skakky adapts the tutorial as a visual reference, using CSS Grid, separate source files and plain JavaScript.
