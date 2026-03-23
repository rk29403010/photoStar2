import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    buildSpawnInvocation,
    getNpxExecutable,
    getSpawnOptions,
    getTaskkillExecutable,
} from '../../tooling/scripts/repo/process-invocation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('generic spawn options keep shell disabled and hide Windows windows', () => {
    assert.deepEqual(
        getSpawnOptions({ cwd: workspaceRoot, stdio: 'inherit', platform: 'win32' }),
        {
            cwd: workspaceRoot,
            env: process.env,
            stdio: 'inherit',
            detached: false,
            shell: false,
            windowsHide: true,
        },
    );
});

test('Windows direct executables are not cmd-wrapped', () => {
    assert.deepEqual(
        buildSpawnInvocation({
            command: 'git',
            args: ['status', '--short'],
            cwd: workspaceRoot,
            stdio: 'pipe',
            platform: 'win32',
        }),
        {
            command: 'git',
            args: ['status', '--short'],
            options: {
                cwd: workspaceRoot,
                env: process.env,
                stdio: 'pipe',
                detached: false,
                shell: false,
                windowsHide: true,
            },
        },
    );
});

test('Windows cmd launchers are wrapped through cmd.exe', () => {
    assert.deepEqual(
        buildSpawnInvocation({
            command: 'npx.cmd',
            args: ['eslint', '--version'],
            cwd: workspaceRoot,
            stdio: 'inherit',
            platform: 'win32',
        }),
        {
            command: 'cmd.exe',
            args: ['/d', '/s', '/c', 'npx.cmd eslint --version'],
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

test('Windows helper resolves executable names for npx and taskkill', () => {
    assert.equal(getNpxExecutable('win32'), 'npx.cmd');
    assert.equal(getNpxExecutable('linux'), 'npx');
    assert.equal(getTaskkillExecutable('win32'), 'taskkill.exe');
    assert.equal(getTaskkillExecutable('linux'), 'taskkill');
});
