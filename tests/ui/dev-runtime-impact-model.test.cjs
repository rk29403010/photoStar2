const test = require('node:test');
const assert = require('node:assert/strict');

test('dev runtime impact model maps restart levels to compact indicator tone and label', async () => {
    const { getDevRuntimeImpactIndicator } = await import('../../src/ui/components/app/devRuntimeImpactModel.ts');

    assert.equal(getDevRuntimeImpactIndicator(null), null);
    assert.deepEqual(
        getDevRuntimeImpactIndicator({
            level: 'auto-restart',
            summary: 'Core watch mode should auto-restart the backend after a clean rebuild.',
            requiresManualRestart: false,
            reasons: [],
            files: [],
            webPort: 5905,
            backendPort: 5906,
        }),
        {
            tone: 'info',
            shortLabel: 'Core restart',
            title: 'Core watch mode should auto-restart the backend after a clean rebuild.',
        },
    );

    assert.deepEqual(
        getDevRuntimeImpactIndicator({
            level: 'manual-restart',
            summary: 'Restart the dev runtime to reload config and environment changes.',
            requiresManualRestart: true,
            reasons: [],
            files: [],
            webPort: 5905,
            backendPort: 5906,
        }),
        {
            tone: 'warning',
            shortLabel: 'Restart app',
            title: 'Restart the dev runtime to reload config and environment changes. Stop the current dev session, then start it again.',
        },
    );

    assert.deepEqual(
        getDevRuntimeImpactIndicator({
            level: 'reinstall',
            summary: 'Reinstall dependencies, then restart the dev runtime.',
            requiresManualRestart: true,
            reasons: [],
            files: [],
            webPort: 5905,
            backendPort: 5906,
        }),
        {
            tone: 'error',
            shortLabel: 'Run npm install',
            title: 'Reinstall dependencies, then restart the dev runtime. Stop the current dev session, run npm install, then start it again.',
        },
    );
});
