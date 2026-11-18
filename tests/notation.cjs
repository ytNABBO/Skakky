const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const files = 'abcdefgh';

function harness() {
    const elements = new Map();
    const timers = new Map();
    let nextTimer = 1;
    let document;
    function createElement(tag = 'div') {
        const listeners = new Map();
        const classes = new Set();
        return {
            tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {},
            textContent: '', value: '', returnValue: '', disabled: false, hidden: false, open: false,
            classList: {
                add(...names) { names.forEach(name => classes.add(name)); },
                remove(...names) { names.forEach(name => classes.delete(name)); }
            },
            addEventListener(type, listener) { listeners.set(type, listener); },
            dispatch(type) { listeners.get(type)?.(); },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            appendChild(child) { this.children.push(child); },
            replaceChildren(...children) { this.children = children; },
            querySelector() { return null; }, querySelectorAll() { return []; },
            focus() { document.activeElement = this; },
            showModal() { this.open = true; },
            close(value = '') { this.open = false; this.returnValue = value; listeners.get('close')?.(); }
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
    const evaluate = code => vm.runInContext(code, context);
    evaluate(source);
    const history = () => JSON.parse(evaluate('JSON.stringify(moveHistory)'));
    return {
        evaluate, elements, history,
        rows: () => elements.get('move-history-body').children.map(row => row.children.map(cell => cell.textContent)),
        fixture(pieces, player = 'white', ep = null, clock = 0) {
            context.fixture = pieces;
            context.fixturePlayer = player;
            context.fixtureEnPassant = ep;
            context.fixtureClock = clock;
            evaluate(`
                for (const rank of currentPosition) rank.fill('');
                for (const [square, piece] of Object.entries(fixture)) {
                    currentPosition[8 - Number(square[1])][files.indexOf(square[0])] = piece;
                }
                currentPlayer = fixturePlayer; enPassant = fixtureEnPassant;
                halfmoveClock = fixtureClock; movesPlayed = currentPlayer === 'white' ? 0 : 1;
                declaredResult = null; pendingPromotion = null; pendingDrawClaim = null; pendingResignation = false;
                drawOfferedBy = null; drawOfferQueued = false;
                castlingRights.white.kingside = castlingRights.white.queenside = true;
                castlingRights.black.kingside = castlingRights.black.queenside = true;
                moveHistory.splice(0); positionOccurrences.clear(); recordCurrentPosition(); renderBoard(); renderMoveHistory();
            `);
        },
        notation(from, to, promotion = null) {
            context.notationMove = { from, to, promotion };
            const before = evaluate('JSON.stringify([currentPosition,currentPlayer,enPassant,castlingRights,halfmoveClock,movesPlayed,Array.from(positionOccurrences),moveHistory])');
            const notation = evaluate(`getAlgebraicMove(
                8 - Number(notationMove.from[1]), files.indexOf(notationMove.from[0]),
                8 - Number(notationMove.to[1]), files.indexOf(notationMove.to[0]), notationMove.promotion)`);
            assert.equal(evaluate('JSON.stringify([currentPosition,currentPlayer,enPassant,castlingRights,halfmoveClock,movesPlayed,Array.from(positionOccurrences),moveHistory])'), before,
                'Generating base notation must preserve the complete live position and history.');
            return notation;
        },
        move(from, to, promotion = null) {
            context.actualMove = { from, to, promotion };
            return evaluate(`
                selectedSquare = document.createElement('button'); selectedSquare.dataset.position = actualMove.from;
                movePiece(8 - Number(actualMove.to[1]), files.indexOf(actualMove.to[0]), actualMove.promotion);
            `);
        }
    };
}

{
    const game = harness();
    assert.deepEqual(game.history(), []);
    assert.equal(game.elements.get('move-history-table').hidden, true);
    assert.equal(game.elements.get('move-history-empty').hidden, false);
    const sequence = [
        ['e2', 'e4', 'e4'], ['e7', 'e5', 'e5'], ['g1', 'f3', 'Nf3'], ['b8', 'c6', 'Nc6'],
        ['f1', 'b5', 'Bb5'], ['a7', 'a6', 'a6'], ['b5', 'c6', 'Bxc6'], ['d7', 'c6', 'dxc6']
    ];
    for (const [from, to, notation] of sequence) {
        assert.equal(game.notation(from, to), notation);
        assert.equal(game.move(from, to), true);
        assert.equal(game.history().at(-1).notation, notation);
    }
    assert.deepEqual(game.history(), sequence.map(([, , notation], index) => ({
        number: Math.floor(index / 2) + 1, player: index % 2 === 0 ? 'white' : 'black', notation
    })));
    assert.deepEqual(game.rows(), [['1.', 'e4', 'e5'], ['2.', 'Nf3', 'Nc6'], ['3.', 'Bb5', 'a6'], ['4.', 'Bxc6', 'dxc6']]);
    assert.equal(game.elements.get('move-history-table').hidden, false);
    assert.equal(game.elements.get('move-history-empty').hidden, true);
    assert.equal(game.elements.get('move-history-body').children[0].children[0].attributes.scope, 'row');
    const before = game.history();
    game.evaluate('renderBoard(); renderBoard(); renderMoveHistory(); renderMoveHistory(); isDeadByContinuation(); cannotMateByContinuation("white");');
    assert.deepEqual(game.history(), before, 'Rendering and simulated continuations must not record moves.');
    assert.equal(game.rows().length, 4);
}
console.log('PASS: opening notation, captures, numbering, move-table rows, empty state and redraw/simulation idempotence.');

{
    const game = harness();
    for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]) assert.equal(game.move(from, to), true);
    assert.equal(game.evaluate('toggleDrawOffer()'), true);
    assert.equal(game.notation('d8', 'h4'), 'Qh4', 'Base notation must not speculate a check or mate suffix.');
    assert.equal(game.move('d8', 'h4'), true);
    assert.equal(game.history().at(-1).notation, 'Qh4#', 'Actual mate gets # and no surviving draw offer marker.');
    assert.equal(game.evaluate('turn.textContent'), 'Checkmate. Black wins.');
    assert.deepEqual(game.rows(), [['1.', 'f3', 'e5'], ['2.', 'g4', 'Qh4#']]);
    const before = game.history();
    assert.equal(game.move('e2', 'e4'), false);
    game.evaluate('renderBoard(); renderMoveHistory();');
    assert.deepEqual(game.history(), before, 'The completed score must remain available after mate.');
}
console.log('PASS: actual checkmate suffix, draw-offer precedence and retained final score.');

