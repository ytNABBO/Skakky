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
    [{ ...blockade, a2: 'B' }, 'A bishop on the other square color can break the wall.'],
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


const bishopBlockade = { ...sparseBlockade, c1: 'B' };
const twoBishopBlockade = { ...bishopBlockade, c8: 'b' };
const reflectedBishops = Object.fromEntries(Object.entries(twoBishopBlockade).map(([square, piece]) =>
    [files[7 - files.indexOf(square[0])] + square[1], piece]));
const swappedBishops = Object.fromEntries(Object.entries(twoBishopBlockade).map(([square, piece]) =>
    [square[0] + (9 - Number(square[1])), piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()]));
for (const fixture of [bishopBlockade, twoBishopBlockade, reflectedBishops, swappedBishops,
    { ...twoBishopBlockade, g1: 'B' }]) {
    assert.equal(isDead(fixture), true, 'Bishops confined behind the wall cannot make checkmate possible.');
}
for (const [fixture, reason] of [
    [{ ...sparseBlockade, f1: 'B' }, 'A bishop that can attack enemy pawns can break the blockade.'],
    [{ ...sparseBlockade, a2: 'B' }, 'A bishop can be offered on a pawn capture square.'],
    [{ ...sparseBlockade, b5: 'B' }, 'A bishop already checking the king must not imply a draw.'],
    [{ ...sparseBlockade, b6: 'B' }, 'A bishop beyond the wall can give a future check even when neither king is checked now.'],
    [{ ...bishopBlockade, a1: 'R' }, 'A remaining rook is outside this proof.'],
    [{ ...bishopBlockade, b1: 'N' }, 'A knight can escape by jumping around the wall and threaten its pawns.'],
    [{ ...bishopBlockade, d1: 'Q' }, 'A remaining queen is outside this proof.']
]) assert.equal(isDead(fixture), false, reason);
assert.equal(isDead(twoBishopBlockade, { pawnRow: 4, column: 0, targetRow: 5 }), false);
console.log('PASS: confined bishops, board symmetries, multiple bishops and bishop/pawn/check escape boundaries.');

// Enumerate every legal state of the sparse wall with one freely moving bishop.
// This reference models rays, king safety and pawn captures without production helpers.
function verifyBishopReachablePositions(pieces) {
    const occupied = new Map();
    const pawnAttacks = [new Set(), new Set()];
    const kings = [];
    let bishop = -1;
    const index = (x, y) => y * 8 + x;
    for (const [square, piece] of Object.entries(pieces)) {
        const x = files.indexOf(square[0]);
        const y = Number(square[1]) - 1;
        const color = piece === piece.toUpperCase() ? 0 : 1;
        if (piece.toLowerCase() === 'k') kings[color] = index(x, y);
        else if (piece === 'B') bishop = index(x, y);
        else {
            assert.equal(piece.toLowerCase(), 'p');
            occupied.set(index(x, y), color);
        }
    }
    assert.notEqual(bishop, -1);
    for (const [square, color] of occupied) {
        const x = square % 8;
        const nextY = Math.floor(square / 8) + (color === 0 ? 1 : -1);
        assert(occupied.has(index(x, nextY)));
        for (const nextX of [x - 1, x + 1]) {
            if (nextX < 0 || nextX > 7) continue;
            const target = index(nextX, nextY);
            assert.notEqual(occupied.get(target), 1 - color);
            pawnAttacks[color].add(target);
        }
    }
    function bishopAttacks(target, state) {
        const source = state[2];
        const dx = target % 8 - source % 8;
        const dy = Math.floor(target / 8) - Math.floor(source / 8);
        if (dx === 0 || Math.abs(dx) !== Math.abs(dy)) return false;
        const step = Math.sign(dy) * 8 + Math.sign(dx);
        for (let square = source + step; square !== target; square += step) {
            if (occupied.has(square) || square === state[0] || square === state[1]) return false;
        }
        return true;
    }
    function inCheck(color, state) {
        const own = state[color];
        const enemy = state[1 - color];
        return pawnAttacks[1 - color].has(own)
            || Math.max(Math.abs(own % 8 - enemy % 8), Math.abs(Math.floor(own / 8) - Math.floor(enemy / 8))) <= 1
            || (color === 1 && bishopAttacks(own, state));
    }
    const queue = [[...kings, bishop, 0]];
    const seen = new Set([queue[0].join(',')]);
    function visit(next) {
        assert(!inCheck(0, next) && !inCheck(1, next), 'No reachable move may create a check.');
        assert(!pawnAttacks[1].has(next[2]), 'No black pawn may capture the bishop and open the wall.');
        const key = next.join(',');
        if (!seen.has(key)) { seen.add(key); queue.push(next); }
    }
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const state = queue[cursor];
        const color = state[3];
        assert(!inCheck(0, state) && !inCheck(1, state));
        assert(!pawnAttacks[1].has(state[2]));
        const from = state[color];
        for (let y = Math.max(0, Math.floor(from / 8) - 1); y <= Math.min(7, Math.floor(from / 8) + 1); y++) {
            for (let x = Math.max(0, from % 8 - 1); x <= Math.min(7, from % 8 + 1); x++) {
                const target = index(x, y);
                if (target === from || occupied.get(target) === color || (color === 0 && target === state[2])) continue;
                const next = [...state];
                next[color] = target;
                next[3] = 1 - color;
                if (inCheck(color, next)) continue;
                assert(!occupied.has(target), 'A legal king move must never capture a pawn.');
                assert.notEqual(target, state[2], 'The opposing king must never reach the bishop.');
                visit(next);
            }
        }
        if (color !== 0) continue;
        for (const dx of [-1, 1]) {
            for (const dy of [-1, 1]) {
                let x = state[2] % 8 + dx;
                let y = Math.floor(state[2] / 8) + dy;
                while (x >= 0 && x < 8 && y >= 0 && y < 8) {
                    const target = index(x, y);
                    if (occupied.get(target) === 0 || target === state[0] || target === state[1]) break;
                    const next = [...state];
                    next[2] = target;
                    next[3] = 1;
                    if (!inCheck(0, next)) {
                        assert(!occupied.has(target), 'A legal bishop move must never capture a pawn.');
                        visit(next);
                    }
                    if (occupied.has(target)) break;
                    x += dx;
                    y += dy;
                }
            }
        }
    }
    assert(seen.size > 1000, 'The reference must explore king and bishop movement throughout the enclosure.');
    return seen.size;
}
const bishopReachable = verifyBishopReachablePositions(bishopBlockade);
console.log(`PASS: all ${bishopReachable} reachable reference states with a moving bishop preserve the wall and exclude every check.`);

