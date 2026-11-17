const board = document.getElementById("board");
const status = document.getElementById("status");
const turn = document.getElementById("turn");
let currentPlayer = "white";
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

// Preserve the starting layout while the current position changes.
const currentPosition = startingPosition.map(row => row.slice());

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

function getPieceColor(piece) {
    return piece === piece.toUpperCase() ? "white" : "black";
}

function getPawnAdvances(row, column) {
    const advances = [];
    const pawn = currentPosition[row][column];

    if (pawn !== "P" && pawn !== "p") {
        return advances;
    }

    const direction = pawn === "P" ? -1 : 1;
    const startingRow = pawn === "P" ? 6 : 1;
    const nextRow = row + direction;

    if (nextRow < 0 || nextRow > 7 || currentPosition[nextRow][column] !== "") {
        return advances;
    }

    const nextRank = 8 - nextRow;
    advances.push(`${files[column]}${nextRank}`);

    // A pawn can advance two squares from its starting rank if both are empty.
    const secondRow = row + 2 * direction;
    if (row === startingRow && currentPosition[secondRow][column] === "") {
        advances.push(`${files[column]}${8 - secondRow}`);
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
        square.disabled = true;
        square.setAttribute("aria-label", `Empty square ${square.dataset.position}`);
    }

    status.textContent = `Select a ${currentPlayer} pawn, then choose a blue-dot square to move.`;
}

function selectPiece(square, piece, row, column) {
    if (piece === "" || getPieceColor(piece) !== currentPlayer || currentPosition[row][column] !== piece) {
        return;
    }

    const wasSelected = selectedSquare === square;
    clearSelection();

    if (wasSelected) {
        return;
    }

    selectedSquare = square;
    square.classList.add("selected");
    square.setAttribute("aria-pressed", "true");

    let message = `Selected ${currentPlayer} ${pieceNames[piece.toLowerCase()]} on ${square.dataset.position}.`;

    if (piece.toLowerCase() === "p") {
        const advances = getPawnAdvances(row, column);

        for (const position of advances) {
            const destination = board.querySelector(`[data-position="${position}"]`);
            destination.classList.add("pawn-advance");
            destination.disabled = false;
            destination.setAttribute("aria-label", `Move ${currentPlayer} pawn from ${square.dataset.position} to ${position}`);
        }

        message += advances.length > 0
            ? ` Forward squares: ${advances.join(", ")}. Choose a blue-dot square to move.`
            : " No forward squares available.";
    } else {
        message += " Movement for this piece is not available yet.";
    }

    status.textContent = message;
}

function movePawn(row, column) {
    if (selectedSquare === null) {
        return false;
    }

    const fromPosition = selectedSquare.dataset.position;
    const fromColumn = files.indexOf(fromPosition[0]);
    const fromRow = 8 - Number(fromPosition[1]);
    const toPosition = `${files[column]}${8 - row}`;

    const pawn = currentPlayer === "white" ? "P" : "p";
    if (currentPosition[fromRow][fromColumn] !== pawn
        || !getPawnAdvances(fromRow, fromColumn).includes(toPosition)) {
        return false;
    }

    currentPosition[fromRow][fromColumn] = "";
    currentPosition[row][column] = pawn;
    const movingPlayer = currentPlayer === "white" ? "White" : "Black";
    currentPlayer = currentPlayer === "white" ? "black" : "white";
    renderBoard();

    const nextPawn = currentPlayer === "white" ? "P" : "p";
    const nextPiece = board.querySelector(`button.square[data-piece="${nextPawn}"]`)
        || board.querySelector("button.square:enabled");
    if (nextPiece !== null) {
        nextPiece.focus();
    }

    status.textContent = `${movingPlayer} pawn moved from ${fromPosition} to ${toPosition}. ${turn.textContent}.`;
    return true;
}

function renderBoard() {
    clearSelection();
    board.replaceChildren();
    turn.textContent = currentPlayer === "white" ? "White to move" : "Black to move";
    turn.dataset.player = currentPlayer;

    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const piece = currentPosition[row][column];
            const isCurrentPlayerPiece = piece !== "" && getPieceColor(piece) === currentPlayer;
            const square = document.createElement(isCurrentPlayerPiece || piece === "" ? "button" : "div");
            square.classList.add("square");

            if (isCurrentPlayerPiece) {
                square.type = "button";
                square.setAttribute("aria-pressed", "false");
                square.addEventListener("click", () => selectPiece(square, piece, row, column));
            } else if (piece === "") {
                square.type = "button";
                square.disabled = true;
                square.addEventListener("click", () => movePawn(row, column));
            }

            const color = (row + column) % 2 === 0 ? "light" : "dark";
            square.classList.add(color);

            // The top-left square is a8; the bottom-right square is h1.
            const rank = 8 - row;
            const position = `${files[column]}${rank}`;
            square.dataset.position = position;
            square.dataset.piece = piece;
            square.title = position;

            if (piece === "") {
                square.setAttribute("aria-label", `Empty square ${position}`);
            }

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
                const pieceColor = getPieceColor(piece);

                pieceElement.classList.add("piece", pieceColor);
                // Request text glyphs instead of emoji for consistent piece styling.
                pieceElement.textContent = pieceSymbols[piece] + "\uFE0E";
                const pieceLabel = `${pieceColor} ${pieceNames[piece.toLowerCase()]} on ${position}`;

                if (isCurrentPlayerPiece) {
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
        const previousSelection = selectedSquare;
        clearSelection();

        if (previousSelection !== null) {
            previousSelection.focus();
        }
    }
});

renderBoard();
