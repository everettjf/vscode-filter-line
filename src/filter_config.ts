'use strict';
import * as vscode from 'vscode';
import {EVML} from './evml';
import {readJsonFile} from './util';

class FilterConfig{
    private _config?: any;
    private _configPath: string = '';
    private _configType: string = '';

    protected read(callback : (succeed: boolean, errorinfo: string)=>void){
        var path = require('path');
        var fs = require('fs');

        let editor = vscode.window.activeTextEditor;
        if(!editor){
            callback(false, 'No file selected');
            return;
        }

        let workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if(!workspaceFolder){
            callback(false, 'Can not locate workspace folder for current file');
            return;
        }
        let workspacePath = workspaceFolder.uri.fsPath;
        let evmlConfigPath = path.join(workspacePath,'.vscode','filterline.evml');
        let txtConfigPath = path.join(workspacePath,'.vscode','filterline.txt');
        let jsonConfigPath = path.join(workspacePath,'.vscode','filterline.json');

        if(fs.existsSync(evmlConfigPath)){
            this._configPath = evmlConfigPath;
        }else if(fs.existsSync(txtConfigPath)){
            this._configPath = txtConfigPath;
        }else{
            this._configPath = jsonConfigPath;
        }

        console.log('config path : ' + this._configPath);
        
        let ext = path.extname(this._configPath);
        if(ext === '.json'){
            // json
            this._config = readJsonFile(this._configPath);
            if(!this._config){
                callback(false,'failed parse json file ' + this._configPath);
                return;
            }

            this.precompileConfig((succeed,errorinfo)=>{
                callback(succeed,errorinfo);
            });
        }else{
            // evml or txt
            let parser = new EVML();
            parser.parse(this._configPath, (succeed,errorinfo)=>{
                if(!succeed){
                    callback(false,'parse file failed : ' + errorinfo);
                    return;
                }

                this.precompileConfig((succeed,errorinfo)=>{
                    callback(succeed,errorinfo);
                });
            });
        }
    }

    precompileConfig(callback:(succeed:boolean, errorinfo:string)=>void){
        // field: type <must exist>
        this._configType = this._config['type'];
        if(this._configType){
            let supportedTypes = [
                'stringlist',
                'regexlist',
                'general',
            ];
            if(supportedTypes.indexOf(this._configType) === -1){
                callback(false,'supported type is stringlist/regexlist/general, regexlist is default if not specified');
                return;
            }
        }else{
            // default
            this._configType = 'regexlist';
            console.log('No config type specified, default to regexlist');
        }

        // field: rules <must exist>
        if(!this._config['rules']){
            callback(false,'No rules in config file ' + this._configPath);
            return;
        }

        if(this._configType === 'stringlist'){
            this.precompileAsStringList(callback);
        }else if(this._configType === 'regexlist'){
            this.precompileAsRegexList(callback);
        }else if(this._configType === 'general'){
            this.precompileAsGeneral(callback);
        }else{
            console.log('Will not go here');
        }

        console.log('precompiled config:');
        console.log(this._config);
    }

    precompileAsStringList(callback:(succeed:boolean, errorinfo:string)=>void){
        // all rule must be string type
        for(let rule of this._config['rules']){
            console.log('rule type ' + rule);

            if(typeof rule !== 'string'){
                callback(false,'Not all rule is string type');
                return;
            }
        }

        callback(true,'');
    }
    precompileAsRegexList(callback:(succeed:boolean, errorinfo:string)=>void){
        // all rule must be string type
        for(let rule of this._config['rules']){
            console.log('rule type ' + rule);

            if(typeof rule !== 'string'){
                callback(false,'Not all rule is string type');
                return;
            }
        }

        /* translate string type rule into 
        {
            'src':'value in the rule',
            '_src_regex' : <precompiled regex>
        }
        */
       let newRules = [];
        for(let rule of this._config['rules']){
            let newRule: any = {
                'src' : rule,
            };
            try{
                newRule['_src_regex'] = new RegExp(rule);
            }catch(e){
                callback(false, 'rule regex incorrect : ' + rule);
                return;
            }

            newRules.push(newRule);
        }
        // override the rules in config
        this._config['rules'] = newRules;

        callback(true,'');
    }

    precompileAsGeneral(callback:(succeed:boolean, errorinfo:string)=>void){
        // field: prefix <optional>
        if(this._config['prefix']){
            try{
                this._config['_prefix_regex'] = new RegExp(this._config['prefix'] + '(.+)');
            }catch(e){
                callback(false,'prefix regex incorrect : ' + this._configPath);
                return;
            }
        }

        // for each object in rules
        for(let rule of this._config['rules']){
            try{
                rule['_src_regex'] = new RegExp(rule['src']);
            }catch(e){
                callback(false, 'src regex incorrect : ' + rule['src']);
                return;
            }
            if(rule['until']){
                try{
                    rule['_until_regex'] = new RegExp(rule['until']);
                }catch(e){
                    callback(false,'until regex incorrect : ' + rule['until'] );
                    return;
                }
            }
        }
    }
}

export {FilterConfig};
