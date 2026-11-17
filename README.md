# Skakky
A personal chess project built with HTML, CSS and JavaScript, one small step at a time.

![Skakky after advancing the white pawn from e2 to e4](docs/preview.png)

## Current progress

- English page text and document language.
- A responsive 8×8 chessboard with alternating light and dark squares.
- Starts with all 32 pieces in their standard positions, with White at the bottom.
- File labels (`a`–`h`) and rank labels (`8`–`1`) along the board edges.
- Unicode piece symbols with English accessible names that include their square coordinates.
- A `White pawn practice` indicator while alternating turns are being developed.
- A blue outline on hovered squares for devices with hover support, with reduced-motion preferences respected.
- White pieces can be selected with a click, Enter or Space, with a green selection outline and an announced status message.
- White pawns can advance to the blue-dot squares, including the initial two-square advance when both squares are empty.
- The board updates after each move and keyboard focus follows the moved pawn.
- Other piece movements, captures, turn changes, promotion and check validation are not implemented yet.

## Run locally

Open `index.html` in a web browser on Linux or Windows. No installation or build step is required.

Hover over a square to see its coordinate, such as `a8` or `h1`, and a blue outline.
The blue outline is visual feedback only; it does not indicate a legal move.
Click a white piece to select it, or use Tab to focus a white piece and press Enter or Space.
The selected square has a green outline. Activate the same piece again or press Escape while focus is on the board to clear the selection.
Selecting another white piece replaces the previous selection. Black pieces are not selectable yet.
For a white pawn, blue dots mark its forward destinations and the status message lists the same coordinates.
Click a blue-dot square to advance, or reach it with Tab or Shift+Tab and press Enter or Space.
Empty squares are enabled only when they are available destinations for the selected pawn.
Both squares must be empty for the initial two-square advance. After leaving rank 2, a pawn can advance only one square at a time.
You can practice consecutive white pawn moves; alternating turns will be added later.
Pawn captures, promotion and king safety are not checked yet. Reload the page to restore the starting position.
Unicode piece shapes may vary slightly depending on the fonts installed on your system.

## Files

- `index.html` defines the page structure and the practice indicator.
- `style.css` defines the page layout and square colors.
- `script.js` handles selection and white pawn advances using a mutable copy of the starting position.
  It uses `renderBoard()` to create the 64 squares and display the current position.
  The function clears the previous squares before drawing the board again.

## Learning reference

[Chess tutorial on YouTube](https://www.youtube.com/watch?v=SS5amIbX0Mo).
This project is developed in small steps as a personal learning exercise.
Skakky adapts the tutorial as a visual reference, using CSS Grid, separate source files and plain JavaScript.
