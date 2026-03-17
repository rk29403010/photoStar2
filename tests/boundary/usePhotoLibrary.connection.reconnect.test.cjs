const test = require('node:test');
const assert = require('node:assert/strict');

test('reconnect messaging uses whole seconds and info severity for delays under ten seconds', async () => {
    const { getRetryState } = await import('../../src/boundary/runtime/usePhotoLibrary.connection.retry.ts');

    const retryState = getRetryState(
        { current: { hasCompletedInitialSync: true } },
        400,
        'Lost connection to backend server.',
        'Backend service unavailable',
    );

    assert.equal(retryState.level, 'info');
    assert.equal(retryState.error, null);
    assert.equal(
        retryState.logMessage,
        'Lost connection to backend server. Reconnecting in 1s.',
    );
    assert.equal(retryState.status, 'Backend service unavailable');
});

test('reconnect messaging escalates to warning at ten seconds or above', async () => {
    const { getRetryState } = await import('../../src/boundary/runtime/usePhotoLibrary.connection.retry.ts');

    const retryState = getRetryState(
        { current: { hasCompletedInitialSync: true } },
        10000,
        'Lost connection to backend server.',
        'Backend service unavailable',
    );

    assert.equal(retryState.level, 'warning');
    assert.equal(
        retryState.error,
        'Lost connection to backend server. Reconnecting in 10s...',
    );
    assert.equal(
        retryState.logMessage,
        'Lost connection to backend server. Reconnecting in 10s.',
    );
});
