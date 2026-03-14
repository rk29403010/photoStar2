const test = require('node:test');
const assert = require('node:assert/strict');

test('buildStablePreviewAssets preserves visible order and appends new previews during ingest', async () => {
    const { buildStablePreviewAssets } = await import('../../dist/core/src/shared/utils/stablePreviewAssets.js');

    const nextVisibleAssets = buildStablePreviewAssets(
        [
            { id: 'b', preview_path: '/thumb-b-old.webp' },
            { id: 'd', preview_path: '/thumb-d.webp' },
        ],
        [
            { id: 'a', preview_path: '/thumb-a.webp' },
            { id: 'b', preview_path: '/thumb-b-new.webp' },
            { id: 'c', preview_path: null },
            { id: 'd', preview_path: '/thumb-d.webp' },
        ],
        true,
    );

    assert.deepEqual(
        nextVisibleAssets.map((asset) => `${asset.id}:${asset.preview_path ?? 'none'}`),
        ['b:/thumb-b-new.webp', 'd:/thumb-d.webp', 'a:/thumb-a.webp'],
    );
});

test('buildStablePreviewAssets resets to the live preview order after ingest', async () => {
    const { buildStablePreviewAssets } = await import('../../dist/core/src/shared/utils/stablePreviewAssets.js');

    const nextVisibleAssets = buildStablePreviewAssets(
        [
            { id: 'b', preview_path: '/thumb-b.webp' },
            { id: 'd', preview_path: '/thumb-d.webp' },
            { id: 'a', preview_path: '/thumb-a.webp' },
        ],
        [
            { id: 'a', preview_path: '/thumb-a.webp' },
            { id: 'b', preview_path: '/thumb-b.webp' },
            { id: 'd', preview_path: '/thumb-d.webp' },
        ],
        false,
    );

    assert.deepEqual(
        nextVisibleAssets.map((asset) => asset.id),
        ['a', 'b', 'd'],
    );
});
