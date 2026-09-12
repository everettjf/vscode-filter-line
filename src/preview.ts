import * as vscode from 'vscode';
import { Job } from './core/job';
import { Cancelled, startJob } from './core/runner';
import { PatternOptions, patternMatcher } from './core/rules';
import { HistoryEntry } from './history';

interface Item extends vscode.QuickPickItem { history?: HistoryEntry; run?: boolean }
export async function pickPattern(source: Job['source'], initial: PatternOptions, history: HistoryEntry[], label: string, baseLine = 0): Promise<PatternOptions | undefined> {
    const pick = vscode.window.createQuickPick<Item>();
    const options = { ...initial };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let job: ReturnType<typeof startJob> | undefined;
    let generation = 0;
    let disposed = false;
    let valid = false;
    const regexButton = { iconPath: new vscode.ThemeIcon('regex'), tooltip: 'Toggle regular expression' };
    const caseButton = { iconPath: new vscode.ThemeIcon('case-sensitive'), tooltip: 'Toggle case sensitivity' };
    const inverseButton = { iconPath: new vscode.ThemeIcon('exclude'), tooltip: 'Toggle inverse match' };
    const contextButton = { iconPath: new vscode.ThemeIcon('list-selection'), tooltip: 'Set context lines before / after' };
    pick.buttons = [regexButton, caseButton, inverseButton, contextButton];
    pick.placeholder = 'Enter a pattern; Enter filters, Esc cancels';
    pick.ignoreFocusOut = true;
    // Results are already filtered by the worker, not by QuickPick fuzzy search.
    pick.matchOnDescription = false;
    pick.matchOnDetail = false;
    const refresh = () => {
        if (disposed) { return; }
        clearTimeout(timer); job?.cancel(); generation++;
        const current = generation;
        options.pattern = pick.value;
        pick.title = `${label} · ${options.regex ? 'Regex' : 'Text'} · ${options.caseSensitive ? 'Case sensitive' : 'Ignore case'} · ${options.invert ? 'Exclude' : 'Keep'} · Context ${options.before}/${options.after}`;
        pick.busy = false;
        valid = false;
        if (!pick.value) {
            pick.items = history.map(entry => ({ label: entry.pattern, description: entry.regex ? 'Regex history' : 'Text history', history: entry, alwaysShow: true }));
            return;
        }
        try { patternMatcher(options); valid = true; }
        catch (error) { pick.items = [{ label: 'Invalid pattern', detail: String(error), alwaysShow: true }]; return; }
        pick.busy = true;
        pick.items = [{ label: 'Run filter', description: 'Preview loading…', alwaysShow: true, run: true }];
        timer = setTimeout(() => {
            job = startJob({ source, options: { ...options }, preview: true });
            void job.result.then(result => {
                if (disposed || current !== generation) { return; }
                pick.busy = false;
                const summary = `${result.matched.toLocaleString()} / ${result.scanned.toLocaleString()} lines match${result.truncated ? ' (sample only)' : ''}`;
                pick.items = [{ label: 'Run filter', description: summary, alwaysShow: true, run: true },
                    { label: 'Preview (first 30 output lines)', kind: vscode.QuickPickItemKind.Separator },
                    ...result.preview.map(line => ({ label: 'Line', description: `${line.number + baseLine + 1}: ${line.text || '(empty line)'}`, alwaysShow: true, run: true }))];
            }, (error: unknown) => {
                if (disposed || current !== generation || error instanceof Cancelled) { return; }
                pick.busy = false;
                pick.items = [{ label: 'Preview unavailable', detail: String(error), alwaysShow: true }];
                valid = false;
            });
        }, 180);
    };
    return new Promise(resolve => {
        const listeners: vscode.Disposable[] = [];
        let suspended = false;
        const finish = (value?: PatternOptions) => {
            if (disposed) { return; }
            disposed = true; clearTimeout(timer); job?.cancel();
            listeners.forEach(listener => listener.dispose()); pick.dispose(); resolve(value);
        };
        listeners.push(pick.onDidChangeValue(refresh), pick.onDidHide(() => { if (!suspended) { finish(); } }),
            pick.onDidAccept(() => {
                const selected = pick.selectedItems[0];
                if (selected?.history) { options.regex = selected.history.regex; pick.value = selected.history.pattern; refresh(); }
                else if (valid && pick.value) { finish({ ...options, pattern: pick.value }); }
            }), pick.onDidTriggerButton(button => {
                if (button === regexButton) { options.regex = !options.regex; }
                if (button === caseButton) { options.caseSensitive = !options.caseSensitive; }
                if (button === inverseButton) { options.invert = !options.invert; }
                if (button === contextButton) {
                    suspended = true;
                    void vscode.window.showInputBox({ title: 'Context lines (before,after)', value: `${options.before},${options.after}`,
                        validateInput: value => /^\d{1,4},\d{1,4}$/.test(value) && value.split(',').every(number => Number(number) <= 1000) ? undefined : 'Enter two integers from 0 to 1000, e.g. 2,3',
                    }).then(value => {
                        if (disposed) { return; }
                        if (value !== undefined) { [options.before, options.after] = value.split(',').map(Number); }
                        suspended = false; pick.show(); refresh();
                    });
                    return;
                }
                refresh();
            }));
        refresh(); pick.show();
    });
}
