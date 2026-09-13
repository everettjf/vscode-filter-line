export interface Line { text: string; eol: string; number: number }

/** Scan each chunk once; join a spanning line only when its terminator arrives. */
export async function* lines(chunks: AsyncIterable<string>, maxLineLength = 16 * 1024 * 1024): AsyncGenerator<Line> {
    const fragments: string[] = [];
    let length = 0;
    let number = 0;
    let pendingCR: string | undefined;
    const checkLength = (extra: number) => {
        if (length + extra > maxLineLength) { throw new Error('A line exceeds the 16 MiB processing limit'); }
    };
    for await (const chunk of chunks) {
        if (!chunk.length) { continue; }
        let start = 0;
        if (pendingCR !== undefined) {
            const crlf = chunk[0] === '\n';
            yield { text: pendingCR, eol: crlf ? '\r\n' : '\r', number: number++ };
            pendingCR = undefined;
            start = crlf ? 1 : 0;
        }
        const terminators = /[\r\n]/g;
        terminators.lastIndex = start;
        let match: RegExpExecArray | null;
        while ((match = terminators.exec(chunk)) !== null) {
            const end = match.index;
            checkLength(end - start);
            const segment = chunk.slice(start, end);
            let text = segment;
            if (fragments.length) {
                fragments.push(segment);
                text = fragments.join('');
                fragments.length = 0;
            }
            length = 0;
            if (chunk[end] === '\r' && end === chunk.length - 1) {
                pendingCR = text;
                start = chunk.length;
                break;
            }
            const crlf = chunk[end] === '\r' && chunk[end + 1] === '\n';
            start = end + (crlf ? 2 : 1);
            yield { text, eol: crlf ? '\r\n' : chunk[end], number: number++ };
            terminators.lastIndex = start;
        }
        if (start < chunk.length) {
            checkLength(chunk.length - start);
            fragments.push(chunk.slice(start));
            length += chunk.length - start;
        }
    }
    if (pendingCR !== undefined) { yield { text: pendingCR, eol: '\r', number }; }
    else if (length) { yield { text: fragments.join(''), eol: '', number }; }
}

export interface FilterStats { scanned: number; matched: number; emitted: number }
export async function* filterLines(source: AsyncIterable<Line>, match: (line: string) => string | undefined,
    before: number, after: number, stats: FilterStats): AsyncGenerator<Line> {
    // Only retain lines that have not been output. Each buffered line is visited at most once.
    const previous: Array<Line | undefined> = new Array(before);
    let head = 0;
    let count = 0;
    let previousBytes = 0;
    let through = -1;
    for await (const line of source) {
        stats.scanned++;
        const text = match(line.text);
        if (text !== undefined) {
            stats.matched++;
            while (count) {
                const prior = previous[head]!;
                previous[head] = undefined;
                head = (head + 1) % before;
                count--;
                stats.emitted++;
                yield prior;
            }
            previousBytes = 0;
            through = line.number + after;
        }
        if (text !== undefined || line.number <= through) {
            stats.emitted++;
            yield { ...line, text: text ?? line.text };
        } else if (before > 0) {
            if (count === before) {
                previousBytes -= previous[head]!.text.length * 2;
                previous[head] = undefined;
                head = (head + 1) % before;
                count--;
            }
            previous[(head + count) % before] = line;
            count++;
            previousBytes += line.text.length * 2;
            if (previousBytes > 32 * 1024 * 1024) { throw new Error('Context exceeds 32 MiB. Reduce the number of context lines.'); }
        }
    }
}
