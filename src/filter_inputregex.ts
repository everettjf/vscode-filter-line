'use strict';
import * as vscode from 'vscode';
import {FilterLineBase} from './filter_base';

class FilterLineWithInputRegex extends FilterLineBase{
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

export { FilterLineWithInputRegex};
