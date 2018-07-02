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
        if(!this._config['type']){
            callback(false,'No type in config file ' + this._configPath);
            return;
        }
        this._configType = this._config['type'];
        


        // field: rules <must exist>
        if(!this._config['rules']){
            callback(false,'No rules in config file ' + this._configPath);
            return;
        }

        // field: prefix <optional>
        if(this._config['prefix']){
            try{
                this._config['_prefix_regex'] = new RegExp(this._config['prefix'] + '(.+)');
            }catch(e){
                callback(false,'prefix regex incorrect : ' + this._configPath);
                return;
            }
        }

        // for each rules
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
        console.log('fixed config:');
        console.log(this._config);
    }

}

export {FilterConfig};
