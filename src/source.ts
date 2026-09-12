import * as vscode from 'vscode';
import { stat } from 'node:fs/promises';
import { Source } from './core/job';

export interface Snapshot {
    uri: vscode.Uri;
    source: Source;
    baseLine: number;
    language: string;
    version?: number;
    disk?: { mtimeMs: number; size: number };
    label: string;
}
export async function captureSource(target?: vscode.Uri): Promise<Snapshot> {
    const active = vscode.window.activeTextEditor;
    const uri = target ?? active?.document.uri;
    if (!uri) { throw new Error('Open a text document, or use Filter Line: Choose File.'); }
    const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
    if (document) {
        let range: vscode.Range | undefined;
        if (active?.document === document && !active.selection.isEmpty) {
            const start = active.selection.start.line;
            const end = active.selection.end.character === 0 ? active.selection.end.line : active.selection.end.line + 1;
            range = new vscode.Range(start, 0, Math.min(end, document.lineCount), 0);
        }
        return { uri, source: { text: document.getText(range) }, baseLine: range?.start.line ?? 0,
            language: document.languageId, version: document.version, label: range ? 'Filter selected lines' : 'Filter document' };
    }
    if (uri.scheme === 'file') {
        const info = await stat(uri.fsPath);
        if (!info.isFile()) { throw new Error('Choose a regular file'); }
        return { uri, source: { path: uri.fsPath }, baseLine: 0, language: 'plaintext',
            disk: { mtimeMs: info.mtimeMs, size: info.size }, label: 'Filter file' };
    }
    const info = await vscode.workspace.fs.stat(uri);
    if (info.size > 16 * 1024 * 1024) { throw new Error('Open this virtual file in an editor first. Direct virtual-file filtering is limited to 16 MiB.'); }
    const doc = await vscode.workspace.openTextDocument(uri);
    return { uri, source: { text: doc.getText() }, baseLine: 0, language: doc.languageId, version: doc.version, label: 'Filter document' };
}
