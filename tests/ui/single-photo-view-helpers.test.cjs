const test = require('node:test');
const assert = require('node:assert/strict');

test('buildAnalysisDetails surfaces mock metadata fields in the analysis tab model', async () => {
    const { buildAnalysisDetails } = await import('../../src/ui/components/single-photo/info-panel/analysisTabModel.ts');

    const details = buildAnalysisDetails({
        ai_metadata: {
            mode: 'mock',
            caption: 'Mock caption for efe2a408-3e4f-4830-803d-0fbb322722c6',
            tags: ['mock-tag'],
            notes: 'Deterministic mock response',
        },
        caption: 'Fallback caption',
    });

    assert.deepEqual(details, {
        mode: 'mock',
        tags: ['mock-tag'],
        description: 'Deterministic mock response',
    });
});

test('zoom helpers clamp zoom out to 50 percent and cap zoom in at 1000 percent', async () => {
    const {
        MIN_ZOOM_SCALE,
        MAX_ZOOM_SCALE,
        ZOOM_STEP,
        clampZoomScale,
        getNextZoomScale,
    } = await import('../../src/ui/components/single-photo/zoomMath.ts');

    assert.equal(MIN_ZOOM_SCALE, 0.5);
    assert.equal(MAX_ZOOM_SCALE, 10);
    assert.equal(ZOOM_STEP, 0.5);
    assert.equal(getNextZoomScale(1, -1), 0.5);
    assert.equal(getNextZoomScale(0.5, -1), 0.5);
    assert.equal(getNextZoomScale(9.75, 1), 10);
    assert.equal(clampZoomScale(0.1), 0.5);
    assert.equal(clampZoomScale(12), 10);
});

test('single photo asset model merges orbit assets and keeps a separate star asset id', async () => {
    const {
        applyStarSelection,
        clearGroupMembership,
        dedupeSinglePhotoAssets,
        mergeSinglePhotoAssets,
        replaceGroupRepresentative,
        resolveSinglePhotoAssetIndex,
        resolveStarAssetId,
    } = await import('../../src/ui/components/single-photo/singlePhotoAssetModel.ts');

    const galleryAssets = [
        { id: 'asset-1', original_path: 'one.jpg', group_id: 'group-1', group_role: 'member' },
    ];
    const orbitAssets = [
        { id: 'asset-2', original_path: 'two.jpg', group_id: 'group-1', group_role: 'canonical' },
        { id: 'asset-2', original_path: 'two-better.jpg', preview_path: 'two.webp', group_id: 'group-1', group_role: 'canonical' },
        { id: 'asset-1', original_path: 'one.jpg', group_id: 'group-1', group_role: 'member' },
    ];

    const mergedAssets = mergeSinglePhotoAssets(galleryAssets, dedupeSinglePhotoAssets(orbitAssets));

    assert.deepEqual(mergedAssets.map((asset) => asset.id), ['asset-1', 'asset-2']);
    assert.equal(mergedAssets[1].original_path, 'two-better.jpg');
    assert.equal(resolveSinglePhotoAssetIndex(mergedAssets, 'asset-2'), 1);
    assert.equal(resolveStarAssetId(mergedAssets, 'asset-1'), 'asset-2');

    assert.deepEqual(
        applyStarSelection([
            { id: 'asset-1', original_path: 'one.jpg', group_id: 'group-1', group_role: 'canonical', role: 'canonical', rank: -1 },
            { id: 'asset-2', original_path: 'two.jpg', group_id: 'group-1', group_role: 'member', role: 'member', rank: 1 },
        ], 'group-1', 'asset-2'),
        [
            { id: 'asset-1', original_path: 'one.jpg', group_id: 'group-1', group_role: 'member', role: 'member', rank: -1 },
            { id: 'asset-2', original_path: 'two.jpg', group_id: 'group-1', group_role: 'canonical', role: 'canonical', rank: -1 },
        ]
    );

    assert.deepEqual(
        clearGroupMembership(
            [
                { id: 'asset-1', original_path: 'one.jpg', group_id: 'group-1', group_role: 'canonical', role: 'canonical', rank: -1, stack_count: 2 },
                { id: 'asset-2', original_path: 'two.jpg', group_id: 'group-1', group_role: 'member', role: 'member', rank: 1, stack_count: 2 },
                { id: 'asset-9', original_path: 'nine.jpg' },
            ],
            'group-1',
        ),
        [
            { id: 'asset-1', original_path: 'one.jpg', group_id: null, group_role: null, role: null, rank: null, stack_count: null },
            { id: 'asset-2', original_path: 'two.jpg', group_id: null, group_role: null, role: null, rank: null, stack_count: null },
            { id: 'asset-9', original_path: 'nine.jpg' },
        ]
    );

    assert.deepEqual(
        replaceGroupRepresentative(
            [
                { id: 'asset-1', original_path: 'one.jpg', preview_path: 'one.webp', group_id: 'group-1', group_role: 'canonical', stack_count: 2 },
                { id: 'asset-9', original_path: 'nine.jpg', preview_path: 'nine.webp' },
            ],
            'group-1',
            { id: 'asset-2', original_path: 'two.jpg', preview_path: 'two.webp', group_id: 'group-1', group_role: 'member' },
        ),
        [
            { id: 'asset-2', original_path: 'two.jpg', preview_path: 'two.webp', group_id: 'group-1', group_role: 'canonical', stack_count: 2, role: 'canonical', rank: -1 },
            { id: 'asset-9', original_path: 'nine.jpg', preview_path: 'nine.webp' },
        ]
    );
});
