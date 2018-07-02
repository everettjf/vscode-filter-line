//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import { EVML} from '../evml';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
// import * as vscode from 'vscode';
// import * as myExtension from '../extension';

// Defines a Mocha test suite to group tests of similar kind together
suite("Extension Tests", function () {

    // Defines a Mocha unit test
    test("Something 1", function() {
        assert.equal(-1, [1, 2, 3].indexOf(5));
        assert.equal(-1, [1, 2, 3].indexOf(0));
    });
    test("split string", function() {
        // console.log(splitString('test:1:2:3:4:5',':'));
        // console.log(splitString('test   :    1:2:3:4:5',':'));
        // console.log(splitString('test:',':'));
        // console.log(splitString('test',':'));

    });
    test("Read fl config", function(done) {
        let fl = new EVML();
        // let filepath = '/Users/qiwei/github/vscode-filter-line/demo/log0txt/.vscode/filterline.txt';
        // let filepath = '/Users/qiwei/github/vscode-filter-line/demo/log1txt/.vscode/filterline.txt';
        let filepath = '/Users/qiwei/github/vscode-filter-line/demo/log2txt/.vscode/filterline.txt';
        fl.parse(filepath,(succeed,errorinfo)=>{
            console.log(succeed);
            console.log(errorinfo);

            console.log('value = ' );
            console.log(fl.getValue());

            done();
        });
    });
});