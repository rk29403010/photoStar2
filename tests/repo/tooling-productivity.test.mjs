import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { countSubstantiveLines } from '../../tooling/scripts/repo/complexity-report.js';
import { makeWatchlistRow } from '../../tooling/scripts/repo/boundary-watchlist.js';
import {
    buildManagedSpawnInvocation,
    getManagedScriptConfig,
    getManagedSpawnOptions,
    getResumeScript,
} from '../../tooling/scripts/repo/dev-session.js';

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

test('makeWatchlistRow summarizes near-boundary file risk from file and function metrics', () => {
    const row = makeWatchlistRow({
        file: 'src/ui/components/LibraryView.tsx',
        fileLines: 459,
        functionCount: 4,
        maxFunctionLines: 72,
        maxCyclomatic: 9,
        maxCognitive: 18,
    });

    assert.deepEqual(row, {
        file: 'src/ui/components/LibraryView.tsx',
        fileLines: 459,
        functionCount: 4,
        maxFunctionLines: 72,
        maxCyclomatic: 9,
        maxCognitive: 18,
        triggers: ['fileLines', 'functionLines', 'cyclomatic', 'cognitive'],
        score: 14,
    });
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

test('managed dev session routes web logs through the prefixed watcher wrapper', () => {
    assert.match(
        getManagedScriptConfig('dev:desktop-runtime').args[5],
        /^npm run dev:web:watch:desktop$/,
    );
    assert.match(
        getManagedScriptConfig('dev:desktop-runtime:debug').args[5],
        /^npm run dev:web:watch:debug$/,
    );
});

test('package scripts expose faster quality, benchmarking, and dev pause controls', async () => {
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    const packageJson = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(packageJsonPath, 'utf8')));
    const scripts = packageJson.scripts ?? {};

    assert.equal(scripts['quality:changed'], 'npm run lint:fast:changed && npm run complexity:changed');
    assert.equal(scripts['quality:changed:full'], 'npm run lint:fast:changed && npm run lint:changed && npm run complexity:changed');
    assert.equal(scripts['benchmark:quality'], 'node tooling/scripts/repo/benchmark-quality.js');
    assert.equal(scripts['boundary:watch'], 'node tooling/scripts/repo/boundary-watchlist.js');
    assert.equal(scripts['dev:pause'], 'node tooling/scripts/repo/dev-session.js pause');
    assert.equal(scripts['dev:resume'], 'node tooling/scripts/repo/dev-session.js resume');
    assert.equal(scripts['thread:list'], 'node tooling/scripts/repo/thread-state.js list');
    assert.equal(scripts['thread:status'], 'node tooling/scripts/repo/thread-state.js status');
    assert.equal(scripts['thread:register'], 'node tooling/scripts/repo/thread-state.js register');
    assert.equal(scripts['thread:update'], 'node tooling/scripts/repo/thread-state.js update');
    assert.equal(scripts['thread:close'], 'node tooling/scripts/repo/thread-state.js close');
    assert.equal(scripts['thread:new'], 'node tooling/scripts/repo/thread-bootstrap.js');
    assert.equal(scripts['thread:start-dev'], 'node tooling/scripts/repo/thread-dev-session.js');
});
