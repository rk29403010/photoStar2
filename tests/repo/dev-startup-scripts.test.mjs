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
    assert.equal(scripts.dev, 'node tooling/scripts/repo/dev-session.js run dev');
    assert.equal(scripts['dev:desktop-runtime'], 'node tooling/scripts/repo/dev-session.js run dev:desktop-runtime');
    assert.equal(scripts['dev:desktop-runtime:debug'], 'node tooling/scripts/repo/dev-session.js run dev:desktop-runtime:debug');
});

test('manual recovery script keeps the port-kill behavior available on demand', () => {
    const packageJson = readPackageJson();
    const scripts = packageJson.scripts ?? {};

    assert.equal(scripts['dev:kill-ports'], 'node tooling/scripts/repo/kill-ports.js');
    assert.equal(scripts['dev:pause'], 'node tooling/scripts/repo/dev-session.js pause');
    assert.equal(scripts['dev:resume'], 'node tooling/scripts/repo/dev-session.js resume');
});
