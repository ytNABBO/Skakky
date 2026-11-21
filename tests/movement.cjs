const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const sourcePath = path.join(__dirname, '..', 'script.js');
const source = fs.readFileSync(sourcePath, 'utf8');

// Rendering is exercised separately in a browser; these tests need only a minimal DOM.
function createElement() {
    const listeners = {};
    return {
        dataset: {},
        classList: { add() {}, remove() {} },
        addEventListener(type, callback) { listeners[type] = callback; },
        dispatch(type, event) { listeners[type]?.(event); },
        showModal() { this.open = true; },
        close(value) { this.open = false; this.returnValue = value; listeners.close?.(); },
        submit(value) {
            let prevented = false;
            this.dispatch('submit', { submitter: { value }, preventDefault() { prevented = true; } });
            if (!prevented) this.close(value);
        },
        setAttribute() {},
        appendChild() {},
        replaceChildren() {},
        focus() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
}

const context = vm.createContext({
    document: { getElementById: createElement, createElement, addEventListener() {} }
});
vm.runInContext(source, context);
assert.equal(vm.runInContext('positionOccurrences.get(getPositionKey())', context), 1,
    'The standard starting position counts as the first occurrence.');
const files = 'abcdefgh';

// Inspect every possible destination independently of the production ray/offset generators.
function reference(board, row, column) {
    const piece = board[row][column];
    const kind = piece.toLowerCase();
    const white = piece === piece.toUpperCase();
    const moves = [];
    const captures = [];

    for (let targetRow = 0; targetRow < 8; targetRow++) {
        for (let targetColumn = 0; targetColumn < 8; targetColumn++) {
            const rowDistance = targetRow - row;
            const columnDistance = targetColumn - column;
            const absoluteRowDistance = Math.abs(rowDistance);
            const absoluteColumnDistance = Math.abs(columnDistance);
            if (!absoluteRowDistance && !absoluteColumnDistance) continue;

            const target = board[targetRow][targetColumn];
            const enemy = target
                && ((target === target.toUpperCase()) !== white)
                && target.toLowerCase() !== 'k';
            let allowed = false;

            if (kind === 'p') {
                const direction = white ? -1 : 1;
                const startingRow = white ? 6 : 1;
                allowed = columnDistance === 0 && !target
                    && (rowDistance === direction
                        || (row === startingRow && rowDistance === 2 * direction
                            && !board[row + direction][column]));
                if (rowDistance === direction && absoluteColumnDistance === 1 && enemy) {
                    captures.push(`${files[targetColumn]}${8 - targetRow}`);
                }
            } else {
                if (kind === 'n') {
                    allowed = absoluteRowDistance * absoluteColumnDistance === 2;
                } else if (kind === 'k') {
                    allowed = Math.max(absoluteRowDistance, absoluteColumnDistance) === 1;
                } else {
                    const straight = rowDistance === 0 || columnDistance === 0;
                    const diagonal = absoluteRowDistance === absoluteColumnDistance;
                    allowed = kind === 'r' ? straight : kind === 'b' ? diagonal : straight || diagonal;
                    if (allowed) {
                        const steps = Math.max(absoluteRowDistance, absoluteColumnDistance);
                        const rowStep = Math.sign(rowDistance);
                        const columnStep = Math.sign(columnDistance);
                        for (let step = 1; step < steps; step++) {
                            if (board[row + step * rowStep][column + step * columnStep]) {
                                allowed = false;
                            }
                        }
                    }
                }
                if (allowed && enemy) captures.push(`${files[targetColumn]}${8 - targetRow}`);
                allowed = allowed && !target;
            }
            if (allowed) moves.push(`${files[targetColumn]}${8 - targetRow}`);
        }
    }
    return { moves: moves.sort(), captures: captures.sort() };
}

let seed = 246813579;
function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
}

let comparisons = 0;
for (const piece of 'PNBRQKpnbrqk') {
    for (let row = 0; row < 8; row++) {
        for (let column = 0; column < 8; column++) {
            for (let fixture = 0; fixture < 8; fixture++) {
                const choices = ['', '', '', '', 'P', 'p', 'N', 'n', 'B', 'b', 'R', 'r', 'Q', 'q', 'K', 'k'];
                const board = Array.from({ length: 8 }, () => Array.from({ length: 8 },
                    () => fixture === 0 ? '' : choices[Math.floor(random() * choices.length)]));
                board[row][column] = piece;
                context.fixture = board;
                vm.runInContext('for (let row = 0; row < 8; row++) currentPosition[row].splice(0, 8, ...fixture[row]);', context);
                const actual = JSON.parse(JSON.stringify(vm.runInContext(`getMoveOptions(${row}, ${column})`, context)));
                actual.moves.sort();
                actual.captures.sort();
                assert.deepEqual(actual, reference(board, row, column),
                    `Mismatch ${piece} ${files[column]}${8 - row} fixture ${fixture}`);
                assert.equal(new Set(actual.moves).size, actual.moves.length);
                assert.equal(new Set(actual.captures).size, actual.captures.length);
                comparisons++;
            }
        }
    }
}
console.log(`PASS: ${comparisons} independent movement comparisons across all six piece types, both colors, every source square, empty boards and randomized blockers.`);

