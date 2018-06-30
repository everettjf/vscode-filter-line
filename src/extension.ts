'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "filter-line" is now active!');


    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable1 = vscode.commands.registerCommand('extension.filterLineWithOneRegex', () => {
        // The code you place here will be executed every time your command is executed
        let filter = new FilterLineWithOneRegex();
        filter.filter();
        context.subscriptions.push(filter);
    });

    let disposable2 = vscode.commands.registerCommand('extension.filterLineWithRegexConfig', () => {
        // The code you place here will be executed every time your command is executed

        let filter = new FilterLineWithRegexConfig();
        filter.filter();
        context.subscriptions.push(filter);
    });

    context.subscriptions.push(disposable1);
    context.subscriptions.push(disposable2);
}

// this method is called when your extension is deactivated
export function deactivate() {
}


class FilterLineBase{

    protected showInfo(text: string){
        vscode.window.showInformationMessage(text);
    }
    protected showError(text: string){
        vscode.window.showErrorMessage(text);
    }

    protected getValidDocument(): vscode.TextDocument | undefined{
        let editor = vscode.window.activeTextEditor;
        if(!editor){
            this.showError('No file selected');
            return undefined;
        }

        let doc = editor.document;
        console.log(doc.languageId);
        if(doc.isDirty){
            this.showError('Save before filter line');
            return undefined;
        }
        return doc;
    }

    protected filterFile(filePath: string){
        // read file
        const readline = require('readline');
        const fs = require('fs');
        var path = require('path');

        const rl = readline.createInterface({
            input: fs.createReadStream(filePath)
        });

        let outputPath = filePath + '.filterline' + path.extname(filePath);
        console.log('output : ' + outputPath);
        if(fs.existsSync(outputPath)){
            console.log('output file already exist, force delete');
            fs.unlinkSync(outputPath);
        }

        // open write file
        let output = fs.createWriteStream(outputPath);
        output.on('open', ()=>{
            // filter line by line
            rl.on('line', (line: string)=>{
                
                // console.log('line ', line);
                let fixedline = this.matchLine(line);
                if(fixedline !== undefined){
                    output.write(fixedline + '\n');
                }

            }).on('close',()=>{
                console.log('finish');
                this.showInfo('complete');
                vscode.workspace.openTextDocument(outputPath).then((doc: vscode.TextDocument)=>{
                    console.log('opened');
                    vscode.window.showTextDocument(doc);
                });
            });
        });
    }

    protected matchLine(line: string): string | undefined{
        return undefined;
    }

    protected prepare(callback : (succeed: boolean)=>void){
    }
    public filter(){
        let doc = this.getValidDocument();
        if(doc === undefined){
            return;
        }
        console.log('file : ' + doc.fileName);

        this.prepare((succeed)=>{
            if(!succeed){
                return;
            }
            if(doc === undefined){
                return;
            }

            this.filterFile(doc.fileName);
        });
    }

    public readJsonFile(filePath: string): object | undefined{
        var fs = require('fs');
        var content = fs.readFileSync(filePath);
        // console.log('content : ' + content);
        if(!content){
            return undefined;
        }
        try{
            var json = JSON.parse(content);
            return json;
        }catch(e){
            console.log('json parse error : ' + e);
        }
        return undefined;
    }
}
class FilterLineWithOneRegex extends FilterLineBase{
    private _regex?: RegExp;

    protected prepare(callback : (succeed: boolean)=>void){
        vscode.window.showInputBox().then(text => {
            if(text === undefined || text === ''){
                console.log('No input');
                callback(false);
                return;
            }
            console.log('input : ' + text);

            this._regex = new RegExp(text);
            callback(true);
        });
    }

    protected matchLine(line: string): string | undefined{
        if(this._regex === undefined){
            return undefined;
        }
        if(line.match(this._regex) !== null){
            return line;
        }
        return undefined;
    }

    dispose(){
    }
}

class FilterLineWithRegexConfig extends FilterLineBase{
    private _config?: any;
    private _flag: string = ""; // flag is global

