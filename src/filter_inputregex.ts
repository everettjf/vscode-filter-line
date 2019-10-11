'use strict';
import * as vscode from 'vscode';
import {FilterLineBase} from './filter_base';

class FilterLineByInputRegex extends FilterLineBase{
    private _regex?: RegExp;
    private readonly HIST_KEY = 'inputRegex';

    public notmatch: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        super(context);

        let history = this.getHistory();
        if (history[this.HIST_KEY] === undefined) {
            history[this.HIST_KEY] = [];
            this.updateHistory(history);
        }
    }

    protected async prepare(callback : (succeed: boolean)=>void){
        const usrChoice: string = await this.showHistoryPick(this.HIST_KEY);

        const makeRegEx = async (text: string | undefined) => {
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
            await this.addToHistory(this.HIST_KEY, text);
            callback(true);
        };

        if (usrChoice !== this.NEW_PATTERN_CHOISE) {
            makeRegEx(usrChoice);
        } else {
            vscode.window.showInputBox().then(makeRegEx);
        }
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
