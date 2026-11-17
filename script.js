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

function getSquareLabel(piece, position) {
    return piece === ""
        ? `Empty square ${position}`
        : `${getPieceColor(piece)} ${pieceNames[piece.toLowerCase()]} on ${position}`;
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

function getPawnCaptures(row, column) {
    const captures = [];
    const pawn = currentPosition[row][column];

    if (pawn !== "P" && pawn !== "p") {
        return captures;
    }

    const nextRow = row + (pawn === "P" ? -1 : 1);
    if (nextRow < 0 || nextRow > 7) {
        return captures;
    }

    for (const offset of [-1, 1]) {
        const targetColumn = column + offset;
        if (targetColumn < 0 || targetColumn > 7) {
            continue;
        }

        const target = currentPosition[nextRow][targetColumn];
        // Kings are never captured; check and checkmate will be added later.
        if (target !== "" && target.toLowerCase() !== "k"
            && getPieceColor(target) !== getPieceColor(pawn)) {
            captures.push(`${files[targetColumn]}${8 - nextRow}`);
        }
    }

    return captures;
}

function clearSelection() {
    if (selectedSquare !== null) {
        selectedSquare.classList.remove("selected");
        selectedSquare.setAttribute("aria-pressed", "false");
        selectedSquare = null;
    }

    for (const square of board.querySelectorAll(".pawn-advance, .pawn-capture")) {
        square.classList.remove("pawn-advance", "pawn-capture");
        square.disabled = true;
        square.setAttribute("aria-label", getSquareLabel(square.dataset.piece, square.dataset.position));
    }

    status.textContent = `Select a ${currentPlayer} pawn, then choose a marked square to move or capture.`;
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
        const captures = getPawnCaptures(row, column);

        for (const position of advances) {
            const destination = board.querySelector(`[data-position="${position}"]`);
            destination.classList.add("pawn-advance");
            destination.disabled = false;
            destination.setAttribute("aria-label", `Move ${currentPlayer} pawn from ${square.dataset.position} to ${position}`);
        }

        for (const position of captures) {
            const destination = board.querySelector(`[data-position="${position}"]`);
            destination.classList.add("pawn-capture");
            destination.disabled = false;
            destination.setAttribute("aria-label", `Capture ${getSquareLabel(destination.dataset.piece, position)} with ${currentPlayer} pawn from ${square.dataset.position}`);
        }

        if (advances.length > 0) {
            message += ` Forward squares: ${advances.join(", ")}.`;
        }
        if (captures.length > 0) {
            message += ` Captures: ${captures.join(", ")}.`;
        }
        message += advances.length > 0 || captures.length > 0
            ? " Choose a marked square."
            : " No pawn destinations available.";
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
    if (currentPosition[fromRow][fromColumn] !== pawn) {
        return false;
    }

    const destinations = [...getPawnAdvances(fromRow, fromColumn), ...getPawnCaptures(fromRow, fromColumn)];
    if (!destinations.includes(toPosition)) {
        return false;
    }

    const capturedPiece = currentPosition[row][column];
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

    const result = capturedPiece === ""
        ? `moved from ${fromPosition} to ${toPosition}`
        : `from ${fromPosition} captured a ${getPieceColor(capturedPiece)} ${pieceNames[capturedPiece.toLowerCase()]} on ${toPosition}`;
    status.textContent = `${movingPlayer} pawn ${result}. ${turn.textContent}.`;
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
            const square = document.createElement("button");
            square.type = "button";
            square.classList.add("square");

            if (isCurrentPlayerPiece) {
                square.setAttribute("aria-pressed", "false");
                square.addEventListener("click", () => selectPiece(square, piece, row, column));
            } else {
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

            square.setAttribute("aria-label", getSquareLabel(piece, position));

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
                pieceElement.setAttribute("aria-hidden", "true");

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