    protected prepare(callback : (succeed: boolean)=>void){
        var path = require('path');

        let editor = vscode.window.activeTextEditor;
        if(!editor){
            this.showError('No file selected');
            callback(false);
            return;
        }

        let workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if(!workspaceFolder){
            callback(false);
            return;
        }
        let workspacePath = workspaceFolder.uri.fsPath;
        let configPath = path.join(workspacePath,'.vscode','filterline.json');

        console.log('config path : ');
        console.log(configPath);

        this._config = this.readJsonFile(configPath);
        if(!this._config){
            this.showError('Can not read config file in ' + configPath);
            console.log('failed read ' + configPath);
            callback(false);
            return;
        }
        // console.log('config:');
        // console.log(this._config);

        if(!this._config['rules']){
            this.showError('No rules in config file : ' + configPath);
            callback(false);
            return;
        }

        if(this._config['prefix']){
            try{
                this._config['_prefix_regex'] = new RegExp(this._config['prefix'] + '(.+)');
            }catch(e){
                this.showError('prefix regex incorrect : ' + configPath);
                callback(false);
                return;
            }
        }

        for(let rule of this._config['rules']){
            try{
                rule['_src_regex'] = new RegExp(rule['src']);
            }catch(e){
                this.showError('src regex incorrect : ' + rule['src']);
                callback(false);
                return;
            }
            if(rule['until']){
                try{
                    rule['_until_regex'] = new RegExp(rule['until']);
                }catch(e){
                    this.showError('until regex incorrect : ' + rule['until']);
                    callback(false);
                    return;
                }
            }
        }
        console.log('fixed config:');
        console.log(this._config);

        callback(true);
    }

    protected matchLine(line: string): string | undefined{
        if(this._config === undefined){
            return undefined;
        }
        let prefixstring = '';
        let content = line;
        let prefix_regex = this._config['_prefix_regex'];
        console.log('----------------------');
        console.log('prefix regex : ' + prefix_regex);
        console.log('line : ' + line);
        if(prefix_regex){
            let res: any = line.match(prefix_regex);
            console.log('prefix match :' + res);
            console.log('line :' + line);

            // not match prefix , just return (except until)
            if(!res){
                return undefined;
            }
            if(res.length > 1){
                for(let idx = 1; idx < res.length - 1; idx++){
                    prefixstring += res[idx];
                    prefixstring += ' ';
                }
                content = res[res.length - 1];
                content = content.trim();
            }
        }
        console.log('>new line');
        console.log('prefix : ' + prefixstring);
        console.log('content : ' + content);

        for(let rule of this._config['rules']){
            let src_regex: RegExp = rule['_src_regex'];
            let dest: string = rule['dest'];
            let tag: string = rule['tag'];
            let flag: string = rule['flag'];
            // let until_regex: RegExp = rule['_until_regex'];

            // global flag
            if(flag !== undefined){
                this._flag = flag;
            }

            // tag
            if(tag === undefined){
                tag = '';
            }

            // try match
            let result: any = content.match(src_regex);
            if(!result){
                // console.log('result is undefine');
                // console.log('reg = ' + src_regex);
                // console.log('line = ' + content);
                continue;
            }

            let flagstring = this._flag;
            let tagstring = tag;
            let contentstring = '';
            if(dest){
                // dest with part
                contentstring = dest;
                // has group
                if(result.length > 1){
                    for(let part of result){
                        contentstring += ' ';
                        contentstring += part;
                    }
                }
            }else{
                // no dest field, just use content
                contentstring = content;
            }

            flagstring = padwithblank(flagstring,4);
            tagstring = padwithblank(tagstring,4);

            return prefixstring + ' ' + flagstring + ' ' + tagstring + ' ' + contentstring;
        }

        return undefined;
    }

    dispose(){
    }
}


function padwithblank(str:string, length:number){
    if(str.length > length){
        return str;
    }
    let pad:string = '';
    for(let i=0;i<length - str.length;i++){
        pad+=' ';
    }
    
    return pad + str;
}

