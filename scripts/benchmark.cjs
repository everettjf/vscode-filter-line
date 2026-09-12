// Reproducible all-match stress case; validates full output and source mapping size.
const { mkdtemp, open, rm, stat } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { startJob } = require('../out/core/runner');
const { defaults } = require('../out/core/rules');
async function digest(file) {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
}
(async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'filterline-benchmark-'));
    try {
        const input = path.join(directory, 'input.log');
        const output = path.join(directory, 'output.log');
        const mapping = path.join(directory, 'mapping');
        const line = '2026-09-12 ERROR request=1234 subsystem=worker message=' + 'x'.repeat(74) + '\r\n';
        const block = Buffer.from(line.repeat(8192));
        const blocks = Math.ceil((Number(process.env.BENCHMARK_MIB) || 128) * 1024 * 1024 / block.length);
        const file = await open(input, 'wx');
        try { for (let i = 0; i < blocks; i++) await file.writeFile(block); } finally { await file.close(); }
        let peakRss = process.memoryUsage().rss;
        const timer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 20);
        const started = performance.now();
        const result = await startJob({ source: { path: input }, options: { ...defaults, pattern: 'ERROR' }, output, mapping }).result;
        clearInterval(timer);
        const seconds = (performance.now() - started) / 1000;
        assert.equal(result.matched, blocks * 8192);
        assert.equal(result.emitted, blocks * 8192);
        assert.equal((await stat(mapping)).size, result.emitted * 8);
        assert.equal(await digest(input), await digest(output));
        const report = { node: process.version, platform: `${process.platform}/${process.arch}`, inputMiB: (await stat(input)).size / 1024 / 1024,
            lines: result.scanned, seconds: Number(seconds.toFixed(3)), peakProcessRssMiB: Number((peakRss / 1024 / 1024).toFixed(1)),
            outputSha256: await digest(output), verified: true };
        console.log(JSON.stringify(report, null, 2));
    } finally { await rm(directory, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
