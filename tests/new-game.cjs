const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const files = 'abcdefgh';

function harness(scheduleClose = callback => callback()) {
    const elements = new Map();
    const timers = new Map();
    let nextTimer = 1;
    let now = 0;
    let wallTime = new Date(2031, 0, 31, 23, 59, 0).getTime();
    let document;
    class TestDate extends Date {
        constructor(...args) { super(...(args.length ? args : [wallTime])); }
        static now() { return wallTime; }
    }
    function createElement(tag = 'div') {
        const classes = new Set();
        const listeners = new Map();
        const node = {
            tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {}, textContent: '',
            disabled: false, hidden: false, open: false, value: '', returnValue: '',
            classList: {
                add(...names) { names.forEach(name => classes.add(name)); },
                remove(...names) { names.forEach(name => classes.delete(name)); },
                contains(name) { return classes.has(name); }
            },
            addEventListener(type, listener) { listeners.set(type, listener); },
            dispatch(type) { listeners.get(type)?.(); },
            click() { if (!this.disabled) listeners.get('click')?.(); },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            appendChild(child) { this.children.push(child); },
            replaceChildren(...children) { this.children = children; },
            focus() { document.activeElement = this; },
            showModal() { this.open = true; },
            close(value = '') {
                this.open = false;
                this.returnValue = value;
                scheduleClose(() => this.dispatch('close'));
            },
            querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; },
            querySelectorAll(selector) {
                const descendants = [];
                function visit(parent) { for (const child of parent.children) { descendants.push(child); visit(child); } }
                visit(this);
                return descendants.filter(child => selector.split(',').some(part => {
                    const candidate = part.trim();
                    if (candidate.startsWith('button') && child.tagName !== 'BUTTON') return false;
                    if (candidate.includes(':enabled') && child.disabled) return false;
                    if (![...candidate.matchAll(/\.([\w-]+)/g)].every(match => child.classList.contains(match[1]))) return false;
                    const data = candidate.match(/\[data-(\w+)="([^"]*)"\]/);
                    return !data || child.dataset[data[1]] === data[2];
                }));
            }
        };
        return node;
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
        document, Date: TestDate, performance: { now: () => now },
        setInterval(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
        clearInterval(id) { timers.delete(id); }
    });
    const evaluate = code => vm.runInContext(code, context);
    evaluate(source);
    const get = id => elements.get(id);
    return {
        evaluate, get,
        timerCount: () => timers.size,
        timerCallbacks: () => [...timers.values()],
        advance(milliseconds, tick = true) {
            now += milliseconds; wallTime += milliseconds;
            if (tick) for (const callback of [...timers.values()]) callback();
        },
        move(from, to) {
            context.actualMove = { from, to };
            return evaluate(`
                selectedSquare = document.createElement('button'); selectedSquare.dataset.position = actualMove.from;
                movePiece(8 - Number(actualMove.to[1]), files.indexOf(actualMove.to[0]));
            `);
        },
        select(square) {
            context.selectSquare = square;
            evaluate(`(() => {
                const selected = board.querySelector('[data-position="' + selectSquare + '"]');
                selectPiece(selected, selected.dataset.piece, 8 - Number(selectSquare[1]), files.indexOf(selectSquare[0]));
            })()`);
        },
        startClock(control = '180+2') {
            context.testControl = control;
            return evaluate('timeControl.value = testControl; startChessClock();');
        },
        fixture(pieces, clock = 0) {
            context.fixture = pieces;
            context.fixtureClock = clock;
            evaluate(`
                for (const rank of currentPosition) rank.fill('');
                for (const [square, piece] of Object.entries(fixture)) {
                    currentPosition[8 - Number(square[1])][files.indexOf(square[0])] = piece;
                }
                halfmoveClock = fixtureClock;
                positionOccurrences.clear(); recordCurrentPosition(); renderBoard();
            `);
        }
    };
}

