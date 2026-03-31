const test = require('node:test');
const assert = require('node:assert/strict');

test('normalizeStoredPhotoBox accepts canonical normalized boxes', async () => {
    const { normalizeStoredPhotoBox } = await import('../../dist/core/src/services/faces/faceImageGeometry.js');

    assert.deepEqual(
        normalizeStoredPhotoBox({ x: 0.25, y: 0.4, width: 0.5, height: 0.3 }),
        { x: 0.25, y: 0.4, width: 0.5, height: 0.3 },
    );
});

test('normalizeStoredPhotoBox converts legacy corner arrays into canonical boxes', async () => {
    const { normalizeStoredPhotoBox } = await import('../../dist/core/src/services/faces/faceImageGeometry.js');

    assert.deepEqual(
        normalizeStoredPhotoBox([0.1, 0.2, 0.4, 0.7]),
        { x: 0.1, y: 0.2, width: 0.3, height: 0.5 },
    );
});

test('normalizeStoredPhotoBox converts mixed-scale metadata boxes into normalized fractions', async () => {
    const { normalizeStoredPhotoBox } = await import('../../dist/core/src/services/faces/faceImageGeometry.js');

    assert.deepEqual(
        normalizeStoredPhotoBox({ x: 700, y: 140, width: 180, height: 320 }),
        { x: 0.7, y: 0.14, width: 0.18, height: 0.32 },
    );
});

test('normalizeStoredPhotoBox rejects zero-area and invalid boxes', async () => {
    const { normalizeStoredPhotoBox } = await import('../../dist/core/src/services/faces/faceImageGeometry.js');

    assert.equal(normalizeStoredPhotoBox({ x: 0.1, y: 0.2, width: 0, height: 0.5 }), null);
    assert.equal(normalizeStoredPhotoBox([0.4, 0.2, 0.1, 0.5]), null);
    assert.equal(normalizeStoredPhotoBox('not-a-box'), null);
});

test('storedPhotoBoxToUnitCorners and storedPhotoBoxToPixelCrop convert canonical boxes for rendering and crops', async () => {
    const {
        storedPhotoBoxToPixelCrop,
        storedPhotoBoxToUnitCorners,
    } = await import('../../dist/core/src/services/faces/faceImageGeometry.js');

    const box = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };
    assert.deepEqual(storedPhotoBoxToUnitCorners(box), [0.1, 0.2, 0.5, 0.5]);
    assert.deepEqual(
        storedPhotoBoxToPixelCrop(box, { width: 1000, height: 800 }),
        { left: 100, top: 160, width: 400, height: 240 },
    );
});
