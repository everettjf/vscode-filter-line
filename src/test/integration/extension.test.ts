import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { activate, FilterOutcome } from '../../extension';
import { defaults, configMatcher } from '../../core/rules';
import { Results } from '../../results';

type API = ReturnType<typeof activate>;
let api: API;
let directory: string;
const command = 'extension.filterLineByInputString';
async function run(uri: vscode.Uri, pattern: string): Promise<FilterOutcome> {
    const result = await vscode.commands.executeCommand<FilterOutcome>(command, uri, { pattern });
    assert.ok(result?.document, 'command returns the completed result document');
    return result;
}

suite('Filter Line extension host', () => {
    suiteSetup(async () => {
        const extension = vscode.extensions.getExtension<API>('everettjf.filter-line');
        assert.ok(extension);
        api = await extension.activate();
        directory = await mkdtemp(path.join(os.tmpdir(), 'filterline-integration-'));
    });
    teardown(async () => {
        for (const doc of vscode.workspace.textDocuments.filter(document => document.isDirty)) {
            await vscode.window.showTextDocument(doc);
            await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        }
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    });
    suiteTeardown(async () => { await rm(directory, { recursive: true, force: true }); });

    test('legacy and new commands register', async () => {
        const registered = await vscode.commands.getCommands(true);
        for (const name of [command, 'extension.filterLineByInputRegex', 'extension.filterLineByNotContainInputString',
            'extension.filterLineByNotMatchInputRegex', 'extension.filterLineByConfigFile', 'extension.filterLineBy',
            'filterLine.chooseFile', 'filterLine.goToSource', 'filterLine.savePreset', 'filterLine.savedPresets', 'filterLine.clearHistory']) {
            assert.ok(registered.includes(name), name);
        }
    });
    test('untitled buffers filter without saving and navigate to the original line', async () => {
        const doc = await vscode.workspace.openTextDocument({ content: 'drop\nkeep\nlast', language: 'log' });
        await vscode.window.showTextDocument(doc);
        const result = await run(doc.uri, 'keep');
        assert.equal(result.document!.getText(), 'keep\n');
        assert.equal(result.document!.languageId, 'log');
        await api.results.jump();
        assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), doc.uri.toString());
        assert.equal(vscode.window.activeTextEditor?.selection.active.line, 1);
    });
    test('right-click URI uses unsaved buffer rather than old disk content', async () => {
        const file = path.join(directory, 'dirty.log'); await writeFile(file, 'disk');
        const doc = await vscode.workspace.openTextDocument(file);
        const editor = await vscode.window.showTextDocument(doc);
        await editor.edit(edit => edit.replace(new vscode.Range(0, 0, 0, 4), 'buffer'));
        assert.equal(doc.isDirty, true);
        const result = await run(doc.uri, 'buffer');
        assert.equal(result.document!.getText(), 'buffer');
        assert.equal(await readFile(file, 'utf8'), 'disk');
        // Revert the fixture so teardown never presents a save confirmation.
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.revert');
    });
    test('selection uses whole lines, excludes end-at-column-zero line, and maps offsets', async () => {
        const doc = await vscode.workspace.openTextDocument({ content: 'keep outside\nkeep one\nkeep two\nkeep outside' });
        const editor = await vscode.window.showTextDocument(doc);
        editor.selection = new vscode.Selection(1, 2, 3, 0);
        const result = await run(doc.uri, 'keep');
        assert.equal(result.document!.getText(), 'keep one\nkeep two\n');
        assert.equal(result.result.scanned, 2);
        vscode.window.activeTextEditor!.selection = new vscode.Selection(1, 0, 1, 0);
        await api.results.jump();
        assert.equal(vscode.window.activeTextEditor!.selection.active.line, 2);
    });
    test('configuration resolves from the explicit target workspace, not active editor', async () => {
        const folders = vscode.workspace.workspaceFolders!;
        assert.equal(folders.length, 2);
        const a = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folders[0].uri, 'input.log'));
        await vscode.window.showTextDocument(a);
        const target = vscode.Uri.joinPath(folders[1].uri, 'input.log');
        const presets = await api.loadPresets(target);
        assert.equal(configMatcher(presets[0].config)('alpha'), undefined);
        assert.equal(configMatcher(presets[0].config)('beta'), 'beta');
        const result = await vscode.commands.executeCommand<FilterOutcome>('extension.filterLineByConfigFile', target);
        assert.equal(result.document!.getText(), 'beta\n');
    });
    test('navigation rejects edits to results and sources', async () => {
        const doc = await vscode.workspace.openTextDocument({ content: 'keep' });
        await vscode.window.showTextDocument(doc);
        await run(doc.uri, 'keep');
        const resultEditor = vscode.window.activeTextEditor!;
        await resultEditor.edit(edit => edit.insert(new vscode.Position(0, 0), 'changed'));
        await assert.rejects(api.results.jump(), /result has been edited/);
        await vscode.window.showTextDocument(doc);
        const second = await run(doc.uri, 'keep');
        const sourceEditor = await vscode.window.showTextDocument(doc);
        await sourceEditor.edit(edit => edit.insert(new vscode.Position(0, 0), 'changed'));
        await vscode.window.showTextDocument(second.document!);
        await assert.rejects(api.results.jump(), /source was edited/);
    });
    test('cancelled execution removes its temporary files', async () => {
        const before = new Set((await readdir(os.tmpdir())).filter(name => name.startsWith('filterline-')));
        const source = await vscode.workspace.openTextDocument({ content: 'a'.repeat(100) + '!' });
        const snapshot = await api.captureSource(source.uri);
        const token = new vscode.CancellationTokenSource();
        const results = new Results();
        const running = api.executeFilter(snapshot, { ...defaults, regex: true, pattern: '(a+)+$' }, results, token.token);
        const rejected = assert.rejects(running, /Filtering cancelled/);
        setTimeout(() => token.cancel(), 150);
        await rejected;
        results.dispose(); token.dispose();
        const after = (await readdir(os.tmpdir())).filter(name => name.startsWith('filterline-') && !before.has(name));
        assert.deepEqual(after, []);
    });
    test('large results complete without opening or replacing files', async () => {
        const file = path.join(directory, 'large.log');
        const text = 'keep original\r\n'.repeat(75000);
        await writeFile(file, text);
        const snapshot = await api.captureSource(vscode.Uri.file(file));
        const setting = vscode.workspace.getConfiguration('filter-line');
        const previous = setting.inspect<number>('maxOpenResultMiB')?.workspaceValue;
        await setting.update('maxOpenResultMiB', 1, vscode.ConfigurationTarget.Workspace);
        const results = new Results();
        const token = new vscode.CancellationTokenSource();
        try {
            const first = await api.executeFilter(snapshot, { ...defaults, pattern: 'keep' }, results, token.token);
            const second = await api.executeFilter(snapshot, { ...defaults, pattern: 'keep' }, results, token.token);
            assert.ok(first.file); assert.ok(second.file); assert.notEqual(first.file, second.file);
            assert.equal(first.document, undefined);
            assert.equal(await readFile(first.file, 'utf8'), text);
            assert.equal(await readFile(file, 'utf8'), text);
        } finally {
            results.dispose(); token.dispose();
            await setting.update('maxOpenResultMiB', previous, vscode.ConfigurationTarget.Workspace);
        }
    });
    test('failed source reads remove temporary output', async () => {
        const before = new Set((await readdir(os.tmpdir())).filter(name => name.startsWith('filterline-')));
        const results = new Results(); const token = new vscode.CancellationTokenSource();
        try {
            await assert.rejects(api.executeFilter({ uri: vscode.Uri.file(path.join(directory, 'missing')), source: { path: path.join(directory, 'missing') }, baseLine: 0, language: 'plaintext', label: 'test' }, defaults, results, token.token), /ENOENT/);
            assert.deepEqual((await readdir(os.tmpdir())).filter(name => name.startsWith('filterline-') && !before.has(name)), []);
        } finally { results.dispose(); token.dispose(); }
    });
    test('virtual editor buffers work without native filesystem paths', async () => {
        const provider = vscode.workspace.registerTextDocumentContentProvider('filterline-test', { provideTextDocumentContent: () => 'drop\nkeep' });
        try {
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse('filterline-test:/sample'));
            await vscode.window.showTextDocument(doc);
            const result = await run(doc.uri, 'keep');
            assert.equal(result.document!.getText(), 'keep');
        } finally { provider.dispose(); }
    });
});
