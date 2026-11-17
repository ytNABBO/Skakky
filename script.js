const board = document.getElementById("board");

// Uppercase letters represent White; lowercase letters represent Black.
const startingPosition = [
    ["r", "n", "b", "q", "k", "b", "n", "r"],
    ["p", "p", "p", "p", "p", "p", "p", "p"],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", ""],
    ["P", "P", "P", "P", "P", "P", "P", "P"],
    ["R", "N", "B", "Q", "K", "B", "N", "R"]
];

const pieceSymbols = {
    r: "♜", n: "♞", b: "♝", q: "♛", k: "♚", p: "♟",
    R: "♖", N: "♘", B: "♗", Q: "♕", K: "♔", P: "♙"
};

const pieceNames = {
    r: "rook",
    n: "knight",
    b: "bishop",
    q: "queen",
    k: "king",
    p: "pawn"
};

for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
        const square = document.createElement("div");
        square.classList.add("square");

        const color = (row + column) % 2 === 0 ? "light" : "dark";
        square.classList.add(color);

        const piece = startingPosition[row][column];

        if (piece !== "") {
            const pieceElement = document.createElement("span");
            const pieceColor = piece === piece.toUpperCase() ? "white" : "black";

            pieceElement.classList.add("piece", pieceColor);
            // Request text glyphs instead of emoji for consistent piece styling.
            pieceElement.textContent = pieceSymbols[piece] + "\uFE0E";
            pieceElement.setAttribute("role", "img");
            pieceElement.setAttribute("aria-label", `${pieceColor} ${pieceNames[piece.toLowerCase()]}`);

            square.appendChild(pieceElement);
        }

        board.appendChild(square);
    }
}

document.getElementById("status").textContent = "Starting position ready. Piece movement is not available yet.";