function setPosition(pieces) {
    context.fixture = Array.from({ length: 8 }, () => Array(8).fill(''));
    for (const [square, piece] of Object.entries(pieces)) {
        context.fixture[8 - Number(square[1])][files.indexOf(square[0])] = piece;
    }
    vm.runInContext('for (let row = 0; row < 8; row++) currentPosition[row].splice(0, 8, ...fixture[row]);', context);
}

function legalOptions(square) {
    const row = 8 - Number(square[1]);
    const column = files.indexOf(square[0]);
    return vm.runInContext(`getLegalMoveOptions(${row}, ${column})`, context);
}

setPosition({ e1: 'K', e2: 'R', e8: 'r', a8: 'k' });
const pinnedRook = legalOptions('e2');
assert(!pinnedRook.moves.includes('d2'), 'A pinned rook cannot expose its king.');
assert(pinnedRook.moves.includes('e3'), 'A pinned rook can keep blocking the attack.');
assert(pinnedRook.captures.includes('e8'), 'A pinned rook can capture the attacker.');
assert.equal(vm.runInContext('JSON.stringify(currentPosition)', context), JSON.stringify(context.fixture),
    'Simulating moves must preserve the position.');

setPosition({ e8: 'k', c7: 'p', b5: 'B', e1: 'K' });
assert.equal(vm.runInContext('findCheckedKing(currentPosition, "black")?.column', context), 4);
assert.deepEqual(Array.from(legalOptions('c7').moves), ['c6'], 'Black must block the diagonal check.');

setPosition({ e1: 'K', e2: 'p', e8: 'r', a8: 'k' });
assert(!legalOptions('e1').captures.includes('e2'), 'The king cannot capture a defended piece.');
assert(!legalOptions('e1').moves.includes('d1'), 'Pawns attack empty diagonals.');
setPosition({ e1: 'K', e2: 'r', a8: 'k' });
assert(legalOptions('e1').captures.includes('e2'), 'The king can capture an undefended attacker.');
setPosition({ e2: 'K', e8: 'r', a8: 'k' });
assert(!legalOptions('e2').moves.includes('e1'), 'Vacating the king square can open an attack on the destination.');

setPosition({ e4: 'K', e6: 'k' });
assert(!legalOptions('e4').moves.includes('e5'), 'Kings cannot move next to each other.');
setPosition({ e4: 'K', a8: 'k', d6: 'p' });
assert(!legalOptions('e4').moves.includes('e5'), 'A king cannot enter a diagonal attacked by Black.');
assert(legalOptions('e4').moves.includes('d5'), 'Black pawns do not attack straight ahead.');
setPosition({ e5: 'k', a1: 'K', d3: 'P' });
assert(!legalOptions('e5').moves.includes('e4'), 'White pawn attacks must use the opposite direction.');
assert(legalOptions('e5').moves.includes('d4'), 'A pawn does not attack straight ahead.');

setPosition({ f4: 'K', e1: 'R', e8: 'k', e7: 'n' });
assert(!legalOptions('f4').moves.includes('f5'), 'A pinned enemy knight still attacks its destinations.');
setPosition({ e1: 'K', d2: 'B', e8: 'r', f3: 'n', a8: 'k' });
assert.deepEqual(Array.from(legalOptions('d2').moves), [], 'Blocking one attack cannot answer a double check.');

console.log('PASS: king safety, pinned pieces, check responses, defended captures and attack directions.');

function turnMessage(player) {
    context.testPlayer = player;
    return vm.runInContext('currentPlayer = testPlayer; renderBoard(); turn.textContent;', context);
}

setPosition({ c6: 'K', b7: 'Q', a8: 'k' });
assert.equal(turnMessage('black'), 'Checkmate. White wins.');
setPosition({ c3: 'k', b2: 'q', a1: 'K' });
assert.equal(turnMessage('white'), 'Checkmate. Black wins.');
setPosition({ c6: 'K', c7: 'Q', a8: 'k' });
assert.equal(turnMessage('black'), 'Stalemate. Draw.');
setPosition({ a1: 'K', b3: 'B', c3: 'k', c2: 'p', a2: 'r', a8: 'r' });
assert.equal(turnMessage('white'), 'White to move (in check)', 'A capture by another piece can prevent checkmate.');

console.log('PASS: checkmate for both colors, stalemate and a capture-only check response.');

const whiteCastlingPosition = { e1: 'K', a1: 'R', h1: 'R', d8: 'k' };
function castlingDestinations(kingSquare) {
    const rank = kingSquare[1];
    const { moves } = legalOptions(kingSquare);
    return [`c${rank}`, `g${rank}`].filter(square => moves.includes(square));
}

