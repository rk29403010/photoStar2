import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(testDirectory, '..', '..');

test('GitHub runs the canonical merge gate with an explicit event base', async () => {
    const workflow = await readFile(path.join(workspaceRoot, '.github', 'workflows', 'quality-gate.yml'), 'utf8');
    assert.match(workflow, /QA_BASE_SHA:.*github\.event\.pull_request\.base\.sha.*github\.event\.before/);
    assert.match(workflow, /run: pnpm run qa:merge/);
    assert.match(workflow, /node-version-file: \.node-version/);
    assert.match(workflow, /apt-get install .*libsecret-1-0/);
    assert.match(workflow, /timeout-minutes: 30/);
});

test('package pins the supported package manager and Node range', async () => {
    const packageJson = JSON.parse(await readFile(path.join(workspaceRoot, 'package.json'), 'utf8'));
    assert.equal(packageJson.packageManager, 'pnpm@11.3.0');
    assert.equal(packageJson.engines.node, '>=22.13.0 <23');
    assert.equal(packageJson.engines.pnpm, '11.3.0');
    assert.equal(packageJson.devDependencies['oxlint-tsgolint'], '0.24.0');
});
