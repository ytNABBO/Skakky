// Show piece moves, update the board, and alternate turns.
const board = document.getElementById("board");
const status = document.getElementById("status");
const turn = document.getElementById("turn");
const promotionDialog = document.getElementById("promotion");
let currentPlayer = "white";
let selectedSquare = null;
let gameResult = null;
let pendingPromotion = null;
const promotionChoices = ["q", "r", "b", "n"];

// The board uses uppercase letters for White and lowercase letters for Black.
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
const knightOffsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
];
const adjacentOffsets = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
];

// Convert piece codes into colors and accessible square labels.
function getPieceColor(piece) {
    return piece === piece.toUpperCase() ? "white" : "black";
}

function getSquareLabel(piece, position) {
    return piece === ""
        ? `Empty square ${position}`
        : `${getPieceColor(piece)} ${pieceNames[piece.toLowerCase()]} on ${position}`;
}

// Find each piece's possible moves and captures.
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
        // Kings are never captured.
        if (target !== "" && target.toLowerCase() !== "k"
            && getPieceColor(target) !== getPieceColor(pawn)) {
            captures.push(`${files[targetColumn]}${8 - nextRow}`);
        }
    }

    return captures;
}

// Knights and kings move to a fixed set of offset squares.
function getMovesForOffsets(row, column, offsets) {
    const options = { moves: [], captures: [] };
    const piece = currentPosition[row][column];

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
        } else if (target.toLowerCase() !== "k" && getPieceColor(target) !== getPieceColor(piece)) {
            options.captures.push(position);
        }
    }

    return options;
}

function getKnightMoves(row, column) {
    return getMovesForOffsets(row, column, knightOffsets);
}

function getSlidingMoves(row, column, directions) {
    const options = { moves: [], captures: [] };
    const piece = currentPosition[row][column];

    for (const [rowOffset, columnOffset] of directions) {
        let nextRow = row + rowOffset;
        let nextColumn = column + columnOffset;

        while (nextRow >= 0 && nextRow < 8 && nextColumn >= 0 && nextColumn < 8) {
            const target = currentPosition[nextRow][nextColumn];
            const position = `${files[nextColumn]}${8 - nextRow}`;

            if (target === "") {
                options.moves.push(position);
            } else {
                if (target.toLowerCase() !== "k" && getPieceColor(target) !== getPieceColor(piece)) {
                    options.captures.push(position);
                }
                break;
            }

            nextRow += rowOffset;
            nextColumn += columnOffset;
        }
    }

    return options;
}

function getRookMoves(row, column) {
    return getSlidingMoves(row, column, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
}

function getBishopMoves(row, column) {
    return getSlidingMoves(row, column, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
}

function getQueenMoves(row, column) {
    return getSlidingMoves(row, column, adjacentOffsets);
}

function getKingMoves(row, column) {
    return getMovesForOffsets(row, column, adjacentOffsets);
}

function getMoveOptions(row, column) {
    const piece = currentPosition[row][column].toLowerCase();
    if (piece === "p") {
        return { moves: getPawnAdvances(row, column), captures: getPawnCaptures(row, column) };
    }
    if (piece === "n") {
        return getKnightMoves(row, column);
    }
    if (piece === "r") {
        return getRookMoves(row, column);
    }
    if (piece === "b") {
        return getBishopMoves(row, column);
    }
    if (piece === "q") {
        return getQueenMoves(row, column);
    }
    if (piece === "k") {
        return getKingMoves(row, column);
    }
    return { moves: [], captures: [] };
}

function isSquareAttacked(position, row, column, attackerColor) {
    // Look back from the target square to the pawn's possible origin.
    const pawn = attackerColor === "white" ? "P" : "p";
    const pawnRow = row + (pawn === "P" ? 1 : -1);
    if (position[pawnRow]?.[column - 1] === pawn || position[pawnRow]?.[column + 1] === pawn) {
        return true;
    }

    const knight = attackerColor === "white" ? "N" : "n";
    if (knightOffsets.some(([dr, dc]) => position[row + dr]?.[column + dc] === knight)) {
        return true;
    }

    // The first piece in each direction can attack or block the line.
    for (const [rowStep, columnStep] of adjacentOffsets) {
        let targetRow = row + rowStep;
        let targetColumn = column + columnStep;
        let distance = 1;

        while (targetRow >= 0 && targetRow < 8 && targetColumn >= 0 && targetColumn < 8) {
            const piece = position[targetRow][targetColumn];
            if (piece !== "") {
                if (getPieceColor(piece) === attackerColor) {
                    const kind = piece.toLowerCase();
                    const linePiece = rowStep === 0 || columnStep === 0 ? "r" : "b";
                    if (kind === linePiece || kind === "q" || (kind === "k" && distance === 1)) {
                        return true;
                    }
                }
                break;
            }

            targetRow += rowStep;
            targetColumn += columnStep;
            distance++;
        }
    }

    return false;
}

function findCheckedKing(position, player) {
    const king = player === "white" ? "K" : "k";
    const row = position.findIndex(rank => rank.includes(king));
    if (row === -1) {
        return null;
    }

    const column = position[row].indexOf(king);
    const opponent = player === "white" ? "black" : "white";
    return isSquareAttacked(position, row, column, opponent) ? { row, column } : null;
}

function getLegalMoveOptions(row, column) {
    const { moves, captures } = getMoveOptions(row, column);
    const piece = currentPosition[row][column];
    const player = getPieceColor(piece);

    // Try each destination on a copy, including the removal of any captured piece.
    function keepsKingSafe(destination) {
        const targetRow = 8 - Number(destination[1]);
        const targetColumn = files.indexOf(destination[0]);
        const position = currentPosition.map(rank => rank.slice());
        position[row][column] = "";
        position[targetRow][targetColumn] = piece;
        return findCheckedKing(position, player) === null;
    }

    return { moves: moves.filter(keepsKingSafe), captures: captures.filter(keepsKingSafe) };
}

function hasLegalMove(player) {
    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const piece = currentPosition[row][column];
            if (piece === "" || getPieceColor(piece) !== player) {
                continue;
            }

            const { moves, captures } = getLegalMoveOptions(row, column);
            if (moves.length > 0 || captures.length > 0) {
                return true;
            }
        }
    }

    return false;
}