setPosition(whiteCastlingPosition);
assert.deepEqual(castlingDestinations('e1'), ['c1', 'g1']);
assert.equal(vm.runInContext('JSON.stringify(currentPosition)', context), JSON.stringify(context.fixture),
    'Checking castling options must leave both king and rooks in place.');
setPosition({ e8: 'k', a8: 'r', h8: 'r', d1: 'K' });
assert.deepEqual(castlingDestinations('e8'), ['c8', 'g8']);
setPosition({ ...whiteCastlingPosition, b1: 'N', f1: 'B' });
assert.deepEqual(castlingDestinations('e1'), [], 'All squares between each rook and the king must be empty.');
setPosition({ ...whiteCastlingPosition, e8: 'r' });
assert.deepEqual(castlingDestinations('e1'), [], 'A king in check cannot castle.');
for (const square of ['f8', 'g8']) {
    setPosition({ ...whiteCastlingPosition, [square]: 'r' });
    assert.deepEqual(castlingDestinations('e1'), ['c1'], 'An attacked transit or destination square blocks castling.');
}
setPosition({ ...whiteCastlingPosition, b8: 'r' });
assert.deepEqual(castlingDestinations('e1'), ['c1', 'g1'], 'An attack on b1 does not block queenside castling.');
setPosition({ ...whiteCastlingPosition, h1: '' });
assert.deepEqual(castlingDestinations('e1'), ['c1'], 'Castling requires the corresponding rook.');
setPosition(whiteCastlingPosition);
vm.runInContext('castlingRights.white.kingside = false;', context);
assert.deepEqual(castlingDestinations('e1'), ['c1'], 'A rook returning to its original square cannot restore lost castling rights.');

console.log('PASS: castling for both colors, path clearance, attacked squares, missing rooks and lost rights.');

setPosition({ a1: 'K', a8: 'k', e5: 'P', d5: 'p' });
assert(!legalOptions('e5').captures.includes('d6'), 'An adjacent pawn alone does not allow en passant.');
vm.runInContext('enPassant = { pawnRow: 3, column: 3, targetRow: 2 };', context);
assert.deepEqual(Array.from(legalOptions('e5').captures), ['d6'], 'White can capture a pawn that just advanced two squares.');
assert.equal(vm.runInContext('JSON.stringify(currentPosition)', context), JSON.stringify(context.fixture),
    'Calculating en passant must leave both pawns in place.');

setPosition({ a1: 'K', a8: 'k', e4: 'p', d4: 'P' });
vm.runInContext('enPassant = { pawnRow: 4, column: 3, targetRow: 5 };', context);
assert.deepEqual(Array.from(legalOptions('e4').captures), ['d3'], 'Black can capture en passant in the opposite direction.');

setPosition({ h5: 'K', g5: 'P', a8: 'k', a5: 'r', f5: 'p' });
vm.runInContext('enPassant = { pawnRow: 3, column: 5, targetRow: 2 };', context);
assert(vm.runInContext('getMoveOptions(3, 6).captures.includes("f6")', context));
assert(!legalOptions('g5').captures.includes('f6'), 'Removing both pawns would expose the king to the rook.');

setPosition({ e4: 'K', e5: 'P', f4: 'P', a8: 'k', c5: 'q', g4: 'q', b4: 'n', d5: 'p' });
vm.runInContext('enPassant = { pawnRow: 3, column: 3, targetRow: 2 };', context);
assert.deepEqual(Array.from(legalOptions('e5').captures), ['d6'], 'Removing the checking pawn can resolve check.');
assert.equal(turnMessage('white'), 'White to move (in check)', 'An en passant escape can prevent checkmate.');
vm.runInContext('enPassant = null;', context);
assert.equal(turnMessage('white'), 'Checkmate. Black wins.', 'Without the en passant right there is no response.');

console.log('PASS: en passant for both colors, discovered check and an en passant escape from check.');

function setDrawPosition(pieces, clock) {
    setPosition(pieces);
    context.testClock = clock;
    vm.runInContext('halfmoveClock = testClock;', context);
    turnMessage('white');
}

function playMove(from, to, promotion = null) {
    context.move = { from, row: 8 - Number(to[1]), column: files.indexOf(to[0]), promotion };
    return vm.runInContext(`
        selectedSquare = document.createElement('button');
        selectedSquare.dataset.position = move.from;
        movePiece(move.row, move.column, move.promotion);
    `, context);
}

setDrawPosition({ a1: 'K', b2: 'R', h8: 'k', g7: 'r' }, 148);
assert.equal(playMove('a1', 'c3'), false, 'An illegal move cannot count toward a draw.');
assert.equal(vm.runInContext('halfmoveClock', context), 148);
assert.equal(playMove('b2', 'b3'), true);
assert.equal(vm.runInContext('turn.textContent', context), 'Black to move', '149 quiet half-moves are not enough.');
assert.equal(playMove('g7', 'g6'), true);
assert.equal(vm.runInContext('turn.textContent', context), 'Draw by the 75-move rule.');
assert.equal(playMove('b3', 'b4'), false, 'The board must stop accepting moves after the draw.');

