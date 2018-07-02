'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {FilterLineWithInputString} from './filter_inputstring';
import {FilterLineWithInputRegex} from './filter_inputregex';
import {FilterLineWithConfigFile} from './filter_configfile';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "filter-line" is now active!');


    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable_inputstring = vscode.commands.registerCommand('extension.filterLineWithInputString', () => {
        let filter = new FilterLineWithInputString();
        filter.filter();
        context.subscriptions.push(filter);
    });

    let disposable_inputregex = vscode.commands.registerCommand('extension.filterLineWithInputRegex', () => {
        let filter = new FilterLineWithInputRegex();
        filter.filter();
        context.subscriptions.push(filter);
    });

    let disposable_configfile = vscode.commands.registerCommand('extension.filterLineWithConfigFile', () => {
        let filter = new FilterLineWithConfigFile();
        filter.filter();
        context.subscriptions.push(filter);
    });

    context.subscriptions.push(disposable_inputstring);
    context.subscriptions.push(disposable_inputregex);
    context.subscriptions.push(disposable_configfile);
}

// this method is called when your extension is deactivated
export function deactivate() {
}
