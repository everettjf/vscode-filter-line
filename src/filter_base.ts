'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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

export { FilterLineBase};
