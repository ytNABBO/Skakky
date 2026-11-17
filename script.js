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

function getKnightMoves(row, column) {
    const options = { moves: [], captures: [] };
    const knight = currentPosition[row][column];

    if (knight.toLowerCase() !== "n") {
        return options;
    }

    // A knight jumps two squares on one axis and one on the other.
    const offsets = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
    ];

    for (const [rowOffset, columnOffset] of offsets) {
        const targetRow = row + rowOffset;
        const targetColumn = column + columnOffset;
        if (targetRow < 0 || targetRow > 7 || targetColumn < 0 || targetColumn > 7) {
            continue;
        }

        const target = currentPosition[targetRow][targetColumn];
        const position = `${files[targetColumn]}${8 - targetRow}`;
        if (target === "") {
            options.moves.push(position);
        } else if (target.toLowerCase() !== "k" && getPieceColor(target) !== getPieceColor(knight)) {
            options.captures.push(position);
        }
    }

    return options;
}

function getMoveOptions(row, column) {
    const piece = currentPosition[row][column].toLowerCase();
    if (piece === "p") {
        return { moves: getPawnAdvances(row, column), captures: getPawnCaptures(row, column) };
    }
    if (piece === "n") {
        return getKnightMoves(row, column);
    }
    return { moves: [], captures: [] };
}

function clearSelection() {
    if (selectedSquare !== null) {
        selectedSquare.classList.remove("selected");
        selectedSquare.setAttribute("aria-pressed", "false");
        selectedSquare = null;
    }

    for (const square of board.querySelectorAll(".move-target, .capture-target")) {
        square.classList.remove("move-target", "capture-target");
        square.disabled = true;
        square.setAttribute("aria-label", getSquareLabel(square.dataset.piece, square.dataset.position));
    }

    status.textContent = `Select a ${currentPlayer} pawn or knight, then choose a marked square.`;
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

    const pieceName = pieceNames[piece.toLowerCase()];
    let message = `Selected ${currentPlayer} ${pieceName} on ${square.dataset.position}.`;

    if (piece.toLowerCase() === "p" || piece.toLowerCase() === "n") {
        const { moves, captures } = getMoveOptions(row, column);

        for (const position of moves) {
            const destination = board.querySelector(`[data-position="${position}"]`);
            destination.classList.add("move-target");
            destination.disabled = false;
            destination.setAttribute("aria-label", `Move ${currentPlayer} ${pieceName} from ${square.dataset.position} to ${position}`);
        }

        for (const position of captures) {
            const destination = board.querySelector(`[data-position="${position}"]`);
            destination.classList.add("capture-target");
            destination.disabled = false;
            destination.setAttribute("aria-label", `Capture ${getSquareLabel(destination.dataset.piece, position)} with ${currentPlayer} ${pieceName} from ${square.dataset.position}`);
        }

        if (moves.length > 0) {
            message += ` Moves: ${moves.join(", ")}.`;
        }
        if (captures.length > 0) {
            message += ` Captures: ${captures.join(", ")}.`;
        }
        message += moves.length > 0 || captures.length > 0
            ? " Choose a marked square."
            : " No destinations available.";
    } else {
        message += " Movement for this piece is not available yet.";
    }

    status.textContent = message;
}

function movePiece(row, column) {
    if (selectedSquare === null) {
        return false;
    }

    const fromPosition = selectedSquare.dataset.position;
    const fromColumn = files.indexOf(fromPosition[0]);
    const fromRow = 8 - Number(fromPosition[1]);
    const toPosition = `${files[column]}${8 - row}`;

    const piece = currentPosition[fromRow][fromColumn];
    if (piece === "" || getPieceColor(piece) !== currentPlayer) {
        return false;
    }

    const { moves, captures } = getMoveOptions(fromRow, fromColumn);
    if (!moves.includes(toPosition) && !captures.includes(toPosition)) {
        return false;
    }

    const capturedPiece = currentPosition[row][column];
    currentPosition[fromRow][fromColumn] = "";
    currentPosition[row][column] = piece;
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
    status.textContent = `${movingPlayer} ${pieceNames[piece.toLowerCase()]} ${result}. ${turn.textContent}.`;
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
                square.addEventListener("click", () => movePiece(row, column));
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
