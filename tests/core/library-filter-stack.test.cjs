const test = require('node:test');
const assert = require('node:assert/strict');

test('shouldRefreshLibraryForFilterStackChange skips refresh when the stack is unchanged', async () => {
    const { shouldRefreshLibraryForFilterStackChange } = await import('../../dist/core/src/shared/utils/libraryFilterStack.js');

    const currentStack = [];
    const nextStack = [];

    assert.equal(shouldRefreshLibraryForFilterStackChange(currentStack, nextStack), false);
});

test('shouldRefreshLibraryForFilterStackChange refreshes when filters are removed', async () => {
    const { shouldRefreshLibraryForFilterStackChange } = await import('../../dist/core/src/shared/utils/libraryFilterStack.js');

    const currentStack = [{ type: 'person_any', personIds: ['person-1'], description: 'Alice' }];
    const nextStack = [];

    assert.equal(shouldRefreshLibraryForFilterStackChange(currentStack, nextStack), true);
});
