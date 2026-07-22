import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePlatformTools } from '../../tooling/scripts/repo/platform-tools.js';
import { recoverInterruptedRuns, taskLogPaths } from '../../tooling/scripts/repo/task-command-records.js';

test('platform executable resolution is portable and has no Windows leakage on POSIX', () => {
    assert.deepEqual(resolvePlatformTools('win32'), { git: 'git.exe', gh: 'gh.exe', pnpm: 'pnpm.cmd' });
    assert.deepEqual(resolvePlatformTools('linux'), { git: 'git', gh: 'gh', pnpm: 'pnpm' });
});

test('interrupted durable commands never become passed after restart recovery', () => {
    const entry = { commandRuns: [{ commandId: 'gate', pid: 42, state: 'running', startedAt: '2026-07-22T00:00:00.000Z' }] };
    recoverInterruptedRuns(entry, () => false);
    assert.equal(entry.commandRuns[0].state, 'interrupted');
    assert.equal(entry.commandRuns[0].exitCode, undefined);
    assert.ok(entry.commandRuns[0].finishedAt);
});

test('durable command logs are disposable task-local files', () => {
    const logs = taskLogPaths(process.cwd(), 'fixture');
    assert.match(logs.stdoutLog.replaceAll('\\', '/'), /\.local\/task-runs\/fixture\.out\.log$/);
    assert.match(logs.stderrLog.replaceAll('\\', '/'), /\.local\/task-runs\/fixture\.err\.log$/);
});
