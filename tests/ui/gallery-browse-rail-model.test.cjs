const test = require('node:test');
const assert = require('node:assert/strict');

test('smooth gallery browse rail defaults to justified mode', async () => {
    const { getDefaultGalleryLayoutMode } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(getDefaultGalleryLayoutMode(), 'justified');
});

test('browse row heights snap into calmer bands', async () => {
    const { getBrowseRowHeightBand } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(getBrowseRowHeightBand(640), 176);
    assert.equal(getBrowseRowHeightBand(960), 196);
    assert.equal(getBrowseRowHeightBand(1280), 220);
    assert.equal(getBrowseRowHeightBand(1680), 244);
});

test('mounted rail tiles only force eager preview loading for the front of the viewport', async () => {
    const { GALLERY_EAGER_PREVIEW_COUNT, GALLERY_ROW_GAP_PX, GALLERY_TILE_GAP_PX } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(GALLERY_EAGER_PREVIEW_COUNT, 12);
    assert.equal(GALLERY_ROW_GAP_PX, 10);
    assert.equal(GALLERY_TILE_GAP_PX, 6);
});

test('prefetch lead grows when the user is scrolling quickly toward unloaded rows', async () => {
    const { getPredictivePrefetchRows, shouldPrefetchBufferedRows } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(getPredictivePrefetchRows({
        viewportRowCount: 4,
        scrollDirection: 'idle',
        pixelsPerMs: 0,
        rowHeight: 220,
        averageBatchLoadMs: 300,
    }), 2);

    assert.equal(getPredictivePrefetchRows({
        viewportRowCount: 4,
        scrollDirection: 'down',
        pixelsPerMs: 2.5,
        rowHeight: 220,
        averageBatchLoadMs: 900,
    }), 12);

    assert.equal(shouldPrefetchBufferedRows({
        remainingRows: 10,
        viewportRowCount: 4,
        scrollDirection: 'down',
        pixelsPerMs: 0.1,
        rowHeight: 220,
        averageBatchLoadMs: 220,
    }), false);

    assert.equal(shouldPrefetchBufferedRows({
        remainingRows: 3,
        viewportRowCount: 4,
        scrollDirection: 'down',
        pixelsPerMs: 1.4,
        rowHeight: 220,
        averageBatchLoadMs: 700,
    }), true);
});

test('scroll settled state waits for the idle delay after the latest movement', async () => {
    const { getScrollSettledState } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(getScrollSettledState(1_000, 1_200, 320), false);
    assert.equal(getScrollSettledState(1_000, 1_320, 320), true);
    assert.equal(getScrollSettledState(1_000, 1_500, 320), true);
});

test('keyboard scrolling uses row steps for arrows and viewport steps for page navigation', async () => {
    const { getKeyboardScrollDelta } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(getKeyboardScrollDelta({ key: 'ArrowDown', browseRowHeight: 220, viewportHeight: 900, rowGap: 10 }), 230);
    assert.equal(getKeyboardScrollDelta({ key: 'ArrowUp', browseRowHeight: 220, viewportHeight: 900, rowGap: 10 }), -230);
    assert.equal(getKeyboardScrollDelta({ key: 'PageDown', browseRowHeight: 220, viewportHeight: 900, rowGap: 10 }), 792);
    assert.equal(getKeyboardScrollDelta({ key: 'PageUp', browseRowHeight: 220, viewportHeight: 900, rowGap: 10 }), -792);
});
