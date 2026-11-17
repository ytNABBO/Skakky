// Show piece moves, update the board, and alternate turns.
const board = document.getElementById("board");
const status = document.getElementById("status");
const turn = document.getElementById("turn");
const promotionDialog = document.getElementById("promotion");
const claimDrawButton = document.getElementById("claim-draw");
const claimRepetitionButton = document.getElementById("claim-repetition");
const drawClaimDialog = document.getElementById("draw-claim");
const drawClaimMove = document.getElementById("draw-claim-move");
const drawOfferMessage = document.getElementById("draw-offer-message");
const offerDrawButton = document.getElementById("offer-draw");
const acceptDrawButton = document.getElementById("accept-draw");
const declineDrawButton = document.getElementById("decline-draw");
let currentPlayer = "white";
let selectedSquare = null;
let gameResult = null;
let pendingPromotion = null;
let pendingDrawClaim = null;
let enPassant = null;
let halfmoveClock = 0;
let movesPlayed = 0;
let drawOfferQueued = false;
let drawOfferedBy = null;
let declaredResult = null;
const drawClaimResults = {
    fifty: "Draw claimed under the 50-move rule.",
    threefold: "Draw claimed by threefold repetition."
};
const claimHalfmoveLimit = 100; // 50 moves by each player.
const drawHalfmoveLimit = 150; // 75 moves by each player.
const claimRepetitionLimit = 3;
const drawRepetitionLimit = 5;
const positionOccurrences = new Map();
const promotionChoices = ["q", "r", "b", "n"];
const castlingRights = {
    white: { kingside: true, queenside: true },
    black: { kingside: true, queenside: true }
};
const castlingSides = [
    { name: "kingside", kingColumn: 6, rookColumn: 7, rookTarget: 5, emptyColumns: [5, 6] },
    { name: "queenside", kingColumn: 2, rookColumn: 0, rookTarget: 3, emptyColumns: [1, 2, 3] }
];

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