const ruleSnapshot = 'JSON.stringify([currentPosition,currentPlayer,enPassant,castlingRights,halfmoveClock,movesPlayed,drawOfferedBy,drawOfferQueued,declaredResult,gameResult,pendingPromotion,pendingDrawClaim,pendingResignation,pendingNewGame,selectedSquare?.dataset.position,Array.from(positionOccurrences),moveHistory,gameStartedAt])';
function assertFreshGame(game) {
    assert.equal(game.evaluate('JSON.stringify(currentPosition)'), game.evaluate('JSON.stringify(startingPosition)'));
    assert.equal(game.evaluate('currentPlayer'), 'white');
    assert.equal(game.evaluate('selectedSquare'), null);
    assert.equal(game.evaluate('gameResult'), null);
    assert.equal(game.evaluate('declaredResult'), null);
    assert.equal(game.evaluate('enPassant'), null);
    assert.equal(game.evaluate('halfmoveClock'), 0);
    assert.equal(game.evaluate('movesPlayed'), 0);
    assert.equal(game.evaluate('drawOfferedBy'), null);
    assert.equal(game.evaluate('drawOfferQueued'), false);
    assert.equal(game.evaluate('pendingPromotion'), null);
    assert.equal(game.evaluate('pendingDrawClaim'), null);
    assert.equal(game.evaluate('pendingResignation'), false);
    assert.equal(game.evaluate('pendingNewGame'), false);
    assert.equal(game.evaluate('castlingRights.white.kingside && castlingRights.white.queenside && castlingRights.black.kingside && castlingRights.black.queenside'), true);
    assert.equal(game.evaluate('positionOccurrences.size'), 1);
    assert.equal(game.evaluate('positionOccurrences.get(getPositionKey())'), 1);
    assert.equal(game.evaluate('moveHistory.length'), 0);
    assert.equal(game.evaluate('chessClock'), null);
    assert.equal(game.evaluate('clockTimer'), null);
    assert.equal(game.timerCount(), 0);
    assert.equal(game.get('time-control').value, '');
    assert.equal(game.get('time-control').disabled, false);
    assert.equal(game.get('start-clock').disabled, true);
    assert.equal(game.get('clock-panel').hidden, true);
    assert.equal(game.get('move-history-body').children.length, 0);
    assert.equal(game.get('move-history-table').hidden, true);
    assert.equal(game.get('move-history-empty').hidden, false);
    assert.equal(game.get('turn').textContent, 'White to move');
    const enabled = game.get('board').children.filter(square => !square.disabled);
    assert.equal(enabled.length, 16);
    assert(enabled.every(square => square.dataset.piece && square.dataset.piece === square.dataset.piece.toUpperCase()));
    assert.equal(game.evaluate('document.activeElement === timeControl'), true);
}

