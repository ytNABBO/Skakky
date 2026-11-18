const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const files = 'abcdefgh';

function harness() {
    const elements = new Map();
    const intervals = new Map();
    const timeouts = [];
    const blobs = [];
    const createdUrls = [];
    const revokedUrls = [];
    const anchors = [];
    let nextTimer = 1;
    let now = 0;
    let wallTime = new Date(2031, 0, 31, 23, 59, 0).getTime();
    let document;
    class TestDate extends Date {
        constructor(...args) { super(...(args.length ? args : [wallTime])); }
        static now() { return wallTime; }
    }
    class TestBlob {
        constructor(parts, options) { this.parts = parts; this.type = options?.type ?? ''; blobs.push(this); }
    }
    function createElement(tag = 'div') {
        const listeners = new Map();
        const classes = new Set();
        const node = {
            tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {},
            textContent: '', value: '', returnValue: '', disabled: false, hidden: false, open: false,
            parentNode: null, clicks: 0, removed: false,
            classList: {
                add(...names) { names.forEach(name => classes.add(name)); },
                remove(...names) { names.forEach(name => classes.delete(name)); }
            },
            addEventListener(type, listener) { listeners.set(type, listener); },
            dispatch(type) { listeners.get(type)?.(); },
            click() { this.clicks++; listeners.get('click')?.(); },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
            removeChild(child) { this.children = this.children.filter(item => item !== child); child.parentNode = null; child.removed = true; },
            replaceChildren(...children) { this.children = children; },
            remove() { this.parentNode?.removeChild(this); this.removed = true; },
            querySelector() { return null; }, querySelectorAll() { return []; },
            focus() { document.activeElement = this; },
            showModal() { this.open = true; },
            close(value = '') { this.open = false; this.returnValue = value; listeners.get('close')?.(); }
        };
        if (node.tagName === 'A') anchors.push(node);
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
    document.body = createElement('body');
    const context = vm.createContext({
        document, Date: TestDate, Blob: TestBlob,
        URL: {
            createObjectURL(blob) { const url = `blob:pgn-test-${createdUrls.length + 1}`; createdUrls.push({ url, blob }); return url; },
            revokeObjectURL(url) { revokedUrls.push(url); }
        },
        performance: { now: () => now },
        setInterval(callback) { const id = nextTimer++; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); },
        setTimeout(callback, delay) { timeouts.push({ callback, delay }); return nextTimer++; }
    });
    const evaluate = code => vm.runInContext(code, context);
    evaluate(source);
    return {
        evaluate, elements, blobs, createdUrls, revokedUrls, anchors, timeouts, document,
        move(from, to, promotion = null) {
            context.actualMove = { from, to, promotion };
            return evaluate(`
                selectedSquare = document.createElement('button'); selectedSquare.dataset.position = actualMove.from;
                movePiece(8 - Number(actualMove.to[1]), files.indexOf(actualMove.to[0]), actualMove.promotion);
            `);
        },
        advance(milliseconds, tick = false) {
            now += milliseconds; wallTime += milliseconds;
            if (tick) for (const callback of [...intervals.values()]) callback();
        },
        startClock(control) {
            context.testControl = control;
            return evaluate('timeControl.value = testControl; startChessClock();');
        }
    };
}

function parsePgn(text) {
    assert.equal(typeof text, 'string');
    assert(text.endsWith('\n\n'), 'A PGN export must end with a blank line.');
    assert(!text.includes('\r'), 'The export uses stable LF newlines.');
    const separator = text.indexOf('\n\n');
    assert(separator > 0, 'Headers and movetext must be separated by a blank line.');
    const headerLines = text.slice(0, separator).split('\n');
    const headers = {};
    const order = [];
    for (const line of headerLines) {
        const match = line.match(/^\[([A-Za-z]+) "([^"\n]*)"\]$/);
        assert(match, `Malformed tag pair: ${line}`);
        assert(!(match[1] in headers), `Duplicate tag: ${match[1]}`);
        headers[match[1]] = match[2]; order.push(match[1]);
    }
    const movetext = text.slice(separator + 2).trim();
    const terminations = movetext.match(/(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)(?=\s|$)/g) ?? [];
    assert.equal(terminations.length, 1, 'Movetext must contain one game termination marker.');
    assert.equal(terminations[0].trim(), headers.Result, 'Header and movetext results must agree.');
    assert.equal(movetext.split(/\s+/).at(-1), headers.Result);
    for (const line of text.slice(separator + 2).split('\n')) assert(line.length <= 79, 'Movetext lines must remain shorter than 80 characters.');
    return { headers, order, movetext: movetext.replace(/\s+/g, ' ') };
}

