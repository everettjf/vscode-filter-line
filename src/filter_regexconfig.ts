'use strict';
import * as vscode from 'vscode';
import { FilterLineBase}  from './filter_base';
import {padwithblank} from './util';


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


export { FilterLineWithRegexConfig};
