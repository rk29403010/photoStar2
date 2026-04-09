const test = require('node:test');
const assert = require('node:assert/strict');

test('removeAssetsById removes moved assets from the current gallery state', async () => {
    const { removeAssetsById } = await import('../../dist/core/src/shared/utils/photoBinLocalState.js');

    const nextAssets = removeAssetsById(
        [
            { id: 'a' },
            { id: 'b' },
            { id: 'c' },
        ],
        ['b'],
    );

    assert.deepEqual(
        nextAssets.map((asset) => asset.id),
        ['a', 'c'],
    );
});

test('restoreAssetsByReference reinserts restored assets in their prior relative order', async () => {
    const { restoreAssetsByReference } = await import('../../dist/core/src/shared/utils/photoBinLocalState.js');

    const nextAssets = restoreAssetsByReference(
        [
            { id: 'a' },
            { id: 'd' },
            { id: 'x' },
        ],
        [
            { id: 'b' },
            { id: 'c' },
        ],
        [
            { id: 'a' },
            { id: 'b' },
            { id: 'c' },
            { id: 'd' },
        ],
    );

    assert.deepEqual(
        nextAssets.map((asset) => asset.id),
        ['a', 'b', 'c', 'd', 'x'],
    );
});