function isEnPassantCapture(position, fromRow, fromColumn, toRow, toColumn) {
    if (enPassant === null || enPassant.pawnRow !== fromRow || enPassant.targetRow !== toRow
        || enPassant.column !== toColumn || Math.abs(fromColumn - toColumn) !== 1) {
        return false;
    }

    const pawn = position[fromRow][fromColumn];
    const adjacentPawn = position[fromRow][toColumn];
    return position[toRow][toColumn] === ""
        && ((pawn === "P" && adjacentPawn === "p") || (pawn === "p" && adjacentPawn === "P"));
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
        const capturesPiece = target !== "" && target.toLowerCase() !== "k"
            && getPieceColor(target) !== getPieceColor(pawn);
        if (capturesPiece || isEnPassantCapture(currentPosition, row, column, nextRow, targetColumn)) {
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

function getCastlingMoves(row, column, player) {
    const homeRow = player === "white" ? 7 : 0;
    const opponent = player === "white" ? "black" : "white";
    if (row !== homeRow || column !== 4 || isSquareAttacked(currentPosition, row, column, opponent)) {
        return [];
    }

    // Check the square the king crosses with its original square now empty.
    const transitPosition = currentPosition.map(rank => rank.slice());
    transitPosition[row][column] = "";
    const rook = player === "white" ? "R" : "r";
    const moves = [];

    for (const side of castlingSides) {
        if (!castlingRights[player][side.name] || currentPosition[row][side.rookColumn] !== rook) {
            continue;
        }
        if (side.emptyColumns.some(emptyColumn => currentPosition[row][emptyColumn] !== "")) {
            continue;
        }
        if (!isSquareAttacked(transitPosition, row, side.rookTarget, opponent)) {
            moves.push(`${files[side.kingColumn]}${8 - row}`);
        }
    }

    return moves;
}

function movePieceOnBoard(position, fromRow, fromColumn, toRow, toColumn, piece) {
    const capturedEnPassant = isEnPassantCapture(position, fromRow, fromColumn, toRow, toColumn);
    const capturedPiece = position[capturedEnPassant ? fromRow : toRow][toColumn];
    if (capturedEnPassant) {
        position[fromRow][toColumn] = "";
    }

    position[fromRow][fromColumn] = "";
    position[toRow][toColumn] = piece;

    let castledSide = null;
    if (piece.toLowerCase() === "k" && fromRow === toRow && fromColumn === 4) {
        const side = castlingSides.find(option => option.kingColumn === toColumn);
        if (side !== undefined) {
            position[toRow][side.rookTarget] = position[toRow][side.rookColumn];
            position[toRow][side.rookColumn] = "";
            castledSide = side.name;
        }
    }
    return { capturedPiece, capturedEnPassant, castledSide };
}

function getLegalMoveOptions(row, column) {
    const { moves, captures } = getMoveOptions(row, column);
    const piece = currentPosition[row][column];
    const player = getPieceColor(piece);
    if (piece.toLowerCase() === "k") {
        moves.push(...getCastlingMoves(row, column, player));
    }

    // Try each destination on a copy, including all squares changed by a special move.
    function keepsKingSafe(destination) {
        const targetRow = 8 - Number(destination[1]);
        const targetColumn = files.indexOf(destination[0]);
        const position = currentPosition.map(rank => rank.slice());
        movePieceOnBoard(position, row, column, targetRow, targetColumn, piece);
        return findCheckedKing(position, player) === null;
    }

    return { moves: moves.filter(keepsKingSafe), captures: captures.filter(keepsKingSafe) };
}

function revokeRookCastlingRight(rights, piece, row, column) {
    if (piece.toLowerCase() !== "r") {
        return;
    }
    const player = getPieceColor(piece);
    const homeRow = player === "white" ? 7 : 0;
    const side = castlingSides.find(option => option.rookColumn === column);
    if (row === homeRow && side !== undefined) {
        rights[player][side.name] = false;
    }
}

function updateMovingCastlingRights(rights, piece, row, column) {
    if (piece.toLowerCase() === "k") {
        const player = getPieceColor(piece);
        rights[player].kingside = false;
        rights[player].queenside = false;
    } else {
        revokeRookCastlingRight(rights, piece, row, column);
    }
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

function isDeadByMaterial(position) {
    let knightCount = 0;
    let bishopSquareColor = null;

    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const kind = position[row][column].toLowerCase();
            if (kind === "" || kind === "k") {
                continue;
            }
            if (kind === "n") {
                knightCount++;
                continue;
            }
            if (kind !== "b") {
                return false;
            }

            const squareColor = (row + column) % 2;
            if (bishopSquareColor !== null && bishopSquareColor !== squareColor) {
                return false;
            }
            bishopSquareColor = squareColor;
        }
    }

    // Only same-color-square bishops or a single knight can remain besides the kings.
    return knightCount === 0 || (knightCount === 1 && bishopSquareColor === null);
}

function serializePosition(position, player, rights, enPassantSquare) {
    return JSON.stringify([position, player, rights, enPassantSquare]);
}

function getPositionKey() {
    let enPassantSquare = "";
    if (enPassant !== null) {
        const { pawnRow, column, targetRow } = enPassant;
        const destination = `${files[column]}${8 - targetRow}`;
        const activePawn = currentPlayer === "white" ? "P" : "p";

        // A double step changes the key only if it gives the next player a legal capture.
        const canCapture = [column - 1, column + 1].some(adjacentColumn =>
            currentPosition[pawnRow][adjacentColumn] === activePawn
            && getLegalMoveOptions(pawnRow, adjacentColumn).captures.includes(destination)
        );
        if (canCapture) {
            enPassantSquare = destination;
        }
    }

    return serializePosition(currentPosition, currentPlayer, castlingRights, enPassantSquare);
}

function recordCurrentPosition() {
    const key = getPositionKey();
    const occurrences = positionOccurrences.get(key) ?? 0;
    positionOccurrences.set(key, occurrences + 1);
}

function canClaimDrawNow(rule) {
    if (rule === "fifty") {
        return halfmoveClock >= claimHalfmoveLimit;
    }
    return (positionOccurrences.get(getPositionKey()) ?? 0) >= claimRepetitionLimit;
}

function wouldRepeatPosition(row, column, destination, piece) {
    const targetRow = 8 - Number(destination[1]);
    const targetColumn = files.indexOf(destination[0]);
    const position = currentPosition.map(rank => rank.slice());
    const rights = { white: { ...castlingRights.white }, black: { ...castlingRights.black } };
    movePieceOnBoard(position, row, column, targetRow, targetColumn, piece);
    updateMovingCastlingRights(rights, piece, row, column);

    // These moves cannot create an en passant right.
    const nextPlayer = currentPlayer === "white" ? "black" : "white";
    const key = serializePosition(position, nextPlayer, rights, "");
    return (positionOccurrences.get(key) ?? 0) >= claimRepetitionLimit - 1;
}

function getIntendedDrawClaimMoves(rule) {
    const claimMoves = [];
    if (rule === "fifty" && halfmoveClock !== claimHalfmoveLimit - 1) {
        return claimMoves;
    }
    if (rule === "threefold" && !Array.from(positionOccurrences.values()).some(count => count >= claimRepetitionLimit - 1)) {
        return claimMoves;
    }

    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const piece = currentPosition[row][column];
            if (piece === "" || piece.toLowerCase() === "p" || getPieceColor(piece) !== currentPlayer) {
                continue;
            }

            const origin = `${files[column]}${8 - row}`;
            // A pawn move or capture cannot return the board to an earlier position.
            const { moves } = getLegalMoveOptions(row, column);
            for (const destination of moves) {
                if (rule === "threefold" && !wouldRepeatPosition(row, column, destination, piece)) {
                    continue;
                }
                claimMoves.push({
                    value: `${origin}-${destination}`,
                    label: `${pieceNames[piece.toLowerCase()]} from ${origin} to ${destination}`
                });
            }
        }
    }

    return claimMoves;
}

