'use strict';

function padwithblank(str:string, length:number){
    if(str.length > length){
        return str;
    }
    let pad:string = '';
    for(let i=0;i<length - str.length;i++){
        pad+=' ';
    }
    
    return pad + str;
}

export {padwithblank};
