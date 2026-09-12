import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { defaults, configMatcher, patternMatcher, readPresets } from '../../core/rules';
import { filterLines, lines } from '../../core/lines';
import { runJob } from '../../core/job';
import { parseEoml } from '../../core/eoml';
import { migrateHistory, updateHistory } from '../../history';

async function* chunks(values: string[]) { yield* values; }
async function collect<T>(source: AsyncIterable<T>): Promise<T[]> { const result: T[] = []; for await (const item of source) { result.push(item); } return result; }

test('line splitter preserves CR, LF, CRLF and missing final newline at every chunk boundary', async () => {
    const text = 'a\r\nb\nc\rd\r\n\nlast';
    for (let size = 1; size <= text.length; size++) {
        const parts = Array.from({ length: Math.ceil(text.length / size) }, (_, index) => text.slice(index * size, (index + 1) * size));
        const result = await collect(lines(chunks(parts)));
        assert.equal(result.map(line => line.text + line.eol).join(''), text);
        assert.deepEqual(result.map(line => line.text), ['a', 'b', 'c', 'd', '', 'last']);
        assert.deepEqual(result.map(line => line.number), [0, 1, 2, 3, 4, 5]);
    }
    assert.deepEqual(await collect(lines(chunks(['']))), []);
    assert.deepEqual(await collect(lines(chunks(['\r']))), [{ text: '', eol: '\r', number: 0 }]);
    await assert.rejects(collect(lines(chunks(['abcdef']), 3)), /line exceeds/);
    assert.deepEqual(await collect(lines(chunks(['abc\r', '\n']), 3)), [{ text: 'abc', eol: '\r\n', number: 0 }]);
});

test('literal, Unicode case, regex and inverted match semantics', () => {
    assert.equal(patternMatcher({ ...defaults, pattern: '.' })('abc'), undefined);
    assert.equal(patternMatcher({ ...defaults, pattern: '.' })('a.b'), 'a.b');
    assert.equal(patternMatcher({ ...defaults, pattern: 'ä', caseSensitive: false })('Ä'), 'Ä');
    assert.equal(patternMatcher({ ...defaults, pattern: '^a+$', regex: true })('aaa'), 'aaa');
    assert.equal(patternMatcher({ ...defaults, pattern: 'x', invert: true })('abc'), 'abc');
    assert.throws(() => patternMatcher({ ...defaults, pattern: '[', regex: true }), /pattern/);
    assert.throws(() => patternMatcher({ ...defaults, before: -1 }), /before/);
});

test('context merges overlapping windows and counts matches independently', async () => {
    const stats = { scanned: 0, matched: 0, emitted: 0 };
    const result = await collect(filterLines(lines(chunks(['0\n1\nhit\nhit\n4\n5\n6'])), patternMatcher({ ...defaults, pattern: 'hit' }), 1, 1, stats));
    assert.deepEqual(result.map(line => line.number), [1, 2, 3, 4]);
    assert.deepEqual(stats, { scanned: 7, matched: 2, emitted: 4 });
});

test('all legacy list types and default regexlist', () => {
    for (const type of ['stringlist', 'regexlist']) {
        const match = configMatcher({ type, rules: ['foo', 'bar'] });
        assert.equal(match('foo!'), 'foo!'); assert.equal(match('none'), undefined);
    }
    for (const type of ['stringlist_notcontainany', 'regexlist_notmatchany']) {
        const match = configMatcher({ type, rules: ['foo', 'bar'] });
        assert.equal(match('foo!'), undefined); assert.equal(match('none'), 'none');
    }
    assert.equal(configMatcher({ rules: ['^x$'] })('x'), 'x');
    assert.equal(configMatcher({ rules: [] })('x'), undefined);
    assert.equal(configMatcher({ type: 'regexlist_notmatchany', rules: [] })('x'), 'x');
});

test('general rules preserve prefix, captures, flags and inclusive until behavior', () => {
    const config = { type: 'general', prefix: '(TIME) ', rules: [
        { src: 'start (\\d+)', dest: 'BEGIN', tag: 'T', flag: '|', until: '^end$' },
        { src: 'next', flag: '' },
    ] };
    const match = configMatcher(config);
    assert.equal(match('TIME start 42'), '    TIME     |    T BEGIN 42');
    assert.equal(match('no prefix'), 'no prefix');
    assert.equal(match('end'), 'end');
    assert.equal(match('ignored'), undefined);
    assert.equal(match('TIME next'), '    TIME            next');
    assert.equal(configMatcher(config)('no prefix'), undefined, 'state is not shared across executions');
});

