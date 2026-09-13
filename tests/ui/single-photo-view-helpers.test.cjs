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

test('single photo asset model merges and deduplicates presentation expansion assets without mutating relationship state', async () => {
    const {
        dedupeSinglePhotoAssets,
        mergeSinglePhotoAssets,
        resolveSinglePhotoAssetIndex,
    } = await import('../../src/ui/components/single-photo/singlePhotoAssetModel.ts');

    const galleryAssets = [
        { id: 'asset-1', original_path: 'one.jpg', caption: 'Gallery caption' },
    ];
    const expandedAssets = [
        { id: 'asset-2', original_path: 'two.jpg' },
        { id: 'asset-2', original_path: 'two-better.jpg', preview_path: 'two.webp' },
        { id: 'asset-1', original_path: 'one.jpg' },
    ];

    const mergedAssets = mergeSinglePhotoAssets(galleryAssets, dedupeSinglePhotoAssets(expandedAssets));

    assert.deepEqual(mergedAssets.map((asset) => asset.id), ['asset-1', 'asset-2']);
    assert.equal(mergedAssets[0].caption, 'Gallery caption');
    assert.equal(mergedAssets[1].original_path, 'two-better.jpg');
    assert.equal(mergedAssets[1].preview_path, 'two.webp');
    assert.equal(resolveSinglePhotoAssetIndex(mergedAssets, 'asset-2'), 1);
    assert.equal(resolveSinglePhotoAssetIndex(mergedAssets, 'missing'), -1);
});
