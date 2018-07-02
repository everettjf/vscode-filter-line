'use strict';

function padWithBlank(str:string, length:number){
    if(str.length > length){
        return str;
    }
    let pad:string = '';
    for(let i=0;i<length - str.length;i++){
        pad+=' ';
    }
    
    return pad + str;
}

function readJsonFile(filePath: string): any | undefined{
    var fs = require('fs');
    var content = fs.readFileSync(filePath);
    // console.log('content : ' + content);
    if(!content){
        return undefined;
    }
    try{
        var json = JSON.parse(content);
        return json;
    }catch(e){
        console.log('json parse error : ' + e);
    }
    return undefined;
}

export {padWithBlank, readJsonFile};
