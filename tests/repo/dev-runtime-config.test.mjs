import test from 'node:test';
import assert from 'node:assert/strict';

import {
    classifyRestartImpact,
    resolveDevRuntimePorts,
} from '../../tooling/scripts/repo/dev-runtime-config.js';

test('resolveDevRuntimePorts falls back to default ports', () => {
    const ports = resolveDevRuntimePorts({}, 'C:/Users/robin/Projects/photoStar2');

    assert.deepEqual(ports, {
        webPort: 5173,
        backendPort: 5174,
    });
});

test('resolveDevRuntimePorts accepts explicit per-worktree overrides', () => {
    const ports = resolveDevRuntimePorts({
        VITE_PORT: '6203',
        VITE_BACKEND_PORT: '6204',
    }, 'C:/Users/robin/Projects/photoStar2/.worktrees/feature-a');

    assert.deepEqual(ports, {
        webPort: 6203,
        backendPort: 6204,
    });
});

test('resolveDevRuntimePorts ignores invalid overrides', () => {
    const ports = resolveDevRuntimePorts({
        VITE_PORT: 'invalid',
        VITE_BACKEND_PORT: '70000',
    }, 'C:/Users/robin/Projects/photoStar2');

    assert.deepEqual(ports, {
        webPort: 5173,
        backendPort: 5174,
    });
});

test('resolveDevRuntimePorts auto-offsets ports inside a worktree', () => {
    const ports = resolveDevRuntimePorts({}, 'C:/Users/robin/Projects/photoStar2/.worktrees/feature-a');

    assert.notDeepEqual(ports, {
        webPort: 5173,
        backendPort: 5174,
    });
    assert.equal(ports.backendPort - ports.webPort, 1);
});

test('resolveDevRuntimePorts uses stable offsets for the same worktree name', () => {
    const first = resolveDevRuntimePorts({}, 'C:/Users/robin/Projects/photoStar2/.worktrees/feature-a');
    const second = resolveDevRuntimePorts({}, 'D:/scratch/photoStar2/.worktrees/feature-a');

    assert.deepEqual(first, second);
});

test('resolveDevRuntimePorts uses different offsets for different worktrees', () => {
    const first = resolveDevRuntimePorts({}, 'C:/Users/robin/Projects/photoStar2/.worktrees/feature-a');
    const second = resolveDevRuntimePorts({}, 'C:/Users/robin/Projects/photoStar2/.worktrees/feature-b');

    assert.notDeepEqual(first, second);
});

test('classifyRestartImpact reports hot reload for ui-only edits', () => {
    const impact = classifyRestartImpact(['src/ui/components/DashboardView.tsx']);

    assert.equal(impact.level, 'hmr');
    assert.equal(impact.requiresManualRestart, false);
    assert.match(impact.summary, /Hot reload/i);
});

test('classifyRestartImpact reports automatic backend restart for core edits', () => {
    const impact = classifyRestartImpact(['src/services/handlers/systemCommands.ts']);

    assert.equal(impact.level, 'auto-restart');
    assert.equal(impact.requiresManualRestart, false);
    assert.match(impact.summary, /auto-restart/i);
});

test('classifyRestartImpact reports manual restart for Vite and env changes', () => {
    const impact = classifyRestartImpact([
        'vite.config.ts',
        '.env.desktop-dev',
    ]);

    assert.equal(impact.level, 'manual-restart');
    assert.equal(impact.requiresManualRestart, true);
    assert.match(impact.summary, /Restart the dev runtime/i);
});

test('classifyRestartImpact reports reinstall when dependency metadata changes', () => {
    const impact = classifyRestartImpact(['package-lock.json']);

    assert.equal(impact.level, 'reinstall');
    assert.equal(impact.requiresManualRestart, true);
    assert.match(impact.summary, /Reinstall dependencies/i);
});

test('classifyRestartImpact picks the strongest requirement across mixed edits', () => {
    const impact = classifyRestartImpact([
        'src/ui/App.tsx',
        'src/services/workflowRuntime/orchestrator.ts',
        'deployments/desktop/tauri/tauri.conf.json',
    ]);

    assert.equal(impact.level, 'manual-restart');
    assert.equal(impact.requiresManualRestart, true);
    assert.match(impact.summary, /desktop shell/i);
});
