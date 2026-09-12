import * as vscode from 'vscode';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { defaults, PatternOptions, Preset } from './core/rules';
import { Cancelled, startJob } from './core/runner';
import { publishOutput } from './core/files';
import { Result } from './core/job';
import { loadPresets } from './config';
import { HistoryEntry, migrateHistory, updateHistory } from './history';
import { pickPattern } from './preview';
import { captureSource, Snapshot } from './source';
import { Results } from './results';

export interface FilterOutcome { result: Result; document?: vscode.TextDocument; file?: string }
export async function executeFilter(snapshot: Snapshot, options: PatternOptions, results: Results,
    token: vscode.CancellationToken, config?: unknown,
    progress: (message: string) => void = () => {}): Promise<FilterOutcome> {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'filterline-'));
    const output = path.join(directory, 'result');
    const mapping = path.join(directory, 'lines');
    let retained = false;
    try {
        if (token.isCancellationRequested) { throw new Cancelled(); }
        if (snapshot.disk) {
            const current = await stat(snapshot.uri.fsPath);
            if (current.size !== snapshot.disk.size || current.mtimeMs !== snapshot.disk.mtimeMs) {
                throw new Error('The source changed while choosing a filter. Run the filter again.');
            }
        }
        const start = Date.now();
        const job = startJob({ source: snapshot.source, options, config, output, mapping }, update => {
            progress(`${(update.bytes / 1024 / 1024).toFixed(1)} MiB · ${update.scanned.toLocaleString()} lines · ${update.matched.toLocaleString()} matches`);
        });
        const cancel = token.onCancellationRequested(job.cancel);
        let result: Result;
        try { result = await job.result; } finally { cancel.dispose(); }
        if (token.isCancellationRequested) { throw new Cancelled(); }
        const info = await stat(output);
        const limit = vscode.workspace.getConfiguration('filter-line', snapshot.uri).get<number>('maxOpenResultMiB', 8) * 1024 * 1024;
        let document: vscode.TextDocument | undefined;
        let file: string | undefined;
        if (info.size <= limit) {
            document = await results.show(output, mapping, directory, snapshot, result);
            retained = true;
        } else {
            let destination = snapshot.uri.scheme === 'file' ? snapshot.uri.fsPath : undefined;
            if (!destination) {
                const selected = await vscode.window.showSaveDialog({ title: 'Choose a base name for the large filtered result' });
                if (!selected) { throw new Cancelled(); }
                if (selected.scheme !== 'file') { throw new Error('Large results require a local filesystem destination on the extension host.'); }
                destination = selected.fsPath;
            }
            file = await publishOutput(output, destination, () => token.isCancellationRequested);
            results.offerSaved(file, mapping, directory, snapshot);
            retained = true;
        }
        progress(`${result.matched.toLocaleString()} / ${result.scanned.toLocaleString()} matched; ${result.emitted.toLocaleString()} output lines in ${((Date.now() - start) / 1000).toFixed(2)}s`);
        return { result, document, file };
    } finally { if (!retained) { await rm(directory, { recursive: true, force: true }); } }
}