for (const [player, pieces, from, to, expected] of [
    ['white', { e1: 'K', h1: 'R', e8: 'k' }, 'e1', 'g1', '0-0'],
    ['white', { e1: 'K', a1: 'R', e8: 'k' }, 'e1', 'c1', '0-0-0'],
    ['black', { e8: 'k', h8: 'r', e1: 'K' }, 'e8', 'g8', '0-0'],
    ['black', { e8: 'k', a8: 'r', e1: 'K' }, 'e8', 'c8', '0-0-0'],
    ['white', { e1: 'K', h1: 'R', f8: 'k' }, 'e1', 'g1', '0-0+']
]) {
    const game = harness();
    game.fixture(pieces, player);
    assert.equal(game.notation(from, to), expected.replace('+', ''));
    assert.equal(game.move(from, to), true);
    assert.deepEqual(game.history(), [{ number: 1, player, notation: expected }]);
    assert.deepEqual(game.rows(), [['1.', player === 'white' ? expected : '—', player === 'black' ? expected : '—']]);
}
console.log('PASS: both castling sides and colors, FIDE zero notation, check suffix and missing-side table cells.');

for (const [pieces, from, to, expected] of [
    [{ a1: 'K', b1: 'N', f1: 'N', h8: 'k' }, 'b1', 'd2', 'Nbd2'],
    [{ h1: 'K', a1: 'R', a3: 'R', h8: 'k' }, 'a1', 'a2', 'R1a2'],
    [{ a1: 'K', b1: 'N', b3: 'N', f1: 'N', h8: 'k' }, 'b1', 'd2', 'Nb1d2'],
    [{ a1: 'K', b1: 'N', f1: 'N', d2: 'p', h8: 'k' }, 'b1', 'd2', 'Nbxd2'],
    [{ e1: 'K', c2: 'N', e2: 'N', e8: 'r', a8: 'k' }, 'c2', 'd4', 'Nd4']
]) {
    const game = harness();
    game.fixture(pieces);
    assert.equal(game.notation(from, to), expected);
    assert.equal(game.move(from, to), true);
    assert.equal(game.history().at(-1).notation, expected);
}
console.log('PASS: file/rank/both disambiguation, disambiguated capture and exclusion of pinned alternatives.');

