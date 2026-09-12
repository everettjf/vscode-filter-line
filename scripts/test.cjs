const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
// Explicit paths also work in Windows shells, which do not expand wildcards.
const directory = path.join(__dirname, '..', 'out', 'test', 'unit');
const files = fs.readdirSync(directory).filter(name => name.endsWith('.test.js')).map(name => path.join(directory, name));
if (!files.length) throw new Error('No unit tests found; compile first');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