export function activate(context: vscode.ExtensionContext) {
    const results = new Results();
    context.subscriptions.push(results);
    let history = context.globalState.get<HistoryEntry[]>('historyV3') ?? migrateHistory(context.globalState.get('history'));
    let lastOptions: PatternOptions | undefined;
    const guarded = (action: (...args: unknown[]) => Promise<unknown>) => async (...args: unknown[]) => {
        try { return await action(...args); }
        catch (error) {
            if (!(error instanceof Cancelled)) { void vscode.window.showErrorMessage(`Filter Line: ${error instanceof Error ? error.message : String(error)}`); }
            return undefined;
        }
    };
    const register = (name: string, action: (...args: unknown[]) => Promise<unknown>) => {
        context.subscriptions.push(vscode.commands.registerCommand(name, guarded(action)));
    };
    const uri = (value: unknown): vscode.Uri | undefined => {
        if (value === undefined) { return undefined; }
        if (value instanceof vscode.Uri) { return value; }
        if (typeof value === 'string') { return vscode.Uri.file(value); } // Legacy command arguments.
        throw new Error('Expected a file URI');
    };
    const run = async (target: unknown, initial: Partial<PatternOptions>, supplied?: unknown, useConfig = false, saved = false) => {
        const snapshot = await captureSource(uri(target));
        const settings = vscode.workspace.getConfiguration('filter-line', snapshot.uri);
        let options: PatternOptions | undefined = { ...defaults,
            caseSensitive: settings.get('caseSensitive', true), before: settings.get('contextBefore', 0), after: settings.get('contextAfter', 0), ...initial };
        let config: unknown;
        if (useConfig || saved) {
            const presets = saved ? context.globalState.get<Preset[]>('presets', []) : await loadPresets(snapshot.uri);
            if (!presets.length) { throw new Error('No saved presets. Run a filter, then use Save Last Filter as Preset.'); }
            const picked = presets.length === 1 ? presets[0] : (await vscode.window.showQuickPick(presets.map(preset => ({ label: preset.name, preset })), { title: 'Choose filter preset' }))?.preset;
            if (!picked) { return; }
            config = picked.config;
        } else if (supplied !== undefined) {
            if (!supplied || typeof supplied !== 'object') { throw new Error('Expected filter options'); }
            options = { ...options, ...supplied as Partial<PatternOptions> };
        } else { options = await pickPattern(snapshot.source, options, history, snapshot.label, snapshot.baseLine); }
        if (!options) { return; }
        const selected = options;
        const outcome = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Filter Line', cancellable: true },
            async (progress, token) => executeFilter(snapshot, selected, results, token, config, message => progress.report({ message })));
        if (config === undefined) {
            lastOptions = selected;
            history = updateHistory(history, { pattern: selected.pattern, regex: selected.regex }, settings.get('historySize', 10));
            await context.globalState.update('historyV3', history);
        }
        vscode.window.setStatusBarMessage(`Filter Line: ${outcome.result.matched.toLocaleString()} / ${outcome.result.scanned.toLocaleString()} matched · ${outcome.result.emitted.toLocaleString()} output lines`, 10000);
        return outcome;
    };
    register('extension.filterLineByInputString', (target, options) => run(target, {}, options));
    register('extension.filterLineByInputRegex', (target, options) => run(target, { regex: true }, options));
    register('extension.filterLineByNotContainInputString', (target, options) => run(target, { invert: true }, options));
    register('extension.filterLineByNotMatchInputRegex', (target, options) => run(target, { regex: true, invert: true }, options));
    register('extension.filterLineByConfigFile', target => run(target, {}, undefined, true));
    register('filterLine.savedPresets', target => run(target, {}, undefined, false, true));
    register('extension.filterLineBy', async target => {
        const selected = await vscode.window.showQuickPick([
            { label: 'Text / Regex (live preview)', command: 'extension.filterLineByInputString' },
            { label: 'Workspace Configuration', command: 'extension.filterLineByConfigFile' },
            { label: 'Saved Preset', command: 'filterLine.savedPresets' },
        ], { title: 'Filter Line' });
        if (selected) { return vscode.commands.executeCommand(selected.command, target); }
    });
    register('filterLine.chooseFile', async () => {
        const selected = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, title: 'Choose a file to filter' });
        if (selected?.[0]) { return run(selected[0], {}); }
    });
    register('filterLine.goToSource', () => results.jump());
    register('filterLine.clearHistory', async () => {
        history = []; await context.globalState.update('historyV3', []); await context.globalState.update('history', undefined);
        vscode.window.setStatusBarMessage('Filter Line history cleared', 3000);
    });
    register('filterLine.savePreset', async () => {
        if (!lastOptions) { throw new Error('Run a text or regex filter first.'); }
        const presets = context.globalState.get<Preset[]>('presets', []);
        const name = await vscode.window.showInputBox({ title: 'Save Last Filter as Preset', prompt: 'Stored locally across workspaces',
            validateInput: value => !value.trim() ? 'Enter a name' : presets.some(preset => preset.name === value.trim()) ? 'This name already exists' : undefined });
        if (!name) { return; }
        const options = lastOptions;
        presets.push({ name: name.trim(), config: { type: 'combined', regex: options.regex, caseSensitive: options.caseSensitive,
            include: options.invert ? [] : [options.pattern], exclude: options.invert ? [options.pattern] : [], before: options.before, after: options.after } });
        await context.globalState.update('presets', presets);
    });
    // Useful for extension-host tests and other extensions; no UI is mocked here.
    return { captureSource, loadPresets, results, executeFilter };
}
