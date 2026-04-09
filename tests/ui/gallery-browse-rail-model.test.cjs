const test = require('node:test');
const assert = require('node:assert/strict');

test('smooth gallery browse rail defaults to justified mode', async () => {
    const { getDefaultGalleryLayoutMode } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(getDefaultGalleryLayoutMode(), 'justified');
});

test('browse row heights snap into calmer bands', async () => {
    const { getBrowseRowHeightBand } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(getBrowseRowHeightBand(640), 150);
    assert.equal(getBrowseRowHeightBand(960), 168);
    assert.equal(getBrowseRowHeightBand(1280), 184);
    assert.equal(getBrowseRowHeightBand(1680), 208);
});

test('prefetch becomes active before the viewport reaches the final buffered rows', async () => {
    const { shouldPrefetchBufferedRows } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(shouldPrefetchBufferedRows(10, 4), false);
    assert.equal(shouldPrefetchBufferedRows(5, 4), true);
    assert.equal(shouldPrefetchBufferedRows(2, 2), true);
});

test('scroll settled state waits for the idle delay after the latest movement', async () => {
    const { getScrollSettledState } = await import('../../src/ui/components/library/galleryBrowseRailModel.ts');

    assert.equal(getScrollSettledState(1_000, 1_060, 120), false);
    assert.equal(getScrollSettledState(1_000, 1_120, 120), true);
    assert.equal(getScrollSettledState(1_000, 1_300, 120), true);
});