// Select a piece, show its destinations, and apply the chosen move.
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

    status.textContent = gameResult === null
        ? `Select a ${currentPlayer} piece, then choose a marked square.`
        : "Reload the page to play again.";
}

function selectPiece(square, piece, row, column) {
    if (gameResult !== null || pendingPromotion !== null) {
        return;
    }

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

    const { moves, captures } = getLegalMoveOptions(row, column);

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

    status.textContent = message;
}

function movePiece(row, column, promotion = null) {
    if (gameResult !== null || selectedSquare === null || pendingPromotion !== null) {
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

    const { moves, captures } = getLegalMoveOptions(fromRow, fromColumn);
    if (!moves.includes(toPosition) && !captures.includes(toPosition)) {
        return false;
    }

    const lastRow = currentPlayer === "white" ? 0 : 7;
    const reachesLastRank = piece.toLowerCase() === "p" && row === lastRow;
    if (reachesLastRank && promotion === null) {
        pendingPromotion = { row, column };
        promotionDialog.returnValue = "";
        promotionDialog.showModal();
        return false;
    }

    if (promotion !== null && (!reachesLastRank || !promotionChoices.includes(promotion))) {
        return false;
    }

    const capturedPiece = currentPosition[row][column];
    let placedPiece = piece;
    if (promotion !== null) {
        placedPiece = currentPlayer === "white" ? promotion.toUpperCase() : promotion;
    }
    currentPosition[fromRow][fromColumn] = "";
    currentPosition[row][column] = placedPiece;
    const movingPlayer = currentPlayer === "white" ? "White" : "Black";
    currentPlayer = currentPlayer === "white" ? "black" : "white";
    renderBoard();

    const nextPawn = currentPlayer === "white" ? "P" : "p";
    const nextPiece = board.querySelector(`button.square:enabled[data-piece="${nextPawn}"]`)
        || board.querySelector("button.square:enabled");

    let result = capturedPiece === ""
        ? `moved from ${fromPosition} to ${toPosition}`
        : `from ${fromPosition} captured a ${getPieceColor(capturedPiece)} ${pieceNames[capturedPiece.toLowerCase()]} on ${toPosition}`;
    if (promotion !== null) {
        result += ` and promoted to a ${pieceNames[promotion]}`;
    }
    const nextInstruction = gameResult === null ? `${turn.textContent}.` : "Reload the page to play again.";
    status.textContent = `${movingPlayer} ${pieceNames[piece.toLowerCase()]} ${result}. ${nextInstruction}`;
    if (gameResult !== null) {
        turn.focus();
    } else {
        nextPiece?.focus();
    }
    return true;
}

// Rebuild all 64 squares from the current position.
function renderBoard() {
    const checkedKing = findCheckedKing(currentPosition, currentPlayer);
    const playerName = currentPlayer === "white" ? "White" : "Black";
    gameResult = null;
    if (!hasLegalMove(currentPlayer)) {
        const winner = currentPlayer === "white" ? "Black" : "White";
        gameResult = checkedKing === null ? "Stalemate. Draw." : `Checkmate. ${winner} wins.`;
    }

    clearSelection();
    board.replaceChildren();
    const turnMessage = checkedKing === null ? `${playerName} to move` : `${playerName} to move (in check)`;
    turn.textContent = gameResult ?? turnMessage;
    turn.dataset.player = currentPlayer;

    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const piece = currentPosition[row][column];
            const canSelect = gameResult === null && piece !== "" && getPieceColor(piece) === currentPlayer;
            const square = document.createElement("button");
            square.type = "button";
            square.classList.add("square");

            if (canSelect) {
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

            const isCheckedKing = checkedKing !== null && row === checkedKing.row && column === checkedKing.column;
            const label = getSquareLabel(piece, position);
            if (isCheckedKing) {
                square.classList.add("in-check");
            }
            square.setAttribute("aria-label", isCheckedKing ? `${label}, in check` : label);

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
    if (event.key === "Escape" && selectedSquare !== null && pendingPromotion === null) {
        const previousSelection = selectedSquare;
        clearSelection();
        previousSelection.focus();
    }
});

promotionDialog.addEventListener("close", () => {
    const target = pendingPromotion;
    pendingPromotion = null;
    const promotion = promotionDialog.returnValue;
    if (target !== null && promotionChoices.includes(promotion)) {
        movePiece(target.row, target.column, promotion);
    }
});

renderBoard();
