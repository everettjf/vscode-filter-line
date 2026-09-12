export interface PatternOptions {
    pattern: string;
    regex: boolean;
    caseSensitive: boolean;
    invert: boolean;
    before: number;
    after: number;
}
export const defaults: PatternOptions = {
    pattern: '', regex: false, caseSensitive: true, invert: false, before: 0, after: 0,
};
export type Matcher = (line: string) => string | undefined;
export interface Preset { name: string; config: unknown }

function object(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${field} must be an object`);
    }
    return value as Record<string, unknown>;
}
function string(value: unknown, field: string): string {
    if (typeof value !== 'string') { throw new Error(`${field} must be a string`); }
    return value;
}
function strings(value: unknown, field: string): string[] {
    if (!Array.isArray(value)) { throw new Error(`${field} must be an array`); }
    return value.map((item, index) => string(item, `${field}[${index}]`));
}
function regex(value: string, flags: string, field: string): RegExp {
    try { return new RegExp(value, flags); }
    catch (error) { throw new Error(`${field}: ${error instanceof Error ? error.message : error}`); }
}
export function contextCount(value: unknown, field: string): number {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1000) {
        throw new Error(`${field} must be an integer between 0 and 1000`);
    }
    return value as number;
}
export function patternMatcher(options: PatternOptions): Matcher {
    string(options.pattern, 'pattern');
    for (const key of ['regex', 'caseSensitive', 'invert'] as const) {
        if (typeof options[key] !== 'boolean') { throw new Error(`${key} must be a boolean`); }
    }
    contextCount(options.before, 'before');
    contextCount(options.after, 'after');
    const needle = options.caseSensitive ? options.pattern : options.pattern.toLowerCase();
    const expression = options.regex ? regex(options.pattern, options.caseSensitive ? '' : 'i', 'pattern') : undefined;
    return line => {
        const matches = expression ? expression.test(line) :
            (options.caseSensitive ? line : line.toLowerCase()).includes(needle);
        return matches !== options.invert ? line : undefined;
    };
}
export function configContext(value: unknown): { before: number; after: number } {
    const config = object(value, 'config');
    return { before: contextCount(config.before ?? 0, 'before'), after: contextCount(config.after ?? 0, 'after') };
}
export function readPresets(value: unknown): Preset[] {
    const root = object(value, 'config');
    if (root.presets === undefined) { return [{ name: 'Workspace rules', config: root }]; }
    if (!Array.isArray(root.presets) || root.presets.length === 0) { throw new Error('presets must be a non-empty array'); }
    const names = new Set<string>();
    return root.presets.map((item, index) => {
        const preset = object(item, `presets[${index}]`);
        const name = string(preset.name, `presets[${index}].name`).trim();
        if (!name || names.has(name)) { throw new Error(`presets[${index}].name must be non-empty and unique`); }
        names.add(name);
        // Validate every preset before offering it, including context fields.
        configMatcher(preset);
        configContext(preset);
        return { name, config: preset };
    });
}
export function configMatcher(value: unknown): Matcher {
    const config = object(value, 'config');
    configContext(config);
    const type = config.type ?? 'regexlist'; // Preserve the actual legacy default.
    if (config.caseSensitive !== undefined && typeof config.caseSensitive !== 'boolean') {
        throw new Error('caseSensitive must be a boolean');
    }
    const sensitive = config.caseSensitive !== false;
    const flags = sensitive ? '' : 'i';
    if (type === 'combined') {
        if (config.regex !== undefined && typeof config.regex !== 'boolean') { throw new Error('regex must be a boolean'); }
        if (config.match !== undefined && config.match !== 'any' && config.match !== 'all') { throw new Error('match must be any or all'); }
        const make = (items: unknown, field: string) => strings(items ?? [], field).map(pattern =>
            patternMatcher({ ...defaults, pattern, regex: config.regex === true, caseSensitive: sensitive }));
        const include = make(config.include, 'include');
        const exclude = make(config.exclude, 'exclude');
        return line => {
            const included = include.length === 0 || (config.match === 'all' ?
                include.every(match => match(line) !== undefined) : include.some(match => match(line) !== undefined));
            return included && !exclude.some(match => match(line) !== undefined) ? line : undefined;
        };
    }
    if (type === 'general') {
        if (!Array.isArray(config.rules)) { throw new Error('rules must be an array'); }
        const prefix = config.prefix === undefined ? undefined : regex(string(config.prefix, 'prefix') + '(.+)', flags, 'prefix');
        const rules = config.rules.map((item, index) => {
            const rule = object(item, `rules[${index}]`);
            const optional = (key: string) => rule[key] === undefined ? undefined : string(rule[key], `rules[${index}].${key}`);
            const until = optional('until');
            return {
                src: regex(string(rule.src, `rules[${index}].src`), flags, `rules[${index}].src`),
                dest: optional('dest'), tag: optional('tag'), flag: optional('flag'),
                until: until ? regex(until, flags, `rules[${index}].until`) : undefined,
            };
        });
        let flag = '';
        let until: RegExp | undefined;
        return line => {
            if (until) { if (until.test(line)) { until = undefined; } return line; }
            let prefixText = '';
            let content = line;
            if (prefix) {
                const result = line.match(prefix);
                if (!result) { return undefined; }
                prefixText = result.slice(1, -1).map(part => (part ?? '').padStart(8) + ' ').join('');
                content = result[result.length - 1].trim();
            }
            for (const rule of rules) {
                const result = content.match(rule.src);
                if (!result) { continue; }
                if (rule.flag !== undefined) { flag = rule.flag; }
                until = rule.until;
                const text = rule.dest ? rule.dest + result.slice(1).map(part => ' ' + (part ?? '')).join('') : content;
                return `${prefixText} ${flag.padStart(4)} ${(rule.tag ?? '').padStart(4)} ${text}`;
            }
            return undefined;
        };
    }
    if (!['stringlist', 'regexlist', 'stringlist_notcontainany', 'regexlist_notmatchany'].includes(String(type))) {
        throw new Error(`Unsupported config type: ${String(type)}`);
    }
    const isRegex = String(type).startsWith('regex');
    const inverted = String(type).includes('_not');
    const rules = strings(config.rules, 'rules').map(pattern => patternMatcher({
        ...defaults, pattern, regex: isRegex, caseSensitive: sensitive,
    }));
    return line => rules.some(match => match(line) !== undefined) !== inverted ? line : undefined;
}