{
    const game = harness();
    for (const [from, to] of [
        ['h2', 'h4'], ['a7', 'a6'], ['h1', 'h3'], ['a6', 'a5'], ['h3', 'h1'], ['b7', 'b5']
    ]) assert.equal(game.move(from, to), true);
    assert.equal(game.evaluate('castlingRights.white.kingside'), false);
    assert.notEqual(game.evaluate('enPassant'), null);
    assert.equal(game.evaluate('toggleDrawOffer()'), true);
    game.evaluate('halfmoveClock = 100; renderBoard();');
    game.select('g1');
    const before = game.evaluate(ruleSnapshot);
    const selected = game.evaluate('selectedSquare');
    game.get('new-game').click();
    assert.equal(game.get('new-game-dialog').open, true);
    assert.equal(game.evaluate('pendingNewGame'), true);
    assert.equal(game.evaluate('movePiece(5, 5)'), false, 'The prepared Nf3 move must wait for the new-game decision.');
    game.select('b1');
    assert.equal(game.evaluate('selectedSquare'), selected);
    assert.equal(game.evaluate('claimDraw("fifty")'), false);
    game.evaluate('openDrawClaim("fifty");');
    assert.equal(game.get('draw-claim').open, false);
    assert.equal(game.evaluate('toggleDrawOffer()'), false);
    assert.equal(game.evaluate('resign("black")'), false);
    game.get('new-game-dialog').close('cancel');
    assert.equal(game.evaluate(ruleSnapshot), before, 'Cancelling must retain the existing game exactly.');
    assert.equal(game.evaluate('document.activeElement === newGameButton'), true);
    game.get('new-game').click();
    game.get('new-game-dialog').close('');
    assert.equal(game.evaluate(ruleSnapshot), before, 'Escape must retain the current position and counters.');

    const board = game.evaluate('currentPosition');
    const ranks = game.evaluate('currentPosition.slice()');
    const rights = game.evaluate('[castlingRights.white,castlingRights.black]');
    const history = game.evaluate('moveHistory');
    const oldDate = game.evaluate('gameStartedAt');
    game.advance(120000);
    assert(game.evaluate('getPgn()').includes('[Date "2031.01.31"]'));
    game.get('new-game').click();
    game.get('new-game-dialog').close('start');
    assertFreshGame(game);
    assert.equal(game.evaluate('currentPosition'), board);
    for (let row = 0; row < 8; row++) assert.equal(game.evaluate(`currentPosition[${row}]`), ranks[row]);
    assert.equal(game.evaluate('castlingRights.white'), rights[0]);
    assert.equal(game.evaluate('castlingRights.black'), rights[1]);
    assert.equal(game.evaluate('moveHistory'), history);
    assert.notEqual(game.evaluate('gameStartedAt'), oldDate);
    const pgn = game.evaluate('getPgn()');
    for (const tag of ['[Date "2031.02.01"]', '[TimeControl "-"]', '[Result "*"]', '[PlyCount "0"]']) assert(pgn.includes(tag));
    assert(pgn.endsWith('\n\n*\n\n'));
}
console.log('PASS: cancellation and confirmation preserve or reset real moves, rights, EP, offers, history, identities and PGN metadata.');

{
    const game = harness();
    assert.equal(game.move('e2', 'e4'), true);
    assert.equal(game.evaluate('toggleDrawOffer()'), true);
    assert.equal(game.move('e7', 'e5'), true);
    game.get('new-game').click();
    assert.equal(game.evaluate('respondToDrawOffer(true)'), false);
    assert.equal(game.evaluate('respondToDrawOffer(false)'), false);
    assert.equal(game.evaluate('drawOfferedBy'), 'black');
    game.get('new-game-dialog').close('cancel');
    assert.equal(game.evaluate('respondToDrawOffer(false)'), true);
}
{
    const game = harness();
    game.get('new-game').click();
    assert.equal(game.startClock(), false, 'Clock setup cannot start while the new-game decision is pending.');
    game.get('new-game-dialog').close('cancel');
    assert.equal(game.startClock(), true);
}
console.log('PASS: pending new-game confirmation blocks draw responses and clock setup until dismissed.');

for (const ending of ['resignation', 'checkmate', 'agreement']) {
    const game = harness();
    if (ending === 'checkmate') {
        for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) assert.equal(game.move(from, to), true);
    } else {
        assert.equal(game.move('e2', 'e4'), true);
        if (ending === 'resignation') assert.equal(game.evaluate('resign()'), true);
        else {
            assert.equal(game.evaluate('toggleDrawOffer()'), true);
            assert.equal(game.move('e7', 'e5'), true);
            assert.equal(game.evaluate('respondToDrawOffer(true)'), true);
        }
    }
    assert.notEqual(game.evaluate('gameResult'), null);
    game.get('new-game').click();
    assert.equal(game.get('new-game-dialog').open, true, 'Finished games must still allow starting again.');
    game.get('new-game-dialog').close('start');
    assertFreshGame(game);
}
console.log('PASS: resignation, mate and agreed-draw results can restart without reloading.');