test('combined presets support any/all, exclude, case and regex', () => {
    const all = configMatcher({ type: 'combined', include: ['error', 'api'], exclude: ['health'], match: 'all', caseSensitive: false });
    assert.equal(all('ERROR API failure'), 'ERROR API failure');
    assert.equal(all('ERROR API health'), undefined);
    assert.equal(all('ERROR worker'), undefined);
    assert.equal(configMatcher({ type: 'combined', include: ['^error'], regex: true })('error: x'), 'error: x');
    assert.equal(configMatcher({ type: 'combined', exclude: ['ping'] })('pong'), 'pong');
});

test('malformed configuration reports fields, not accidental TypeErrors', () => {
    for (const [config, message] of [
        [{ rules: {} }, /rules must be an array/], [{ rules: [3] }, /rules\[0\]/],
        [{ type: 'general', rules: [{}] }, /rules\[0\].src/], [{ type: 'general', rules: [{ src: '[' }] }, /rules\[0\].src/],
        [{ type: 'combined', include: 5 }, /include/], [{ type: 'combined', match: 'maybe' }, /match/],
        [{ type: 'general', rules: [{ src: 'x', until: '[' }] }, /until/],
        [{ rules: [], before: 1001 }, /before/], [{ rules: [], caseSensitive: 1 }, /caseSensitive/],
    ] as [unknown, RegExp][]) { assert.throws(() => configMatcher(config), message); }
    assert.throws(() => readPresets({ presets: [{ name: 'a', rules: [] }, { name: 'a', rules: [] }] }), /unique/);
    assert.throws(() => readPresets({ presets: [] }), /non-empty/);
});

test('all ten checked-in legacy JSON/EOML examples produce equivalent output', async () => {
    const demo = path.resolve(__dirname, '../../../demo');
    for (let index = 0; index < 5; index++) {
        const json = JSON.parse(await readFile(path.join(demo, `log${index}json/.vscode/filterline.json`), 'utf8')) as unknown;
        const eoml = parseEoml(await readFile(path.join(demo, `log${index}eoml/.vscode/filterline.eoml`), 'utf8'));
        const a = configMatcher(json); const b = configMatcher(eoml);
        for (const line of ['Framework app begin to start', 'cost 42 ms', 'TIME 12 [ABC] Framework app begin to start', 'nothing']) { assert.equal(a(line), b(line)); }
    }
});

test('EOML validates structure and treats literal colon patterns as strings', () => {
    assert.deepEqual(Object.assign({}, parseEoml('type:stringlist\nrules:\n[\nhttp://x\n]')), { type: 'stringlist', rules: ['http://x'] });
    assert.throws(() => parseEoml('rules:\n[\nx'), /missing closing/);
    assert.throws(() => parseEoml(']'), /line 1/);
});

test('preview is bounded, marks samples, and never counts a cut partial line', async () => {
    const result = await runJob({ source: { text: 'hit\n'.repeat(10000) }, options: { ...defaults, pattern: 'hit' }, preview: true });
    assert.equal(result.scanned, 5000); assert.equal(result.matched, 5000); assert.equal(result.preview.length, 30); assert.equal(result.truncated, true);
    const cut = await runJob({ source: { text: 'x'.repeat(300000) }, options: { ...defaults, pattern: 'x' }, preview: true });
    assert.equal(cut.scanned, 0); assert.equal(cut.truncated, true);
});

test('history promotes reused rules, enforces limit, and migrates both legacy kinds', () => {
    const history = migrateHistory({ inputStr: ['a', 3], inputRegex: ['b'] });
    assert.deepEqual(history, [{ pattern: 'a', regex: false }, { pattern: 'b', regex: true }]);
    assert.deepEqual(updateHistory(history, history[1], 1), [history[1]]);
    assert.deepEqual(migrateHistory(null), []);
});

test('context remains bounded for unusually long lines', async () => {
    const stats = { scanned: 0, matched: 0, emitted: 0 };
    await assert.rejects(collect(filterLines(lines(chunks(['x'.repeat(1024 * 1024) + '\n'].flatMap(line => Array(20).fill(line)))), () => undefined, 20, 0, stats)), /Context exceeds/);
});
