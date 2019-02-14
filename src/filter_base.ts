'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { fdatasyncSync } from 'fs';

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
        console.log('will filter file : ' + filePath);

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
            let newInputPath = inputPath + Math.floor(Math.random()*1000) + ext;
            console.log('will rename');
            console.log('from : ' + inputPath);
            console.log('to: ' + newInputPath);
            try{
                if(fs.existsSync(newInputPath)){
                    fs.unlinkSync(newInputPath);
                }
            }catch(e){
                this.showError('unlink error : ' + e);
                return;
            }
            try{
                fs.renameSync(inputPath, newInputPath);
            }catch(e){
                this.showError('rename error : ' + e);
                return;
            }
            console.log('after rename');
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


        // open write file
        let writeStream = fs.createWriteStream(outputPath);
        writeStream.on('open', ()=>{
            console.log('write stream opened');
            
            // open read file
            const readLine = readline.createInterface({
                input: fs.createReadStream(inputPath)
            });
            
            // filter line by line
            readLine.on('line', (line: string)=>{
                // console.log('line ', line);
                let fixedline = this.matchLine(line);
                if(fixedline !== undefined){
                    writeStream.write(fixedline + '\n');
                }
            }).on('close',()=>{
                this.showInfo('Filter completed :)');

                try{
                    if(isOverwriteMode){
                        fs.unlinkSync(inputPath);
                    }
                }catch(e){
                    console.log(e);
                }
                vscode.workspace.openTextDocument(outputPath).then((doc: vscode.TextDocument)=>{
                    vscode.window.showTextDocument(doc);
                });
            });
        }).on('error',(e :Error)=>{
            console.log('can not open write stream : ' + e);
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
                console.log('undefined doc');
                return;
            }

            this.filterFile(doc.fileName);
        });
    }
}

export { FilterLineBase};
