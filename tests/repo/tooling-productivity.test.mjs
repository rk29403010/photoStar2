import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { countSubstantiveLines } from '../../tooling/scripts/repo/complexity-report.js';
import { buildManagedSpawnInvocation, getManagedSpawnOptions, getResumeScript } from '../../tooling/scripts/repo/dev-session.js';

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

test('managed dev session spawn options keep shell disabled by default', () => {
    assert.deepEqual(
        getManagedSpawnOptions({ stdio: 'inherit', platform: 'win32' }),
        {
            cwd: workspaceRoot,
            env: process.env,
            stdio: 'inherit',
            detached: false,
            shell: false,
            windowsHide: true,
        },
    );
    assert.deepEqual(
        getManagedSpawnOptions({ stdio: 'inherit', platform: 'linux' }),
        {
            cwd: workspaceRoot,
            env: process.env,
            stdio: 'inherit',
            detached: false,
            shell: false,
            windowsHide: false,
        },
    );
});

test('managed dev session uses cmd.exe wrapping for Windows command launchers', () => {
    assert.deepEqual(
        buildManagedSpawnInvocation({
            command: 'npm.cmd',
            args: ['run', 'dev:desktop-runtime'],
            stdio: 'ignore',
            detached: true,
            platform: 'win32',
        }),
        {
            command: 'cmd.exe',
            args: ['/d', '/s', '/c', 'npm.cmd run dev:desktop-runtime'],
            options: {
                cwd: workspaceRoot,
                env: process.env,
                stdio: 'ignore',
                detached: true,
                shell: false,
                windowsHide: true,
            },
        },
    );
});

test('managed dev session does not cmd-wrap direct node launches on Windows', () => {
    const command = process.execPath;
    const args = ['node_modules/concurrently/dist/bin/concurrently.js', '--version'];

    assert.deepEqual(
        buildManagedSpawnInvocation({
            command,
            args,
            stdio: 'inherit',
            platform: 'win32',
        }),
        {
            command,
            args,
            options: {
                cwd: workspaceRoot,
                env: process.env,
                stdio: 'inherit',
                detached: false,
                shell: false,
                windowsHide: true,
            },
        },
    );
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
