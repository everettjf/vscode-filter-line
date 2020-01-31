'use strict';

import { StringDecoder } from 'string_decoder';
import { Transform, Readable, ReadableOptions } from 'stream';
import { TextDocument, Range } from 'vscode';
import fs = require('fs');
import {promisify} from 'util';
import { PathLike } from 'fs';

const renameAsync = promisify(fs.rename);
const unlinkAsync = promisify(fs.unlink);
const statAsync = promisify(fs.stat);

const copyAsync = (path: PathLike, newPath: PathLike, flags?: string) =>
    new Promise((res, rej) => {
        const readStream = fs.createReadStream(path),
            writeStream = fs.createWriteStream(newPath, {flags});

        readStream.on('error', rej);
        writeStream.on('error', rej);
        writeStream.on('finish', res);
        readStream.pipe(writeStream);
    });

const moveAsync = async (path: PathLike, newPath: PathLike, flags?: string) => {
    try {
        await renameAsync(path, newPath);
    } catch (error) {
        if (error.code !== 'EXDEV') { throw new error; }

        await copyAsync(path, newPath, flags);
        await unlinkAsync(path);
    }
};

function padWithBlank(str: string, length: number) {
    if (str.length > length) {
        return str;
    }
    let pad = '';
    for (let i=0; i<length - str.length; i++) {
        pad+=' ';
    }

    return pad + str;
}

function readJsonFile(filePath: string): any | undefined {
    const content: string = fs.readFileSync(filePath, {encoding: 'utf-8'});
    // console.log('content : ' + content);
    if (!content) {
        return undefined;
    }
    try {
        const json = JSON.parse(content);
        return json;
    } catch (e) {
        console.log('json parse error : ' + e);
    }
    return undefined;
}

type NextCallback = (err?: Error | null, chunk?: Buffer | string | any) => any;

class FilterStream extends Transform {

    protected prevData: string | undefined;

    constructor(protected onLine: (line: string) => string | boolean | undefined) {
        super({
            readableObjectMode: true,
            writableObjectMode: true
        });
    }

    _transform(chunk: Buffer | string | any, encoding: string, next: NextCallback): void {

        let str: string | undefined;
        if (chunk instanceof Buffer) {
            const decoder: StringDecoder = new StringDecoder(encoding);
            str = decoder.write(chunk);
        } else if (typeof chunk === 'string') {
            str = chunk;
        }

        if (!str) {
            next(null, chunk);
            return;
        }

        const lines = str.split('\n');

        if (this.prevData) {
            lines[0] = this.prevData.concat(lines[0]);
            this.prevData = undefined;
        }

        for (let i = 0, max = lines.length - 1; i < max; i++) {
            if (this.onLine(lines[i])) {
                this.push(`${lines[i]}\n`);
            }
        }

        if (!str.endsWith('\n')) {
            this.prevData = lines[lines.length - 1];
        }

        next();
    }

    _flush(next: NextCallback): void {
        if (this.prevData) {
            next(null, this.onLine(this.prevData) ? this.prevData : undefined);
        } else {
            next();
        }
    }
}

class TextDocumentReadStream extends Readable {
    protected line = 0;
    readonly chunkSize = 100;

    constructor(protected doc: TextDocument, options: ReadableOptions) {
        super(options);
    }

    _read(): void {
        if (this.doc.isClosed) {
            this.push(null);
            console.log('Source document was closed!');
            return;
        }

        if (this.line >= this.doc.lineCount - 1) {
            this.push(null);
            return;
        }

        const range = this.doc.validateRange(new Range(this.line, 0, this.line + this.chunkSize, 0));
        const data = this.doc.getText(range);
        this.push(data);
        this.line = range.end.line;
    }
}

export {
    renameAsync,
    copyAsync,
    statAsync,
    unlinkAsync,
    moveAsync,
    padWithBlank,
    readJsonFile,
    FilterStream,
    TextDocumentReadStream};
