# filter-line README

Filter line for current opening file by strings/regular expressions.

## Features

1. Filter line by input string.
2. Filter line by input regular expression.
3. Filter line by config file `filterline.json`(or `filterline.eoml`) in corresponding `.vscode` directory.


## Usage

![list](img/commandlist.png)

### Filter line by input string.

1. Open Command Palette (⇧⌘P) and type `FilterLine`, select `Filter Line By Input String` in the list.
2. Type a string and hit `<Enter>`.


### Filter line by input regex.

1. Open Command Palette (⇧⌘P) and type `FilterLine`, select `Filter Line By Input Regex` in the list.
2. Type a regular expression and hit `<Enter>`.


## Config file type

1. There are 2 file type `filterline.json` and `filterline.eoml`. 
2. `eoml` is a simple config file format that created by me(`everettjf`), only for this project(`vscode-filter-line`) at present. For more information, please visit [eoml](https://github.com/everettjf/eoml).

## Config file format type

There are 3 format types. As they are so simple, I will not describe them here. Please visit the demo directly :
1. `stringlist`: String list [json format](demo/log0json/.vscode/filterline.json) [eoml format](demo/log0eoml/.vscode/filterline.eoml)
2. `regexlist`: Regular expressions list [json format](demo/log1json/.vscode/filterline.json) [eoml format](demo/log1eoml/.vscode/filterline.eoml)
3. `general`: This is default if `type` is not specified. [json format](demo/log2json/.vscode/filterline.json) [eoml format](demo/log2eoml/.vscode/filterline.eoml)


## Release Notes

### 1.0.0

Initial release

**Enjoy!**
