const test = require('node:test');
const assert = require('node:assert/strict');

test('resolveViewportStageAsset keeps the committed asset until a new image is ready', async () => {
    const { resolveViewportStageAsset } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    const committedAsset = { id: 'asset-1', original_path: 'one.jpg' };
    const requestedAsset = { id: 'asset-2', original_path: 'two.jpg' };

    assert.equal(
        resolveViewportStageAsset({
            committedAsset,
            requestedAsset,
            isRequestedImageReady: false,
        }),
        committedAsset,
    );

    assert.equal(
        resolveViewportStageAsset({
            committedAsset,
            requestedAsset,
            isRequestedImageReady: true,
        }),
        requestedAsset,
    );
});

test('resolveViewportStageAsset falls back to the requested asset when no committed asset exists', async () => {
    const { resolveViewportStageAsset } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    const requestedAsset = { id: 'asset-2', original_path: 'two.jpg' };

    assert.equal(
        resolveViewportStageAsset({
            committedAsset: null,
            requestedAsset,
            isRequestedImageReady: false,
        }),
        requestedAsset,
    );
});

test('shouldShowViewportFaceOverlays waits for the requested image to finish loading', async () => {
    const { shouldShowViewportFaceOverlays } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    assert.equal(
        shouldShowViewportFaceOverlays({
            showFaces: true,
            alwaysShowForPanel: false,
            committedAssetId: 'asset-1',
            requestedAssetId: 'asset-2',
            isRequestedImageReady: false,
        }),
        false,
    );

    assert.equal(
        shouldShowViewportFaceOverlays({
            showFaces: false,
            alwaysShowForPanel: true,
            committedAssetId: 'asset-2',
            requestedAssetId: 'asset-2',
            isRequestedImageReady: false,
        }),
        false,
    );

    assert.equal(
        shouldShowViewportFaceOverlays({
            showFaces: true,
            alwaysShowForPanel: false,
            committedAssetId: 'asset-2',
            requestedAssetId: 'asset-2',
            isRequestedImageReady: true,
        }),
        true,
    );
});
