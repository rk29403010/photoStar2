import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { countSubstantiveLines } from '../../tooling/scripts/repo/complexity-report.js';
import { getResumeScript } from '../../tooling/scripts/repo/dev-session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('countSubstantiveLines ignores blank and comment-only lines', () => {
    const sourceText = [
        'function example() {',
        '  // comment only',
        '',
        '  const value = 1;',
        '  /* block comment',
        '     still comment */',
        '  return value;',
        '}',
        '',
    ].join('\n');

    const loc = countSubstantiveLines(sourceText);

    assert.equal(loc, 4);
});

test('getResumeScript prefers persisted script and falls back to desktop runtime', () => {
    assert.equal(getResumeScript({ lastScript: 'dev:desktop-runtime:debug' }), 'dev:desktop-runtime:debug');
    assert.equal(getResumeScript(null), 'dev:desktop-runtime');
});

test('package scripts expose faster quality, benchmarking, and dev pause controls', async () => {
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    const packageJson = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(packageJsonPath, 'utf8')));
    const scripts = packageJson.scripts ?? {};

    assert.equal(scripts['quality:changed'], 'npm run lint:fast:changed && npm run complexity:changed');
    assert.equal(scripts['quality:changed:full'], 'npm run lint:fast:changed && npm run lint:changed && npm run complexity:changed');
    assert.equal(scripts['benchmark:quality'], 'node tooling/scripts/repo/benchmark-quality.js');
    assert.equal(scripts['dev:pause'], 'node tooling/scripts/repo/dev-session.js pause');
    assert.equal(scripts['dev:resume'], 'node tooling/scripts/repo/dev-session.js resume');
});