for (const [pieces, from, to, promotion] of [
    [{ a1: 'K', b2: 'P', h8: 'k' }, 'b2', 'b4', null],
    [{ a1: 'K', b2: 'R', b5: 'n', h8: 'k', g7: 'r' }, 'b2', 'b5', null],
    [{ a1: 'K', b7: 'P', h6: 'k', h7: 'p' }, 'b7', 'b8', 'n']
]) {
    setDrawPosition(pieces, 149);
    assert.equal(playMove(from, to, promotion), true);
    assert.equal(vm.runInContext('halfmoveClock', context), 0, 'A pawn move, promotion or capture resets the clock.');
    assert.equal(vm.runInContext('turn.textContent', context), 'Black to move');
}

vm.runInContext('castlingRights.white.kingside = true;', context);
setDrawPosition({ e1: 'K', h1: 'R', e8: 'k' }, 148);
assert.equal(playMove('e1', 'g1'), true);
assert.equal(vm.runInContext('halfmoveClock', context), 149, 'Castling counts as one quiet move.');

setDrawPosition({ c6: 'K', d7: 'Q', a8: 'k' }, 149);
assert.equal(playMove('d7', 'b7'), true);
assert.equal(vm.runInContext('halfmoveClock', context), 150);
assert.equal(vm.runInContext('turn.textContent', context), 'Checkmate. White wins.', 'Checkmate takes precedence over the draw.');

console.log('PASS: 75-move threshold, legal moves only, resets, castling and checkmate precedence.');

function positionKey() {
    return vm.runInContext('getPositionKey()', context);
}

setDrawPosition({ e1: 'K', f1: 'B', h1: 'R', e8: 'k' }, 0);
vm.runInContext('castlingRights.white.kingside = true;', context);
const originalKey = positionKey();
vm.runInContext('currentPlayer = "black";', context);
assert.notEqual(positionKey(), originalKey, 'A different side to move changes the position.');
vm.runInContext('currentPlayer = "white"; halfmoveClock = 4;', context);
assert.equal(positionKey(), originalKey, 'The half-move count does not change position identity.');
vm.runInContext('castlingRights.white.kingside = false;', context);
assert.notEqual(positionKey(), originalKey, 'Losing castling rights changes the position even when the path is blocked.');

setPosition({ a1: 'K', a8: 'k', e5: 'P', d5: 'p' });
const withoutEnPassant = positionKey();
vm.runInContext('enPassant = { pawnRow: 3, column: 3, targetRow: 2 };', context);
assert.notEqual(positionKey(), withoutEnPassant, 'A legal en passant capture changes the position.');

setPosition({ h5: 'K', g5: 'P', a8: 'k', a5: 'r', f5: 'p' });
vm.runInContext('enPassant = null;', context);
const pinnedPosition = positionKey();
vm.runInContext('enPassant = { pawnRow: 3, column: 5, targetRow: 2 };', context);
assert.equal(positionKey(), pinnedPosition, 'An en passant capture that exposes the king does not change the position.');

vm.runInContext('enPassant = null; positionOccurrences.clear();', context);
setDrawPosition({ e1: 'K', g1: 'N', e8: 'k', g8: 'n' }, 0);
vm.runInContext('recordCurrentPosition(); renderBoard(); renderBoard();', context);
assert.equal(vm.runInContext('positionOccurrences.get(getPositionKey())', context), 1,
    'Redrawing the same position must not count as a repeat.');

for (let cycle = 1; cycle <= 4; cycle++) {
    for (const [from, to] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) {
        assert.equal(playMove(from, to), true);
    }
    assert.equal(vm.runInContext('positionOccurrences.get(getPositionKey())', context), cycle + 1);
    assert.equal(vm.runInContext('turn.textContent', context),
        cycle === 4 ? 'Draw by fivefold repetition.' : 'White to move');
}
assert.equal(playMove('g1', 'f3'), false, 'The game must stop accepting moves after fivefold repetition.');

console.log('PASS: fivefold repetition, position identity, first occurrence and redraws.');

const pinnedClaimPosition = { e1: 'K', e2: 'R', a8: 'k', e8: 'r' };
setDrawPosition(pinnedClaimPosition, 98);
assert(vm.runInContext('claimDrawButton.hidden', context), 'The claim is unavailable with two half-moves still required.');
assert.equal(vm.runInContext('claimDraw("fifty", "e2-e3")', context), false);

