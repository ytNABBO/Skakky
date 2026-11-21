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
const resignButton = document.getElementById("resign");
const resignationDialog = document.getElementById("resignation");
const resigningPlayerSelect = document.getElementById("resigning-player");
const moveHistoryBody = document.getElementById("move-history-body");
const moveHistoryTable = document.getElementById("move-history-table");
const moveHistoryEmpty = document.getElementById("move-history-empty");
const newGameButton = document.getElementById("new-game");
const newGameDialog = document.getElementById("new-game-dialog");
const timeControl = document.getElementById("time-control");
const startClockButton = document.getElementById("start-clock");
const clockPanel = document.getElementById("clock-panel");
const clockDisplays = {
    white: document.getElementById("white-clock"),
    black: document.getElementById("black-clock")
};
const timeControls = {
    "60+0": { time: 60000, increment: 0 },
    "120+1": { time: 120000, increment: 1000 },
    "180+0": { time: 180000, increment: 0 },
    "180+2": { time: 180000, increment: 2000 },
    "300+0": { time: 300000, increment: 0 },
    "600+0": { time: 600000, increment: 0 },
    "600+5": { time: 600000, increment: 5000 },
    "900+5": { time: 900000, increment: 5000 },
    "900+10": { time: 900000, increment: 10000 },
    "1800+0": { time: 1800000, increment: 0 }
};
let chessClock = null;
let clockTimer = null;
let pendingResignation = false;
let pendingNewGame = false;
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
const deadPositionPlyLimit = 8;
const deadPositionNodeLimit = 64;
const positionOccurrences = new Map();
const moveHistory = [];
let drawClaimMovesCache = null;
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

function copyPosition(position = currentPosition) {
    return position.map(row => row.slice());
}

function copyCastlingRights(rights = castlingRights) {
    return { white: { ...rights.white }, black: { ...rights.black } };
}

function restorePosition(saved) {
    saved.position.forEach((rank, row) => currentPosition[row].splice(0, 8, ...rank));
    currentPlayer = saved.player;
    enPassant = saved.enPassant;
    Object.assign(castlingRights.white, saved.rights.white);
    Object.assign(castlingRights.black, saved.rights.black);
}

function oppositePlayer(player) {
    return player === "white" ? "black" : "white";
}

function closeGameDialogs(clearReturnValue = false) {
    for (const dialog of [promotionDialog, drawClaimDialog, resignationDialog, newGameDialog]) {
        if (dialog.open) dialog.close("");
        if (clearReturnValue) dialog.returnValue = "";
    }
}

function hasPendingGameDialog() {
    return pendingPromotion !== null || pendingDrawClaim !== null || pendingResignation || pendingNewGame;
}

