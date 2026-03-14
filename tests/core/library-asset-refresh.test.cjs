const test = require('node:test');
const assert = require('node:assert/strict');

test('mergeRefreshedAssetPage preserves loaded pages while replacing refreshed items', async () => {
    const { mergeRefreshedAssetPage } = await import('../../dist/core/src/shared/utils/libraryAssetRefresh.js');

    const merged = mergeRefreshedAssetPage(
        [
            { id: 'a', preview_path: null },
            { id: 'b', preview_path: null },
            { id: 'c', preview_path: '/thumb-c.webp' },
            { id: 'd', preview_path: '/thumb-d.webp' },
        ],
        [
            { id: 'a', preview_path: '/thumb-a.webp' },
            { id: 'e', preview_path: '/thumb-e.webp' },
        ],
    );

    assert.deepEqual(
        merged.map((asset) => `${asset.id}:${asset.preview_path ?? 'none'}`),
        ['a:/thumb-a.webp', 'e:/thumb-e.webp', 'b:none', 'c:/thumb-c.webp', 'd:/thumb-d.webp']
    );
});

test('mergeRefreshedAssetPage removes duplicate ids from preserved tail', async () => {
    const { mergeRefreshedAssetPage } = await import('../../dist/core/src/shared/utils/libraryAssetRefresh.js');

    const merged = mergeRefreshedAssetPage(
        [
            { id: 'a', preview_path: null },
            { id: 'b', preview_path: '/thumb-b-old.webp' },
            { id: 'c', preview_path: '/thumb-c.webp' },
        ],
        [
            { id: 'b', preview_path: '/thumb-b-new.webp' },
            { id: 'a', preview_path: '/thumb-a.webp' },
        ],
    );

    assert.deepEqual(
        merged.map((asset) => `${asset.id}:${asset.preview_path ?? 'none'}`),
        ['b:/thumb-b-new.webp', 'a:/thumb-a.webp', 'c:/thumb-c.webp']
    );
});
