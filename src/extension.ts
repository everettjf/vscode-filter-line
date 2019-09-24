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
    let disposable_inputstring = vscode.commands.registerCommand('extension.filterLineByInputString', () => {
        let filter = new FilterLineByInputString();
        filter.filter();
        context.subscriptions.push(filter);
    });

    let disposable_inputregex = vscode.commands.registerCommand('extension.filterLineByInputRegex', () => {
        let filter = new FilterLineByInputRegex();
        filter.filter();
        context.subscriptions.push(filter);
    });

    let disposable_notcontaininputstring = vscode.commands.registerCommand('extension.filterLineByNotContainInputString', () => {
        let filter = new FilterLineByInputString();
        filter.notcontain = true;
        filter.filter();
        context.subscriptions.push(filter);
    });

    let disposable_notmatchinputregex = vscode.commands.registerCommand('extension.filterLineByNotMatchInputRegex', () => {
        let filter = new FilterLineByInputRegex();
        filter.notmatch = true;
        filter.filter();
        context.subscriptions.push(filter);
    });

    let disposable_configfile = vscode.commands.registerCommand('extension.filterLineByConfigFile', () => {
        let filter = new FilterLineByConfigFile();
        filter.filter();
        context.subscriptions.push(filter);
    });

    let disposable_inputstring_menu = vscode.commands.registerCommand('extension.filterLineByInputStringMenu', (fileUri) => {
        if (typeof fileUri === 'undefined' || !(fileUri instanceof vscode.Uri)) {
            console.warn('File URI validation failed');
            return;
        }
        let filter = new FilterLineByInputString();
        filter.filter(fileUri.fsPath);
        context.subscriptions.push(filter);
    });

    let disposable_inputregex_menu = vscode.commands.registerCommand('extension.filterLineByInputRegexMenu', (fileUri) => {
        if (typeof fileUri === 'undefined' || !(fileUri instanceof vscode.Uri)) {
            console.warn('File URI validation failed');
            return;
        }
        let filter = new FilterLineByInputRegex();
        filter.filter(fileUri.fsPath);
        context.subscriptions.push(filter);
    });

    let disposable_notcontaininputstring_menu = vscode.commands.registerCommand('extension.filterLineByNotContainInputStringMenu', (fileUri) => {
        if (typeof fileUri === 'undefined' || !(fileUri instanceof vscode.Uri)) {
            console.warn('File URI validation failed');
            return;
        }
        let filter = new FilterLineByInputString();
        filter.notcontain = true;
        filter.filter(fileUri.fsPath);
        context.subscriptions.push(filter);
    });

    let disposable_notmatchinputregex_menu = vscode.commands.registerCommand('extension.filterLineByNotMatchInputRegexMenu', (fileUri) => {
        if (typeof fileUri === 'undefined' || !(fileUri instanceof vscode.Uri)) {
            console.warn('File URI validation failed');
            return;
        }
        let filter = new FilterLineByInputRegex();
        filter.notmatch = true;
        filter.filter(fileUri.fsPath);
        context.subscriptions.push(filter);
    });

    let disposable_configfile_menu = vscode.commands.registerCommand('extension.filterLineByConfigFileMenu', (fileUri) => {
        if (typeof fileUri === 'undefined' || !(fileUri instanceof vscode.Uri)) {
            console.warn('File URI validation failed');
            return;
        }
        let filter = new FilterLineByConfigFile();
        filter.filter(fileUri.fsPath);
        context.subscriptions.push(filter);
    });

    context.subscriptions.push(disposable_inputstring);
    context.subscriptions.push(disposable_inputregex);
    context.subscriptions.push(disposable_notcontaininputstring);
    context.subscriptions.push(disposable_notmatchinputregex);
    context.subscriptions.push(disposable_configfile);
    context.subscriptions.push(disposable_inputstring_menu);
    context.subscriptions.push(disposable_inputregex_menu);
    context.subscriptions.push(disposable_notcontaininputstring_menu);
    context.subscriptions.push(disposable_notmatchinputregex_menu);
    context.subscriptions.push(disposable_configfile_menu);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