// Use elapsed time rather than interval counts, including after background-tab delays.
function formatClockTime(milliseconds) {
    const seconds = Math.ceil(Math.max(0, milliseconds) / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderClocks() {
    clockPanel.hidden = chessClock === null;
    for (const player of ["white", "black"]) {
        clockDisplays[player].textContent = chessClock === null
            ? "--:--" : formatClockTime(chessClock.remaining[player]);
        clockDisplays[player].dataset.running = String(chessClock?.activePlayer === player);
    }
    const locked = chessClock !== null || movesPlayed > 0 || gameResult !== null;
    if (chessClock === null && locked) timeControl.value = "";
    timeControl.disabled = locked;
    startClockButton.disabled = locked || !Object.hasOwn(timeControls, timeControl.value);
}

function startChessClock() {
    if (chessClock !== null || movesPlayed > 0 || gameResult !== null
        || hasPendingGameDialog()
        || !Object.hasOwn(timeControls, timeControl.value)) {
        return false;
    }
    const control = timeControls[timeControl.value];
    chessClock = {
        remaining: { white: control.time, black: control.time },
        increment: control.increment,
        timeControl: control.increment === 0 ? String(control.time / 1000)
            : `${control.time / 1000}+${control.increment / 1000}`,
        activePlayer: "white",
        lastTimestamp: performance.now()
    };
    clockTimer = setInterval(syncChessClock, 100);
    renderClocks();
    return true;
}

function stopChessClock() {
    if (clockTimer !== null) {
        clearInterval(clockTimer);
        clockTimer = null;
    }
    if (chessClock !== null) chessClock.activePlayer = null;
}

function syncChessClock() {
    if (chessClock === null || chessClock.activePlayer === null) return gameResult === null;
    const now = performance.now();
    const player = chessClock.activePlayer;
    chessClock.remaining[player] = Math.max(0,
        chessClock.remaining[player] - Math.max(0, now - chessClock.lastTimestamp));
    chessClock.lastTimestamp = now;
    if (chessClock.remaining[player] > 0) {
        renderClocks();
        return true;
    }

    const opponent = oppositePlayer(player);
    declaredResult = cannotMateByContinuation(opponent)
        ? "Draw on time: the opponent cannot checkmate."
        : `${player === "white" ? "White" : "Black"} ran out of time. ${opponent === "white" ? "White" : "Black"} wins.`;
    stopChessClock();
    // Invalidate callbacks before closing dialogs, whose close events are deferred.
    pendingPromotion = null;
    pendingDrawClaim = null;
    pendingResignation = false;
    pendingNewGame = false;
    closeGameDialogs();
    renderBoard();
    turn.focus();
    return false;
}

function completeClockMove(player) {
    if (chessClock === null || gameResult !== null) return;
    chessClock.remaining[player] += chessClock.increment;
    chessClock.activePlayer = currentPlayer;
    renderClocks();
    // The next player gets a fresh timestamp after the move updates finish.
    chessClock.lastTimestamp = performance.now();
}

// Convert piece codes into colors and accessible square labels.
function getPieceColor(piece) {
    return piece === piece.toUpperCase() ? "white" : "black";
}

function getSquareLabel(piece, position) {
    return piece === ""
        ? `Empty square ${position}`
        : `${getPieceColor(piece)} ${pieceNames[piece.toLowerCase()]} on ${position}`;
}

// Build Appendix C notation from the legal position before the move is played.
function getAlgebraicMove(fromRow, fromColumn, toRow, toColumn, promotion = null) {
    const piece = currentPosition[fromRow][fromColumn];
    const kind = piece.toLowerCase();
    if (kind === "k" && Math.abs(toColumn - fromColumn) === 2) {
        return toColumn > fromColumn ? "0-0" : "0-0-0";
    }
    const destination = `${files[toColumn]}${8 - toRow}`;
    const capture = currentPosition[toRow][toColumn] !== ""
        || isEnPassantCapture(currentPosition, fromRow, fromColumn, toRow, toColumn);
    let notation = kind === "p" ? (capture ? files[fromColumn] : "") : piece.toUpperCase();
    if (kind !== "p" && kind !== "k") {
        const alternatives = [];
        for (let row = 0; row < 8; row++) {
            for (let column = 0; column < 8; column++) {
                if ((row === fromRow && column === fromColumn) || currentPosition[row][column] !== piece) continue;
                const { moves, captures } = getLegalMoveOptions(row, column);
                if (moves.includes(destination) || captures.includes(destination)) alternatives.push({ row, column });
            }
        }
        if (alternatives.length > 0) {
            const sameFile = alternatives.some(other => other.column === fromColumn);
            const sameRank = alternatives.some(other => other.row === fromRow);
            notation += !sameFile ? files[fromColumn] : !sameRank ? String(8 - fromRow)
                : `${files[fromColumn]}${8 - fromRow}`;
        }
    }
    notation += `${capture ? "x" : ""}${destination}`;
    if (promotion !== null) notation += promotion.toUpperCase();
    return notation;
}

function renderMoveHistory() {
    const rows = new Map();
    for (const entry of moveHistory) {
        if (!rows.has(entry.number)) {
            const element = document.createElement("tr");
            const number = document.createElement("th");
            number.setAttribute("scope", "row");
            number.textContent = `${entry.number}.`;
            const white = document.createElement("td");
            const black = document.createElement("td");
            white.textContent = black.textContent = "—";
            for (const cell of [number, white, black]) element.appendChild(cell);
            rows.set(entry.number, { element, white, black });
        }
        rows.get(entry.number)[entry.player].textContent = entry.notation;
    }
    moveHistoryBody.replaceChildren(...Array.from(rows.values(), row => row.element));
    moveHistoryEmpty.hidden = moveHistory.length > 0;
    moveHistoryTable.hidden = moveHistory.length === 0;
}

function startNewGame() {
    stopChessClock();
    chessClock = null;
    // Invalidate old dialog callbacks before dismissing their UI.
    pendingPromotion = null;
    pendingDrawClaim = null;
    pendingResignation = false;
    pendingNewGame = false;
    closeGameDialogs(true);
    startingPosition.forEach((rank, row) => currentPosition[row].splice(0, 8, ...rank));
    currentPlayer = "white";
    selectedSquare = null;
    gameResult = null;
    declaredResult = null;
    enPassant = null;
    halfmoveClock = 0;
    movesPlayed = 0;
    drawOfferQueued = false;
    drawOfferedBy = null;
    for (const player of ["white", "black"]) {
        castlingRights[player].kingside = true;
        castlingRights[player].queenside = true;
    }
    moveHistory.splice(0);
    positionOccurrences.clear();
    timeControl.value = "";
    resigningPlayerSelect.value = "white";
    drawClaimMove.replaceChildren();
    drawClaimMove.value = "";
    recordCurrentPosition();
    renderBoard();
    renderMoveHistory();
    timeControl.focus();
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
    const opponent = oppositePlayer(player);
    return isSquareAttacked(position, row, column, opponent) ? { row, column } : null;
}

function getCastlingMoves(row, column, player) {
    const homeRow = player === "white" ? 7 : 0;
    const opponent = player === "white" ? "black" : "white";
    if (row !== homeRow || column !== 4 || isSquareAttacked(currentPosition, row, column, opponent)) {
        return [];
    }

    // Check the square the king crosses with its original square now empty.
    const transitPosition = copyPosition();
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
        const position = copyPosition();
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

// Prove a pawn blockade dead when no piece can break it or ever give check.
function isDeadByPawnBlockade(position, enPassantState = null) {
    if (enPassantState !== null) {
        if (typeof enPassantState !== "object") return false;
        const { pawnRow, column, targetRow } = enPassantState;
        if (!Number.isInteger(column) || column < 0 || column > 7
            || !Number.isInteger(pawnRow) || !Number.isInteger(targetRow)) return false;
        const movedPawn = pawnRow === 4 && targetRow === 5 ? "P"
            : pawnRow === 3 && targetRow === 2 ? "p" : null;
        if (movedPawn === null || position[pawnRow][column] !== movedPawn
            || position[targetRow][column] !== ""
            || position[movedPawn === "P" ? 6 : 1][column] !== "") return false;
        const capturingPawn = movedPawn === "P" ? "p" : "P";
        // Only an adjacent opposing pawn can use this one-move capture opportunity.
        // Reject even a possibly pinned capture: uncertainty must keep play active.
        if ([column - 1, column + 1].some(adjacentColumn =>
            position[pawnRow][adjacentColumn] === capturingPawn)) return false;
    }
    const kings = { white: [], black: [] };
    const pawns = [];
    const bishops = [];
    const knights = [];
    const pawnAttacks = { white: new Set(), black: new Set() };
    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const piece = position[row][column];
            if (piece === "") continue;
            const player = getPieceColor(piece);
            if (piece.toLowerCase() === "k") {
                kings[player].push([row, column]);
            } else if (piece.toLowerCase() === "p" && row > 0 && row < 7) {
                pawns.push({ row, column, player });
            } else if (piece.toLowerCase() === "b") {
                bishops.push({ row, column, player });
            } else if (piece.toLowerCase() === "n") {
                knights.push({ row, column, player });
            } else {
                return false;
            }
        }
    }
    if (pawns.length === 0 || kings.white.length !== 1 || kings.black.length !== 1
        || findCheckedKing(position, "white") !== null || findCheckedKing(position, "black") !== null) {
        return false;
    }
    for (const { row, column, player } of pawns) {
        const nextRow = row + (player === "white" ? -1 : 1);
        // Every pawn is blocked by another pawn, rather than by a movable king.
        if (position[nextRow][column].toLowerCase() !== "p") return false;
        const opponentPawn = player === "white" ? "p" : "P";
        for (const nextColumn of [column - 1, column + 1]) {
            if (nextColumn < 0 || nextColumn > 7) continue;
            if (position[nextRow][nextColumn] === opponentPawn) return false;
            pawnAttacks[player].add(nextRow * 8 + nextColumn);
        }
    }

    function getKingRegion(player) {
        const opponent = player === "white" ? "black" : "white";
        const opponentPawn = player === "white" ? "p" : "P";
        const ownPawn = player === "white" ? "P" : "p";
        const queue = kings[player].slice();
        const visited = new Set([queue[0][0] * 8 + queue[0][1]]);
        for (let index = 0; index < queue.length; index++) {
            const [row, column] = queue[index];
            for (const [dr, dc] of adjacentOffsets) {
                const nextRow = row + dr;
                const nextColumn = column + dc;
                const square = nextRow * 8 + nextColumn;
                if (nextRow < 0 || nextRow > 7 || nextColumn < 0 || nextColumn > 7
                    || visited.has(square) || pawnAttacks[opponent].has(square)) continue;
                const target = position[nextRow][nextColumn];
                if (target === ownPawn) continue;
                if (target === opponentPawn) return null;
                // Ignore all mobile pieces, including minor pieces that might be captured later.
                visited.add(square);
                queue.push([nextRow, nextColumn]);
            }
        }
        return visited;
    }

    const kingRegions = { white: getKingRegion("white"), black: getKingRegion("black") };
    if (kingRegions.white === null || kingRegions.black === null) return false;

    for (const bishop of bishops) {
        const opponent = bishop.player === "white" ? "black" : "white";
        const queue = [[bishop.row, bishop.column]];
        const visited = new Set([bishop.row * 8 + bishop.column]);
        const directions = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
        for (let index = 0; index < queue.length; index++) {
            const [row, column] = queue[index];
            const square = row * 8 + column;
            // Even a sacrificial pawn capture or a possible future check defeats this proof.
            if (pawnAttacks[opponent].has(square) || kingRegions[opponent].has(square)) return false;
            for (const [dr, dc] of directions) {
                let nextRow = row + dr;
                let nextColumn = column + dc;
                while (nextRow >= 0 && nextRow < 8 && nextColumn >= 0 && nextColumn < 8) {
                    const target = position[nextRow][nextColumn];
                    if (target.toLowerCase() === "p") {
                        if (getPieceColor(target) === opponent) return false;
                        break;
                    }
                    const destination = nextRow * 8 + nextColumn;
                    // Other mobile pieces never restrict this deliberately larger region.
                    if (!visited.has(destination)) {
                        visited.add(destination);
                        queue.push([nextRow, nextColumn]);
                    }
                    nextRow += dr;
                    nextColumn += dc;
                }
            }
        }
    }

    for (const knight of knights) {
        const opponent = knight.player === "white" ? "black" : "white";
        const queue = [[knight.row, knight.column]];
        const visited = new Set([knight.row * 8 + knight.column]);
        for (let index = 0; index < queue.length; index++) {
            const [row, column] = queue[index];
            if (pawnAttacks[opponent].has(row * 8 + column)) return false;
            for (const [dr, dc] of knightOffsets) {
                const nextRow = row + dr;
                const nextColumn = column + dc;
                if (nextRow < 0 || nextRow > 7 || nextColumn < 0 || nextColumn > 7) continue;
                const destination = nextRow * 8 + nextColumn;
                // A knight attacks its landing squares, even when they are not reachable moves.
                if (kingRegions[opponent].has(destination)) return false;
                const target = position[nextRow][nextColumn];
                if (target.toLowerCase() === "p") {
                    if (getPieceColor(target) === opponent) return false;
                    continue;
                }
                // Jumps ignore all mobile blockers, including pieces that could be sacrificed.
                if (!visited.has(destination)) {
                    visited.add(destination);
                    queue.push([nextRow, nextColumn]);
                }
            }
        }
    }

    // Pawns stay frozen and no minor piece can ever give check, even after captures.
    return true;
}

// Prove no continuation reaches a mate by the specified player, or by either player.
function hasNoMatingContinuation(matingPlayer, maxPlies = deadPositionPlyLimit, maxNodes = deadPositionNodeLimit) {
    if (matingPlayer !== null && matingPlayer !== "white" && matingPlayer !== "black") return false;
    if (!Number.isInteger(maxPlies) || maxPlies < 0 || maxPlies > deadPositionPlyLimit
        || !Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > deadPositionNodeLimit) return false;
    const pieces = currentPosition.flat();
    if (pieces.filter(piece => piece === "K").length !== 1
        || pieces.filter(piece => piece === "k").length !== 1) return false;

    function savePosition() {
        return {
            position: copyPosition(),
            player: currentPlayer,
            enPassant,
            rights: copyCastlingRights()
        };
    }

    const original = savePosition();
    const path = new Set();
    let nodes = 0;
    function allContinuationsSafe(depth) {
        if (nodes >= maxNodes) return false;
        nodes++;
        const replies = [];
        for (let row = 0; row < 8; row++) {
            for (let column = 0; column < 8; column++) {
                const piece = currentPosition[row][column];
                if (piece === "" || getPieceColor(piece) !== currentPlayer) continue;
                const { moves, captures } = getLegalMoveOptions(row, column);
                for (const destination of [...moves, ...captures]) {
                    const toRow = 8 - Number(destination[1]);
                    const toColumn = files.indexOf(destination[0]);
                    const promotes = piece.toLowerCase() === "p" && (toRow === 0 || toRow === 7);
                    for (const promotion of promotes ? promotionChoices : [null]) {
                        replies.push({ row, column, toRow, toColumn, promotion });
                    }
                }
            }
        }
        if (replies.length === 0) {
            // A mate by the other player also ends any chance for the specified player to mate.
            return findCheckedKing(currentPosition, currentPlayer) === null
                || (matingPlayer !== null && currentPlayer === matingPlayer);
        }
        if ((matingPlayer !== null && cannotMateByMaterial(currentPosition, matingPlayer))
            || isDeadByMaterial(currentPosition) || isDeadByPawnBlockade(currentPosition, enPassant)) return true;
        const key = serializePosition(currentPosition, currentPlayer, castlingRights, enPassant);
        // Close only the current path; every other exit from the cycle must still be checked.
        if (path.has(key)) return true;
        if (depth === maxPlies) return false;
        path.add(key);
        const parent = savePosition();
        try {
            for (const { row, column, toRow, toColumn, promotion } of replies) {
                let provedSafe;
                try {
                    const piece = currentPosition[row][column];
                    const placedPiece = promotion === null ? piece
                        : currentPlayer === "white" ? promotion.toUpperCase() : promotion;
                    const { capturedPiece } = movePieceOnBoard(currentPosition, row, column, toRow, toColumn, placedPiece);
                    updateMovingCastlingRights(castlingRights, piece, row, column);
                    revokeRookCastlingRight(castlingRights, capturedPiece, toRow, toColumn);
                    enPassant = piece.toLowerCase() === "p" && Math.abs(toRow - row) === 2
                        ? { pawnRow: toRow, column: toColumn, targetRow: (row + toRow) / 2 } : null;
                    currentPlayer = oppositePlayer(currentPlayer);
                    provedSafe = allContinuationsSafe(depth + 1);
                } finally {
                    restorePosition(parent);
                }
                // Any possible mating continuation for the target, or uncertainty, rejects the proof.
                if (!provedSafe) return false;
            }
            return true;
        } finally {
            path.delete(key);
        }
    }
    try {
        return allContinuationsSafe(0);
    } finally {
        restorePosition(original);
    }
}

function isDeadByContinuation(maxPlies = deadPositionPlyLimit, maxNodes = deadPositionNodeLimit) {
    return hasNoMatingContinuation(null, maxPlies, maxNodes);
}

function cannotMateByContinuation(player, maxPlies = deadPositionPlyLimit, maxNodes = deadPositionNodeLimit) {
    if (player !== "white" && player !== "black") return false;
    return hasNoMatingContinuation(player, maxPlies, maxNodes);
}

// Material can prove mating impossible even when the other player can still mate.
function cannotMateByMaterial(position, player) {
    const own = [];
    const opponent = [];
    const bishops = [];
    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            const piece = position[row][column];
            if (piece === "" || piece.toLowerCase() === "k") continue;
            const kind = piece.toLowerCase();
            (getPieceColor(piece) === player ? own : opponent).push(kind);
            if (kind === "b") bishops.push((row + column) % 2);
        }
    }
    if (own.length === 0) return true;
    if (own.length === 1 && own[0] === "n") {
        // Enemy pawns and minor pieces can help form a mating net.
        return opponent.every(kind => kind === "q");
    }
    // Same-color bishops give a single check. At least one square beside its diagonal
    // is safe from the attacking king, and a rook or queen there can block or capture.
    return own.every(kind => kind === "b")
        && opponent.every(kind => kind === "b" || kind === "r" || kind === "q")
        && bishops.every(color => color === bishops[0]);
}

