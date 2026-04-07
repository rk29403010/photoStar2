const test = require('node:test');
const assert = require('node:assert/strict');

test('sortAssetsForGallery sorts filenames in natural ascending order', async () => {
    const { sortAssetsForGallery } = await import('../../dist/core/src/shared/utils/libraryGallery.js');

    const sorted = sortAssetsForGallery([
        { id: '3', original_path: 'C:/photos/img11.jpg' },
        { id: '1', original_path: 'C:/photos/img2.jpg' },
        { id: '2', original_path: 'C:/photos/img10.jpg' },
    ], 'filename');

    assert.deepEqual(sorted.map((asset) => asset.id), ['1', '2', '3']);
});

test('sortAssetsForGallery sorts by photo_created_at descending in date mode', async () => {
    const { sortAssetsForGallery } = await import('../../dist/core/src/shared/utils/libraryGallery.js');

    const sorted = sortAssetsForGallery([
        { id: '1', original_path: 'C:/photos/a.jpg', created_at: '2026-01-01T00:00:00.000Z', photo_created_at: '2024-01-01T00:00:00.000Z' },
        { id: '3', original_path: 'C:/photos/c.jpg', created_at: '2027-01-01T00:00:00.000Z', photo_created_at: null },
        { id: '2', original_path: 'C:/photos/b.jpg', created_at: '2025-01-01T00:00:00.000Z', photo_created_at: '2025-01-01T00:00:00.000Z' },
    ], 'date');

    assert.deepEqual(sorted.map((asset) => asset.id), ['2', '1', '3']);
});

test('sortAssetsForGallery sorts by photo_created_at ascending in reverse-date mode', async () => {
    const { sortAssetsForGallery } = await import('../../dist/core/src/shared/utils/libraryGallery.js');

    const sorted = sortAssetsForGallery([
        { id: '1', original_path: 'C:/photos/a.jpg', created_at: '2026-01-01T00:00:00.000Z', photo_created_at: '2024-01-01T00:00:00.000Z' },
        { id: '3', original_path: 'C:/photos/c.jpg', created_at: '2027-01-01T00:00:00.000Z', photo_created_at: null },
        { id: '2', original_path: 'C:/photos/b.jpg', created_at: '2025-01-01T00:00:00.000Z', photo_created_at: '2025-01-01T00:00:00.000Z' },
    ], 'reverse-date');

    assert.deepEqual(sorted.map((asset) => asset.id), ['1', '2', '3']);
});

test('sortAssetsForGallery sorts by group id then asset id in group mode', async () => {
    const { sortAssetsForGallery } = await import('../../dist/core/src/shared/utils/libraryGallery.js');

    const sorted = sortAssetsForGallery([
        { id: 'b2', original_path: 'C:/photos/b2.jpg', group_id: 'group-b' },
        { id: 'a2', original_path: 'C:/photos/a2.jpg', group_id: 'group-a' },
        { id: 'a1', original_path: 'C:/photos/a1.jpg', group_id: 'group-a' },
        { id: 'u1', original_path: 'C:/photos/u1.jpg', group_id: null },
    ], 'group');

    assert.deepEqual(sorted.map((asset) => asset.id), ['u1', 'a1', 'a2', 'b2']);
});

test('getEffectiveLibrarySortMode falls back to filename when grouped mode is enabled in group sort', async () => {
    const { getEffectiveLibrarySortMode } = await import('../../dist/core/src/shared/utils/libraryGallery.js');

    assert.equal(getEffectiveLibrarySortMode('group', false), 'group');
    assert.equal(getEffectiveLibrarySortMode('group', true), 'filename');
    assert.equal(getEffectiveLibrarySortMode('date', true), 'date');
});

test('buildCurrentPhotoStatus returns filename, sensitivity, and dimensions', async () => {
    const { buildCurrentPhotoStatus } = await import('../../dist/core/src/shared/utils/libraryGallery.js');

    const status = buildCurrentPhotoStatus({
        id: '1',
        original_path: 'C:/photos/IMG_0001.JPG',
        sensitivity_status: 'review',
        sensitivity_score: 42,
        width: 3024,
        height: 4032,
    });

    assert.deepEqual(status, {
        filename: 'IMG_0001.JPG',
        sensitivity: 'Review',
        dimensions: '3024 × 4032',
    });
});

test('buildCurrentPhotoStatus falls back to score-driven labels and unrated state', async () => {
    const { buildCurrentPhotoStatus } = await import('../../dist/core/src/shared/utils/libraryGallery.js');

    assert.deepEqual(buildCurrentPhotoStatus({
        id: 'unsafe',
        original_path: 'C:/photos/unsafe.jpg',
        sensitivity_score: 89,
    }), {
        filename: 'unsafe.jpg',
        sensitivity: 'Unsafe (89%)',
        dimensions: null,
    });

    assert.deepEqual(buildCurrentPhotoStatus({
        id: 'unknown',
        original_path: 'C:/photos/unknown.jpg',
    }), {
        filename: 'unknown.jpg',
        sensitivity: 'Unrated',
        dimensions: null,
    });
});
