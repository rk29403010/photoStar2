import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildSmokeRuntimeEnv,
    collectCdpFailures,
    getBrowserCandidates,
    getSmokeFailureReason,
    isSmokeReadyState,
    getChangedPathsSinceBase,
    resolveSmokeBrowser,
    resolveUiSmokeBase,
    shouldRunUiSmoke,
} from '../../tooling/scripts/repo/ui-smoke.js';

test('browser discovery prefers Edge on Windows and Chrome on Linux', () => {
    const windowsCandidates = getBrowserCandidates({
        platform: 'win32',
        env: { 'ProgramFiles(x86)': 'D:\\Program Files (x86)', ProgramFiles: 'D:\\Program Files' },
    });
    assert.match(windowsCandidates[0], /Microsoft\\Edge\\Application\\msedge\.exe$/);

    const linuxCandidates = getBrowserCandidates({ platform: 'linux' });
    assert.equal(linuxCandidates[0], '/usr/bin/google-chrome');
    assert.equal(resolveSmokeBrowser({
        platform: 'win32',
        exists: (candidate) => candidate === windowsCandidates[1],
        env: { 'ProgramFiles(x86)': 'D:\\Program Files (x86)', ProgramFiles: 'D:\\Program Files' },
    }), windowsCandidates[1]);
});

test('browser discovery accepts an explicit smoke browser', () => {
    assert.equal(resolveSmokeBrowser({ env: { UI_SMOKE_BROWSER: 'C:\\tools\\browser.exe' } }), 'C:\\tools\\browser.exe');
});

test('smoke runtime configuration uses isolated ports', () => {
    assert.deepEqual(buildSmokeRuntimeEnv({ env: { KEEP: 'yes' }, webPort: 6201, backendPort: 6202 }), {
        KEEP: 'yes',
        VITE_PORT: '6201',
        VITE_BACKEND_PORT: '6202',
    });
});

test('smoke readiness requires a visible root and an initial UI state', () => {
    const ready = { rootVisible: true, loadingVisible: true, viteOverlayVisible: false, startupFailureVisible: false };
    assert.equal(isSmokeReadyState(ready), true);
    assert.equal(isSmokeReadyState({ ...ready, loadingVisible: false }), false);
    assert.equal(isSmokeReadyState({ ...ready, viteOverlayVisible: true }), false);
    assert.match(getSmokeFailureReason({ ...ready, rootVisible: false }, []), /root was empty/);
});

test('CDP errors are reported as smoke failures', () => {
    const failures = collectCdpFailures([
        { method: 'Runtime.exceptionThrown', params: { exceptionDetails: { text: 'Uncaught', exception: { description: 'ReferenceError: mount failed' } } } },
        { method: 'Runtime.consoleAPICalled', params: { type: 'error', args: [{ value: 'mount failed' }] } },
        { method: 'Log.entryAdded', params: { entry: { level: 'error', text: 'network error' } } },
    ]);
    assert.deepEqual(failures, [
        'Uncaught browser exception: ReferenceError: mount failed',
        'Browser console error: mount failed',
        'Browser log error: network error',
    ]);
});

test('UI smoke selection includes browser and backend runtime surfaces', () => {
    assert.equal(shouldRunUiSmoke(['src/ui/App.tsx']), true);
    assert.equal(shouldRunUiSmoke(['src/services/handlers/assetCommands.ts']), true);
    assert.equal(shouldRunUiSmoke(['docs/ai/change-workflow.md']), false);
    assert.equal(shouldRunUiSmoke(['tooling/scripts/repo/ui-smoke.js']), true);
});

test('UI smoke resolves a supplied base and reads the branch diff', () => {
    assert.equal(resolveUiSmokeBase({ explicitBase: 'abc123' }), 'abc123');
    assert.equal(resolveUiSmokeBase({
        env: {},
        git: (args) => args[0] === 'branch' ? 'feature' : '',
    }), '');
    const calls = [];
    const paths = getChangedPathsSinceBase('origin/main', {
        git: (args) => {
            calls.push(args);
            return 'src/ui/App.tsx\ntests/ui/app.test.cjs';
        },
    });
    assert.deepEqual(paths, ['src/ui/App.tsx', 'tests/ui/app.test.cjs']);
    assert.deepEqual(calls, [['diff', '--name-only', 'origin/main...HEAD']]);
});