function resign(player = currentPlayer) {
    if ((player !== "white" && player !== "black") || !syncChessClock()
        || gameResult !== null || hasPendingGameDialog()) {
        return false;
    }
    const opponent = player === "white" ? "black" : "white";
    const winner = opponent === "white" ? "White" : "Black";
    declaredResult = cannotMateByContinuation(opponent)
        ? "Draw on resignation: the opponent cannot checkmate."
        : `${player === "white" ? "White" : "Black"} resigns. ${winner} wins.`;
    renderBoard();
    turn.focus();
    return true;
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
    const position = copyPosition();
    const rights = copyCastlingRights();
    movePieceOnBoard(position, row, column, targetRow, targetColumn, piece);
    updateMovingCastlingRights(rights, piece, row, column);

    // These moves cannot create an en passant right.
    const nextPlayer = oppositePlayer(currentPlayer);
    const key = serializePosition(position, nextPlayer, rights, "");
    return (positionOccurrences.get(key) ?? 0) >= claimRepetitionLimit - 1;
}

function getIntendedDrawClaimMoves(rule) {
    const cacheKey = `${rule}:${getPositionKey()}:${halfmoveClock}`;
    if (drawClaimMovesCache?.key === cacheKey) return drawClaimMovesCache.moves;

    const claimMoves = [];
    if (rule === "fifty" && halfmoveClock !== claimHalfmoveLimit - 1) {
        drawClaimMovesCache = { key: cacheKey, moves: claimMoves };
        return claimMoves;
    }
    if (rule === "threefold" && !Array.from(positionOccurrences.values()).some(count => count >= claimRepetitionLimit - 1)) {
        drawClaimMovesCache = { key: cacheKey, moves: claimMoves };
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

    drawClaimMovesCache = { key: cacheKey, moves: claimMoves };
    return claimMoves;
}

function claimDraw(rule, intendedMove = "") {
    if (!syncChessClock() || !Object.hasOwn(drawClaimResults, rule)
        || gameResult !== null || hasPendingGameDialog()) {
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
    if (!syncChessClock() || !canQueueDrawOffer() || hasPendingGameDialog()) {
        return false;
    }

    drawOfferQueued = !drawOfferQueued;
    updateDrawOfferControls();
    return true;
}

function respondToDrawOffer(accept) {
    if (!syncChessClock() || !hasIncomingDrawOffer() || hasPendingGameDialog()) {
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
        : "Start a new game to play again.";
}

function selectPiece(square, piece, row, column) {
    if (!syncChessClock() || gameResult !== null || hasPendingGameDialog()) {
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
    if (!syncChessClock() || gameResult !== null || selectedSquare === null || hasPendingGameDialog()) {
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

    if (promotion !== null) {
        if (!reachesLastRank || !promotionChoices.includes(promotion)) return false;
        if (promotionDialog.open) promotionDialog.close(promotion);
    }

    const notation = getAlgebraicMove(fromRow, fromColumn, row, column, promotion);
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
    const movingColor = currentPlayer;
    const movingPlayer = currentPlayer === "white" ? "White" : "Black";
    movesPlayed++;
    drawOfferedBy = drawOfferQueued ? currentPlayer : null;
    drawOfferQueued = false;
    currentPlayer = oppositePlayer(currentPlayer);
    recordCurrentPosition();
    renderBoard();
    const checkSuffix = gameResult?.startsWith("Checkmate.") ? "#"
        : findCheckedKing(currentPosition, currentPlayer) !== null ? "+" : "";
    const offerSuffix = drawOfferedBy === movingColor ? " (=)" : "";
    moveHistory.push({ number: Math.ceil(movesPlayed / 2), player: movingColor, notation: notation + checkSuffix + offerSuffix });
    renderMoveHistory();

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
    const nextInstruction = gameResult === null ? `${turn.textContent}.` : "Start a new game to play again.";
    status.textContent = `${moveMessage}. ${nextInstruction}`;
    if (gameResult !== null) {
        turn.focus();
    } else {
        nextPiece?.focus();
    }
    completeClockMove(movingColor);
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
    } else if (isDeadByPawnBlockade(currentPosition, enPassant)) {
        gameResult = "Draw by dead position.";
    } else if (isDeadByContinuation()) {
        gameResult = "Draw by dead position.";
    } else if (halfmoveClock >= drawHalfmoveLimit) {
        gameResult = "Draw by the 75-move rule.";
    } else if ((positionOccurrences.get(getPositionKey()) ?? 0) >= drawRepetitionLimit) {
        gameResult = "Draw by fivefold repetition.";
    }

    if (gameResult !== null) {
        stopChessClock();
        drawOfferQueued = false;
        drawOfferedBy = null;
    }
    claimDrawButton.hidden = gameResult !== null
        || (!canClaimDrawNow("fifty") && getIntendedDrawClaimMoves("fifty").length === 0);
    claimRepetitionButton.hidden = gameResult !== null
        || (!canClaimDrawNow("threefold") && getIntendedDrawClaimMoves("threefold").length === 0);
    updateDrawOfferControls();
    resignButton.hidden = gameResult !== null;
    renderClocks();
    clearSelection();
    board.replaceChildren();
    const squareContainer = document.createDocumentFragment?.() ?? board;
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

            squareContainer.appendChild(square);
        }
    }
    if (squareContainer !== board) board.appendChild(squareContainer);
}

board.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedSquare !== null && !hasPendingGameDialog()) {
        const previousSelection = selectedSquare;
        clearSelection();
        previousSelection.focus();
    }
});

