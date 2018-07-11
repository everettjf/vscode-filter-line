'use strict';
import { FilterLineBase }  from './filter_base';
import { padWithBlank } from './util';
import { FilterConfigReader } from './config';

class FilterLineByConfigFile extends FilterLineBase{
    private _config?: any;
    private _configType: string = '';

    // general
    private _flag: string = ""; // flag is global
    private _untilRegex?: RegExp; // global , ignore prefix

    protected prepare(callback : (succeed: boolean)=>void){
        let configReader: FilterConfigReader = new FilterConfigReader();
        configReader.read((succeed,errorinfo)=>{
            if(!succeed){
                this.showError(errorinfo);
                callback(false);
                return;
            }

            this._config = configReader.getConfig();
            this._configType = configReader.getConfigType();

            console.log('fixed config:');
            console.log(this._config);

            callback(true);
        });
    }
    protected matchLine(line: string): string | undefined{
        if(this._configType === 'general'){
            return this.matchLineGeneral(line);
        }else if(this._configType === 'stringlist'){
            return this.matchLineStringList(line);
        }else if(this._configType === 'regexlist'){
            return this.matchLineRegexList(line);
        }else if(this._configType === 'stringlist_notcontainany'){
            return this.matchLineStringListNotContainAny(line);
        }else if(this._configType === 'regexlist_notmatchany'){
            return this.matchLineRegexListNotMatchAny(line);
        }
        return undefined;
    }

    protected matchLineStringList(line: string): string | undefined{
        for(let rule of this._config['rules']){
            if(line.indexOf(rule) !== -1){
                return line;
            }
        }
        return undefined;
    }

    protected matchLineStringListNotContainAny(line: string): string | undefined{
        for(let rule of this._config['rules']){
            if(line.indexOf(rule) !== -1){
                // contain 
                return undefined;
            }
        }
        return line;
    }
    protected matchLineRegexList(line: string): string | undefined{
        for(let rule of this._config['rules']){
            let res = line.match(rule);
            if(res){
                return line;
            }
        }
        return undefined;
    }

    protected matchLineRegexListNotMatchAny(line: string): string | undefined{
        for(let rule of this._config['rules']){
            let res = line.match(rule);
            if(res){
                return undefined;
            }
        }
        return line;
    }


    protected matchLineGeneral(line: string): string | undefined{
        if(this._config === undefined){
            return undefined;
        }

        if(this._untilRegex){
            // return the original line until find the match line 
            if(!line.match(this._untilRegex)){
                return line;
            }
            // Ok , got the line
            this._untilRegex = undefined;
            return line;
        }

        let prefixstring = '';
        let content = line;
        let prefix_regex = this._config['_prefix_regex'];
        // console.log('----------------------');
        // console.log('prefix regex : ' + prefix_regex);
        // console.log('line : ' + line);
        if(prefix_regex){
            let res: any = line.match(prefix_regex);
            // console.log('prefix match :' + res);
            // console.log('line :' + line);

            // not match prefix , just return (except until)
            if(!res){
                return undefined;
            }
            if(res.length > 1){
                for(let idx = 1; idx < res.length - 1; idx++){
                    prefixstring += padWithBlank(res[idx],8);
                    prefixstring += ' ';
                }
                content = res[res.length - 1];
                content = content.trim();
            }
        }
        // console.log('>new line');
        // console.log('prefix : ' + prefixstring);
        // console.log('content : ' + content);

        for(let rule of this._config['rules']){
            let src_regex: RegExp = rule['_src_regex'];
            let dest: string = rule['dest'];
            let tag: string = rule['tag'];
            let flag: string = rule['flag'];
            let until_regex: RegExp = rule['_until_regex'];

            // try match
            let result: any = content.match(src_regex);
            if(!result){
                // console.log('result is undefine');
                // console.log('reg = ' + src_regex);
                // console.log('line = ' + content);
                continue;
            }

            // global flag
            if(flag !== undefined){
                this._flag = flag;
            }

            // tag
            if(tag === undefined){
                tag = '';
            }

            // Now, it match , check the until regex
            if(until_regex){
                this._untilRegex = until_regex;
            }

            // Print the content
            let flagstring = this._flag;
            let tagstring = tag;
            let contentstring = '';
            if(dest){
                // dest with part
                contentstring = dest;
                // has group
                if(result.length > 1){
                    for(let idx=0;idx<result.length;idx++){
                        if(idx === 0){
                            continue;
                        }
                        contentstring += ' ';
                        contentstring += result[idx];
                    }
                }
            }else{
                // no dest field, just use content
                contentstring = content;
            }

            flagstring = padWithBlank(flagstring,4);
            tagstring = padWithBlank(tagstring,4);

            return prefixstring + ' ' + flagstring + ' ' + tagstring + ' ' + contentstring;
        }

        return undefined;
    }

    dispose(){
    }
}


export { FilterLineByConfigFile};
