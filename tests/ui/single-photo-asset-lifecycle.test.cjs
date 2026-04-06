const test = require('node:test');
const assert = require('node:assert/strict');

test('shouldSyncSinglePhotoAssetFocus only syncs when the focused asset changes', async () => {
    const { shouldSyncSinglePhotoAssetFocus } = await import('../../src/ui/components/single-photo/useSinglePhotoAssetLifecycle.ts');

    assert.equal(shouldSyncSinglePhotoAssetFocus({
        assetId: 'asset-1',
        lastSyncedAssetId: null,
        shouldSyncAssetFocus: true,
    }), true);

    assert.equal(shouldSyncSinglePhotoAssetFocus({
        assetId: 'asset-1',
        lastSyncedAssetId: 'asset-1',
        shouldSyncAssetFocus: true,
    }), false);

    assert.equal(shouldSyncSinglePhotoAssetFocus({
        assetId: 'asset-2',
        lastSyncedAssetId: 'asset-1',
        shouldSyncAssetFocus: true,
    }), true);

    assert.equal(shouldSyncSinglePhotoAssetFocus({
        assetId: 'asset-2',
        lastSyncedAssetId: 'asset-1',
        shouldSyncAssetFocus: false,
    }), false);

    assert.equal(shouldSyncSinglePhotoAssetFocus({
        assetId: undefined,
        lastSyncedAssetId: 'asset-1',
        shouldSyncAssetFocus: true,
    }), false);
});
