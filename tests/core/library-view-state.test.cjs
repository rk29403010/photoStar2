const test = require('node:test');
const assert = require('node:assert/strict');

test('getLibraryViewState keeps the loading state active during a replacement refresh', async () => {
    const { getLibraryViewState } = await import('../../dist/core/src/shared/utils/libraryViewState.js');

    const viewState = getLibraryViewState({
        assetCount: 0,
        rejectedAssetCount: 0,
        loading: false,
        backendReady: true,
        isRefreshingLibrary: true,
    });

    assert.equal(viewState, 'loading');
});

test('getLibraryViewState only returns empty when no replacement refresh is pending', async () => {
    const { getLibraryViewState } = await import('../../dist/core/src/shared/utils/libraryViewState.js');

    const viewState = getLibraryViewState({
        assetCount: 0,
        rejectedAssetCount: 0,
        loading: false,
        backendReady: true,
        isRefreshingLibrary: false,
    });

    assert.equal(viewState, 'empty');
});

test('getLibraryViewState keeps showing content while replacement data is in flight', async () => {
    const { getLibraryViewState } = await import('../../dist/core/src/shared/utils/libraryViewState.js');

    const viewState = getLibraryViewState({
        assetCount: 12,
        rejectedAssetCount: 0,
        loading: false,
        backendReady: true,
        isRefreshingLibrary: true,
    });

    assert.equal(viewState, 'content');
});
