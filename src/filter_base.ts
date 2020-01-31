'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import fs = require('fs');
import path = require('path');
import os = require('os');
import {promisify} from 'util';
import stream = require('stream');

const pipeline = promisify(stream.pipeline);
import { FilterStream, TextDocumentReadStream, statAsync, moveAsync, unlinkAsync } from './util';


class Filter {
    protected readonly TAIL = 'filterline';

    constructor(protected fromUri: vscode.Uri,
                protected filterCallback: (line: string) => string | boolean | undefined,
                protected logger: vscode.OutputChannel) {
    }

    public async process(): Promise<vscode.Uri> {
        let ext = path.extname(this.fromUri.path);
        const timestamp = new Date().getTime().toString();
        let outBase = '';
        if (this.fromUri.scheme !== 'file') {
            outBase = this.fromUri.path;
            ext = (ext === '') ? '.txt' : ext;
        } else {
            outBase = this.fromUri.fsPath.split(path.sep).slice(-1)[0].split('.').slice(0, -1).join('.');
        }

        let outPath = `${outBase}.${this.TAIL}-${timestamp}${ext}`;
        outPath = `${os.tmpdir()}${path.sep}${outPath}`;

        await pipeline(
            this.createInputStream(),
            new FilterStream(this.filterCallback),
            fs.createWriteStream(outPath)
        );

        return vscode.Uri.parse(`file:${outPath}`);
    }

    protected createInputStream(): stream.Readable {
        if (this.fromUri.scheme === 'file') {
            const doc = this.findOpenedDoc();
            if (doc !== undefined && doc.isDirty) {
                return new TextDocumentReadStream(doc, {encoding: 'utf-8'});
            }

            return fs.createReadStream(this.fromUri.fsPath, {encoding: 'utf-8'});
        } else {
            const doc = this.findOpenedDoc();

            if (doc === undefined) {
                this.logger.appendLine('Unable to find open document for provided URI');
                throw Error('TextDocument not found');
            }

            return new TextDocumentReadStream(doc, {encoding: 'utf-8'});
        }
    }

    protected findOpenedDoc(): vscode.TextDocument | undefined {
        return vscode.workspace.textDocuments.find(el => el.uri.path === this.fromUri.path);
    }
}

class FilterLineBase {
    protected ctx: vscode.ExtensionContext;
    private history: any;
    protected readonly NEW_PATTERN_CHOICE = 'New pattern...';
    protected readonly LARGE_MODE_THR = (30 * 1024 * 1024);

    constructor(context: vscode.ExtensionContext, protected logger: vscode.OutputChannel) {
        this.ctx = context;
        this.history = this.ctx.globalState.get('history', {});

        this.logger.appendLine(`Temp path: ${os.tmpdir()}`);
    }

    protected getHistory(): any {
        return this.history;
    }

    protected async updateHistory(hist: any) {
        this.history = hist;
        await this.ctx.globalState.update('history', hist);
    }

    protected getHistoryMaxSize(): number {
        return vscode.workspace.getConfiguration('filter-line').get('historySize', 10);
    }

    protected async addToHistory(key: string, newEl: string) {
        if (this.history[key] === undefined) {
            this.logger.appendLine(`History doesn't contain '${key}' field`);
            return;
        }

        if (this.history[key].indexOf(newEl) === -1) {
            const maxSz = this.getHistoryMaxSize();
            if (this.history[key].length >= maxSz) {
                for (let i = this.history[key].length; i > maxSz - 1; i--) {
                    this.history[key].pop();
                }
            }
            this.history[key].unshift(newEl);
            await this.ctx.globalState.update('history', this.history);
        }
    }

    protected async showHistoryPick(key: string): Promise<string> {
        if (this.history[key] === undefined) {
            this.logger.appendLine(`History doesn't contain '${key}' field`);
            return this.NEW_PATTERN_CHOICE;
        }

        let usrChoice: string | undefined = undefined;
        if (this.history[key].length) {
            const picks: Array<string> = [...this.history[key]];
            picks.push(this.NEW_PATTERN_CHOICE);
            usrChoice = await vscode.window.showQuickPick(picks);
        }
        return (usrChoice === undefined) ? this.NEW_PATTERN_CHOICE : usrChoice;
    }

