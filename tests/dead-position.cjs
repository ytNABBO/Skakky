const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const elements = new Map();
function createElement() {
    return {
        dataset: {}, children: [], disabled: false,
        classList: { add() {}, remove() {} },
        addEventListener() {}, setAttribute() {},
        appendChild(child) { this.children.push(child); },
        replaceChildren(...children) { this.children = children; },
        focus() {}, querySelector() { return null; }, querySelectorAll() { return []; }
    };
}
const context = vm.createContext({
    document: {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement());
            return elements.get(id);
        },
        createElement, addEventListener() {}
    }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8'), context);
const evaluate = code => vm.runInContext(code, context);
const files = 'abcdefgh';

const blockade = { e1: 'K', e8: 'k' };
for (let column = 0; column < 8; column++) {
    const rank = 3 + column % 2;
    blockade[files[column] + rank] = 'P';
    blockade[files[column] + (rank + 1)] = 'p';
}

function position(pieces) {
    const board = Array.from({ length: 8 }, () => Array(8).fill(''));
    for (const [square, piece] of Object.entries(pieces)) {
        board[8 - Number(square[1])][files.indexOf(square[0])] = piece;
    }
    return board;
}

function isDead(pieces, enPassant = null) {
    context.fixture = position(pieces);
    context.fixtureEnPassant = enPassant;
    const before = JSON.stringify(context.fixture);
    const globalsBefore = evaluate('JSON.stringify([currentPosition, currentPlayer, castlingRights, enPassant, halfmoveClock, movesPlayed, Array.from(positionOccurrences)])');
    const result = evaluate('isDeadByPawnBlockade(fixture, fixtureEnPassant)');
    assert.equal(JSON.stringify(context.fixture), before, 'Analysis must not mutate its input.');
    assert.equal(evaluate('JSON.stringify([currentPosition, currentPlayer, castlingRights, enPassant, halfmoveClock, movesPlayed, Array.from(positionOccurrences)])'), globalsBefore,
        'Analysis must not alter the live game state.');
    return result;
}

const reflected = Object.fromEntries(Object.entries(blockade).map(([square, piece]) =>
    [files[7 - files.indexOf(square[0])] + square[1], piece]));
const colorSwapped = Object.fromEntries(Object.entries(blockade).map(([square, piece]) =>
    [square[0] + (9 - Number(square[1])), piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()]));

for (const fixture of [blockade, reflected, colorSwapped]) assert.equal(isDead(fixture), true);
const sparseBlockade = { e1: 'K', e8: 'k' };
for (const file of ['a', 'c', 'e', 'g']) {
    sparseBlockade[file + '3'] = 'P';
    sparseBlockade[file + '4'] = 'p';
}
assert.equal(isDead(sparseBlockade), true, 'Pawn attacks can close the gaps between separated blocked pairs.');

const breached = { ...blockade };
delete breached.a3;
delete breached.a4;
delete breached.b4;
delete breached.b5;
const advancingPawn = { ...blockade };
delete advancingPawn.a4;
const pawnCapture = { ...blockade, b3: 'P', b4: 'p' };
delete pawnCapture.b5;
const checkedKing = { ...blockade, b3: 'K' };
delete checkedKing.e1;
for (const [fixture, reason] of [
    [breached, 'A gap can let a king break the blockade.'],
    [advancingPawn, 'A pawn with an empty forward square can move.'],
    [pawnCapture, 'Pawns can break a blockade through diagonal captures.'],
    [{ ...blockade, a2: 'B' }, 'A remaining bishop is outside this proof.'],
    [{ ...blockade, e1: 'k', e8: 'K' }, 'Kings beyond the wall can reach exposed enemy pawns.'],
    [checkedKing, 'A king in pawn check is outside this proof.'],
    [{ ...blockade, e2: 'K' }, 'Exactly one king of each color is required.'],
    [{ ...blockade, e8: '' }, 'A missing king must not imply a draw.'],
    [{ e1: 'K', e8: 'k' }, 'Bare kings are handled by the separate material rule.'],
    [{ ...blockade, a8: 'P' }, 'An unpromoted pawn on the last rank is invalid.']
]) assert.equal(isDead(fixture), false, reason);

assert.equal(isDead(blockade, { pawnRow: 4, column: 1, targetRow: 5 }), false,
    'A possible en passant right must prevent a static blockade declaration.');
assert.equal(evaluate('isDeadByPawnBlockade(startingPosition)'), false);
console.log('PASS: proved pawn blockades, board symmetries, en passant and positions that must stay active; analysis preserves state.');

