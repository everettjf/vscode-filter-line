import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import Ajv from 'ajv';

test('published JSON schema accepts every legacy JSON example and named combined presets', async () => {
    const root = path.resolve(__dirname, '../../..');
    const schema = JSON.parse(await readFile(path.join(root, 'schemas/filterline.schema.json'), 'utf8')) as object;
    const validate = new Ajv({ allErrors: true }).compile(schema);
    for (let index = 0; index < 5; index++) {
        assert.equal(validate(JSON.parse(await readFile(path.join(root, `demo/log${index}json/.vscode/filterline.json`), 'utf8'))), true, JSON.stringify(validate.errors));
    }
    assert.equal(validate({ presets: [{ name: 'Errors', type: 'combined', include: ['error'], exclude: ['ping'], match: 'all', regex: true, before: 2 }] }), true);
    for (const config of [{ rules: 'x' }, { type: 'general', rules: [{}] }, { type: 'combined', before: -1 }, { presets: [{ type: 'combined' }] }, { type: 'typo', rules: [] }]) {
        assert.equal(validate(config), false, JSON.stringify(config));
    }
});
