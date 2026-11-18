const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

function harness(pieces, player = 'white', ep = null) {
    const elements = new Map();
    const timers = new Map();
    let nextTimer = 1;
    let document;
    function createElement() {
        const listeners = new Map();
        return {
            dataset: {}, children: [], attributes: {}, value: '', disabled: false,
            classList: { add() {}, remove() {} },
            addEventListener(type, callback) { listeners.set(type, callback); },
            setAttribute(name, value) { this.attributes[name] = value; },
            appendChild(child) { this.children.push(child); },
            replaceChildren(...children) { this.children = children; },
            focus() { document.activeElement = this; },
            querySelector() { return null; }, querySelectorAll() { return []; }
        };
    }
    document = {
        activeElement: null,
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement());
            return elements.get(id);
        },
        createElement, addEventListener() {}
    };
    const context = vm.createContext({
        document, performance: { now: () => 0 },
        setInterval(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
        clearInterval(id) { timers.delete(id); }
    });
    vm.runInContext(source, context);
    context.fixture = pieces;
    context.fixturePlayer = player;
    context.fixtureEnPassant = ep;
    const evaluate = code => vm.runInContext(code, context);
    evaluate(`
        for (const rank of currentPosition) rank.fill('');
        for (const [square, piece] of Object.entries(fixture)) {
            currentPosition[8 - Number(square[1])][files.indexOf(square[0])] = piece;
        }
        currentPlayer = fixturePlayer;
        enPassant = fixtureEnPassant;
    `);
    return {
        evaluate, elements,
        timerCount: () => timers.size,
        moves() {
            return Array.from(evaluate(`(() => {
                const legal = [];
                for (let row = 0; row < 8; row++) for (let column = 0; column < 8; column++) {
                    const piece = currentPosition[row][column];
                    if (!piece || getPieceColor(piece) !== currentPlayer) continue;
                    const options = getLegalMoveOptions(row, column);
                    for (const destination of [...options.moves, ...options.captures]) {
                        const prefix = files[column] + (8 - row) + '-' + destination;
                        if (piece.toLowerCase() === 'p' && ['1', '8'].includes(destination[1])) {
                            for (const promotion of promotionChoices) legal.push(prefix + '=' + promotion);
                        } else legal.push(prefix);
                    }
                }
                return legal.sort();
            })()`));
        }
    };
}

const snapshot = `JSON.stringify([
    currentPosition, currentPlayer, enPassant, castlingRights,
    halfmoveClock, movesPlayed, Array.from(positionOccurrences),
    gameResult, declaredResult, drawOfferQueued, drawOfferedBy,
    pendingPromotion, pendingDrawClaim, pendingResignation, chessClock, clockTimer,
    turn.textContent, status.textContent, promotionChoices
])`;

function prove(game, expected, limit = 8, maxNodes = 64) {
    const before = game.evaluate(snapshot);
    const board = game.evaluate('currentPosition');
    const ranks = game.evaluate('currentPosition.slice()');
    const ep = game.evaluate('enPassant');
    const rights = game.evaluate('[castlingRights.white, castlingRights.black]');
    const selected = game.evaluate('selectedSquare');
    const clock = game.evaluate('chessClock');
    const timers = game.timerCount();
    assert.equal(game.evaluate(`isDeadByContinuation(${JSON.stringify(limit)}, ${JSON.stringify(maxNodes)})`), expected);
    assert.equal(game.evaluate(snapshot), before, 'Analysis must restore all live game values.');
    assert.equal(game.evaluate('currentPosition'), board, 'The board object must retain its identity.');
    for (let row = 0; row < 8; row++) assert.equal(game.evaluate(`currentPosition[${row}]`), ranks[row]);
    assert.equal(game.evaluate('enPassant'), ep, 'The original en passant object must be restored.');
    assert.equal(game.evaluate('castlingRights.white'), rights[0]);
    assert.equal(game.evaluate('castlingRights.black'), rights[1]);
    assert.equal(game.evaluate('selectedSquare'), selected);
    assert.equal(game.evaluate('chessClock'), clock);
    assert.equal(game.timerCount(), timers, 'Analysis must not alter clock timers.');
}

const forcedCapture = { a1: 'K', h6: 'B', c2: 'k', a2: 'r' };
const swapped = Object.fromEntries(Object.entries(forcedCapture).map(([square, piece]) =>
    [square[0] + (9 - Number(square[1])), piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()]));
