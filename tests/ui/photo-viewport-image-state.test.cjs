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

test('shouldShowViewportFaceOverlays waits for the displayed image to finish loading', async () => {
    const { shouldShowViewportFaceOverlays } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    assert.equal(
        shouldShowViewportFaceOverlays({
            showFaces: true,
            alwaysShowForPanel: false,
            committedAssetId: 'asset-1',
            requestedAssetId: 'asset-2',
            isDisplayedImageReady: false,
        }),
        false,
    );

    assert.equal(
        shouldShowViewportFaceOverlays({
            showFaces: false,
            alwaysShowForPanel: true,
            committedAssetId: 'asset-2',
            requestedAssetId: 'asset-2',
            isDisplayedImageReady: false,
        }),
        false,
    );

    assert.equal(
        shouldShowViewportFaceOverlays({
            showFaces: true,
            alwaysShowForPanel: false,
            committedAssetId: 'asset-2',
            requestedAssetId: 'asset-2',
            isDisplayedImageReady: true,
        }),
        true,
    );
});

test('isViewportImageTransitionPending stays true until the displayed image is ready', async () => {
    const { isViewportImageTransitionPending } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    assert.equal(
        isViewportImageTransitionPending({
            committedAssetId: 'asset-1',
            requestedAssetId: 'asset-2',
            isDisplayedImageReady: false,
        }),
        true,
    );

    assert.equal(
        isViewportImageTransitionPending({
            committedAssetId: 'asset-2',
            requestedAssetId: 'asset-2',
            isDisplayedImageReady: false,
        }),
        true,
    );

    assert.equal(
        isViewportImageTransitionPending({
            committedAssetId: 'asset-2',
            requestedAssetId: 'asset-2',
            isDisplayedImageReady: true,
        }),
        false,
    );
});

test('getNextNavButtonRightOffset keeps the next arrow clear of the info panel', async () => {
    const { getNextNavButtonRightOffset } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    assert.equal(getNextNavButtonRightOffset({ showInfoPanel: false, infoPanelWidth: 360 }), 12);
    assert.equal(getNextNavButtonRightOffset({ showInfoPanel: true, infoPanelWidth: 360 }), 372);
});

test('fitViewportStageDimensions scales small assets up to the available viewport', async () => {
    const { fitViewportStageDimensions } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    assert.deepEqual(
        fitViewportStageDimensions({
            viewportWidth: 1920,
            viewportHeight: 915,
            assetWidth: 375,
            assetHeight: 284,
        }),
        {
            width: 1208,
            height: 915,
        },
    );

    assert.deepEqual(
        fitViewportStageDimensions({
            viewportWidth: 1560,
            viewportHeight: 915,
            assetWidth: 635,
            assetHeight: 915,
        }),
        {
            width: 635,
            height: 915,
        },
    );
});

test('commitViewportPendingImage resets ready state until the visible image has loaded', async () => {
    const { commitViewportPendingImage } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    assert.deepEqual(
        commitViewportPendingImage({
            activeAsset: { id: 'asset-1', original_path: 'one.jpg' },
            activeImageSrc: 'one.jpg',
            pendingAsset: { id: 'asset-2', original_path: 'two.jpg' },
            pendingImageSrc: 'two.jpg',
            isActiveImageReady: true,
        }),
        {
            activeAsset: { id: 'asset-2', original_path: 'two.jpg' },
            activeImageSrc: 'two.jpg',
            pendingAsset: null,
            pendingImageSrc: null,
            isActiveImageReady: false,
        },
    );
});

test('getViewportStageTransformTransition disables transform animation during image swaps', async () => {
    const { getViewportStageTransformTransition } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    assert.equal(
        getViewportStageTransformTransition({
            isDragging: false,
            isImageTransitionPending: true,
        }),
        'none',
    );

    assert.equal(
        getViewportStageTransformTransition({
            isDragging: true,
            isImageTransitionPending: false,
        }),
        'none',
    );

    assert.equal(
        getViewportStageTransformTransition({
            isDragging: false,
            isImageTransitionPending: false,
        }),
        'transform 0.15s ease-out',
    );
});

test('getViewportStageIdentity changes when the committed image source changes', async () => {
    const { getViewportStageIdentity } = await import('../../src/ui/components/single-photo/photoViewportImageState.ts');

    assert.equal(
        getViewportStageIdentity({
            assetId: 'asset-1',
            imageSrc: 'one.jpg',
        }),
        'asset-1::one.jpg',
    );

    assert.equal(
        getViewportStageIdentity({
            assetId: 'asset-1',
            imageSrc: null,
        }),
        'asset-1::missing',
    );
});
