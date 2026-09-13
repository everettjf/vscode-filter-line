import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { lines, filterLines, FilterStats } from './lines';
import { configContext, configMatcher, PatternOptions, patternMatcher } from './rules';

export const PREVIEW_TEXT_LIMIT = 256 * 1024;
export type Source = { path: string } | { text: string };
export interface Job {
    source: Source;
    options: PatternOptions;
    config?: unknown;
    preview?: boolean;
    output?: string;
    mapping?: string;
}
export interface Result extends FilterStats {
    preview: { text: string; number: number }[];
    truncated: boolean;
    bytes: number;
    encoding: Encoding;
}
type Encoding = 'utf-8' | 'utf-16le' | 'utf-16be';
export interface Progress extends FilterStats { bytes: number }
export async function runJob(job: Job, report: (progress: Progress) => void = () => {}): Promise<Result> {
    const match = job.config === undefined ? patternMatcher(job.options) : configMatcher(job.config);
    const context = job.config === undefined ? job.options : configContext(job.config);
    const stats: FilterStats = { scanned: 0, matched: 0, emitted: 0 };
    const result: Result = { ...stats, preview: [], truncated: false, bytes: 0, encoding: 'utf-8' };
    let bom: Buffer = Buffer.alloc(0);
    const initial = 'path' in job.source ? await stat(job.source.path) : undefined;
    if (initial && !initial.isFile()) { throw new Error('Choose a regular file'); }
    async function* chunks(): AsyncGenerator<string> {
        if ('text' in job.source) {
            const limit = job.preview ? PREVIEW_TEXT_LIMIT : job.source.text.length;
            result.truncated = job.source.text.length > limit;
            for (let offset = 0; offset < Math.min(limit, job.source.text.length); offset += 64 * 1024) {
                const text = job.source.text.slice(offset, Math.min(offset + 64 * 1024, limit));
                result.bytes += Buffer.byteLength(text);
                yield text;
            }
            return;
        }
        const stream = createReadStream(job.source.path, { highWaterMark: 64 * 1024 });
        let decoder: TextDecoder | undefined;
        try {
            for await (const chunk of stream) {
                let buffer = chunk as Buffer;
                result.bytes += buffer.length;
                if (!decoder) {
                    if ((buffer[0] === 0xff && buffer[1] === 0xfe && buffer[2] === 0 && buffer[3] === 0) ||
                        (buffer[0] === 0 && buffer[1] === 0 && buffer[2] === 0xfe && buffer[3] === 0xff)) {
                        throw new Error('UTF-32 disk input is unsupported. Open the file with the correct encoding in VS Code first.');
                    }
                    if (buffer[0] === 0xff && buffer[1] === 0xfe) { result.encoding = 'utf-16le'; bom = buffer.subarray(0, 2); }
                    else if (buffer[0] === 0xfe && buffer[1] === 0xff) { result.encoding = 'utf-16be'; bom = buffer.subarray(0, 2); }
                    else if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) { bom = buffer.subarray(0, 3); }
                    buffer = buffer.subarray(bom.length);
                    decoder = new TextDecoder(result.encoding, { fatal: true, ignoreBOM: true });
                }
                const decoded = decoder.decode(buffer, { stream: true });
                if (result.encoding === 'utf-8' && decoded.includes('\0')) {
                    throw new Error('NUL bytes detected. Open the file with the correct encoding in VS Code first; BOM-less UTF-16 and binary input are unsupported in disk mode.');
                }
                yield decoded;
                if (job.preview && result.bytes >= 256 * 1024 && result.bytes < (initial?.size ?? 0)) {
                    result.truncated = true;
                    return; // Don't flush a decoder at an intentionally cut byte boundary.
                }
            }
            if (decoder) { yield decoder.decode(); }
        } catch (error) {
            if (error instanceof TypeError) { throw new Error('Invalid text encoding. Open the file with the correct encoding in VS Code, then filter its editor buffer. Disk mode supports UTF-8 and BOM-marked UTF-16.'); }
            throw error;
        } finally { stream.destroy(); }
    }
    let lastReport = 0;
    async function* input() {
        for await (const line of lines(chunks())) {
            if (job.preview && line.number >= 5000) { result.truncated = true; return; }
            if (result.truncated && !line.eol) { return; }
            yield line;
            if (Date.now() - lastReport > 100) { report({ ...stats, bytes: result.bytes }); lastReport = Date.now(); }
        }
    }
    const output = !job.preview && job.output ? await open(job.output, 'wx') : undefined;
    let mapping: Awaited<ReturnType<typeof open>> | undefined;
    const buffers: Buffer[] = [];
    const positions: number[] = [];
    let buffered = 0;
    let wroteBom = false;
    const encode = (text: string) => {
        const buffer = Buffer.from(text, result.encoding === 'utf-8' ? 'utf8' : 'utf16le');
        return result.encoding === 'utf-16be' ? buffer.swap16() : buffer;
    };
    const flush = async () => {
        if (!output) { return; }
        if (!wroteBom) { await output.writeFile(bom); wroteBom = true; }
        if (buffers.length) { await output.writeFile(Buffer.concat(buffers)); }
        if (mapping && positions.length) {
            const bytes = Buffer.alloc(positions.length * 8);
            positions.forEach((number, index) => bytes.writeDoubleLE(number, index * 8));
            await mapping.writeFile(bytes);
        }
        buffers.length = 0; positions.length = 0; buffered = 0;
    };
    try {
        if (output && job.mapping) { mapping = await open(job.mapping, 'wx'); }
        for await (const line of filterLines(input(), match, context.before, context.after, stats)) {
            if (job.preview) {
                if (result.preview.length < 30) { result.preview.push({ text: line.text.slice(0, 300), number: line.number }); }
            } else if (output) {
                const buffer = encode(line.text + line.eol);
                buffers.push(buffer); positions.push(line.number); buffered += buffer.length;
                if (buffered >= 64 * 1024 || positions.length >= 8192) { await flush(); }
            }
            if (Date.now() - lastReport > 100) { report({ ...stats, bytes: result.bytes }); lastReport = Date.now(); }
        }
        await flush();
        if (output) { await output.sync(); }
        if ('path' in job.source && initial) {
            const final = await stat(job.source.path);
            if (initial.size !== final.size || initial.mtimeMs !== final.mtimeMs || initial.ino !== final.ino) {
                throw new Error('Source file changed during filtering. Run the filter again.');
            }
        }
        return { ...result, ...stats };
    } finally {
        await Promise.all([output?.close(), mapping?.close()]);
    }
}
