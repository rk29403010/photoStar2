import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

function readPackageJson() {
    return JSON.parse(readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8'));
}

test('default dev scripts do not pre-kill ports before starting watchers', () => {
    const packageJson = readPackageJson();
    const scripts = packageJson.scripts ?? {};

    assert.equal('predev' in scripts, false);
    assert.equal('predev:desktop-runtime' in scripts, false);
    assert.equal('predev:desktop-runtime:debug' in scripts, false);
    assert.equal(scripts['dev:desktop-runtime'], 'concurrently --names web,core --prefix-colors cyan.bold,magenta.bold "npm run dev:web:desktop" "npm run dev:core"');
    assert.equal(scripts['dev:desktop-runtime:debug'], 'concurrently --names web,core --prefix-colors cyan.bold,magenta.bold "npm run dev:web:debug" "npm run dev:core"');
});

test('manual recovery script keeps the port-kill behavior available on demand', () => {
    const packageJson = readPackageJson();
    const scripts = packageJson.scripts ?? {};

    assert.equal(scripts['dev:kill-ports'], 'node tooling/scripts/repo/kill-ports.js');
});
