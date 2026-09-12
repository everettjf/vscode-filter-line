import { parentPort, workerData } from 'node:worker_threads';
import { Job, runJob } from './core/job';

void runJob(workerData as Job, progress => parentPort?.postMessage({ progress })).then(
    result => parentPort?.postMessage({ result }),
    (error: unknown) => parentPort?.postMessage({ error: error instanceof Error ? error.message : String(error) }),
);
