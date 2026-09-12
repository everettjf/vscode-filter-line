const fs = require('node:fs');
const path = require('node:path');
fs.rmSync(path.join(__dirname, '..', 'out'), { recursive: true, force: true });
