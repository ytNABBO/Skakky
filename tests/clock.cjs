const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

// A small interactive DOM exercises the real square and dialog event handlers.
function harness() {
    let now = 0;
    let nextTimer = 1;
    const timers = new Map();
    const elements = new Map();
    const documentListeners = new Map();
    let document;

    function element(tag = 'div') {
        const classes = new Set();
        const listeners = new Map();
        const node = {
            tagName: tag.toUpperCase(), children: [], dataset: {}, disabled: false,
            hidden: false, open: false, value: '', returnValue: '', textContent: '',
            attributes: {},
            classList: {
                add(...names) { names.forEach(name => classes.add(name)); },
                remove(...names) { names.forEach(name => classes.delete(name)); },
                contains(name) { return classes.has(name); },
                toggle(name, force) {
                    const enabled = force === undefined ? !classes.has(name) : force;
                    if (enabled) classes.add(name); else classes.delete(name);
                    return enabled;
                }
            },
            addEventListener(type, callback) {
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(callback);
            },
            dispatch(type, properties = {}) {
                for (const callback of listeners.get(type) ?? []) callback({ target: node, ...properties });
            },
            click() { if (!node.disabled) node.dispatch('click'); },
            setAttribute(name, value) { node.attributes[name] = String(value); },
            getAttribute(name) { return node.attributes[name] ?? null; },
            appendChild(child) { node.children.push(child); return child; },
            replaceChildren(...children) { node.children = children; },
            focus() { document.activeElement = node; },
            showModal() { node.open = true; },
            close(value = '') { node.open = false; node.returnValue = value; node.dispatch('close'); },
            querySelector(selector) { return node.querySelectorAll(selector)[0] ?? null; },
            querySelectorAll(selector) {
                const descendants = [];
                function visit(parent) {
                    for (const child of parent.children) { descendants.push(child); visit(child); }
                }
                visit(node);
                return descendants.filter(child => selector.split(',').some(part => {
                    const candidate = part.trim();
                    const classNames = [...candidate.matchAll(/\.([\w-]+)/g)].map(match => match[1]);
                    if (!classNames.every(name => child.classList.contains(name))) return false;
                    if (candidate.startsWith('button') && child.tagName !== 'BUTTON') return false;
                    if (candidate.includes(':enabled') && child.disabled) return false;
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
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        },
        createElement: element,
        addEventListener(type, callback) { documentListeners.set(type, callback); }
    };
    document.getElementById('time-control').value = '';
    const context = vm.createContext({
        document,
        performance: { now: () => now },
        setInterval(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
        clearInterval(id) { timers.delete(id); }
    });
    vm.runInContext(source, context);
    const evaluate = code => vm.runInContext(code, context);
    const get = id => document.getElementById(id);
    const square = coordinate => get('board').querySelector(`[data-position="${coordinate}"]`);
    return {
        evaluate, get, square,
        start(control = '180+2') {
            get('time-control').value = control;
            get('time-control').dispatch('change');
            get('start-clock').click();
        },
        advance(milliseconds, tick = true) {
            now += milliseconds;
            if (tick) for (const callback of [...timers.values()]) callback();
        },
        visibilityChange() { documentListeners.get('visibilitychange')?.(); },
        move(from, to) {
            assert(square(from), `Missing source square ${from}`);
            square(from).click();
            assert(square(to), `Missing destination square ${to}`);
            square(to).click();
        },
        fixture(pieces, player = 'white') {
            context.pieces = pieces;
            context.fixturePlayer = player;
            evaluate(`
                for (const row of currentPosition) row.fill('');
                for (const [square, piece] of Object.entries(pieces)) {
                    currentPosition[8 - Number(square[1])]['abcdefgh'.indexOf(square[0])] = piece;
                }
                currentPlayer = fixturePlayer;
                halfmoveClock = 0;
                enPassant = null;
                positionOccurrences.clear();
                recordCurrentPosition();
                renderBoard();
            `);
        },
        timers: () => timers.size,
        active: () => evaluate('chessClock?.activePlayer'),
        remaining: player => evaluate(`chessClock.remaining.${player}`),
        result: () => get('turn').textContent
    };
}

{
    const game = harness();
    assert.equal(game.evaluate('chessClock'), null, 'A new game is untimed.');
    game.advance(500000);
    assert.equal(game.result(), 'White to move');
    game.get('time-control').value = '180+2';
    game.get('time-control').dispatch('change');
    game.move('e2', 'e4');
    assert.equal(game.get('time-control').disabled, true, 'The time control locks on the first move.');
    assert.equal(game.get('time-control').value, '', 'An unstarted preset must not label an untimed game as timed.');
    game.start();
    assert.equal(game.evaluate('chessClock'), null, 'Clocks cannot be started halfway through a game.');
}

for (const [control, initial, increment] of [['180+2', 180000, 2000], ['300+0', 300000, 0], ['600+5', 600000, 5000]]) {
    const game = harness();
    game.start(control);
    assert.equal(game.active(), 'white');
    assert.equal(game.remaining('white'), initial);
    assert.equal(game.remaining('black'), initial);
    assert.equal(game.get('time-control').disabled, true);
    assert.equal(game.timers(), 1);
    game.start(control);
    game.evaluate('startChessClock();');
    assert.equal(game.timers(), 1, 'Duplicate starts must not create timers or reset time.');
    game.advance(2350);
    assert.equal(game.remaining('white'), initial - 2350, 'A delayed interval debits all elapsed time.');
    assert.equal(game.remaining('black'), initial);
    game.move('e2', 'e4');
    assert.equal(game.remaining('white'), initial - 2350 + increment);
    assert.equal(game.active(), 'black');
    game.advance(1450, false);
    game.move('e7', 'e5');
    assert.equal(game.remaining('black'), initial - 1450 + increment, 'Actions settle time without waiting for an interval.');
    assert.equal(game.active(), 'white');
}
console.log('PASS: untimed default, all time controls, White starts, delayed ticks, increments and control locking.');

{
    const game = harness();
    game.start();
    game.advance(1000, false);
    game.move('e2', 'e5');
    assert.equal(game.active(), 'white', 'An illegal destination cannot switch clocks.');
    assert.equal(game.remaining('black'), 180000);
    game.advance(500);
    assert.equal(game.remaining('white'), 178500, 'Illegal moves grant no increment.');
    game.advance(12000, false);
    game.visibilityChange();
    assert.equal(game.remaining('white'), 166500, 'Visibility changes settle background elapsed time.');
}

for (const confirm of [false, true]) {
    const game = harness();
    game.fixture({ a1: 'K', b7: 'P', h6: 'k', h7: 'p' });
    game.start();
    game.advance(1000);
    game.move('b7', 'b8');
    assert.equal(game.get('promotion').open, true);
    assert.equal(game.active(), 'white', 'Promotion is incomplete until a piece is chosen.');
    game.advance(3500);
    game.get('promotion').close(confirm ? 'q' : '');
    assert.equal(game.remaining('white'), confirm ? 177500 : 175500);
    assert.equal(game.active(), confirm ? 'black' : 'white');
    assert.equal(game.square('b8').dataset.piece, confirm ? 'Q' : '');
}
console.log('PASS: illegal moves, background settlement, promotion thinking time and promotion cancellation.');

for (const player of ['white', 'black']) {
    const game = harness();
    game.start('300+0');
    if (player === 'black') game.move('e2', 'e4');
    const before = game.evaluate('JSON.stringify(currentPosition)');
    game.advance(300000, false);
    game.move(player === 'white' ? 'e2' : 'e7', player === 'white' ? 'e4' : 'e5');
    assert.equal(game.result(), player === 'white' ? 'White ran out of time. Black wins.' : 'Black ran out of time. White wins.');
    assert.equal(game.evaluate('JSON.stringify(currentPosition)'), before, 'An expired player cannot finish a move.');
    assert.equal(game.remaining(player), 0);
    assert.equal(game.active(), null);
    assert.equal(game.timers(), 0);
}

for (const dialog of ['promotion', 'resignation', 'draw-claim']) {
    const game = harness();
    game.fixture({ a1: 'K', b7: 'P', h6: 'k', h7: 'p' });
    game.start('300+0');
    if (dialog === 'promotion') game.move('b7', 'b8');
    if (dialog === 'resignation') game.get('resign').click();
    if (dialog === 'draw-claim') {
        game.evaluate('halfmoveClock = 99; renderBoard();');
        game.get('claim-draw').click();
    }
    assert.equal(game.get(dialog).open, true);
    game.advance(300000);
    assert.equal(game.get(dialog).open, false, 'Timeout dismisses pending dialogs.');
    assert.equal(game.evaluate('pendingPromotion'), null);
    assert.equal(game.evaluate('pendingDrawClaim'), null);
    assert.equal(game.evaluate('pendingResignation'), false);
    // A delayed close event from an already dismissed dialog must not change the result.
    game.get(dialog).close(dialog === 'promotion' ? 'q' : dialog === 'resignation' ? 'resign' : 'claim');
    assert.equal(game.result(), 'White ran out of time. Black wins.');
    assert.equal(game.square('b7').dataset.piece, 'P');
}
console.log('PASS: timeout before move submission, both colors, pending-dialog cleanup and stale close events.');

for (const [pieces, drawn] of [
    [{ a1: 'K', b2: 'Q', h8: 'k' }, true],
    [{ a1: 'K', b2: 'Q', h8: 'k', g6: 'n' }, true],
    [{ a1: 'K', b2: 'P', h8: 'k', g6: 'n' }, false],
    [{ a1: 'K', h8: 'k', g6: 'n', f6: 'n' }, false]
]) {
    const game = harness();
    game.fixture(pieces);
    game.start('300+0');
    game.advance(300001);
    assert.equal(game.result(), drawn ? 'Draw on time: the opponent cannot checkmate.' : 'White ran out of time. Black wins.');
}

for (const ending of ['mate', 'stalemate', 'material', 'pawn-blockade', 'bishop-blockade', 'knight-blockade', '75-move', 'repetition', 'resignation', 'claim', 'agreement']) {
    const game = harness();
    game.start();
    game.advance(500);
    if (ending === 'mate') {
        game.fixture({ c6: 'K', d7: 'Q', a8: 'k' });
        game.move('d7', 'b7');
        assert.equal(game.result(), 'Checkmate. White wins.');
        assert.equal(game.remaining('white'), 179500, 'A game-ending move does not start another clock or grant increment.');
    } else if (ending === 'stalemate') {
        game.fixture({ c6: 'K', d7: 'Q', a8: 'k' });
        game.move('d7', 'c7');
        assert.equal(game.result(), 'Stalemate. Draw.');
    } else if (ending === 'material') {
        game.fixture({ a1: 'K', b2: 'B', c3: 'r', h8: 'k' });
        game.move('b2', 'c3');
        assert.equal(game.result(), 'Draw by insufficient material.');
    } else if (ending === 'pawn-blockade' || ending === 'bishop-blockade') {
        const bishops = ending === 'bishop-blockade' ? { c1: 'B', c8: 'b' } : {};
        game.fixture({
            ...bishops,
            e1: 'K', e8: 'k',
            a3: 'P', c3: 'P', e3: 'P', g3: 'P', b3: 'P', d4: 'P', f4: 'P', h4: 'P',
            a4: 'p', c4: 'p', e4: 'p', g4: 'p', b5: 'p', d5: 'p', f5: 'p', h5: 'p'
        });
        game.evaluate('movesPlayed = 2; renderBoard();');
        game.get('offer-draw').click();
        assert.equal(game.evaluate('drawOfferQueued'), true);
        game.move('b3', 'b4');
        assert.equal(game.result(), 'Draw by dead position.');
        assert.equal(game.remaining('white'), 179500, 'The last locking move ends play without increment.');
        assert.equal(game.get('offer-draw').hidden, true);
        assert.equal(game.get('resign').hidden, true);
        assert.equal(game.get('claim-draw').hidden, true);
        assert.equal(game.get('claim-repetition').hidden, true);
    } else if (ending === 'knight-blockade') {
        game.fixture({
            e1: 'K', e8: 'k', a1: 'N',
            a4: 'P', b2: 'P', c2: 'P', d3: 'P', e2: 'P', f3: 'P', g2: 'P', h3: 'P',
            a5: 'p', b4: 'p', c3: 'p', d4: 'p', e3: 'p', f4: 'p', g3: 'p', h4: 'p'
        });
        game.move('b2', 'b3');
        assert.equal(game.result(), 'Draw by dead position.');
        assert.equal(game.remaining('white'), 179500, 'Confined knights must not prolong a dead game or grant increment.');
        assert.equal(game.get('resign').hidden, true);
    } else if (ending === '75-move') {
        game.fixture({ a1: 'K', b2: 'R', h8: 'k', g7: 'r' });
        game.evaluate('halfmoveClock = 149;');
        game.move('b2', 'b3');
        assert.equal(game.result(), 'Draw by the 75-move rule.');
    } else if (ending === 'repetition') {
        game.evaluate('positionOccurrences.set(getPositionKey(), 5); renderBoard();');
        assert.equal(game.result(), 'Draw by fivefold repetition.');
    } else if (ending === 'resignation') {
        game.get('resign').click();
        game.advance(1500, false);
        game.get('resignation').close('resign');
        assert.equal(game.result(), 'White resigns. Black wins.');
    } else if (ending === 'claim') {
        game.evaluate('halfmoveClock = 100; renderBoard();');
        game.get('claim-draw').click();
        assert.equal(game.result(), 'Draw claimed under the 50-move rule.');
    } else {
        game.move('e2', 'e4');
        game.get('offer-draw').click();
        game.move('e7', 'e5');
        game.get('accept-draw').click();
        assert.equal(game.result(), 'Draw by agreement.');
    }
    const times = [game.remaining('white'), game.remaining('black')];
    const result = game.result();
    assert.equal(game.active(), null, `${ending} stops the clock.`);
    assert.equal(game.timers(), 0, `${ending} clears the interval.`);
    game.advance(900000);
    game.evaluate('syncChessClock();');
    assert.deepEqual([game.remaining('white'), game.remaining('black')], times, `${ending} freezes both times.`);
    assert.equal(game.result(), result);
}
console.log('PASS: impossible-mate timeout exceptions and every terminal result freezes both clocks.');
