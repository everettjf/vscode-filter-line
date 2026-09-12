import { copyFile, link, mkdtemp, open, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import * as path from 'node:path';
import { Cancelled } from './runner';

/** Create a new result without ever replacing another file, even under concurrency. */
export async function publishOutput(temporary: string, source: string, cancelled: () => boolean = () => false): Promise<string> {
    if (cancelled()) { throw new Cancelled(); }
    const extension = path.extname(source);
    const base = source + '.filterline';
    const directory = await mkdtemp(path.join(path.dirname(source), '.filterline-'));
    const staged = path.join(directory, 'complete');
    try {
        await copyFile(temporary, staged, constants.COPYFILE_EXCL);
        for (let index = 0; index < 10000; index++) {
            if (cancelled()) { throw new Cancelled(); }
            const destination = `${base}${index ? '.' + index : ''}${extension}`;
            try {
                await link(staged, destination);
                return destination;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') { throw error; }
            }
        }
        throw new Error('Too many existing result files; choose a different destination');
    } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function originalLine(mapping: string, resultLine: number): Promise<number | undefined> {
    if (!Number.isSafeInteger(resultLine) || resultLine < 0) { return undefined; }
    const handle = await open(mapping, 'r');
    try {
        const buffer = Buffer.alloc(8);
        const { bytesRead } = await handle.read(buffer, 0, 8, resultLine * 8);
        return bytesRead === 8 ? buffer.readDoubleLE(0) : undefined;
    } finally { await handle.close(); }
}
