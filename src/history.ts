export interface HistoryEntry { pattern: string; regex: boolean }
export function updateHistory(history: HistoryEntry[], item: HistoryEntry, limit: number): HistoryEntry[] {
    return [item, ...history.filter(previous => previous.pattern !== item.pattern || previous.regex !== item.regex)]
        .slice(0, Math.max(1, Math.min(50, limit)));
}
export function migrateHistory(value: unknown): HistoryEntry[] {
    if (!value || typeof value !== 'object') { return []; }
    const old = value as Record<string, unknown>;
    return ['inputStr', 'inputRegex'].flatMap(key => Array.isArray(old[key]) ?
        (old[key] as unknown[]).filter((item): item is string => typeof item === 'string').map(pattern => ({ pattern, regex: key === 'inputRegex' })) : []);
}