const snapshot = 'JSON.stringify([currentPosition,currentPlayer,enPassant,castlingRights,halfmoveClock,movesPlayed,Array.from(positionOccurrences),moveHistory,gameResult,declaredResult,chessClock,clockTimer,selectedSquare?.dataset.position,pendingPromotion,pendingDrawClaim,pendingResignation])';
function exportPure(game) {
    const before = game.evaluate(snapshot);
    const result = game.evaluate('getPgn()');
    assert.equal(game.evaluate(snapshot), before, 'Formatting PGN must never mutate game state, settle clocks or record hypothetical moves.');
    return parsePgn(result);
}

{
    const game = harness();
    const pgn = exportPure(game);
    assert.deepEqual(pgn.order.slice(0, 7), ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result']);
    assert.deepEqual(pgn.headers, {
        Event: 'Skakky casual game', Site: '?', Date: '2031.01.31', Round: '-', White: '?', Black: '?', Result: '*',
        PlyCount: '0', TimeControl: '-'
    });
    assert.equal(pgn.movetext, '*');
    game.advance(120000);
    assert.equal(exportPure(game).headers.Date, '2031.01.31', 'Exporting after local midnight must retain the start date.');
    assert.equal(game.move('e2', 'e4'), true);
    assert.equal(game.move('e7', 'e5'), true);
    assert.equal(game.move('g1', 'f3'), true);
    const opening = exportPure(game);
    assert.equal(opening.headers.PlyCount, '3');
    assert.equal(opening.movetext, '1. e4 e5 2. Nf3 *');
}
console.log('PASS: seven-tag roster, zero-move export, local start-date freeze, real opening moves and pure formatting.');

{
    const game = harness();
    for (const [from, to] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) assert.equal(game.move(from, to), true);
    const pgn = exportPure(game);
    assert.equal(pgn.headers.Result, '0-1');
    assert.equal(pgn.headers.PlyCount, '4');
    assert.equal(pgn.movetext, '1. f3 e5 2. g4 Qh4# 0-1');
}
for (const [result, expected] of [
    [null, '*'], ['Checkmate. White wins.', '1-0'], ['Checkmate. Black wins.', '0-1'],
    ['Black resigns. White wins.', '1-0'], ['White resigns. Black wins.', '0-1'],
    ['White ran out of time. Black wins.', '0-1'], ['Black ran out of time. White wins.', '1-0'],
    ['Draw on resignation: the opponent cannot checkmate.', '1/2-1/2'],
    ['Draw on time: the opponent cannot checkmate.', '1/2-1/2'], ['Stalemate. Draw.', '1/2-1/2'],
    ['Draw by dead position.', '1/2-1/2'], ['Draw claimed under the 50-move rule.', '1/2-1/2']
]) {
    const game = harness();
    game.evaluate(`gameResult = ${JSON.stringify(result)};`);
    assert.equal(game.evaluate('getPgnResult()'), expected);
    const pgn = exportPure(game);
    assert.equal(pgn.headers.Result, expected);
    assert.equal(pgn.movetext, expected, 'A zero-move finished score still has exactly one termination marker.');
}
{
    const game = harness();
    assert.equal(game.evaluate('resign("black")'), true);
    assert.equal(exportPure(game).headers.Result, '1-0', 'Off-turn resignation result must not be inferred from the side to move.');
}
console.log('PASS: actual checkmate, off-turn resignation and every result family use matching PGN termination markers.');

{
    const game = harness();
    for (const [from, to] of [
        ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'b5'], ['a7', 'a6'], ['e1', 'g1']
    ]) assert.equal(game.move(from, to), true);
    const pgn = exportPure(game);
    assert.equal(pgn.movetext, '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. O-O *');
    assert.equal(game.evaluate('moveHistory.at(-1).notation'), '0-0', 'Export conversion must not change the FIDE move list.');
}
for (const promotion of ['q', 'r', 'b', 'n']) {
    const game = harness();
    for (const [from, to] of [
        ['a2', 'a4'], ['h7', 'h5'], ['a4', 'a5'], ['h5', 'h4'], ['a5', 'a6'], ['h4', 'h3'],
        ['a6', 'b7'], ['h3', 'g2']
    ]) assert.equal(game.move(from, to), true);
    assert.equal(game.move('b7', 'a8', promotion), true);
    assert.equal(game.move('g2', 'h1', 'n'), true);
    const pgn = exportPure(game);
    assert.equal(pgn.movetext, `1. a4 h5 2. a5 h4 3. a6 h3 4. axb7 hxg2 5. bxa8=${promotion.toUpperCase()} gxh1=N *`);
    assert.equal(pgn.headers.PlyCount, '10');
    assert.equal(game.evaluate('moveHistory[8].notation'), `bxa8${promotion.toUpperCase()}`);
}
// Existing recorded tokens exercise conversion of suffixes without changing history.
{
    const game = harness();
    game.evaluate(`moveHistory.push(
        { number: 1, player: 'white', notation: '0-0+' },
        { number: 1, player: 'black', notation: '0-0-0#' },
        { number: 2, player: 'white', notation: 'bxa8N+' },
        { number: 2, player: 'black', notation: 'e1R#' }
    );`);
    assert.equal(exportPure(game).movetext, '1. O-O+ O-O-O# 2. bxa8=N+ e1=R# *');
}
console.log('PASS: real castling and all legal opening promotion variants convert to PGN without changing FIDE history.');

