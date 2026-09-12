import * as vscode from 'vscode';
import { readFile, rm, stat } from 'node:fs/promises';
import { TextDecoder } from 'node:util';
import { originalLine } from './core/files';
import { Snapshot } from './source';
import { Result } from './core/job';

interface Entry { snapshot: Snapshot; mapping: string; directory: string; resultVersion: number }
export class Results implements vscode.Disposable {
    private readonly entries = new Map<string, Entry>();
    private readonly close: vscode.Disposable;
    private readonly pending = new Set<string>();
    private disposed = false;
    constructor() {
        this.close = vscode.workspace.onDidCloseTextDocument(document => {
            const key = document.uri.toString();
            const entry = this.entries.get(key);
            if (entry) { this.entries.delete(key); void rm(entry.directory, { recursive: true, force: true }); }
        });
    }
    async show(output: string, mapping: string, directory: string, snapshot: Snapshot, result: Result): Promise<vscode.TextDocument> {
        const content = new TextDecoder(result.encoding, { fatal: true }).decode(await readFile(output));
        const doc = await vscode.workspace.openTextDocument({ content, language: snapshot.language });
        this.track(doc, mapping, directory, snapshot);
        await vscode.window.showTextDocument(doc, { preview: false });
        return doc;
    }
    track(doc: vscode.TextDocument, mapping: string, directory: string, snapshot: Snapshot): void {
        this.entries.set(doc.uri.toString(), { snapshot, mapping, directory, resultVersion: doc.version });
    }
    offerSaved(file: string, mapping: string, directory: string, snapshot: Snapshot): void {
        this.pending.add(directory);
        void vscode.window.showInformationMessage(`Filtered result saved: ${file}`, 'Open Result').then(async action => {
            let retained = false;
            try {
                if (action && !this.disposed) {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
                    if (this.disposed) { return; }
                    this.track(document, mapping, directory, snapshot);
                    retained = true;
                    await vscode.window.showTextDocument(document, { preview: false });
                }
            } catch (error) {
                void vscode.window.showErrorMessage(`Filter Line: ${String(error)}`);
            } finally {
                this.pending.delete(directory);
                if (!retained) { await rm(directory, { recursive: true, force: true }); }
            }
        });
    }
    async jump(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        const entry = editor && this.entries.get(editor.document.uri.toString());
        if (!editor || !entry) { throw new Error('Run this command in a Filter Line result opened in this session.'); }
        if (editor.document.version !== entry.resultVersion) { throw new Error('The result has been edited. Filter again to refresh source navigation.'); }
        const line = await originalLine(entry.mapping, editor.selection.active.line);
        if (line === undefined) { throw new Error('This line has no source mapping.'); }
        const source = entry.snapshot;
        const current = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === source.uri.toString());
        if (source.version !== undefined && (!current || current.version !== source.version)) {
            throw new Error('The source was edited or closed. Filter again to refresh source navigation.');
        }
        if (source.disk) {
            const info = await stat(source.uri.fsPath);
            if (info.size !== source.disk.size || info.mtimeMs !== source.disk.mtimeMs || current?.isDirty) {
                throw new Error('The source has changed. Filter again to refresh source navigation.');
            }
        }
        const doc = current ?? await vscode.workspace.openTextDocument(source.uri);
        const target = await vscode.window.showTextDocument(doc, { preview: false });
        target.selection = new vscode.Selection(line + source.baseLine, 0, line + source.baseLine, 0);
        target.revealRange(target.selection, vscode.TextEditorRevealType.InCenter);
    }
    dispose(): void {
        this.disposed = true;
        this.close.dispose();
        for (const directory of this.pending) { void rm(directory, { recursive: true, force: true }); }
        this.pending.clear();
        for (const entry of this.entries.values()) { void rm(entry.directory, { recursive: true, force: true }); }
        this.entries.clear();
    }
}
