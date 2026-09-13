import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import { Job, Progress, Result, PREVIEW_TEXT_LIMIT } from './job';

export class Cancelled extends Error { constructor() { super('Filtering cancelled'); } }
export function startJob(job: Job, report: (progress: Progress) => void = () => {}): { result: Promise<Result>; cancel: () => void } {
    // Preserve one extra character so the worker can still label the sample truncated.
    // Bound the structured clone too, not just the work done after it reaches the worker.
    const workerData = job.preview && 'text' in job.source
        ? { ...job, source: { text: job.source.text.slice(0, PREVIEW_TEXT_LIMIT + 1) } }
        : job;
    const worker = new Worker(path.join(__dirname, '..', 'worker.js'), { workerData, resourceLimits: { maxOldGenerationSizeMb: 256 } });
    let cancel = () => {};
    const result = new Promise<Result>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error, value?: Result) => {
            if (settled) { return; }
            settled = true;
            // Resolve only after handles are closed, so callers can remove temporary output on Windows too.
            void worker.terminate().then(() => { if (error) { reject(error); } else { resolve(value!); } }, reject);
        };
        cancel = () => finish(new Cancelled());
        worker.on('message', (message: { result?: Result; progress?: Progress; error?: string }) => {
            if (message.error) { finish(new Error(message.error)); }
            else if (message.result) { finish(undefined, message.result); }
            else if (message.progress) { report(message.progress); }
        });
        worker.on('error', error => finish(error));
        worker.on('exit', code => { if (!settled) { finish(new Error(`Filter worker exited unexpectedly (${code})`)); } });
    });
    return { result, cancel: () => cancel() };
}
