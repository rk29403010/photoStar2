import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { countSubstantiveLines } from '../../tooling/scripts/repo/complexity-report.js';
import { makeWatchlistRow } from '../../tooling/scripts/repo/boundary-watchlist.js';
import {
    buildLegacyManagedProcessCleanupInvocation,
    buildManagedPortCleanupInvocation,
    buildManagedResumeInvocation,
    buildManagedSpawnInvocation,
    createManagedDevEnv,
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

test('managed dev session env injects resolved per-worktree ports', () => {
    const managedEnv = createManagedDevEnv(
        {},
        path.join(workspaceRoot, '.worktrees', 'investigate-library-people-pause-states'),
    );

    assert.match(managedEnv.VITE_PORT, /^\d+$/);
    assert.match(managedEnv.VITE_BACKEND_PORT, /^\d+$/);
    assert.notEqual(managedEnv.VITE_PORT, '5173');
    assert.notEqual(managedEnv.VITE_BACKEND_PORT, '5174');
});

test('managed dev session cleanup targets the resolved runtime ports on Windows', () => {
    const env = createManagedDevEnv({}, workspaceRoot);

    assert.deepEqual(
        buildManagedPortCleanupInvocation({
            env,
            cwd: workspaceRoot,
            platform: 'win32',
        }),
        {
            command: 'powershell.exe',
            args: [
                '-NoProfile',
                '-Command',
                `$pids=(Get-NetTCPConnection -LocalPort ${env.VITE_PORT},${env.VITE_BACKEND_PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if ($pids) { Stop-Process -Id $pids -Force -ErrorAction SilentlyContinue }`,
            ],
        },
    );
});

test('managed dev session cleanup targets legacy npm wrapper processes on Windows', () => {
    const workspacePattern = workspaceRoot.replace(/\//g, '\\');

    assert.deepEqual(
        buildLegacyManagedProcessCleanupInvocation({
            cwd: workspaceRoot,
            platform: 'win32',
        }),
        {
            command: 'powershell.exe',
            args: [
                '-NoProfile',
                '-Command',
                `$pids=(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ($_.CommandLine -like '*${workspacePattern}*concurrently.js*') -or ($_.CommandLine -like '*npm-cli.js*run dev:core*') -or ($_.CommandLine -like '*npm-cli.js*run dev:web:watch*') -or ($_.CommandLine -like '*pnpm*run dev:core*') -or ($_.CommandLine -like '*pnpm*run dev:web:watch*') } | Select-Object -ExpandProperty ProcessId -Unique); if ($pids) { Stop-Process -Id $pids -Force -ErrorAction SilentlyContinue }`,
            ],
        },
    );
});

test('managed dev session uses cmd.exe wrapping for Windows command launchers', () => {
    const env = createManagedDevEnv({}, workspaceRoot);

    assert.deepEqual(
        buildManagedSpawnInvocation({
            command: 'npx.cmd',
            args: ['pnpm', 'run', 'dev:desktop-runtime'],
            stdio: 'ignore',
            detached: true,
            env,
            platform: 'win32',
        }),
        {
            command: 'cmd.exe',
            args: ['/d', '/s', '/c', 'npx.cmd pnpm run dev:desktop-runtime'],
            options: {
                cwd: workspaceRoot,
                env,
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
    const env = createManagedDevEnv({}, workspaceRoot);

    assert.deepEqual(
        buildManagedSpawnInvocation({
            command,
            args,
            stdio: 'inherit',
            env,
            platform: 'win32',
        }),
        {
            command,
            args,
            options: {
                cwd: workspaceRoot,
                env,
                stdio: 'inherit',
                detached: false,
                shell: false,
                windowsHide: true,
            },
        },
    );
});

test('managed dev session background resume launches the long-lived script directly', () => {
    const env = createManagedDevEnv({}, workspaceRoot);

    assert.deepEqual(
        buildManagedResumeInvocation({
            scriptName: 'dev:desktop-runtime',
            env,
            cwd: workspaceRoot,
            platform: 'win32',
        }),
        {
            command: process.execPath,
            args: getManagedScriptConfig('dev:desktop-runtime').args,
            options: {
                cwd: workspaceRoot,
                env,
                stdio: 'ignore',
                detached: true,
                shell: false,
                windowsHide: true,
            },
        },
    );
});

test('managed dev session routes web logs through the prefixed watcher wrapper', () => {
    assert.match(
        getManagedScriptConfig('dev:desktop-runtime').args[0],
        /managed-dev-runtime\.js$/,
    );
    assert.deepEqual(getManagedScriptConfig('dev:desktop-runtime').args.slice(1), ['--profile', 'desktop']);
    assert.deepEqual(getManagedScriptConfig('dev:desktop-runtime:debug').args.slice(1), ['--profile', 'debug']);
});

test('package scripts expose faster quality, benchmarking, and dev pause controls', async () => {
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    const packageJson = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(packageJsonPath, 'utf8')));
    const scripts = packageJson.scripts ?? {};

    assert.equal(scripts['quality:changed'], 'pnpm run lint:fast:changed && pnpm run complexity:changed');
    assert.equal(scripts['quality:changed:full'], 'pnpm run lint:fast:changed && pnpm run lint:changed && pnpm run complexity:changed');
    assert.match(scripts.quality, /pnpm run test:repo/);
    assert.match(scripts.quality, /pnpm run test:ui/);
    assert.equal(scripts.test, 'pnpm run test:repo');
    assert.equal(scripts['test:repo'], 'node --test tests/repo/*.test.mjs');
    assert.equal(scripts['test:ui'], 'node --test tests/ui/*.test.cjs');
    assert.equal(scripts['test:core'], 'pnpm run build:core:ts && node --test tests/core/*.test.cjs');
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
    assert.equal(scripts['thread:stop-dev'], 'node tooling/scripts/repo/thread-dev-session.js stop');
    assert.equal(scripts['thread:doctor'], 'node tooling/scripts/repo/thread-doctor.js');
    assert.equal(scripts['thread:ship'], 'node tooling/scripts/repo/thread-ship.js');
    assert.equal(scripts['lint:md'], 'markdownlint "**/*.md" --ignore node_modules --ignore deployments/desktop/tauri/target --ignore artifacts');
    assert.equal(scripts['fix:md'], 'markdownlint "**/*.md" --fix --ignore node_modules --ignore deployments/desktop/tauri/target --ignore artifacts');
});
