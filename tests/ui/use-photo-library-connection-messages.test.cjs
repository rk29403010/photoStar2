const test = require('node:test');
const assert = require('node:assert/strict');

test('AssetUpdated events with only an assetId request a backend refresh for that asset', async () => {
    const { getAssetUpdateInstruction } = await import('../../src/boundary/runtime/assetUpdateEvents.ts');

    assert.deepEqual(
        getAssetUpdateInstruction({
            type: 'AssetUpdated',
            assetId: 'asset-42',
        }),
        {
            kind: 'refresh',
            assetId: 'asset-42',
        },
    );
});

test('AssetUpdated events with a full asset payload still apply directly', async () => {
    const { getAssetUpdateInstruction } = await import('../../src/boundary/runtime/assetUpdateEvents.ts');

    assert.deepEqual(
        getAssetUpdateInstruction({
            type: 'AssetUpdated',
            asset: { id: 'asset-42', caption: 'Updated caption' },
        }),
        {
            kind: 'merge',
            asset: { id: 'asset-42', caption: 'Updated caption' },
        },
    );
});