setDrawPosition(pinnedClaimPosition, 99);
const intendedMoves = vm.runInContext('getIntendedDrawClaimMoves("fifty").map(move => move.value)', context);
assert(intendedMoves.includes('e2-e3'), 'A legal quiet move can be nominated.');
assert(!intendedMoves.includes('e2-f2'), 'A pinned piece cannot nominate an illegal move.');
assert(!intendedMoves.includes('e2-e8'), 'A capture resets the clock and cannot be nominated.');
assert.equal(vm.runInContext('claimDraw("fifty")', context), false, 'At 99 half-moves a nomination is required.');
assert.equal(vm.runInContext('claimDraw("fifty", "e2-e3")', context), true);
assert.equal(vm.runInContext('turn.textContent', context), 'Draw claimed under the 50-move rule.');
assert.equal(vm.runInContext('currentPosition[6][4]', context), 'R', 'The intended move must not be played.');
assert.equal(vm.runInContext('currentPlayer', context), 'white');
assert.equal(vm.runInContext('halfmoveClock', context), 99);
assert.equal(turnMessage('white'), 'Draw claimed under the 50-move rule.', 'A redraw must preserve the result.');

vm.runInContext('declaredResult = null;', context);
const pawnOnlyClaimPosition = { a1: 'K', b1: 'B', a2: 'P', b2: 'P', c2: 'P', h8: 'k' };
setDrawPosition(pawnOnlyClaimPosition, 99);
assert(vm.runInContext('claimDrawButton.hidden', context), 'Pawn moves cannot be nominated.');
setDrawPosition(pawnOnlyClaimPosition, 100);
assert.equal(vm.runInContext('turn.textContent', context), 'White to move', 'The 50-move draw requires a claim.');
assert(!vm.runInContext('claimDrawButton.hidden', context), 'At 100 half-moves no nomination is required.');
assert.equal(vm.runInContext('claimDraw("fifty")', context), true);
assert.equal(vm.runInContext('turn.textContent', context), 'Draw claimed under the 50-move rule.');

console.log('PASS: 50-move claims at the threshold or with a legal intended move.');

const knightCycle = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']];
function reachIntendedRepetition() {
    vm.runInContext('declaredResult = null; positionOccurrences.clear(); castlingRights.white.kingside = true;', context);
    setDrawPosition({ e1: 'K', g1: 'N', h1: 'R', e8: 'k', g8: 'n', h8: 'r' }, 0);
    vm.runInContext('recordCurrentPosition();', context);
    assert(vm.runInContext('claimRepetitionButton.hidden', context));
    for (const [from, to] of [...knightCycle, ...knightCycle.slice(0, 3)]) {
        assert.equal(playMove(from, to), true);
    }
}

reachIntendedRepetition();
const repetitionSnapshot = 'JSON.stringify([getPositionKey(), halfmoveClock, Array.from(positionOccurrences)])';
const beforeClaim = vm.runInContext(repetitionSnapshot, context);
assert.equal(vm.runInContext('canClaimDrawNow("threefold")', context), false);
assert.deepEqual(Array.from(vm.runInContext('getIntendedDrawClaimMoves("threefold").map(move => move.value)', context)),
    ['f6-g8'], 'Only a move that would restore the same position a third time can be nominated.');
assert.equal(vm.runInContext('claimDraw("threefold", "f6-e4")', context), false);
vm.runInContext('claimRepetitionButton.dispatch("click"); drawClaimMove.value = "f6-g8"; drawClaimDialog.submit("claim");', context);
assert.equal(vm.runInContext('drawClaimDialog.open', context), false);
assert.equal(vm.runInContext('turn.textContent', context), 'Draw claimed by threefold repetition.');
assert.equal(vm.runInContext(repetitionSnapshot, context), beforeClaim,
    'A prospective claim must leave the board, turn, castling rights and counters unchanged.');

reachIntendedRepetition();
assert.equal(playMove('f6', 'g8'), true);
assert.equal(vm.runInContext('turn.textContent', context), 'White to move', 'Threefold repetition requires a claim.');
assert.equal(vm.runInContext('claimDraw("threefold")', context), true);
assert.equal(turnMessage('white'), 'Draw claimed by threefold repetition.', 'The claimed draw must survive a redraw.');

console.log('PASS: direct and intended threefold claims, valid nominations and unchanged game state.');

vm.runInContext(`
    declaredResult = null;
    movesPlayed = 0;
    halfmoveClock = 0;
    enPassant = null;
    positionOccurrences.clear();
    startingPosition.forEach((rank, row) => currentPosition[row].splice(0, 8, ...rank));
    currentPlayer = "white";
    recordCurrentPosition();
    renderBoard();
`, context);
assert.equal(vm.runInContext('toggleDrawOffer()', context), false, 'A draw cannot be offered before the first move.');
assert.equal(playMove('e2', 'e4'), true);
assert.equal(vm.runInContext('toggleDrawOffer()', context), true);
assert.equal(vm.runInContext('respondToDrawOffer(true)', context), false, 'A queued offer cannot be accepted.');
assert.equal(vm.runInContext('toggleDrawOffer()', context), true, 'The player can cancel before sending.');
assert.equal(vm.runInContext('toggleDrawOffer()', context), true);
assert.equal(playMove('e7', 'e4'), false);
assert(vm.runInContext('drawOfferQueued', context), 'A rejected move cannot send the offer.');
assert.equal(playMove('e7', 'e5'), true);
assert.equal(vm.runInContext('drawOfferMessage.textContent', context), 'Black offers a draw.');

