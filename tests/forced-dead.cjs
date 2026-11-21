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
        move(from, to) {
            return evaluate(`
                selectedSquare = document.createElement('button'); selectedSquare.dataset.position = ${JSON.stringify(from)};
                movePiece(${8 - Number(to[1])}, ${'abcdefgh'.indexOf(to[0])});
            `);
        },
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

function proveQuery(game, expected, expression) {
    const before = game.evaluate(snapshot);
    const board = game.evaluate('currentPosition');
    const ranks = game.evaluate('currentPosition.slice()');
    const ep = game.evaluate('enPassant');
    const rights = game.evaluate('[castlingRights.white, castlingRights.black]');
    const selected = game.evaluate('selectedSquare');
    const clock = game.evaluate('chessClock');
    const timers = game.timerCount();
    assert.equal(game.evaluate(expression), expected);
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

function prove(game, expected, limit = 8, maxNodes = 64) {
    proveQuery(game, expected, `isDeadByContinuation(${JSON.stringify(limit)}, ${JSON.stringify(maxNodes)})`);
}

function proveCannotMate(game, player, expected, limit = 8, maxNodes = 64) {
    proveQuery(game, expected, `cannotMateByContinuation(${JSON.stringify(player)}, ${JSON.stringify(limit)}, ${JSON.stringify(maxNodes)})`);
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


const forcedWinningMove = { a1: 'K', b2: 'R', c5: 'N', d3: 'N', a3: 'k', a2: 'r', d2: 'n' };
const reflectedWinningMove = Object.fromEntries(Object.entries(forcedWinningMove).map(([square, piece]) =>
    [square[0] + (9 - Number(square[1])), piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()]));
for (const [pieces, player, unablePlayer, expectedMoves] of [
    [forcedWinningMove, 'white', 'black', ['b2-a2']],
    [reflectedWinningMove, 'black', 'white', ['b7-a7']]
]) {
    const game = harness(pieces, player);
    assert.deepEqual(game.moves(), expectedMoves);
    prove(game, false, 1, 2);
    proveCannotMate(game, unablePlayer, false, 0);
    proveCannotMate(game, unablePlayer, false, 1, 1);
    proveCannotMate(game, unablePlayer, true, 1, 2);
    proveCannotMate(game, unablePlayer, true);
    proveCannotMate(game, player, false);
    game.evaluate('recordCurrentPosition(); renderBoard();');
    assert.equal(game.evaluate('gameResult'), null, 'A position where one side can mate is not an automatic dead draw.');

    const actualState = 'JSON.stringify([currentPosition, currentPlayer, enPassant, castlingRights, halfmoveClock, movesPlayed, Array.from(positionOccurrences)])';
    const beforeResignation = game.evaluate(actualState);
    assert.equal(game.evaluate('resign()'), true);
    assert.equal(game.evaluate('turn.textContent'), 'Draw on resignation: the opponent cannot checkmate.');
    assert.equal(game.evaluate(actualState), beforeResignation, 'The hypothetical winning move must not be played when resignation is a draw.');
    assert.equal(game.elements.get('board').children.filter(square => !square.disabled).length, 0);
    assert.equal(game.evaluate('resignButton.hidden && claimDrawButton.hidden && claimRepetitionButton.hidden'), true);
    assert.equal(game.evaluate('document.activeElement === turn'), true);
    game.evaluate('renderBoard();');
    assert.equal(game.evaluate('turn.textContent'), 'Draw on resignation: the opponent cannot checkmate.');
}
console.log('PASS: side-specific forced-mate impossibility for both colors gives a resignation draw without an automatic dead draw.');

const afterForcedMate = harness(forcedWinningMove);
afterForcedMate.evaluate(`
    movePieceOnBoard(currentPosition, 6, 1, 6, 0, 'R'); currentPlayer = 'black';
`);
assert.equal(afterForcedMate.moves().length, 0);
assert.notEqual(afterForcedMate.evaluate('findCheckedKing(currentPosition, currentPlayer)'), null);
prove(afterForcedMate, false, 0, 1);
proveCannotMate(afterForcedMate, 'black', true, 0, 1);
proveCannotMate(afterForcedMate, 'white', false, 0, 1);
const afterReflectedMate = harness(reflectedWinningMove, 'black');
afterReflectedMate.evaluate(`
    movePieceOnBoard(currentPosition, 1, 1, 1, 0, 'r'); currentPlayer = 'white';
`);
assert.equal(afterReflectedMate.moves().length, 0);
proveCannotMate(afterReflectedMate, 'white', true, 0, 1);
proveCannotMate(afterReflectedMate, 'black', false, 0, 1);
console.log('PASS: terminal mate distinguishes the side that achieved mate from the side that can no longer mate.');

const sideSpecificState = harness(forcedWinningMove);
sideSpecificState.evaluate(`
    timeControl.value = '180+2'; startChessClock();
    selectedSquare = document.createElement('button'); selectedSquare.dataset.position = 'b2';
    halfmoveClock = 73; movesPlayed = 20;
    positionOccurrences.set('historical-target-position', 2);
    drawOfferQueued = true;
`);
proveCannotMate(sideSpecificState, 'black', true);
proveCannotMate(sideSpecificState, 'white', false);
proveCannotMate(epEscape, 'black', false);
proveCannotMate(epEscape, 'white', false);
for (const target of ['red', '', null, 0, {}, []]) proveCannotMate(sideSpecificState, target, false);
for (const limit of [-1, 1.5, 9, '8', null]) proveCannotMate(sideSpecificState, 'black', false, limit);
for (const nodes of [0, -1, 1.5, 65, '64', null]) proveCannotMate(sideSpecificState, 'black', false, 8, nodes);
console.log('PASS: side-specific search preserves live references, clocks and history and rejects invalid targets or limits.');

// Material can permit mate even when it cannot force one against best defense.
const cooperativeMaterial = harness({ a1: 'K', h8: 'k', g6: 'n', b2: 'P' });
assert.equal(cooperativeMaterial.evaluate('cannotMateByMaterial(currentPosition, "black")'), false);
proveCannotMate(cooperativeMaterial, 'black', false);
cooperativeMaterial.evaluate('recordCurrentPosition(); renderBoard();');
assert.equal(cooperativeMaterial.evaluate('resign()'), true);
assert.equal(cooperativeMaterial.evaluate('turn.textContent'), 'White resigns. Black wins.',
    'A possibly mating or unproved continuation must keep resignation as a loss.');
const ordinaryResignation = harness({ e1: 'K', d1: 'Q', e8: 'k', d8: 'q' });
proveCannotMate(ordinaryResignation, 'black', false);
ordinaryResignation.evaluate('renderBoard();');
assert.equal(ordinaryResignation.evaluate('resign()'), true);
assert.equal(ordinaryResignation.evaluate('turn.textContent'), 'White resigns. Black wins.');
const materialException = harness({ a1: 'K', b2: 'Q', h8: 'k' });
proveCannotMate(materialException, 'black', true, 0, 1);
proveCannotMate(materialException, 'white', false, 0, 1);
console.log('PASS: cooperation and uncertain branches remain losses on resignation while existing material exceptions remain draws.');

for (const defender of ['r', 'q']) {
    for (const bishopSquare of ['b2', 'c3']) {
        const game = harness({ a1: 'k', a2: defender, c1: 'K', [bishopSquare]: 'B' }, 'black');
        assert.notEqual(game.evaluate('findCheckedKing(currentPosition, "black")'), null);
        assert(game.moves().includes('a2-b2'), 'The defending piece can capture the bishop or block the check.');
        proveCannotMate(game, 'white', true, 0, 1);
        prove(game, false, 0, 1);
    }
}
const sameColorBishops = harness({ c3: 'K', d3: 'B', f3: 'B', h8: 'k', a8: 'r', a7: 'q', e6: 'b' }, 'black');
proveCannotMate(sameColorBishops, 'white', true, 0, 1);
proveCannotMate(sameColorBishops, 'black', false, 0, 1);

for (const blocker of ['b', 'n', 'p']) {
    const game = harness({ f7: 'K', f8: 'B', h8: 'k', h7: blocker });
    proveCannotMate(game, 'white', false, 0, 1);
    game.evaluate('recordCurrentPosition(); renderBoard();');
    assert.equal(game.evaluate(`
        selectedSquare = document.createElement('button'); selectedSquare.dataset.position = 'f8';
        movePiece(1, 6);
    `), true);
    assert.equal(game.evaluate('gameResult'), 'Checkmate. White wins.');
}
const oppositeColorBishops = harness({ c3: 'K', d3: 'B', f4: 'B', h8: 'k', a8: 'r' }, 'black');
proveCannotMate(oppositeColorBishops, 'white', false, 0, 1);
console.log('PASS: bishop mating potential accounts for rook and queen defenses, bishop square colors and blockers that permit mate.');

// In Ambrona's position 16, the only capture through the pawn wall is followed by stalemate.
const stalemateWall = { b1: 'k', g2: 'P', f3: 'P', g3: 'p', f4: 'p', h4: 'K', f5: 'p', h5: 'P', h6: 'p' };
const reflectedWall = Object.fromEntries(Object.entries(stalemateWall).map(([square, piece]) =>
    [square[0] + (9 - Number(square[1])), piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()]));
for (const [pieces, player, move] of [[stalemateWall, 'white', 'h4-h3'], [reflectedWall, 'black', 'h5-h6']]) {
    const game = harness(pieces, player);
    assert.deepEqual(game.moves(), [move]);
    prove(game, true);
    proveCannotMate(game, 'white', true);
    proveCannotMate(game, 'black', true);
}

const { f5, ...breakableWall } = stalemateWall;
const closingWall = harness({ ...breakableWall, f6: f5 }, 'black');
closingWall.evaluate('recordCurrentPosition(); renderBoard();');
assert.equal(closingWall.evaluate('gameResult'), null);
assert.equal(closingWall.move('f6', 'f5'), true);
assert.equal(closingWall.evaluate('gameResult'), 'Draw by dead position.');
assert.equal(closingWall.evaluate('moveHistory.length'), 1);
assert.equal(closingWall.evaluate('currentPosition[6][6]'), 'P', 'The possible king capture must not be played.');

const openWall = harness(breakableWall);
prove(openWall, false);
openWall.evaluate('recordCurrentPosition(); renderBoard();');
assert.equal(openWall.evaluate('gameResult'), null);
for (const [from, to] of [['h4', 'g4'], ['b1', 'a1'], ['g4', 'f4']]) {
    assert.equal(openWall.move(from, to), true);
}
assert.equal(openWall.evaluate('currentPosition[4][5]'), 'K');
assert.equal(openWall.evaluate('gameResult'), null, 'Removing the f5 pawn permits a capture that leaves the game active.');
console.log('PASS: pawn walls can be dead when every breach stalemates, while an active breach keeps the game playable.');

// Ambrona's position 14 adds a mobile bishop to the pawn wall.
const { b1: blackKing, ...pawnWall } = stalemateWall;
const bishopWall = { ...pawnWall, f1: blackKing, g1: 'b' };
const reflectedBishopWall = Object.fromEntries(Object.entries(bishopWall).map(([square, piece]) =>
    [square[0] + (9 - Number(square[1])), piece === piece.toUpperCase() ? piece.toLowerCase() : piece.toUpperCase()]));
for (const [pieces, player] of [[bishopWall, 'black'], [reflectedBishopWall, 'white']]) {
    const game = harness(pieces, player);
    prove(game, true);
    proveCannotMate(game, player, true);
}

const { f3: approachingPawn, ...unclosedBishopWall } = bishopWall;
const closingBishopWall = harness({ ...unclosedBishopWall, f2: approachingPawn });
closingBishopWall.evaluate('recordCurrentPosition(); renderBoard();');
assert.equal(closingBishopWall.evaluate('gameResult'), null);
const closedBishopPosition = JSON.parse(closingBishopWall.evaluate('JSON.stringify(currentPosition)'));
closedBishopPosition[6][5] = '';
closedBishopPosition[5][5] = 'P';
assert.equal(closingBishopWall.move('f2', 'f3'), true);
assert.equal(closingBishopWall.evaluate('gameResult'), 'Draw by dead position.');
assert.equal(closingBishopWall.evaluate('JSON.stringify(currentPosition)'), JSON.stringify(closedBishopPosition));
assert.deepEqual(JSON.parse(closingBishopWall.evaluate('JSON.stringify(moveHistory)')),
    [{ number: 1, player: 'white', notation: 'f3' }]);

const breakableBishopWall = { ...bishopWall };
delete breakableBishopWall.f5;
const openBishopWall = harness(breakableBishopWall, 'black');
prove(openBishopWall, false);
openBishopWall.evaluate('recordCurrentPosition(); renderBoard();');
for (const [from, to] of [['f1', 'e1'], ['h4', 'g4'], ['e1', 'd1'], ['g4', 'f4']]) {
    assert.equal(openBishopWall.move(from, to), true);
}
assert.equal(openBishopWall.evaluate('gameResult'), null, 'The breach must leave the game active.');

const matingBishopWall = harness({ ...pawnWall, h2: 'k', e5: 'b' }, 'black');
prove(matingBishopWall, false);
matingBishopWall.evaluate('recordCurrentPosition(); renderBoard();');
assert.equal(matingBishopWall.move('e5', 'f6'), true);
assert.equal(matingBishopWall.evaluate('gameResult'), 'Checkmate. Black wins.');
console.log('PASS: a mobile bishop can inhabit a dead pawn wall, while a live breach or bishop mate keeps play active.');