context.fixture = position({ ...blockade, b3: 'P', b4: '', c1: 'B', c8: 'b' });
evaluate(`
    fixture.forEach((rank, row) => currentPosition[row].splice(0, 8, ...rank));
    currentPlayer = 'white'; enPassant = null; halfmoveClock = 0;
    positionOccurrences.clear(); recordCurrentPosition(); renderBoard();
`);
assert.equal(evaluate('gameResult'), null, 'The unfinished bishop blockade must remain playable.');
assert.equal(evaluate(`
    selectedSquare = document.createElement('button');
    selectedSquare.dataset.position = 'b3';
    movePiece(4, 1);
`), true);
assert.equal(evaluate('turn.textContent'), 'Draw by dead position.');
assert.equal(elements.get('board').children.filter(square => !square.disabled).length, 0);
assert.equal(evaluate('claimDrawButton.hidden'), true);
assert.equal(evaluate('claimRepetitionButton.hidden'), true);
evaluate('renderBoard();');
assert.equal(evaluate('turn.textContent'), 'Draw by dead position.');
console.log('PASS: the final pawn move locks a bishop fortress and finishes play automatically.');

const knightBlockade = { e1: 'K', e8: 'k', a1: 'N' };
for (const [column, rank] of [4, 3, 2, 3, 2, 3, 2, 3].entries()) {
    knightBlockade[files[column] + rank] = 'P';
    knightBlockade[files[column] + (rank + 1)] = 'p';
}
const reflectedKnights = Object.fromEntries(Object.entries(knightBlockade).map(([square, piece]) =>
    [files[7 - files.indexOf(square[0])] + square[1], piece]));
const swappedKnights = Object.fromEntries(Object.entries(knightBlockade).map(([square, piece]) =>
    [square[0] + (9 - Number(square[1])), piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()]));
const twoKnightBlockade = { ...knightBlockade, a4: '', a5: '', a2: 'P', a3: 'p', c1: 'N' };
for (const fixture of [knightBlockade, reflectedKnights, swappedKnights, twoKnightBlockade,
    { ...knightBlockade, f1: 'B' }]) {
    assert.equal(isDead(fixture), true, 'A knight trapped by the wall cannot make checkmate possible.');
}
for (const [fixture, reason] of [
    [{ ...blockade, b1: 'N' }, 'A knight can jump around the ordinary pawn wall and capture a pawn.'],
    [{ ...blockade, a5: 'N' }, 'The immediate Na5xc4 pawn capture must keep the game active.'],
    [{ ...knightBlockade, a1: '', f6: 'N' }, 'A knight already checking the enemy king cannot imply a draw.'],
    [{ ...knightBlockade, a1: '', f5: 'N' }, 'A knight beyond the wall can give a future check.'],
    [{ ...knightBlockade, c1: 'N' }, 'An additional knight can escape through a2 and break this wall.'],
    [{ ...knightBlockade, a8: 'R' }, 'A remaining rook is outside this proof.'],
    [{ ...knightBlockade, h8: 'q' }, 'A remaining queen is outside this proof.']
]) assert.equal(isDead(fixture), false, reason);
assert.equal(isDead(knightBlockade, { pawnRow: 4, column: 1, targetRow: 5 }), false);
console.log('PASS: trapped knights, symmetries, multiple knights, mixed bishops and knight jump/capture/check boundaries.');