function claimDraw(rule, intendedMove = "") {
    if (!Object.hasOwn(drawClaimResults, rule)
        || gameResult !== null || pendingPromotion !== null || pendingDrawClaim !== null) {
        return false;
    }

    if (!canClaimDrawNow(rule) && !getIntendedDrawClaimMoves(rule).some(move => move.value === intendedMove)) {
        return false;
    }

    declaredResult = drawClaimResults[rule];
    renderBoard();
    turn.focus();
    return true;
}

function canQueueDrawOffer() {
    // Black can offer with the first reply since both players will then have moved.
    return gameResult === null && movesPlayed > 0 && drawOfferedBy === null;
}

function hasIncomingDrawOffer() {
    return gameResult === null && movesPlayed >= 2
        && drawOfferedBy !== null && drawOfferedBy !== currentPlayer;
}

function updateDrawOfferControls() {
    const canOffer = canQueueDrawOffer();
    const canRespond = hasIncomingDrawOffer();
    offerDrawButton.hidden = !canOffer;
    offerDrawButton.setAttribute("aria-pressed", String(canOffer && drawOfferQueued));
    acceptDrawButton.hidden = !canRespond;
    declineDrawButton.hidden = !canRespond;

    if (canRespond) {
        const playerName = drawOfferedBy === "white" ? "White" : "Black";
        drawOfferMessage.textContent = `${playerName} offers a draw.`;
    } else {
        drawOfferMessage.textContent = canOffer && drawOfferQueued
            ? "The draw offer will be sent with your next move."
            : "";
    }
}

function toggleDrawOffer() {
    if (!canQueueDrawOffer() || pendingPromotion !== null || pendingDrawClaim !== null) {
        return false;
    }

    drawOfferQueued = !drawOfferQueued;
    updateDrawOfferControls();
    return true;
}

