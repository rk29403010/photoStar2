const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const distCoreDir = path.join(repoRoot, 'dist', 'core');

fs.mkdirSync(distCoreDir, { recursive: true });
fs.writeFileSync(
    path.join(distCoreDir, 'package.json'),
    `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
    'utf8'
);
