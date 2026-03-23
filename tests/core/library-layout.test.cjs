const test = require('node:test');
const assert = require('node:assert/strict');

test('buildGalleryTileLayout keeps a regular square span in grid mode', async () => {
    const { buildGalleryTileLayout } = await import('../../dist/core/src/shared/utils/libraryLayout.js');

    const layout = buildGalleryTileLayout({
        width: 4000,
        height: 1000,
        processingPhase: 2,
        layoutCapabilities: { heroEligible: true },
        manualState: { forceHero: true },
    }, 'grid');

    assert.deepEqual(layout, {
        intent: 'normal',
        spanW: 3,
        spanH: 3,
    });
});

test('buildGalleryTileLayout preserves aspect-aware hero behavior in tiled mode', async () => {
    const { buildGalleryTileLayout } = await import('../../dist/core/src/shared/utils/libraryLayout.js');

    const layout = buildGalleryTileLayout({
        width: 3200,
        height: 1800,
        processingPhase: 2,
        layoutCapabilities: { heroEligible: true },
    }, 'tiled');

    assert.deepEqual(layout, {
        intent: 'hero',
        spanW: 8,
        spanH: 4,
    });
});
