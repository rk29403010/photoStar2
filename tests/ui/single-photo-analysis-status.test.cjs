const test = require('node:test');
const assert = require('node:assert/strict');

test('analysis status badge uses a solid readable background', async () => {
    const { getAnalysisStatusBadgeStyle } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisStatus.ts');

    const style = getAnalysisStatusBadgeStyle('analyzing');

    assert.equal(style.background, '#221433');
    assert.equal(style.color, '#f3e8ff');
    assert.match(style.boxShadow, /rgba\(0,0,0,0\.35\)/);
});

test('analysis status stays visible even when controls fade', async () => {
    const { getAnalysisStatusVisibilityStyle } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisStatus.ts');

    assert.deepEqual(getAnalysisStatusVisibilityStyle(false), {
        opacity: 1,
        pointerEvents: 'none',
        transition: 'opacity 0.35s ease',
    });
});

test('analysis status remains visible for reruns on the active asset', async () => {
    const { isAnalysisStatusVisible } = await import('../../src/ui/components/single-photo/singlePhotoAnalysisStatus.ts');

    assert.equal(isAnalysisStatusVisible({
        analyzingAssetId: 'asset-1',
        assetId: 'asset-1',
    }), true);
    assert.equal(isAnalysisStatusVisible({
        analyzingAssetId: 'asset-2',
        assetId: 'asset-1',
    }), false);
    assert.equal(isAnalysisStatusVisible({
        analyzingAssetId: null,
        assetId: 'asset-1',
    }), false);
});