assert.equal(vm.runInContext('respondToDrawOffer(false)', context), true);
assert.equal(vm.runInContext('turn.textContent', context), 'White to move');
assert.equal(vm.runInContext('toggleDrawOffer()', context), true);
assert.equal(playMove('g1', 'f3'), true);
assert.equal(playMove('b8', 'c6'), true);
assert.equal(vm.runInContext('hasIncomingDrawOffer()', context), false, 'Playing a move declines the offer.');

assert.equal(vm.runInContext('toggleDrawOffer()', context), true);
assert.equal(playMove('f1', 'c4'), true);
const beforeAgreement = vm.runInContext(repetitionSnapshot, context);
assert.equal(vm.runInContext('respondToDrawOffer(true)', context), true);
assert.equal(turnMessage('black'), 'Draw by agreement.');
assert.equal(vm.runInContext(repetitionSnapshot, context), beforeAgreement, 'Accepting changes only the result.');
assert.equal(playMove('g8', 'f6'), false, 'Play must stop after an accepted offer.');

console.log('PASS: offer timing, cancellation, explicit and implicit decline, and draw by agreement.');

vm.runInContext('declaredResult = null; positionOccurrences.clear(); enPassant = null;', context);
const deadMaterialPositions = [
    [{ a1: 'K', h8: 'k' }, 'only the two kings'],
    [{ a1: 'K', c1: 'B', h8: 'k' }, 'one bishop besides the kings'],
    [{ a1: 'K', c3: 'N', h8: 'k' }, 'one knight besides the kings'],
    [{ a1: 'K', c1: 'B', h8: 'k', f8: 'b' }, 'bishops on the same square color']
];

for (const [pieces, description] of deadMaterialPositions) {
    setPosition(pieces);
    assert.equal(vm.runInContext('isDeadByMaterial(currentPosition)', context), true, description);
    assert.equal(turnMessage('white'), 'Draw by insufficient material.', description);
    assert.equal(playMove('a1', 'a2'), false, 'A dead game must stop accepting moves.');
}

for (const [pieces, description] of [
    [{ a1: 'K', c2: 'N', b3: 'N', h8: 'k' }, 'two knights'],
    [{ a1: 'K', c1: 'B', h8: 'k', g8: 'b' }, 'bishops on opposite square colors'],
    [{ a1: 'K', b1: 'P', h8: 'k' }, 'a remaining pawn']
]) {
    setPosition(pieces);
    assert.equal(vm.runInContext('isDeadByMaterial(currentPosition)', context), false, description);
    assert.notEqual(turnMessage('white'), 'Draw by insufficient material.', description);
}

console.log('PASS: automatic insufficient-material draws and positions that must remain in play.');

// Exercise actual promotion moves, including captures and all underpromotions.
for (const player of ['white', 'black']) {
    for (const choice of ['q', 'r', 'b', 'n']) {
        vm.runInContext('declaredResult = null; halfmoveClock = 0; positionOccurrences.clear();', context);
        setPosition(player === 'white'
            ? { a1: 'K', b7: 'P', c8: 'r', h6: 'k', h7: 'p' }
            : { a3: 'K', b2: 'p', c1: 'R', h8: 'k', a2: 'P' });
        turnMessage(player);
        assert.equal(playMove(player === 'white' ? 'b7' : 'b2', player === 'white' ? 'c8' : 'c1', choice), true);
        assert.equal(vm.runInContext(`currentPosition[${player === 'white' ? 0 : 7}][2]`, context),
            player === 'white' ? choice.toUpperCase() : choice);
        assert.equal(vm.runInContext('halfmoveClock', context), 0);
    }
}
console.log('PASS: capture promotions to queen, rook, bishop and knight for both colors.');

function prepareResignation(pieces, player = 'white') {
    vm.runInContext(`
        declaredResult = null; halfmoveClock = 0; positionOccurrences.clear();
        pendingPromotion = null; pendingDrawClaim = null; pendingResignation = false;
    `, context);
    setPosition(pieces);
    turnMessage(player);
}

