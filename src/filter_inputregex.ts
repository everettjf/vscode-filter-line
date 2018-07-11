'use strict';
import * as vscode from 'vscode';
import {FilterLineBase} from './filter_base';

class FilterLineByInputRegex extends FilterLineBase{
    private _regex?: RegExp;

    public notmatch: boolean = false;

    protected prepare(callback : (succeed: boolean)=>void){
        vscode.window.showInputBox().then(text => {
            if(text === undefined || text === ''){
                // console.log('No input');
                callback(false);
                return;
            }
            // console.log('input : ' + text);
            try{
                this._regex = new RegExp(text);
            }catch(e){
                this.showError('Regex incorrect :' + e);
                callback(false);
                return;
            }
            callback(true);
        });
    }

    protected matchLine(line: string): string | undefined{
        if(this._regex === undefined){
            return undefined;
        }
        if(this.notmatch){
            if(line.match(this._regex) === null){
                return line;
            }
        }else{
            if(line.match(this._regex) !== null){
                return line;
            }
        }
        return undefined;
    }

    dispose(){
    }
}

export { FilterLineByInputRegex};
