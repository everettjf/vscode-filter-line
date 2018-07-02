'use strict';
// 
// EVerett's Markup Language
// 


class EVML{
    protected _value: any = {};
    protected _isArrayMode: boolean = false;
    protected _currentArrayItem?: any;
    protected _currentArrayKey: string = '';
    protected _lastKey: string = '';

    constructor(){
    }

    public parse(filePath:string, callback: (succeed: boolean, errorinfo: string)=> void){
        const readline = require('readline');
        const fs = require('fs');

        if(!fs.existsSync(filePath)){
            callback(false,'file not exist');
            return;
        }

        const rl = readline.createInterface({
            input: fs.createReadStream(filePath)
        });

        rl.on('line', (line:string)=>{
            // for each trimmed line
            let trimmedline = line.trim();
            if(trimmedline.length === 0){
                return;
            }
            // console.log('line:' + line);

            if(trimmedline === '['){
                // only flag into array mode , and read next line
                this._isArrayMode = true;
                this._currentArrayKey = this._lastKey;
                this._currentArrayItem = {};
                this._value[this._currentArrayKey] = [];
                return;
            }else if(trimmedline === '-'){
                // end current array item , will into next array item
                if(this._currentArrayKey.length > 0 && this._currentArrayItem){
                    this._value[this._currentArrayKey].push(this._currentArrayItem);
                    this._currentArrayItem = {};
                }
                return;
            }else if(trimmedline === ']'){
                // end current array item , will into next array item
                if(this._currentArrayKey.length > 0 && this._currentArrayItem){
                    this._value[this._currentArrayKey].push(this._currentArrayItem);
                    this._currentArrayItem = {};
                }
                // end array mode
                this._currentArrayKey = '';
                this._isArrayMode = false;
                return;
            }

            let parts = evml_split(trimmedline,':');
            if(parts === undefined){
                // no kv, so check if array mode
                // if array node , directly push as string
                if(this._isArrayMode){
                    this._currentArrayItem = undefined;
                    this._value[this._currentArrayKey].push(trimmedline);
                }
                return;
            }
            let k = parts[0].trim();
            let v = parts[1].trim();
            // console.log('k=',k);
            // console.log('v=',v);

            if(this._isArrayMode){
                // array mode : set the cached array item
                this._currentArrayItem[k] = v;
            }else{
                // set the 1st level
                this._value[k] = v;
            }

            this._lastKey = k;
        }).on('close',()=>{
            // console.log('read complete');

            callback(true,'');
        });
    }
    public getValue():any{
        return this._value;
    }
}

function evml_split(str:string, sep:string): [string,string] | undefined{

    let index = str.indexOf(sep);
    // no sep
    if(index === -1){
        return undefined;
    }

    let ret: [string,string] = ['',''];

    ret[0] = str.substr(0,index);
    ret[1] = str.substr(index+sep.length,str.length);

    return ret;
}

export { EVML, evml_split};