function respondToDrawOffer(accept) {
    if (!hasIncomingDrawOffer() || pendingPromotion !== null || pendingDrawClaim !== null) {
        return false;
    }

    drawOfferedBy = null;
    if (accept) {
        declaredResult = "Draw by agreement.";
        renderBoard();
        turn.focus();
    } else {
        updateDrawOfferControls();
        const nextSquare = selectedSquare ?? board.querySelector("button.square:enabled");
        nextSquare?.focus();
    }
    return true;
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
    if (gameResult !== null || pendingPromotion !== null || pendingDrawClaim !== null) {
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
        const label = destination.dataset.piece === ""
            ? `Capture en passant with ${currentPlayer} pawn from ${square.dataset.position} to ${position}`
            : `Capture ${getSquareLabel(destination.dataset.piece, position)} with ${currentPlayer} ${pieceName} from ${square.dataset.position}`;
        destination.setAttribute("aria-label", label);
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
    if (gameResult !== null || selectedSquare === null || pendingPromotion !== null || pendingDrawClaim !== null) {
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

    let placedPiece = piece;
    if (promotion !== null) {
        placedPiece = currentPlayer === "white" ? promotion.toUpperCase() : promotion;
    }
    const { capturedPiece, capturedEnPassant, castledSide } = movePieceOnBoard(
        currentPosition, fromRow, fromColumn, row, column, placedPiece
    );
    const isPawnMove = piece.toLowerCase() === "p";
    if (isPawnMove || capturedPiece !== "") {
        halfmoveClock = 0;
    } else {
        halfmoveClock++;
    }

    // Only the most recent move can give the opponent an en passant capture.
    enPassant = null;
    if (isPawnMove && Math.abs(row - fromRow) === 2) {
        enPassant = { pawnRow: row, column, targetRow: (fromRow + row) / 2 };
    }
    updateMovingCastlingRights(castlingRights, piece, fromRow, fromColumn);
    revokeRookCastlingRight(castlingRights, capturedPiece, row, column);
    const movingPlayer = currentPlayer === "white" ? "White" : "Black";
    movesPlayed++;
    drawOfferedBy = drawOfferQueued ? currentPlayer : null;
    drawOfferQueued = false;
    currentPlayer = currentPlayer === "white" ? "black" : "white";
    recordCurrentPosition();
    renderBoard();

    const nextPawn = currentPlayer === "white" ? "P" : "p";
    const nextPiece = board.querySelector(`button.square:enabled[data-piece="${nextPawn}"]`)
        || board.querySelector("button.square:enabled");

    let result = `moved from ${fromPosition} to ${toPosition}`;
    if (capturedEnPassant) {
        result = `captured en passant from ${fromPosition} to ${toPosition}`;
    } else if (capturedPiece !== "") {
        result = `from ${fromPosition} captured a ${getPieceColor(capturedPiece)} ${pieceNames[capturedPiece.toLowerCase()]} on ${toPosition}`;
    }
    if (promotion !== null) {
        result += ` and promoted to a ${pieceNames[promotion]}`;
    }
    const moveMessage = castledSide === null
        ? `${movingPlayer} ${pieceNames[piece.toLowerCase()]} ${result}`
        : `${movingPlayer} castled ${castledSide}`;
    const nextInstruction = gameResult === null ? `${turn.textContent}.` : "Reload the page to play again.";
    status.textContent = `${moveMessage}. ${nextInstruction}`;
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
    if (declaredResult !== null) {
        gameResult = declaredResult;
    } else if (!hasLegalMove(currentPlayer)) {
        const winner = currentPlayer === "white" ? "Black" : "White";
        gameResult = checkedKing === null ? "Stalemate. Draw." : `Checkmate. ${winner} wins.`;
    } else if (isDeadByMaterial(currentPosition)) {
        gameResult = "Draw by insufficient material.";
    } else if (halfmoveClock >= drawHalfmoveLimit) {
        gameResult = "Draw by the 75-move rule.";
    } else if ((positionOccurrences.get(getPositionKey()) ?? 0) >= drawRepetitionLimit) {
        gameResult = "Draw by fivefold repetition.";
    }

    if (gameResult !== null) {
        drawOfferQueued = false;
        drawOfferedBy = null;
    }
    claimDrawButton.hidden = gameResult !== null
        || (!canClaimDrawNow("fifty") && getIntendedDrawClaimMoves("fifty").length === 0);
    claimRepetitionButton.hidden = gameResult !== null
        || (!canClaimDrawNow("threefold") && getIntendedDrawClaimMoves("threefold").length === 0);
    updateDrawOfferControls();
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
    if (event.key === "Escape" && selectedSquare !== null && pendingPromotion === null && pendingDrawClaim === null) {
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

function openDrawClaim(rule) {
    if (gameResult !== null || pendingPromotion !== null || pendingDrawClaim !== null) {
        return;
    }
    if (canClaimDrawNow(rule)) {
        claimDraw(rule);
        return;
    }

    const moves = getIntendedDrawClaimMoves(rule);
    if (moves.length === 0) {
        return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a move";
    placeholder.disabled = true;
    drawClaimMove.replaceChildren(placeholder);
    for (const move of moves) {
        const option = document.createElement("option");
        option.value = move.value;
        option.textContent = move.label;
        drawClaimMove.appendChild(option);
    }
    drawClaimMove.value = "";
    drawClaimDialog.returnValue = "";
    pendingDrawClaim = rule;
    drawClaimDialog.showModal();
}

claimDrawButton.addEventListener("click", () => openDrawClaim("fifty"));
claimRepetitionButton.addEventListener("click", () => openDrawClaim("threefold"));
offerDrawButton.addEventListener("click", toggleDrawOffer);
acceptDrawButton.addEventListener("click", () => respondToDrawOffer(true));
declineDrawButton.addEventListener("click", () => respondToDrawOffer(false));

drawClaimDialog.addEventListener("close", () => {
    const rule = pendingDrawClaim;
    pendingDrawClaim = null;
    if (rule !== null && drawClaimDialog.returnValue === "claim") {
        claimDraw(rule, drawClaimMove.value);
    }
});

recordCurrentPosition();
renderBoard();