    protected getSaveAfterFilteringFlag(): boolean {
        return vscode.workspace.getConfiguration('filter-line').get('saveAfterFiltering', false);
    }

    protected showInfo(text: string) {
        this.logger.appendLine(text);
        vscode.window.showInformationMessage(text);
    }
    protected showError(text: string) {
        this.logger.appendLine(text);
        vscode.window.showErrorMessage(text);
    }

    protected showWarning(text: string) {
        this.logger.appendLine(text);
        vscode.window.showWarningMessage(text);
    }

    protected getSourceUri(fileUri?: vscode.Uri): vscode.Uri | undefined {
        if (fileUri === undefined) {
            // Filtering was launched from command line
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                this.showError("No file selected or file is too large. For large files, use file's context menu. For more information please visit README");
                return undefined;
            }

            return editor.document.uri;
        } else {
            return fileUri;
        }
    }

    protected async filter_(uri: vscode.Uri) {
        const tmpPath = await (new Filter(uri, (line) => this.matchLine(line), this.logger)).process();

        const fInfo = await statAsync(tmpPath.fsPath);

        const largeModeFlag = fInfo.size > this.LARGE_MODE_THR;
        const saveFlag = this.getSaveAfterFilteringFlag();

        let dstPath = tmpPath;
        let processed = false;

        if (saveFlag) {
            if (uri.scheme !== 'file') {
                this.showWarning("Don't know where to save file. Saved into temporary folder");
            } else {
                const dstBase = tmpPath.fsPath.split(path.sep).slice(-1)[0];
                dstPath = vscode.Uri.parse(uri.fsPath.split(path.sep).slice(0, -1).join(path.sep) + path.sep + dstBase);
                try {
                    await moveAsync(tmpPath.fsPath, dstPath.fsPath);
                } catch (error) {
                    this.showError('Error occurred on save file to origin folder. Saved into temporary folder');
                    dstPath = tmpPath;
                }
            }
        } else {
            if (largeModeFlag) {
                this.showWarning('Filtered content is larger then Visual Studio Code limitations. Saved into temporary folder');
            } else {
                await vscode.commands.executeCommand('workbench.action.files.newUntitledFile');
                const editor = vscode.window.activeTextEditor;

                if (editor === undefined) {
                    throw Error('Text Editor does not open');
                }

                const readStream = fs.createReadStream(tmpPath.fsPath, {encoding: 'utf-8', highWaterMark: 100 * 1024});

                const doc = editor.document;

                try {
                    for await (const chunk of readStream) {
                        const pos = doc.validatePosition(new vscode.Position(doc.lineCount, 0));
                        await editor.edit(async edit => {
                            edit.insert(pos, chunk);
                        });
                    }

                    await unlinkAsync(tmpPath.fsPath);
                    processed = true;
                } catch (e) {
                    if (e.name !== undefined && e.name === 'DISPOSED') {
                        processed = true;
                    }
                }
            }
        }

        if (!processed) {
            const doc = await vscode.workspace.openTextDocument(dstPath);
            await vscode.window.showTextDocument(doc);
        }

        this.showInfo('Filtering completed :)');
    }

    protected matchLine(line: string): string | undefined {
        return undefined;
    }

    protected prepare(callback: (succeed: boolean) => void) {
        callback(true);
    }

    public filter(filePath?: vscode.Uri) {
        const srcUri =this.getSourceUri(filePath);

        if (srcUri === undefined) {
            return;
        }

        this.logger.appendLine('will filter file: ' + srcUri.path);

        this.prepare(async (succeed) => {
            this.logger.appendLine(`Succeed ${succeed}`);
            if (!succeed) {
                return;
            }

            await this.filter_(srcUri);
        });
    }
}

export { FilterLineBase};
