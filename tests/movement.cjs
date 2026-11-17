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