for (const player of ['white', 'black']) {
    prepareResignation({ e1: 'K', d1: 'Q', e8: 'k', d8: 'q' }, player);
    const beforeResignation = vm.runInContext(repetitionSnapshot, context);
    vm.runInContext('resignButton.dispatch("click")', context);
    assert.equal(vm.runInContext('resignationDialog.open', context), true);
    assert.equal(playMove(player === 'white' ? 'd1' : 'd8', player === 'white' ? 'd2' : 'd7'), false);
    assert.equal(vm.runInContext('toggleDrawOffer()', context), false);
    assert.equal(vm.runInContext('resign()', context), false, 'Confirmation must precede resignation.');
    vm.runInContext('resignationDialog.submit("cancel")', context);
    assert.equal(vm.runInContext(repetitionSnapshot, context), beforeResignation);
    assert.equal(vm.runInContext('gameResult', context), null);
    // Escape closes a dialog without a confirmation value.
    vm.runInContext('resignButton.dispatch("click"); resignationDialog.close("");', context);
    assert.equal(vm.runInContext('gameResult', context), null);
    vm.runInContext('resignButton.dispatch("click"); resignationDialog.submit("resign");', context);
    const expected = player === 'white' ? 'White resigns. Black wins.' : 'Black resigns. White wins.';
    assert.equal(turnMessage(player), expected);
    assert.equal(vm.runInContext(repetitionSnapshot, context), beforeResignation);
    assert.equal(vm.runInContext('resignButton.hidden', context), true);
    assert.equal(vm.runInContext('resign()', context), false);
}

for (const [pieces, player, drawn] of [
    [{ a1: 'K', b2: 'Q', h8: 'k' }, 'white', true],
    [{ a1: 'K', h8: 'k', g6: 'n', b2: 'Q' }, 'white', true],
    [{ a1: 'K', h8: 'k', f8: 'b', d1: 'Q' }, 'white', true],
    [{ a1: 'K', h8: 'k', g6: 'n', b2: 'R' }, 'white', false],
    [{ a1: 'K', h8: 'k', g6: 'n', b2: 'P' }, 'white', false],
    [{ a1: 'K', h8: 'k', g6: 'n', f6: 'n' }, 'white', false],
    [{ a1: 'K', b3: 'N', h8: 'k', g7: 'q' }, 'black', true]
]) {
    prepareResignation(pieces, player);
    assert.equal(vm.runInContext('resign()', context), true);
    assert.equal(vm.runInContext('gameResult.startsWith("Draw on resignation")', context), drawn);
}

prepareResignation({ a1: 'K', b2: 'Q', h8: 'k' });
vm.runInContext('pendingPromotion = { row: 0, column: 1 };', context);
assert.equal(vm.runInContext('resign()', context), false);
vm.runInContext('pendingPromotion = null; pendingDrawClaim = "fifty";', context);
assert.equal(vm.runInContext('resign()', context), false);
vm.runInContext('pendingDrawClaim = null;', context);
setPosition({ c6: 'K', b7: 'Q', a8: 'k' });
turnMessage('black');
assert.equal(vm.runInContext('resign()', context), false, 'A finished game cannot be resigned.');
console.log('PASS: resignation confirmation, cancellation, state preservation, both colors, mating-material exceptions and finished-game guards.');

const resignationPositionState = 'JSON.stringify([currentPosition, currentPlayer, enPassant, castlingRights, halfmoveClock, movesPlayed, Array.from(positionOccurrences)])';
for (const [pieces, heavyPieceSide, bishopSide, win] of [
    [{ b6: 'K', d7: 'R', a8: 'k', f8: 'b' }, 'white', 'black', 'Black resigns. White wins.'],
    [{ a1: 'K', f1: 'B', d3: 'B', c3: 'k', d2: 'q', h8: 'r', c4: 'b' }, 'black', 'white', 'White resigns. Black wins.']
]) {
    for (const [resigningPlayer, result] of [
        [heavyPieceSide, 'Draw on resignation: the opponent cannot checkmate.'], [bishopSide, win]
    ]) {
        prepareResignation(pieces, heavyPieceSide);
        assert.equal(vm.runInContext('gameResult', context), null, 'The side with a rook or queen can still checkmate.');
        const before = vm.runInContext(resignationPositionState, context);
        context.testResigningPlayer = resigningPlayer;
        vm.runInContext('resignButton.dispatch("click"); resigningPlayerSelect.value = testResigningPlayer; resignationDialog.submit("resign");', context);
        assert.equal(vm.runInContext('turn.textContent', context), result);
        assert.equal(vm.runInContext(resignationPositionState, context), before);
    }
}
console.log('PASS: same-color bishops draw against rook or queen material on resignation; the reverse resignation awards a win.');

const ordinaryResignationPosition = { e1: 'K', d1: 'Q', e8: 'k', d8: 'q' };
for (const [activePlayer, resigningPlayer, expectedResult] of [
    ['white', 'black', 'Black resigns. White wins.'],
    ['black', 'white', 'White resigns. Black wins.']
]) {
    prepareResignation(ordinaryResignationPosition, activePlayer);
    vm.runInContext(`
        halfmoveClock = 27; movesPlayed = 14;
        positionOccurrences.set('off-turn-history', 2);
        castlingRights.white.kingside = true;
        castlingRights.black.queenside = false;
    `, context);
    const before = vm.runInContext(resignationPositionState, context);
    context.testResigningPlayer = resigningPlayer;
    assert.equal(vm.runInContext('resign(testResigningPlayer)', context), true);
    assert.equal(vm.runInContext('turn.textContent', context), expectedResult);
    assert.equal(vm.runInContext(resignationPositionState, context), before,
        'Off-turn resignation must preserve the real turn, board, rights, counters and history.');
    assert.equal(vm.runInContext('resignButton.hidden', context), true);
    assert.equal(vm.runInContext('resign(testResigningPlayer)', context), false,
        'A finished game cannot accept another resignation from either player.');
}

