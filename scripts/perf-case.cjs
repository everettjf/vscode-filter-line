const { performance, monitorEventLoopDelay } = require('node:perf_hooks');
const { startJob } = require('../out/core/runner');
const spec = JSON.parse(process.argv[2]);
if (spec.bufferPreviewMiB) {
    spec.source = { text: Buffer.alloc(spec.bufferPreviewMiB * 1048576, 'x').toString('utf8') };
    delete spec.bufferPreviewMiB;
}
const delay = monitorEventLoopDelay({ resolution: 10 });
let peakRss = process.memoryUsage().rss;
const timer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 10);
delay.enable();
const started = performance.now();
const job = startJob(spec);
const deadline = setTimeout(() => job.cancel(), 30000);
job.result.then(result => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    console.log(JSON.stringify({ result, seconds: (performance.now() - started) / 1000,
        peakRssMiB: peakRss / 1048576, mainLoopMaxMs: delay.max / 1e6 }));
}, error => { console.error(error); process.exitCode = 1; }).finally(() => {
    clearInterval(timer); clearTimeout(deadline); delay.disable();
});
