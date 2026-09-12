/** The legacy Filter Line EOML subset, parsed without asynchronous callbacks or filesystem access. */
export function parseEoml(text: string): unknown {
    const root: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    let lastKey = '';
    let array: unknown[] | undefined;
    let item: Record<string, string> | undefined;
    const flush = () => { if (item && Object.keys(item).length) { array?.push(item); } item = undefined; };
    for (const [index, raw] of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).entries()) {
        const line = raw.trim();
        const error = (message: string): never => { throw new Error(`EOML line ${index + 1}: ${message}`); };
        if (!line || line.startsWith('#')) { continue; }
        if (line === '[') {
            if (array || !lastKey) { error('unexpected array start'); }
            array = []; root[lastKey] = array; continue;
        }
        if (line === ']') { if (!array) { error('unexpected array end'); } flush(); array = undefined; continue; }
        if (line === '-') { if (!array) { error('unexpected item separator'); } flush(); continue; }
        if (array && root.type !== 'general') { array.push(line); continue; }
        const colon = line.indexOf(':');
        if (colon <= 0) { error('expected key:value'); }
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        if (array) {
            item ??= Object.create(null) as Record<string, string>;
            item[key] = value;
        } else { root[key] = value; lastKey = key; }
    }
    if (array) { throw new Error('EOML: missing closing ]'); }
    return root;
}
