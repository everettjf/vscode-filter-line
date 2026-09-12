import { test } from 'node:test';
import { appendFileSync } from 'node:fs';
import * as assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { runJob } from '../../core/job';
import { defaults } from '../../core/rules';
import { originalLine, publishOutput } from '../../core/files';
import { Cancelled, startJob } from '../../core/runner';

async function temporary(action: (directory: string) => Promise<void>) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'filterline-test-'));
    try { await action(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('disk UTF-8 and BOM-marked UTF-16 round-trip exactly including mixed terminators', async () => temporary(async directory => {
    const text = 'keep 中文\r\ndrop\nkeep Ä\rkeep final';
    const expected = 'keep 中文\r\nkeep Ä\rkeep final';
    const formats = [
        { bom: Buffer.alloc(0), encode: (s: string) => Buffer.from(s) },
        { bom: Buffer.from([0xef, 0xbb, 0xbf]), encode: (s: string) => Buffer.from(s) },
        { bom: Buffer.from([0xff, 0xfe]), encode: (s: string) => Buffer.from(s, 'utf16le') },
        { bom: Buffer.from([0xfe, 0xff]), encode: (s: string) => Buffer.from(s, 'utf16le').swap16() },
    ];
    for (const [index, format] of formats.entries()) {
        const input = path.join(directory, `input${index}`); const output = input + '.out'; const mapping = input + '.map';
        const bytes = Buffer.concat([format.bom, format.encode(text)]);
        await writeFile(input, bytes);
        const result = await runJob({ source: { path: input }, options: { ...defaults, pattern: 'keep' }, output, mapping });
        assert.equal(result.matched, 3);
        assert.deepEqual(await readFile(output), Buffer.concat([format.bom, format.encode(expected)]));
        assert.deepEqual(await readFile(input), bytes);
        assert.deepEqual(await Promise.all([0, 1, 2, 3].map(line => originalLine(mapping, line))), [0, 2, 3, undefined]);
    }
}));

test('multibyte characters and CRLF across read boundaries remain intact', async () => temporary(async directory => {
    const input = path.join(directory, 'input'); const output = input + '.out';
    const text = 'a'.repeat(65535) + '中\r\nkeep';
    await writeFile(input, text);
    await runJob({ source: { path: input }, options: defaults, output });
    assert.equal(await readFile(output, 'utf8'), text);
}));

test('invalid UTF-8, UTF-32 and NUL-bearing input fail explicitly; input remains intact', async () => temporary(async directory => {
    for (const [index, bytes] of [Buffer.from([0xff, 0x80]), Buffer.from([0xff, 0xfe, 0, 0, 65, 0, 0, 0]), Buffer.from('alpha\nbeta', 'utf16le')].entries()) {
        const input = path.join(directory, String(index)); await writeFile(input, bytes);
        await assert.rejects(runJob({ source: { path: input }, options: defaults, output: input + '.out' }), /encoding|UTF-32|NUL/);
        assert.deepEqual(await readFile(input), bytes);
    }
}));

test('empty files and zero matches produce complete empty output', async () => temporary(async directory => {
    for (const [index, text] of ['', 'not a match\n'].entries()) {
        const output = path.join(directory, String(index));
        const result = await runJob({ source: { text }, options: { ...defaults, pattern: 'xyz' }, output });
        assert.equal(result.matched, 0); assert.equal((await stat(output)).size, 0);
    }
}));

test('exclusive output and concurrent publication never overwrite source or existing results', async () => temporary(async directory => {
    const input = path.join(directory, 'my.filterline.log'); const temp = path.join(directory, 'complete');
    await writeFile(input, 'original'); await writeFile(temp, 'filtered');
    await assert.rejects(runJob({ source: { text: 'replace' }, options: defaults, output: input }), /EEXIST/);
    const paths = await Promise.all(Array.from({ length: 12 }, () => publishOutput(temp, input)));
    assert.equal(new Set(paths).size, 12);
    assert.equal(await readFile(input, 'utf8'), 'original');
    for (const result of paths) { assert.equal(await readFile(result, 'utf8'), 'filtered'); }
    assert.equal((await readdir(directory)).filter(name => name.startsWith('.filterline-')).length, 0);
}));

test('read/write/mapping failures reject instead of reporting success', async () => temporary(async directory => {
    await assert.rejects(runJob({ source: { path: path.join(directory, 'missing') }, options: defaults }), /ENOENT/);
    await assert.rejects(runJob({ source: { text: 'x' }, options: defaults, output: path.join(directory, 'missing/out') }), /ENOENT/);
    const output = path.join(directory, 'output');
    await assert.rejects(runJob({ source: { text: 'x' }, options: defaults, output, mapping: directory }), /EEXIST/);
    await assert.rejects(publishOutput('/does-not-exist', path.join(directory, 'target')), /ENOENT/);
    assert.equal((await readdir(directory)).filter(name => name.startsWith('.filterline-')).length, 0);
}));

test('worker produces finished output and propagates errors', async () => temporary(async directory => {
    const output = path.join(directory, 'output');
    const result = await startJob({ source: { text: 'keep\ndrop\nkeep' }, options: { ...defaults, pattern: 'keep' }, output }).result;
    assert.equal(result.emitted, 2); assert.equal(await readFile(output, 'utf8'), 'keep\nkeep');
    await assert.rejects(startJob({ source: { text: 'x' }, options: { ...defaults, regex: true, pattern: '[' } }).result, /pattern/);
}));

test('pathological regex is cancellable without blocking the main thread', { timeout: 5000 }, async () => {
    const job = startJob({ source: { text: 'a'.repeat(100) + '!' }, options: { ...defaults, regex: true, pattern: '(a+)+$' }, preview: true });
    const rejected = assert.rejects(job.result, Cancelled);
    await new Promise(resolve => setTimeout(resolve, 150));
    job.cancel();
    await rejected;
});

test('progress is emitted even when no lines match', async () => {
    let reports = 0;
    await runJob({ source: { text: 'drop\n'.repeat(1000) }, options: { ...defaults, pattern: 'absent' } }, () => reports++);
    assert.ok(reports > 0);
});

test('source changes during processing reject the result', async () => temporary(async directory => {
    const input = path.join(directory, 'changing.log');
    await writeFile(input, 'hit\n'.repeat(20000));
    let changed = false;
    // The report hook runs within processing; changing the file is deterministic here.
    await assert.rejects(runJob({ source: { path: input }, options: { ...defaults, pattern: 'hit' }, output: input + '.out' }, () => {
        if (!changed) { changed = true; appendFileSync(input, 'appended'); }
    }), /Source file changed/);
    assert.ok(changed);
}));

test('mapping handles gaps and context without altering original line numbers', async () => temporary(async directory => {
    const output = path.join(directory, 'output'); const mapping = path.join(directory, 'map');
    const result = await runJob({ source: { text: 'zero\nkeep\ntwo\nthree\nfour\nkeep\nlast' }, options: { ...defaults, pattern: 'keep', after: 1 }, output, mapping });
    assert.equal(result.emitted, 4);
    assert.deepEqual(await Promise.all([0, 1, 2, 3].map(line => originalLine(mapping, line))), [1, 2, 5, 6]);
}));

test('cancellation before publication leaves no result or staging directory', async () => temporary(async directory => {
    const complete = path.join(directory, 'complete'); await writeFile(complete, 'full output');
    let checks = 0;
    await assert.rejects(publishOutput(complete, path.join(directory, 'source.log'), () => ++checks >= 2), Cancelled);
    assert.deepEqual(await readdir(directory), ['complete']);
}));