{
    const game = harness();
    assert.equal(game.move('e2', 'e4'), true);
    assert.equal(game.evaluate('toggleDrawOffer()'), true);
    assert.equal(game.move('e7', 'e5'), true);
    assert.equal(game.evaluate('respondToDrawOffer(true)'), true);
    const pgn = exportPure(game);
    assert.equal(pgn.movetext, '1. e4 e5 {Draw offered.} 1/2-1/2');
    assert.equal(game.evaluate('moveHistory[1].notation'), 'e5 (=)');
}
{
    const game = harness();
    assert.equal(game.move('e2', 'e4'), true);
    assert.equal(game.move('e7', 'e5'), true);
    assert.equal(game.evaluate('toggleDrawOffer()'), true);
    assert.equal(game.move('g1', 'f3'), true);
    assert.equal(game.move('b8', 'c6'), true);
    assert.equal(exportPure(game).movetext, '1. e4 e5 2. Nf3 {Draw offered.} 2... Nc6 *',
        "Black must receive a repeated move number after a comment follows White's move.");
}
{
    const game = harness();
    const cycle = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']];
    for (let count = 0; count < 4; count++) for (const [from, to] of cycle) assert.equal(game.move(from, to), true);
    const text = game.evaluate('getPgn()');
    const pgn = parsePgn(text);
    assert.equal(pgn.headers.PlyCount, '16');
    assert.equal(pgn.headers.Result, '1/2-1/2');
    assert(text.split('\n\n')[1].split('\n').filter(Boolean).length > 1, 'A longer actual game must wrap its movetext.');
    assert(pgn.movetext.endsWith('8. Ng1 Ng8 1/2-1/2'));
}
console.log('PASS: draw offers become PGN comments and longer real scores wrap cleanly with one final result.');

for (const [control, expected] of [['180+2', '180+2'], ['300+0', '300'], ['600+5', '600+5']]) {
    const game = harness();
    assert.equal(game.startClock(control), true);
    assert.equal(exportPure(game).headers.TimeControl, expected);
    assert.equal(game.evaluate('chessClock.timeControl'), expected);
}
{
    const game = harness();
    assert.equal(game.startClock('300+0'), true);
    game.advance(300001);
    assert.equal(exportPure(game).headers.Result, '*', 'Pure formatting must not adjudicate an overdue but unsettled clock.');
    assert.equal(game.evaluate('gameResult'), null);
    game.elements.get('download-pgn').click();
    assert.equal(game.evaluate('turn.textContent'), 'White ran out of time. Black wins.');
    assert.equal(game.blobs.length, 1);
    assert(game.blobs[0].type.startsWith('application/x-chess-pgn'));
    const downloaded = parsePgn(game.blobs[0].parts.join(''));
    assert.equal(downloaded.headers.Result, '0-1', 'Downloading must settle elapsed time before formatting.');
    assert.equal(downloaded.headers.PlyCount, '0');
    assert.equal(downloaded.headers.TimeControl, '300');
    assert.equal(game.anchors.length, 1);
    assert.equal(game.anchors[0].clicks, 1);
    assert.equal(game.anchors[0].hidden, true);
    assert.equal(game.anchors[0].removed, true);
    assert(game.anchors[0].download.endsWith('.pgn'));
    assert.equal(game.createdUrls.length, 1);
    assert.equal(game.anchors[0].href, game.createdUrls[0].url);
    assert.deepEqual(game.revokedUrls, [], 'The download URL must remain alive until the browser has started the download.');
    assert.equal(game.timeouts.length, 1);
    assert.equal(game.timeouts[0].delay, 1000);
    game.timeouts[0].callback();
    assert.deepEqual(game.revokedUrls, [game.createdUrls[0].url]);
}
console.log('PASS: canonical time controls, pure overdue formatting and download-time flag settlement with safe URL cleanup.');
