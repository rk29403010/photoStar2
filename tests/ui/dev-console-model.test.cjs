const test = require('node:test');
const assert = require('node:assert/strict');

test('dev console unread counts split warnings from errors and only mark error tone for errors', async () => {
    const {
        createUnreadConsoleCounts,
        getConsoleToggleTone,
        getNextUnreadConsoleCounts,
    } = await import('../../src/ui/components/devConsoleModel.ts');

    const withWarning = getNextUnreadConsoleCounts(createUnreadConsoleCounts(), 'warn');
    const withError = getNextUnreadConsoleCounts(withWarning, 'error');

    assert.deepEqual(withWarning, { warnings: 1, errors: 0 });
    assert.deepEqual(withError, { warnings: 1, errors: 1 });
    assert.deepEqual(getNextUnreadConsoleCounts(withError, 'log'), withError);
    assert.equal(getConsoleToggleTone(createUnreadConsoleCounts()), 'neutral');
    assert.equal(getConsoleToggleTone(withWarning), 'warning');
    assert.equal(getConsoleToggleTone(withError), 'error');
});
