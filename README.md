# Skakky
A personal chess project built with HTML, CSS and JavaScript, one small step at a time.

![Skakky with the white pawn on e2 selected and forward previews on e3 and e4](docs/preview.png)

## Current progress

- English page text and document language.
- A responsive 8×8 chessboard with alternating light and dark squares.
- All 32 pieces in their standard starting positions, with White at the bottom.
- File labels (`a`–`h`) and rank labels (`8`–`1`) along the board edges.
- Unicode piece symbols with English accessible names that include their square coordinates.
- A turn indicator showing `White to move` for the starting position.
- A blue outline on hovered squares for devices with hover support, with reduced-motion preferences respected.
- White pieces can be selected with a click, Enter or Space, with a green selection outline and an announced status message.
- White pawns show a preview of their unobstructed forward squares, including the initial two-square advance.
- Moving pieces, captures, turn changes and check validation are not implemented yet.

## Run locally

Open `index.html` in a web browser on Linux or Windows. No installation or build step is required.

Hover over a square to see its coordinate, such as `a8` or `h1`, and a blue outline.
The blue outline is visual feedback only; it does not indicate a legal move.
Click a white piece to select it, or use Tab to focus a white piece and press Enter or Space.
The selected square has a green outline. Activate the same piece again or press Escape while focus is on the board to clear the selection.
Selecting another white piece replaces the previous selection. Black pieces and empty squares are not selectable yet.
For a white pawn, blue dots mark its forward preview and the status message lists the same coordinates.
Both squares must be empty to preview the initial two-square advance. Pawn captures and king safety are not checked yet.
Pieces stay in their starting positions; movement is not implemented yet.
The turn indicator stays on White until move handling and turn changes are implemented.
Unicode piece shapes may vary slightly depending on the fonts installed on your system.

## Files

- `index.html` defines the page structure and the turn indicator.
- `style.css` defines the page layout and square colors.
- `script.js` handles piece selection and pawn previews, and uses `renderBoard()` to create the 64 squares and display pieces from an 8×8 array.
  The function clears the previous squares before drawing the board again.

## Learning reference

[Chess tutorial on YouTube](https://www.youtube.com/watch?v=SS5amIbX0Mo).
This project is developed in small steps as a personal learning exercise.
Skakky adapts the tutorial as a visual reference, using CSS Grid, separate source files and plain JavaScript.
