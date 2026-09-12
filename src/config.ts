import * as vscode from 'vscode';
import { parseEoml } from './core/eoml';
import { Preset, readPresets, configMatcher } from './core/rules';

export async function loadPresets(target: vscode.Uri): Promise<Preset[]> {
    const folder = vscode.workspace.getWorkspaceFolder(target);
    if (!folder) { throw new Error('The target file must belong to a workspace to load filterline configuration.'); }
    // Preserve legacy precedence.
    for (const name of ['filterline.eoml', 'filterline.txt', 'filterline.json']) {
        const uri = vscode.Uri.joinPath(folder.uri, '.vscode', name);
        let content: Uint8Array;
        try {
            const info = await vscode.workspace.fs.stat(uri);
            if (info.size > 1024 * 1024) { throw new Error(`${name} exceeds the 1 MiB configuration limit`); }
            content = await vscode.workspace.fs.readFile(uri);
        }
        catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') { continue; }
            throw error;
        }
        try {
            const value: unknown = name.endsWith('.json') ? JSON.parse(Buffer.from(content).toString('utf8').replace(/^\uFEFF/, '')) : parseEoml(Buffer.from(content).toString('utf8'));
            const presets = readPresets(value);
            presets.forEach(preset => configMatcher(preset.config));
            return presets;
        } catch (error) { throw new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    throw new Error('No .vscode/filterline.json (or legacy .eoml/.txt) exists in the target workspace.');
}
