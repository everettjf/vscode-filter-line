'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {FilterLineByInputString} from './filter_inputstring';
import {FilterLineByInputRegex} from './filter_inputregex';
import {FilterLineByConfigFile} from './filter_configfile';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const logger = vscode.window.createOutputChannel('FilterLine');
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "filter-line" is now active!');


    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    const disposables: Array<vscode.Disposable> = [];
    disposables.push(vscode.commands.registerCommand('extension.filterLineBy', async (fileUri) => {
        if (typeof fileUri !== 'undefined' && !(fileUri instanceof vscode.Uri)) {
            console.warn('File URI validation failed');
            return;
        }

        interface Filters {
            label: string;
            command: string;
        }

        const filters: Array<Filters> = [
            {label: 'Input String', command: 'extension.filterLineByInputString'},
            {label: 'Input Regex', command: 'extension.filterLineByInputRegex'},
            {label: 'Not Contain Input String', command: 'extension.filterLineByNotContainInputString'},
            {label: 'Not Match Input Regex', command: 'extension.filterLineByNotMatchInputRegex'},
            {label: 'Config File', command: 'extension.filterLineByConfigFile'}];

        const choices: vscode.QuickPickItem[] = filters.map(item => Object.create({label: item.label}));
        let choice: string | vscode.QuickPickItem | undefined = await vscode.window.showQuickPick(choices);
        if (choice === undefined) {
            return;
        } else {
            choice = choice.label;
        }
        await vscode.commands.executeCommand(filters.filter(val => val.label === choice)[0].command, fileUri);
    }));

    disposables.push(vscode.commands.registerCommand('extension.filterLineByInputString', (path) => {
        const filter = new FilterLineByInputString(context, logger);
        filter.filter(path);
        context.subscriptions.push(filter);
    }));

    disposables.push(vscode.commands.registerCommand('extension.filterLineByInputRegex', (path) => {
        const filter = new FilterLineByInputRegex(context, logger);
        filter.filter(path);
        context.subscriptions.push(filter);
    }));

    disposables.push(vscode.commands.registerCommand('extension.filterLineByNotContainInputString', (path) => {
        const filter = new FilterLineByInputString(context, logger);
        filter.notcontain = true;
        filter.filter(path);
        context.subscriptions.push(filter);
    }));

    disposables.push(vscode.commands.registerCommand('extension.filterLineByNotMatchInputRegex', (path) => {
        const filter = new FilterLineByInputRegex(context, logger);
        filter.notmatch = true;
        filter.filter(path);
        context.subscriptions.push(filter);
    }));

    disposables.push(vscode.commands.registerCommand('extension.filterLineByConfigFile', (path) => {
        const filter = new FilterLineByConfigFile(context, logger);
        filter.filter(path);
        context.subscriptions.push(filter);
    }));

    context.subscriptions.push(...disposables);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