{
    const game = harness();
    assert.equal(game.startClock(), true);
    const oldClock = game.evaluate('chessClock');
    const oldTimer = game.timerCallbacks()[0];
    const before = game.evaluate(ruleSnapshot);
    game.get('new-game').click();
    game.advance(1500, false);
    game.get('new-game-dialog').close('cancel');
    assert.equal(game.evaluate(ruleSnapshot), before);
    assert.equal(game.evaluate('chessClock.remaining.white'), 178500, 'Cancelling must charge time spent deciding.');
    game.get('new-game').click();
    game.advance(500, false);
    game.get('new-game-dialog').close('');
    assert.equal(game.evaluate('chessClock.remaining.white'), 178000);
    game.get('new-game').click();
    game.get('new-game-dialog').close('start');
    assertFreshGame(game);
    assert.equal(oldClock.activePlayer, null);
    const fresh = game.evaluate(ruleSnapshot);
    oldTimer();
    game.advance(200000);
    assert.equal(game.evaluate(ruleSnapshot), fresh, 'A cleared old timer must not resurrect or expire the untimed new game.');
    assert.equal(game.startClock('300+0'), true);
    assert.equal(game.evaluate('chessClock.remaining.white'), 300000);
    game.advance(1000);
    assert.equal(game.evaluate('chessClock.remaining.white'), 299000, 'A restarted clock must use its new baseline.');
    assert.equal(game.timerCount(), 1);
}
for (const tickBeforeConfirmation of [false, true]) {
    const game = harness();
    assert.equal(game.startClock('300+0'), true);
    game.get('new-game').click();
    game.advance(300001, tickBeforeConfirmation);
    if (!tickBeforeConfirmation) game.get('new-game-dialog').close('start');
    assert.equal(game.get('new-game-dialog').open, false);
    assert.equal(game.evaluate('pendingNewGame'), false);
    assert.equal(game.get('turn').textContent, 'White ran out of time. Black wins.',
        'A delayed timeout must be adjudicated before a pending new-game confirmation can reset it.');
    game.get('new-game-dialog').close('start');
    assert.equal(game.get('turn').textContent, 'White ran out of time. Black wins.', 'A stale close event must not discard the timeout result.');
    game.get('new-game').click();
    assert.equal(game.get('new-game-dialog').open, true);
    game.get('new-game-dialog').close('start');
    assertFreshGame(game);
}
console.log('PASS: timed decisions keep running; reset clears old intervals and delayed or stale confirmations cannot erase a timeout.');

{
    const closeEvents = [];
    const game = harness(callback => closeEvents.push(callback));
    assert.equal(game.startClock('300+0'), true);
    const dialog = game.get('new-game-dialog');
    game.get('new-game').click();
    game.advance(300001);
    assert.equal(dialog.open, false);
    assert.equal(closeEvents.length, 1);
    assert.equal(game.get('turn').textContent, 'White ran out of time. Black wins.');

    game.get('new-game').click();
    assert.equal(dialog.open, true);
    closeEvents.shift()();
    assert.equal(game.evaluate('pendingNewGame'), true);
    dialog.close('start');
    closeEvents.shift()();
    assertFreshGame(game);
}
console.log('PASS: a deferred timeout close event leaves a reopened new-game confirmation active.');

for (const dialog of ['promotion', 'draw-claim', 'resignation', 'new-game-dialog']) {
    const game = harness();
    if (dialog === 'promotion') {
        game.fixture({ a1: 'K', b7: 'P', h6: 'k', h7: 'p' });
        assert.equal(game.move('b7', 'b8'), false);
    } else if (dialog === 'draw-claim') {
        game.fixture({ a1: 'K', b2: 'R', h8: 'k', g7: 'r' }, 99);
        game.evaluate('openDrawClaim("fifty");');
    } else game.get(dialog === 'resignation' ? 'resign' : 'new-game').click();
    assert.equal(game.get(dialog).open, true);
    game.evaluate('startNewGame();');
    assert.equal(game.get(dialog).open, false);
    assertFreshGame(game);
    assert.equal(game.move('e2', 'e4'), true);
    const afterActualMove = game.evaluate(ruleSnapshot);
    const oldAction = dialog === 'promotion' ? 'q' : dialog === 'draw-claim' ? 'claim' : dialog === 'resignation' ? 'resign' : 'start';
    game.get(dialog).close(oldAction);
    assert.equal(game.evaluate(ruleSnapshot), afterActualMove,
        'A dismissed dialog callback must not play, claim, resign or reset after a new game has begun.');
}
console.log('PASS: reset invalidates every pending dialog before closing it and stale callbacks cannot alter the new game.');
