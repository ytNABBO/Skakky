const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');

// Check movement geometry; king safety and special moves are outside this test.
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