// Independently explore kings and a knight with every jump explicitly considered.
// The reference uses no production movement, attack or reachability helpers.
function verifyKnightReachablePositions(pieces) {
    const pawns = new Map();
    const pawnAttacks = [new Set(), new Set()];
    const kings = [];
    let knight = -1;
    const index = (x, y) => y * 8 + x;
    for (const [square, piece] of Object.entries(pieces)) {
        const x = files.indexOf(square[0]);
        const y = Number(square[1]) - 1;
        const color = piece === piece.toUpperCase() ? 0 : 1;
        if (piece.toLowerCase() === 'k') kings[color] = index(x, y);
        else if (piece === 'N') knight = index(x, y);
        else {
            assert.equal(piece.toLowerCase(), 'p');
            pawns.set(index(x, y), color);
        }
    }
    assert.notEqual(knight, -1);
    for (const [square, color] of pawns) {
        const x = square % 8;
        const nextY = Math.floor(square / 8) + (color === 0 ? 1 : -1);
        assert(pawns.has(index(x, nextY)), 'Every reference pawn must remain blocked.');
        for (const nextX of [x - 1, x + 1]) {
            if (nextX < 0 || nextX > 7) continue;
            const target = index(nextX, nextY);
            assert.notEqual(pawns.get(target), 1 - color);
            pawnAttacks[color].add(target);
        }
    }
    function knightAttacks(target, state) {
        return Math.abs(target % 8 - state[2] % 8)
            * Math.abs(Math.floor(target / 8) - Math.floor(state[2] / 8)) === 2;
    }
    function inCheck(color, state) {
        const own = state[color];
        const enemy = state[1 - color];
        return pawnAttacks[1 - color].has(own)
            || Math.max(Math.abs(own % 8 - enemy % 8), Math.abs(Math.floor(own / 8) - Math.floor(enemy / 8))) <= 1
            || (color === 1 && knightAttacks(own, state));
    }
    const queue = [[...kings, knight, 0]];
    const seen = new Set([queue[0].join(',')]);
    function visit(next) {
        assert(!inCheck(0, next) && !inCheck(1, next), 'No reachable move may create a check.');
        assert(!pawnAttacks[1].has(next[2]), 'A black pawn must never be able to capture the knight.');
        const key = next.join(',');
        if (!seen.has(key)) { seen.add(key); queue.push(next); }
    }
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const state = queue[cursor];
        const color = state[3];
        assert(!inCheck(0, state) && !inCheck(1, state));
        const from = state[color];
        for (let y = Math.max(0, Math.floor(from / 8) - 1); y <= Math.min(7, Math.floor(from / 8) + 1); y++) {
            for (let x = Math.max(0, from % 8 - 1); x <= Math.min(7, from % 8 + 1); x++) {
                const target = index(x, y);
                if (target === from || pawns.get(target) === color || (color === 0 && target === state[2])) continue;
                const next = [...state];
                next[color] = target;
                next[3] = 1 - color;
                if (inCheck(color, next)) continue;
                assert(!pawns.has(target), 'A legal king move must never capture a pawn.');
                assert.notEqual(target, state[2], 'The opposing king must never reach the knight.');
                visit(next);
            }
        }
        if (color !== 0) continue;
        const source = state[2];
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                if (Math.abs(x - source % 8) * Math.abs(y - Math.floor(source / 8)) !== 2) continue;
                const target = index(x, y);
                if (pawns.get(target) === 0 || target === state[0] || target === state[1]) continue;
                const next = [...state];
                next[2] = target;
                next[3] = 1;
                if (inCheck(0, next)) continue;
                assert(!pawns.has(target), 'No legal knight jump may capture a pawn and break the wall.');
                visit(next);
            }
        }
    }
    assert(seen.size > 100, 'The reference must explore all king movements around the trapped knight.');
    return seen.size;
}
const knightReachable = verifyKnightReachablePositions(knightBlockade);
console.log(`PASS: all ${knightReachable} reachable reference king-and-knight states preserve the wall and exclude every check.`);

context.fixture = position({ ...knightBlockade, b3: '', b2: 'P' });
evaluate(`
    fixture.forEach((rank, row) => currentPosition[row].splice(0, 8, ...rank));
    currentPlayer = 'white'; enPassant = null; halfmoveClock = 0;
    positionOccurrences.clear(); recordCurrentPosition(); renderBoard();
`);
assert.equal(evaluate('gameResult'), null, 'The unfinished knight blockade must remain playable.');
assert.equal(evaluate(`
    selectedSquare = document.createElement('button');
    selectedSquare.dataset.position = 'b2';
    movePiece(5, 1);
`), true);
assert.equal(evaluate('turn.textContent'), 'Draw by dead position.');
assert.equal(elements.get('board').children.filter(square => !square.disabled).length, 0);
assert.equal(evaluate('claimDrawButton.hidden'), true);
assert.equal(evaluate('claimRepetitionButton.hidden'), true);
evaluate('renderBoard();');
assert.equal(evaluate('turn.textContent'), 'Draw by dead position.');
console.log('PASS: the final pawn move traps the knight and finishes play automatically.');
