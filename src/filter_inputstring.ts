'use strict';
import * as vscode from 'vscode';
import { FilterLineBase } from './filter_base';

class FilterLineByInputString extends FilterLineBase{
    private _inputstring?: string;

    public notcontain: boolean = false;

    protected prepare(callback : (succeed: boolean)=>void){
        vscode.window.showInputBox().then(text => {
            if(text === undefined || text === ''){
                console.log('No input');
                callback(false);
                return;
            }
            console.log('input : ' + text);

            this._inputstring = text;
            callback(true);
        });
    }

    protected matchLine(line: string): string | undefined{
        if(this._inputstring === undefined){
            return undefined;
        }
        if(this.notcontain){
            if(line.indexOf(this._inputstring) === -1){
                return line;
            }
        }else{
            if(line.indexOf(this._inputstring) !== -1){
                return line;
            }
        }
        return undefined;
    }

    dispose(){
    }

}

export { FilterLineByInputString};