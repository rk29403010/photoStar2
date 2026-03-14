const test = require('node:test');
const assert = require('node:assert/strict');

test('background ingest refresh ids preserve existing paging state', async () => {
    const {
        shouldUpdatePagingStateFromAssetResponse,
        isPreservedPagingAssetRefreshId,
    } = await import('../../dist/core/src/shared/utils/libraryPagingState.js');

    assert.equal(isPreservedPagingAssetRefreshId('get_assets-preserve_123'), true);
    assert.equal(shouldUpdatePagingStateFromAssetResponse('get_assets-preserve_123'), false);
});

test('standard asset responses still update paging state', async () => {
    const {
        shouldUpdatePagingStateFromAssetResponse,
    } = await import('../../dist/core/src/shared/utils/libraryPagingState.js');

    assert.equal(shouldUpdatePagingStateFromAssetResponse('get_assets-123'), true);
    assert.equal(shouldUpdatePagingStateFromAssetResponse('get_assets_page_48'), true);
    assert.equal(shouldUpdatePagingStateFromAssetResponse('assets-init'), true);
    assert.equal(shouldUpdatePagingStateFromAssetResponse('people-init'), false);
});
