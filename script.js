const board = document.getElementById("board");
const status = document.getElementById("status");
const initialStatus = "Select a white piece. Movement is not available yet.";
let selectedSquare = null;

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

const files = "abcdefgh";

function getWhitePawnAdvances(row, column) {
    const advances = [];
    const nextRow = row - 1;

    if (nextRow < 0 || startingPosition[nextRow][column] !== "") {
        return advances;
    }

    const nextRank = 8 - nextRow;
    advances.push(`${files[column]}${nextRank}`);

    // A pawn can advance two squares from rank 2 only if both are empty.
    if (row === 6 && startingPosition[row - 2][column] === "") {
        advances.push(`${files[column]}${nextRank + 1}`);
    }

    return advances;
}

function clearSelection() {
    if (selectedSquare !== null) {
        selectedSquare.classList.remove("selected");
        selectedSquare.setAttribute("aria-pressed", "false");
        selectedSquare = null;
    }

    for (const square of board.querySelectorAll(".pawn-advance")) {
        square.classList.remove("pawn-advance");
    }

    status.textContent = initialStatus;
}

function selectPiece(square, piece, row, column) {
    const wasSelected = selectedSquare === square;
    clearSelection();

    if (wasSelected) {
        return;
    }

    selectedSquare = square;
    square.classList.add("selected");
    square.setAttribute("aria-pressed", "true");

    let message = `Selected white ${pieceNames[piece.toLowerCase()]} on ${square.dataset.position}.`;

    if (piece === "P") {
        const advances = getWhitePawnAdvances(row, column);

        for (const position of advances) {
            const destination = board.querySelector(`[data-position="${position}"]`);
            destination.classList.add("pawn-advance");
        }

        message += advances.length > 0
            ? ` Forward preview: ${advances.join(", ")}.`
            : " No forward squares available.";
    }

    status.textContent = `${message} Movement is not available yet.`;
}

function renderBoard() {
    clearSelection();
    board.replaceChildren();

    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const piece = startingPosition[row][column];
            const isWhitePiece = piece !== "" && piece === piece.toUpperCase();
            const square = document.createElement(isWhitePiece ? "button" : "div");
            square.classList.add("square");

            if (isWhitePiece) {
                square.type = "button";
                square.setAttribute("aria-pressed", "false");
                square.addEventListener("click", () => selectPiece(square, piece, row, column));
            }

            const color = (row + column) % 2 === 0 ? "light" : "dark";
            square.classList.add(color);

            // The top-left square is a8; the bottom-right square is h1.
            const rank = 8 - row;
            const position = `${files[column]}${rank}`;
            square.dataset.position = position;
            square.title = position;

            if (column === 0) {
                const rankLabel = document.createElement("span");
                rankLabel.classList.add("coordinate", "rank");
                rankLabel.textContent = String(rank);
                rankLabel.setAttribute("aria-hidden", "true");
                square.appendChild(rankLabel);
            }

            if (row === 7) {
                const fileLabel = document.createElement("span");
                fileLabel.classList.add("coordinate", "file");
                fileLabel.textContent = files[column];
                fileLabel.setAttribute("aria-hidden", "true");
                square.appendChild(fileLabel);
            }

            if (piece !== "") {
                const pieceElement = document.createElement("span");
                const pieceColor = piece === piece.toUpperCase() ? "white" : "black";

                pieceElement.classList.add("piece", pieceColor);
                // Request text glyphs instead of emoji for consistent piece styling.
                pieceElement.textContent = pieceSymbols[piece] + "\uFE0E";
                const pieceLabel = `${pieceColor} ${pieceNames[piece.toLowerCase()]} on ${position}`;

                if (isWhitePiece) {
                    square.setAttribute("aria-label", pieceLabel);
                    pieceElement.setAttribute("aria-hidden", "true");
                } else {
                    pieceElement.setAttribute("role", "img");
                    pieceElement.setAttribute("aria-label", pieceLabel);
                }

                square.appendChild(pieceElement);
            }

            board.appendChild(square);
        }
    }
}

board.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        clearSelection();
    }
});

renderBoard();
