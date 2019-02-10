'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

class FilterLineBase{

    protected showInfo(text: string){
        console.log(text);
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
        if(doc.isDirty){
            this.showError('Save before filter line');
            return undefined;
        }
        return doc;
    }

    protected filterFile(filePath: string){
        const readline = require('readline');
        const fs = require('fs');
        var path = require('path');

        let inputPath = filePath;

        // special path tail
        let ext = path.extname(inputPath);
        let tail = '.filterline' + ext;

        // overwrite mode ?
        let isOverwriteMode = inputPath.indexOf(tail) !== -1;

        let outputPath = '';
        if (isOverwriteMode) {
            outputPath = inputPath;

            // change input path
            let newInputPath = inputPath + '.last' + ext;
            fs.renameSync(inputPath, newInputPath);
            inputPath = newInputPath;
        } else {
            outputPath = inputPath + tail;

            if(fs.existsSync(outputPath)){
                console.log('output file already exist, force delete when not under overwrite mode');
                fs.unlinkSync(outputPath);
            }
        }

        console.log('overwrite mode: ' + (isOverwriteMode?'on':'off'));
        console.log('input path: ' + inputPath);
        console.log('output path: ' + outputPath);

        // open read file
        const readStream = readline.createInterface({
            input: fs.createReadStream(inputPath)
        });

        // open write file
        let writeStream = fs.createWriteStream(outputPath);
        writeStream.on('open', ()=>{
            // filter line by line
            readStream.on('line', (line: string)=>{
                // console.log('line ', line);
                let fixedline = this.matchLine(line);
                if(fixedline !== undefined){
                    writeStream.write(fixedline + '\n');
                }
            }).on('close',()=>{
                this.showInfo('Filter completed :)');
                vscode.workspace.openTextDocument(outputPath).then((doc: vscode.TextDocument)=>{
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
}

export { FilterLineBase};