for (const [pieces, player] of [[forcedCapture, 'white'], [swapped, 'black']]) {
    const game = harness(pieces, player);
    assert.deepEqual(game.moves(), [player === 'white' ? 'a1-a2' : 'a8-a7']);
    prove(game, false, 0);
    prove(game, true, 1);
    prove(game, true);
}
const alternateEscape = harness({ a1: 'K', h6: 'B', c3: 'k', a2: 'r' });
assert.deepEqual(alternateEscape.moves(), ['a1-a2', 'a1-b1']);
prove(alternateEscape, false);
for (const limit of [-1, 1.5, 9, '8', null]) prove(harness(forcedCapture), false, limit);
console.log('PASS: forced material draws for both colors, depth bounds and alternative escapes.');

// A forced capture of the home rook revokes rights during analysis, then restores them.
const homeRook = harness({ a7: 'K', h3: 'B', c7: 'k', a8: 'r' });
assert.deepEqual(homeRook.moves(), ['a7-a8']);
homeRook.evaluate(`
    timeControl.value = '180+2'; startChessClock();
    selectedSquare = document.createElement('button'); selectedSquare.dataset.position = 'a7';
    halfmoveClock = 73; movesPlayed = 20;
    positionOccurrences.set('historical-position', 2);
    drawOfferQueued = true;
`);
prove(homeRook, true);
assert.equal(homeRook.evaluate('chessClock.activePlayer'), 'white');
assert.equal(homeRook.evaluate('halfmoveClock'), 73);

const epEscape = harness({ e4: 'K', e5: 'P', f4: 'P', a8: 'k', c5: 'q', g4: 'q', b4: 'n', d5: 'p' },
    'white', { pawnRow: 3, column: 3, targetRow: 2 });
assert.deepEqual(epEscape.moves(), ['e5-d6']);
prove(epEscape, false);
console.log('PASS: speculative king/home-rook rights and en passant captures restore board, references, clocks and history.');

// A unique legal capture can itself give checkmate; forced play does not imply a draw.
const forcedMate = harness({ a1: 'K', b2: 'R', c5: 'N', d3: 'N', a3: 'k', a2: 'r', d2: 'n' });
assert.deepEqual(forcedMate.moves(), ['b2-a2']);
prove(forcedMate, false, 1);
forcedMate.evaluate(`
    movePieceOnBoard(currentPosition, 6, 1, 6, 0, 'R'); currentPlayer = 'black';
`);
assert.equal(forcedMate.moves().length, 0);
assert.notEqual(forcedMate.evaluate('findCheckedKing(currentPosition, currentPlayer)'), null);
prove(forcedMate, false);

const promotion = harness({ a1: 'K', b7: 'P', c2: 'k', b3: 'p' });
assert.deepEqual(promotion.moves(), ['b7-b8=b', 'b7-b8=n', 'b7-b8=q', 'b7-b8=r']);
prove(promotion, false);
const stalemate = harness({ c6: 'K', c7: 'Q', a8: 'k' }, 'black');
assert.equal(stalemate.moves().length, 0);
prove(stalemate, true, 0);
console.log('PASS: forced checkmate stays decisive, promotion choices branch and stalemate remains drawn.');

// The triggering move ends the game before its hypothetical forced capture is played.
const integration = harness({ a1: 'K', h6: 'B', c2: 'k', b2: 'r' }, 'black');
integration.evaluate('recordCurrentPosition(); renderBoard();');
assert.equal(integration.evaluate('gameResult'), null);
assert.equal(integration.evaluate(`
    selectedSquare = document.createElement('button'); selectedSquare.dataset.position = 'b2';
    movePiece(6, 0);
`), true);
assert.equal(integration.evaluate('turn.textContent'), 'Draw by dead position.');
assert.equal(integration.evaluate('currentPosition[7][0]'), 'K', 'The hypothetical Kxa2 must not be played.');
assert.equal(integration.evaluate('currentPosition[6][0]'), 'r');
assert.equal(integration.elements.get('board').children.filter(square => !square.disabled).length, 0);
assert.equal(integration.evaluate('claimDrawButton.hidden && claimRepetitionButton.hidden && resignButton.hidden'), true);
integration.evaluate('renderBoard();');
assert.equal(integration.evaluate('turn.textContent'), 'Draw by dead position.');
assert.equal(integration.evaluate('document.activeElement === turn'), true);
console.log('PASS: the triggering move declares a dead draw, disables play and preserves the real position on redraw.');


const branchingCaptures = { a1: 'K', c4: 'B', c2: 'k', a2: 'r' };
const swappedBranches = Object.fromEntries(Object.entries(branchingCaptures).map(([square, piece]) =>
    [square[0] + (9 - Number(square[1])), piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()]));