{
    const game = harness();
    game.fixture({ a1: 'K', e5: 'P', d5: 'p', h8: 'k' }, 'white', { pawnRow: 3, column: 3, targetRow: 2 });
    assert.equal(game.notation('e5', 'd6'), 'exd6');
    assert.equal(game.move('e5', 'd6'), true);
    assert.equal(game.history().at(-1).notation, 'exd6');
    assert.equal(game.evaluate('currentPosition[3][3]'), '');
}
for (const choice of ['q', 'r', 'b', 'n']) {
    const game = harness();
    game.fixture({ a1: 'K', b7: 'P', c8: 'r', h6: 'k', h7: 'p' });
    assert.equal(game.notation('b7', 'c8', choice), `bxc8${choice.toUpperCase()}`);
    assert.equal(game.move('b7', 'c8', choice), true);
    assert.equal(game.history().at(-1).notation, `bxc8${choice.toUpperCase()}`);
}
for (const [player, pieces, from, to, promotion, expected] of [
    ['white', { a1: 'K', g7: 'P', a8: 'k', h7: 'p' }, 'g7', 'g8', 'q', 'g8Q+'],
    ['black', { a1: 'K', e2: 'p', h8: 'k', a2: 'P' }, 'e2', 'e1', 'r', 'e1R+'],
    ['white', { h1: 'K', b7: 'P', a8: 'r', c7: 'k', h7: 'p' }, 'b7', 'a8', 'n', 'bxa8N+'],
    ['black', { e2: 'K', c1: 'R', b2: 'p', h8: 'k', a2: 'P' }, 'b2', 'c1', 'n', 'bxc1N+']
]) {
    const game = harness();
    game.fixture(pieces, player);
    assert.equal(game.notation(from, to, promotion), expected.slice(0, -1));
    assert.equal(game.move(from, to, promotion), true);
    assert.equal(game.history().at(-1).notation, expected);
}
console.log('PASS: en passant, all promotion choices, no-equals FIDE promotion notation, checking promotions and underpromotion captures.');

{
    const game = harness();
    assert.equal(game.move('e2', 'e5'), false);
    assert.deepEqual(game.history(), []);
    game.fixture({ a1: 'K', b7: 'P', h6: 'k', h7: 'p' });
    assert.equal(game.move('b7', 'b8'), false);
    assert.equal(game.elements.get('promotion').open, true);
    assert.deepEqual(game.history(), []);
    game.elements.get('promotion').close('');
    assert.deepEqual(game.history(), [], 'Cancelling promotion must not append a half-completed move.');
    assert.equal(game.move('b7', 'b8'), false);
    game.elements.get('promotion').close('q');
    assert.deepEqual(game.history(), [{ number: 1, player: 'white', notation: 'b8Q' }]);
}
{
    const game = harness();
    game.fixture({ a1: 'K', b2: 'R', h8: 'k', g7: 'r' }, 'white', null, 99);
    game.evaluate('openDrawClaim("fifty");');
    assert.equal(game.elements.get('draw-claim').open, true);
    game.elements.get('draw-claim').close('cancel');
    assert.deepEqual(game.history(), []);
    assert.equal(game.evaluate('claimDraw("fifty", "a1-a3")'), false);
    assert.deepEqual(game.history(), []);
    assert.equal(game.evaluate('claimDraw("fifty", "b2-b3")'), true);
    assert.deepEqual(game.history(), [], 'An intended-move claim does not play or record its nominated move.');
}
{
    const game = harness();
    assert.equal(game.move('e2', 'e4'), true);
    const before = game.history();
    game.elements.get('resign').dispatch('click');
    game.elements.get('resignation').close('cancel');
    assert.deepEqual(game.history(), before);
    assert.equal(game.evaluate('resign()'), true);
    assert.deepEqual(game.history(), before, 'Resignation ends the game without inventing a move.');
    game.evaluate('renderBoard(); renderMoveHistory();');
    assert.deepEqual(game.history(), before);
}
console.log('PASS: illegal moves, promotion/claim cancellation, intended claims and resignation never create phantom history.');

{
    const game = harness();
    assert.equal(game.move('e2', 'e4'), true);
    assert.equal(game.evaluate('toggleDrawOffer(); toggleDrawOffer();'), true);
    assert.equal(game.move('e7', 'e5'), true);
    assert.equal(game.history().at(-1).notation, 'e5', 'A cancelled queued offer has no annotation.');
    assert.equal(game.evaluate('toggleDrawOffer()'), true);
    assert.equal(game.move('g1', 'f3'), true);
    assert.equal(game.history().at(-1).notation, 'Nf3 (=)');
    const before = game.history();
    assert.equal(game.evaluate('respondToDrawOffer(true)'), true);
    assert.equal(game.evaluate('turn.textContent'), 'Draw by agreement.');
    assert.deepEqual(game.history(), before, 'Accepting a draw offer preserves the recorded offer without adding a move.');
    assert.deepEqual(game.rows(), [['1.', 'e4', 'e5'], ['2.', 'Nf3 (=)', '—']]);
}
console.log('PASS: only delivered draw offers receive (=), with history retained after acceptance.');
