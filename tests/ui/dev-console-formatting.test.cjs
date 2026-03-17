const test = require('node:test');
const assert = require('node:assert/strict');

test('dev console strips PhotoStar timeline prefix from displayed messages', async () => {
    const { normalizeConsoleMessage } = await import('../../src/ui/components/devConsoleModel.ts');

    assert.equal(
        normalizeConsoleMessage('[PhotoStar timeline +648ms] Lost connection to backend server.'),
        'Lost connection to backend server.',
    );
    assert.equal(
        normalizeConsoleMessage('[PhotoStar timeline +745132ms] Initial sync complete.'),
        'Initial sync complete.',
    );
    assert.equal(
        normalizeConsoleMessage('Plain console message'),
        'Plain console message',
    );
});
