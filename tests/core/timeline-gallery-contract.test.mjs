import test from 'node:test';
import assert from 'node:assert/strict';

test('grouped timeline contract modules compile and date-mode routing uses grouped timeline data', async () => {
    const timelineGalleryModule = await import('../../dist/core/src/boundary/contracts/timelineGallery.js');
    const coreContractsModule = await import('../../dist/core/src/boundary/contracts/core.js');
    const { getLibraryGalleryDataMode, getEffectiveLibrarySortMode } = await import('../../dist/core/src/shared/utils/libraryGallery.js');

    assert.ok(timelineGalleryModule);
    assert.ok(coreContractsModule);
    assert.ok(Array.isArray(coreContractsModule.PERSON_COLORS));

    assert.equal(getLibraryGalleryDataMode('date'), 'grouped-timeline');
    assert.equal(getLibraryGalleryDataMode('reverse-date'), 'grouped-timeline');
    assert.equal(getLibraryGalleryDataMode('filename'), 'flat');
    assert.equal(getLibraryGalleryDataMode('group'), 'flat');

    assert.equal(getEffectiveLibrarySortMode('group', true), 'filename');
    assert.equal(getLibraryGalleryDataMode(getEffectiveLibrarySortMode('group', true)), 'flat');
    assert.equal(getLibraryGalleryDataMode(getEffectiveLibrarySortMode('date', true)), 'grouped-timeline');
});