// Independently enumerate the complete legal king-only graph for the full wall.
// No production movement or attack helpers are used in this reference traversal.
function verifyReachablePositions(pieces) {
    const occupied = new Map();
    const pawnAttacks = [new Set(), new Set()];
    const kingSquares = [];
    function coordinates(square) { return [files.indexOf(square[0]), Number(square[1]) - 1]; }
    function squareIndex(x, y) { return y * 8 + x; }
    for (const [square, piece] of Object.entries(pieces)) {
        const [x, y] = coordinates(square);
        const color = piece === piece.toUpperCase() ? 0 : 1;
        if (piece.toLowerCase() === 'k') kingSquares[color] = squareIndex(x, y);
        else occupied.set(squareIndex(x, y), color);
    }
    for (const [square, color] of occupied) {
        const x = square % 8;
        const nextY = Math.floor(square / 8) + (color === 0 ? 1 : -1);
        assert(occupied.has(squareIndex(x, nextY)), 'Every reference pawn must remain blocked.');
        for (const nextX of [x - 1, x + 1]) {
            if (nextX < 0 || nextX > 7) continue;
            const destination = squareIndex(nextX, nextY);
            assert.notEqual(occupied.get(destination), 1 - color, 'No reference pawn may capture another pawn.');
            pawnAttacks[color].add(destination);
        }
    }
    const queue = [[...kingSquares, 0]];
    const visited = new Set([queue[0].join(',')]);
    for (let index = 0; index < queue.length; index++) {
        const state = queue[index];
        const player = state[2];
        for (const color of [0, 1]) {
            assert(!pawnAttacks[1 - color].has(state[color]), 'Neither king may ever be checked by a frozen pawn.');
        }
        const from = state[player];
        const opponent = state[1 - player];
        const [x, y] = [from % 8, Math.floor(from / 8)];
        for (let nextX = Math.max(0, x - 1); nextX <= Math.min(7, x + 1); nextX++) {
            for (let nextY = Math.max(0, y - 1); nextY <= Math.min(7, y + 1); nextY++) {
                const destination = squareIndex(nextX, nextY);
                if (destination === from || occupied.get(destination) === player) continue;
                if (pawnAttacks[1 - player].has(destination)) continue;
                if (Math.max(Math.abs(nextX - opponent % 8), Math.abs(nextY - Math.floor(opponent / 8))) <= 1) continue;
                assert(!occupied.has(destination), 'No reachable king move may capture a pawn and change the wall.');
                const next = [...state];
                next[player] = destination;
                next[2] = 1 - player;
                const key = next.join(',');
                if (!visited.has(key)) { visited.add(key); queue.push(next); }
            }
        }
    }
    assert(visited.size > 100, 'The reference must explore a substantial graph rather than just the initial moves.');
    return visited.size;
}
const reachable = verifyReachablePositions(blockade);
console.log(`PASS: all ${reachable} reachable reference king states keep every pawn frozen and neither king in check; checkmate is impossible.`);

// The same wall is still playable when its last move allows en passant.
context.fixture = position({ ...blockade, b2: 'P', b4: '' });
evaluate(`
    fixture.forEach((rank, row) => currentPosition[row].splice(0, 8, ...rank));
    currentPlayer = 'white'; enPassant = null; halfmoveClock = 0;
    recordCurrentPosition(); renderBoard();
    selectedSquare = document.createElement('button');
    selectedSquare.dataset.position = 'b2';
    movePiece(4, 1);
`);
assert.equal(evaluate('turn.textContent'), 'Black to move', 'A double step must leave the en passant reply available.');
assert(evaluate('getLegalMoveOptions(4, 0).captures.includes("b3")'), 'Black can break the wall with a4xb3 en passant.');
assert.equal(evaluate(`
    selectedSquare = document.createElement('button');
    selectedSquare.dataset.position = 'a4';
    movePiece(5, 1);
`), true);
assert.equal(evaluate('currentPosition[4][1]'), '', 'The double-stepping pawn must be removed.');
assert.equal(evaluate('currentPosition[5][1]'), 'p');
assert.equal(evaluate('gameResult'), null, 'The en passant break must remain playable.');

// The last blocking move must finish the game, including when draw claims are available.
context.fixture = position({ ...blockade, b3: 'P', b4: '' });
evaluate(`
    fixture.forEach((rank, row) => currentPosition[row].splice(0, 8, ...rank));
    currentPlayer = 'white'; enPassant = null; halfmoveClock = 100;
    recordCurrentPosition(); renderBoard();
`);
assert.equal(evaluate('gameResult'), null, 'The unfinished blockade must stay active.');
assert.equal(evaluate('claimDrawButton.hidden'), false, 'The initial position permits an optional claim.');
assert.equal(evaluate(`
    selectedSquare = document.createElement('button');
    selectedSquare.dataset.position = 'b3';
    movePiece(4, 1);
`), true);
assert.equal(evaluate('turn.textContent'), 'Draw by dead position.');
assert.equal(evaluate('currentPosition[4][1]'), 'P');
assert.equal(evaluate('claimDrawButton.hidden'), true);
assert.equal(evaluate('claimRepetitionButton.hidden'), true);
assert.equal(elements.get('board').children.filter(square => !square.disabled).length, 0,
    'A proved dead position must disable every square.');
assert.equal(evaluate('movePiece(1, 4)'), false, 'No later move can revive the game.');
evaluate('renderBoard();');
assert.equal(evaluate('turn.textContent'), 'Draw by dead position.', 'The result must survive a redraw.');
assert.equal(evaluate('claimDraw("fifty")'), false, 'A dead game cannot accept a later draw claim.');
console.log('PASS: the final blocking move ends play automatically, disables controls and survives redraw.');
