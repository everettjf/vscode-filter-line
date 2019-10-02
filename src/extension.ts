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

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "filter-line" is now active!');


    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable_filterby = vscode.commands.registerCommand('extension.filterLineBy', async (fileUri) => {
        let path: string | undefined;
        if (typeof fileUri !== 'undefined' && !(fileUri instanceof vscode.Uri)) {
            console.warn('File URI validation failed');
            return;
        }
        path = (fileUri) ? fileUri.fsPath : undefined;

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
        await vscode.commands.executeCommand(filters.filter(val => val.label === choice)[0].command, path);
    });

    let disposable_inputstring = vscode.commands.registerCommand('extension.filterLineByInputString', (path) => {
        let filter = new FilterLineByInputString(context);
        filter.filter(path);
        context.subscriptions.push(filter);
    });

    let disposable_inputregex = vscode.commands.registerCommand('extension.filterLineByInputRegex', (path) => {
        let filter = new FilterLineByInputRegex(context);
        filter.filter(path);
        context.subscriptions.push(filter);
    });

    let disposable_notcontaininputstring = vscode.commands.registerCommand('extension.filterLineByNotContainInputString', (path) => {
        let filter = new FilterLineByInputString(context);
        filter.notcontain = true;
        filter.filter(path);
        context.subscriptions.push(filter);
    });

    let disposable_notmatchinputregex = vscode.commands.registerCommand('extension.filterLineByNotMatchInputRegex', (path) => {
        let filter = new FilterLineByInputRegex(context);
        filter.notmatch = true;
        filter.filter(path);
        context.subscriptions.push(filter);
    });

    let disposable_configfile = vscode.commands.registerCommand('extension.filterLineByConfigFile', (path) => {
        let filter = new FilterLineByConfigFile(context);
        filter.filter(path);
        context.subscriptions.push(filter);
    });

    context.subscriptions.push(disposable_filterby);
    context.subscriptions.push(disposable_inputstring);
    context.subscriptions.push(disposable_inputregex);
    context.subscriptions.push(disposable_notcontaininputstring);
    context.subscriptions.push(disposable_notmatchinputregex);
    context.subscriptions.push(disposable_configfile);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