promotionDialog.addEventListener("submit", (event) => {
    const target = pendingPromotion;
    const promotion = event.submitter?.value;
    if (!promotionDialog.open || target === null || !promotionChoices.includes(promotion)) return;

    // Settle the clock and play the choice during submission, before the queued close event.
    event.preventDefault();
    pendingPromotion = null;
    if (!movePiece(target.row, target.column, promotion) && promotionDialog.open) {
        promotionDialog.close();
    }
});

promotionDialog.addEventListener("close", () => {
    if (!promotionDialog.open) pendingPromotion = null;
});

function openDrawClaim(rule) {
    if (!syncChessClock() || gameResult !== null || hasPendingGameDialog()) {
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

resignButton.addEventListener("click", () => {
    if (!syncChessClock() || gameResult !== null || hasPendingGameDialog()) return;
    pendingResignation = true;
    resigningPlayerSelect.value = currentPlayer;
    resignationDialog.returnValue = "";
    resignationDialog.showModal();
});

resignationDialog.addEventListener("close", () => {
    const wasPending = pendingResignation;
    pendingResignation = false;
    if (wasPending && resignationDialog.returnValue === "resign") {
        if (!resign(resigningPlayerSelect.value) && gameResult === null) resignButton.focus();
    } else if (wasPending) {
        resignButton.focus();
    }
});

newGameButton.addEventListener("click", () => {
    // Settle the clock and allow a restart even if the game has ended.
    syncChessClock();
    if (hasPendingGameDialog()) return;
    pendingNewGame = true;
    newGameDialog.returnValue = "";
    newGameDialog.showModal();
});

newGameDialog.addEventListener("close", () => {
    // A timeout can queue a close event before the dialog is reopened.
    if (newGameDialog.open || !pendingNewGame) return;
    // An overdue clock invalidates this confirmation before the pending flag is consumed.
    syncChessClock();
    if (!pendingNewGame) return;
    pendingNewGame = false;
    if (newGameDialog.returnValue === "start") {
        startNewGame();
    } else {
        newGameButton.focus();
    }
});

startClockButton.addEventListener("click", startChessClock);
timeControl.addEventListener("change", renderClocks);
document.addEventListener("visibilitychange", syncChessClock);

recordCurrentPosition();
renderBoard();
renderMoveHistory();
