const test = require('node:test');
const assert = require('node:assert/strict');

async function loadModule(relativePath) {
    return import(new URL(`../../${relativePath}`, `file://${__dirname.replace(/\\/g, '/')}/`).href);
}

test('selection recovery ignores transient missing assets while the library is refreshing', async () => {
    const { shouldClearMissingSelection } = await loadModule('src/ui/hooks/useSelectionRecovery.ts');

    const result = shouldClearMissingSelection({
        assets: [],
        selectedAssetId: 'asset-1',
        isRefreshingLibrary: true,
    });

    assert.equal(result, false);
});

test('single photo overlay keeps the focused asset when it temporarily disappears from the live asset page', async () => {
    const { resolveSinglePhotoOverlaySelection } = await loadModule('src/ui/components/app/singlePhotoOverlaySelection.ts');

    const fallbackSelectedAsset = { id: 'asset-1', original_path: 'C:/photo.jpg' };
    const result = resolveSinglePhotoOverlaySelection({
        assets: [{ id: 'asset-2', original_path: 'C:/other.jpg' }],
        selectedAssetId: 'asset-1',
        fallbackSelectedAsset,
    });

    assert.equal(result.selectedIndex, 1);
    assert.equal(result.overlayAssets[1].id, 'asset-1');
});
