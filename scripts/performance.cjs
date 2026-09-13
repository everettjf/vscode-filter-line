const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { defaults } = require('../out/core/rules');
const budgets = require('./performance-budgets.json');
async function hash(file) {
    const digest = createHash('sha256');
    for await (const chunk of createReadStream(file)) digest.update(chunk);
    return digest.digest('hex');
}
(async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'filterline-perf-'));
    const reports = [];
    const failures = [];
    const gate = (condition, message) => { if (!condition) failures.push(message); };
    try {
        const rows = Array.from({ length: 2048 }, (_, index) =>
            `2026-09-12 ${index === 1024 ? 'ERROR' : 'DEBUG'} request=${String(index).padStart(4, '0')} message=${'x'.repeat(80)}\r\n`);
        const block = rows.join('');
        async function input(size, name) {
            const file = path.join(directory, name);
            const blocks = Math.ceil(size * 1048576 / Buffer.byteLength(block));
            const handle = await fs.open(file, 'wx');
            try { for (let i = 0; i < blocks; i++) await handle.writeFile(block); } finally { await handle.close(); }
            return { file, blocks, size: (await fs.stat(file)).size };
        }
        const small = await input(64, '64.log');
        const large = await input(256, '256.log');
        async function measure(name, fixture, options, indices, preview = false, bufferPreviewMiB = undefined) {
            const output = path.join(directory, name + '.out');
            const mapping = path.join(directory, name + '.map');
            const child = spawnSync(process.execPath, [path.join(__dirname, 'perf-case.cjs'), JSON.stringify({
                source: { path: fixture.file }, options: { ...defaults, ...options }, output, mapping, preview, bufferPreviewMiB,
            })], { encoding: 'utf8', timeout: 35000, maxBuffer: 1048576 });
            assert.equal(child.status, 0, `${name}: ${child.error || child.stderr}`);
            const measured = JSON.parse(child.stdout);
            const result = measured.result;
            if (preview) {
                assert.equal(result.truncated, true);
                assert.ok(result.scanned <= 5000 && result.bytes <= 262144);
                assert.ok(result.preview.length <= 30);
            } else {
                const selected = indices.map(i => rows[i]).join('');
                const expected = createHash('sha256');
                const expectedMap = createHash('sha256');
                for (let blockIndex = 0; blockIndex < fixture.blocks; blockIndex++) {
                    expected.update(selected);
                    const bytes = Buffer.alloc(indices.length * 8);
                    indices.forEach((index, offset) => bytes.writeDoubleLE(blockIndex * rows.length + index, offset * 8));
                    expectedMap.update(bytes);
                }
                assert.equal(result.scanned, fixture.blocks * rows.length);
                assert.equal(result.emitted, fixture.blocks * indices.length);
                const expectedMatches = options.pattern === 'request=' ? rows.length : options.pattern === 'ABSENT' ? 0 : 1;
                assert.equal(result.matched, fixture.blocks * expectedMatches);
                assert.equal(await hash(output), expected.digest('hex'), `${name}: output correctness`);
                assert.equal(await hash(mapping), expectedMap.digest('hex'), `${name}: mapping correctness`);
            }
            const report = { name, inputMiB: fixture.size / 1048576, seconds: measured.seconds,
                throughputMiBps: preview ? null : fixture.size / 1048576 / measured.seconds, peakRssMiB: measured.peakRssMiB,
                mainLoopMaxMs: measured.mainLoopMaxMs, scanned: result.scanned, matched: result.matched, verified: true };
            reports.push(report);
            gate(report.peakRssMiB <= budgets.maxRssMiB, `${name}: RSS exceeds ${budgets.maxRssMiB} MiB`);
            gate(report.mainLoopMaxMs <= budgets.maxMainLoopMs, `${name}: main event loop stalled`);
            if (preview) gate(report.seconds * 1000 <= budgets.maxPreviewMs, `${name}: preview too slow`);
            else gate(report.throughputMiBps >= budgets.minThroughputMiBps, `${name}: throughput below floor`);
            console.log(`${name}: ${report.seconds.toFixed(3)}s, ${report.peakRssMiB.toFixed(1)} MiB RSS, ${report.mainLoopMaxMs.toFixed(1)}ms main-loop max`);
            return report;
        }
        const all = rows.map((_, i) => i);
        const dense = await measure('all-64', small, { pattern: 'request=' }, all);
        const scaled = await measure('all-256', large, { pattern: 'request=' }, all);
        await measure('none', small, { pattern: 'ABSENT' }, []);
        await measure('sparse', small, { pattern: 'ERROR' }, [1024]);
        await measure('regex', small, { pattern: '^2026-09-12 ERROR request=\\d+', regex: true }, [1024]);
        await measure('context-sparse', small, { pattern: 'ERROR', before: 3, after: 3 }, [1021,1022,1023,1024,1025,1026,1027]);
        const context = await measure('context-dense-1000', small, { pattern: 'request=', before: 1000 }, all);
        await measure('preview-256', large, { pattern: 'ERROR' }, [], true);
        await measure('preview-buffer-64', small, { pattern: 'x' }, [], true, 64);
        gate(scaled.peakRssMiB - dense.peakRssMiB <= budgets.maxScalingRssGrowthMiB, '4x input caused excessive RSS growth');
        gate(scaled.throughputMiBps >= dense.throughputMiBps * budgets.minScalingThroughputRatio, '4x input caused superlinear runtime');
        gate(context.seconds <= dense.seconds * budgets.maxDenseContextRatio, 'Dense context rescans already emitted lines');
        // Equal total bytes, different individual line lengths: exposes repeated rescanning/copying.
        const long = [];
        for (const lengthMiB of [1, 8]) {
            const file = path.join(directory, `long-${lengthMiB}`);
            const handle = await fs.open(file, 'wx');
            const line = Buffer.from('x'.repeat(lengthMiB * 1048576) + '\r\n');
            try { for (let i = 0; i < 16 / lengthMiB; i++) await handle.writeFile(line); } finally { await handle.close(); }
            const output = file + '.out';
            const child = spawnSync(process.execPath, [path.join(__dirname, 'perf-case.cjs'), JSON.stringify({ source: { path: file }, options: defaults, output })], { encoding: 'utf8', timeout: 35000 });
            assert.equal(child.status, 0, child.stderr);
            const measured = JSON.parse(child.stdout);
            assert.equal(await hash(file), await hash(output));
            const report = { name: `long-line-${lengthMiB}MiB`, seconds: measured.seconds, peakRssMiB: measured.peakRssMiB, verified: true };
            reports.push(report); long.push(report);
            gate(report.peakRssMiB <= budgets.maxRssMiB, `${report.name}: RSS exceeds budget`);
            console.log(`${report.name}: ${report.seconds.toFixed(3)}s, ${report.peakRssMiB.toFixed(1)} MiB RSS`);
        }
        gate(long[1].seconds <= long[0].seconds * budgets.maxLongLineRatio, 'Long-line scanning/copying is superlinear');
        const report = { date: new Date().toISOString(), node: process.version, platform: `${os.platform()}/${os.arch()}`, budgets, reports, failures };
        await fs.mkdir('.performance', { recursive: true });
        await fs.writeFile('.performance/results.json', JSON.stringify(report, null, 2) + '\n');
        if (failures.length) { console.error(failures.join('\n')); if (!process.argv.includes('--record-only')) process.exitCode = 1; }
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
