const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

const sourcePath = path.join(__dirname, '..', 'script.js');
const source = fs.readFileSync(sourcePath, 'utf8');

// Rendering is exercised separately in a browser; these tests need only a minimal DOM.
function createElement() {
    return {
        dataset: {},
        classList: { add() {}, remove() {} },
        addEventListener() {},
        setAttribute() {},
        appendChild() {},
        replaceChildren() {},
        focus() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
}

const context = vm.createContext({
    document: { getElementById: createElement, createElement }
});
vm.runInContext(source, context);
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
    [{ a1: 'K', b7: 'P', h6: 'k' }, 'b7', 'b8', 'n']
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