for (const [pieces, player, expectedMoves] of [
    [branchingCaptures, 'white', ['a1-a2', 'c4-a2']],
    [swappedBranches, 'black', ['a8-a7', 'c5-a7']]
]) {
    const game = harness(pieces, player);
    assert.deepEqual(game.moves(), expectedMoves);
    prove(game, false, 0);
    prove(game, false, 1, 2);
    prove(game, true, 1, 3);
    prove(game, true);
}

// Bxa2 is examined first and proves dead, but a later Kb1 escape cannot be ignored.
const branchingEscape = harness({ a1: 'K', c4: 'B', c3: 'k', a2: 'r' });
assert.deepEqual(branchingEscape.moves(), ['a1-a2', 'a1-b1', 'c4-a2']);
branchingEscape.evaluate(`
    timeControl.value = '180+2'; startChessClock();
    selectedSquare = document.createElement('button'); selectedSquare.dataset.position = 'c4';
    halfmoveClock = 99; movesPlayed = 20;
    positionOccurrences.set('prior-branch-position', 2);
    drawOfferQueued = true;
`);
prove(branchingEscape, false, 1);
prove(branchingEscape, false);
assert.equal(branchingEscape.evaluate('castlingRights.white.kingside && castlingRights.white.queenside'), true,
    'A simulated sibling king move must not leak castling-right changes.');

for (const budget of [0, -1, 1.5, 65, '64', null]) prove(harness(branchingCaptures), false, 8, budget);
prove(harness(forcedCapture), false, 1, 1);
prove(harness(forcedCapture), true, 1, 2);
console.log('PASS: every branch must prove dead, both colors, node/depth limits and complete sibling-state restoration.');

// Examine dead B/N promotions before Q/R continuations that can still produce mate.
const capturePromotion = harness({ a1: 'K', b7: 'P', c2: 'k', a8: 'r' });
assert.deepEqual(capturePromotion.moves(), ['b7-a8=b', 'b7-a8=n', 'b7-a8=q', 'b7-a8=r']);
capturePromotion.evaluate("promotionChoices.splice(0, promotionChoices.length, 'b', 'n', 'q', 'r');");
prove(capturePromotion, false, 1);
prove(capturePromotion, false);
assert.equal(capturePromotion.evaluate('currentPosition[0][0]'), 'r', 'Analysis must restore the captured rook after every promotion sibling.');
assert.equal(capturePromotion.evaluate('currentPosition[1][1]'), 'P');
console.log('PASS: dead underpromotion choices cannot hide queen or rook continuations.');

const initial = harness({});
initial.evaluate(`
    startingPosition.forEach((rank, row) => currentPosition[row].splice(0, 8, ...rank));
`);
prove(initial, false);
prove(initial, false, 8, 1);
console.log('PASS: the ordinary starting position remains unproved within the bounded search.');

// Rb2-a2 creates two dead replies; neither hypothetical capture may be played.
const branchingIntegration = harness({ a1: 'K', c4: 'B', c2: 'k', b2: 'r' }, 'black');
branchingIntegration.evaluate('recordCurrentPosition(); renderBoard();');
assert.equal(branchingIntegration.evaluate('gameResult'), null);
assert.equal(branchingIntegration.evaluate(`
    selectedSquare = document.createElement('button'); selectedSquare.dataset.position = 'b2';
    movePiece(6, 0);
`), true);
assert.equal(branchingIntegration.evaluate('turn.textContent'), 'Draw by dead position.');
assert.equal(branchingIntegration.evaluate('currentPosition[7][0]'), 'K');
assert.equal(branchingIntegration.evaluate('currentPosition[4][2]'), 'B');
assert.equal(branchingIntegration.evaluate('currentPosition[6][0]'), 'r');
assert.equal(branchingIntegration.evaluate('halfmoveClock'), 1, 'Simulated captures must not reset the real move counter.');
assert.equal(branchingIntegration.evaluate('positionOccurrences.size'), 3,
    'Only the starting position, fixture and real triggering move belong in repetition history.');
assert.equal(branchingIntegration.elements.get('board').children.filter(square => !square.disabled).length, 0);
assert.equal(branchingIntegration.evaluate('claimDrawButton.hidden && claimRepetitionButton.hidden && resignButton.hidden'), true);
branchingIntegration.evaluate('renderBoard();');
assert.equal(branchingIntegration.evaluate('turn.textContent'), 'Draw by dead position.');
assert.equal(branchingIntegration.evaluate('document.activeElement === turn'), true);
console.log('PASS: a real move declares the branching dead draw while board, counters and history retain only actual play.');