prepareResignation(ordinaryResignationPosition);
for (const player of [null, '', 'red', 'White', 0, false, {}, []]) {
    context.testResigningPlayer = player;
    const before = vm.runInContext(resignationPositionState, context);
    assert.equal(vm.runInContext('resign(testResigningPlayer)', context), false,
        'Only the two player colors may be selected for resignation.');
    assert.equal(vm.runInContext('gameResult', context), null);
    assert.equal(vm.runInContext(resignationPositionState, context), before);
}
console.log('PASS: either player can resign off turn; invalid players and finished games are rejected without changing game state.');

prepareResignation({ a1: 'K', h8: 'k', g7: 'q' }, 'white');
const beforeBareKingResignation = vm.runInContext(resignationPositionState, context);
assert.equal(vm.runInContext('resign("black")', context), true);
assert.equal(vm.runInContext('turn.textContent', context), 'Draw on resignation: the opponent cannot checkmate.',
    'The bare White king cannot win when Black resigns during White\'s turn.');
assert.equal(vm.runInContext(resignationPositionState, context), beforeBareKingResignation);

prepareResignation({ a1: 'K', b2: 'R', c5: 'N', d3: 'N', a3: 'k', a2: 'r', d2: 'n' }, 'white');
assert.equal(vm.runInContext('gameResult', context), null);
assert.equal(vm.runInContext('cannotMateByContinuation("white")', context), false);
assert.equal(vm.runInContext('cannotMateByContinuation("black")', context), true);
const beforeForcedMateResignation = vm.runInContext(resignationPositionState, context);
assert.equal(vm.runInContext('resign("black")', context), true);
assert.equal(vm.runInContext('turn.textContent', context), 'Black resigns. White wins.',
    'Off-turn resignation must test the actual opponent from the unchanged side to move.');
assert.equal(vm.runInContext(resignationPositionState, context), beforeForcedMateResignation,
    'The hypothetical Rxa2 checkmate must not be played to determine the result.');
console.log('PASS: off-turn resignation checks the correct opponent and uses the real turn for impossible-mate analysis.');

for (const activePlayer of ['white', 'black']) {
    const resigningPlayer = activePlayer === 'white' ? 'black' : 'white';
    prepareResignation(ordinaryResignationPosition, activePlayer);
    const before = vm.runInContext(resignationPositionState, context);
    context.testResigningPlayer = resigningPlayer;
    vm.runInContext('resignButton.dispatch("click")', context);
    assert.equal(vm.runInContext('resignationDialog.open', context), true);
    assert.equal(vm.runInContext('resigningPlayerSelect.value', context), activePlayer,
        'Every resignation dialog opening must default to the player whose turn it is.');
    vm.runInContext('resigningPlayerSelect.value = testResigningPlayer;', context);
    assert.equal(vm.runInContext('resign(testResigningPlayer)', context), false,
        'Choosing the other side must not bypass the pending confirmation.');
    vm.runInContext('resignationDialog.submit("cancel")', context);
    assert.equal(vm.runInContext('gameResult', context), null);
    assert.equal(vm.runInContext(resignationPositionState, context), before);

    vm.runInContext('resignButton.dispatch("click")', context);
    assert.equal(vm.runInContext('resigningPlayerSelect.value', context), activePlayer,
        'Cancelling must not carry a previous side choice into the next dialog.');
    vm.runInContext('resigningPlayerSelect.value = testResigningPlayer; resignationDialog.close("");', context);
    assert.equal(vm.runInContext('gameResult', context), null, 'Escape must leave the game active.');
    assert.equal(vm.runInContext(resignationPositionState, context), before);

    vm.runInContext('resignButton.dispatch("click")', context);
    assert.equal(vm.runInContext('resigningPlayerSelect.value', context), activePlayer);
    vm.runInContext('resigningPlayerSelect.value = testResigningPlayer; resignationDialog.submit("resign");', context);
    assert.equal(vm.runInContext('turn.textContent', context),
        activePlayer === 'white' ? 'Black resigns. White wins.' : 'White resigns. Black wins.');
    assert.equal(vm.runInContext(resignationPositionState, context), before);
    assert.equal(vm.runInContext('resignationDialog.open', context), false);
    vm.runInContext('resignButton.dispatch("click")', context);
    assert.equal(vm.runInContext('resignationDialog.open', context), false,
        'The resignation dialog must not reopen after the game ends.');
}
console.log('PASS: resignation side selection, confirmation, cancellation, Escape, reopening defaults and finished-game dialog guards.');
