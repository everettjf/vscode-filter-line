export interface Line { text: string; eol: string; number: number }

/** Split incrementally, including CRLF across chunks; never invent a final line. */
export async function* lines(chunks: AsyncIterable<string>, maxLineLength = 16 * 1024 * 1024): AsyncGenerator<Line> {
    let pending = '';
    let number = 0;
    for await (const chunk of chunks) {
        pending += chunk;
        let start = 0;
        for (let index = 0; index < pending.length; index++) {
            const char = pending[index];
            if (char !== '\r' && char !== '\n') { continue; }
            if (char === '\r' && index === pending.length - 1) { break; }
            const end = index;
            if (char === '\r' && pending[index + 1] === '\n') { index++; }
            if (end - start > maxLineLength) { throw new Error('A line exceeds the 16 MiB processing limit'); }
            yield { text: pending.slice(start, end), eol: pending.slice(end, index + 1), number: number++ };
            start = index + 1;
        }
        pending = pending.slice(start);
        if (pending.length - (pending.endsWith('\r') ? 1 : 0) > maxLineLength) { throw new Error('A line exceeds the 16 MiB processing limit'); }
    }
    if (pending) {
        const cr = pending.endsWith('\r');
        yield { text: cr ? pending.slice(0, -1) : pending, eol: cr ? '\r' : '', number };
    }
}

export interface FilterStats { scanned: number; matched: number; emitted: number }
export async function* filterLines(source: AsyncIterable<Line>, match: (line: string) => string | undefined,
    before: number, after: number, stats: FilterStats): AsyncGenerator<Line> {
    const previous: Line[] = [];
    let previousBytes = 0;
    let through = -1;
    let lastEmitted = -1;
    for await (const line of source) {
        stats.scanned++;
        const text = match(line.text);
        if (text !== undefined) {
            stats.matched++;
            for (const prior of previous) {
                if (prior.number > lastEmitted) { stats.emitted++; yield prior; lastEmitted = prior.number; }
            }
            through = line.number + after;
        }
        if (text !== undefined || line.number <= through) {
            stats.emitted++;
            yield { ...line, text: text ?? line.text };
            lastEmitted = line.number;
        }
        if (before > 0) {
            previous.push(line);
            previousBytes += line.text.length * 2;
            if (previous.length > before) { previousBytes -= previous.shift()!.text.length * 2; }
            if (previousBytes > 32 * 1024 * 1024) { throw new Error('Context exceeds 32 MiB. Reduce the number of context lines.'); }
        }
    }
}
