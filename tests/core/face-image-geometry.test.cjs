const test = require('node:test');
const assert = require('node:assert/strict');

test('getOrientedDimensions swaps width and height for rotated EXIF orientations', async () => {
    const { getOrientedDimensions } = await import('../../dist/core/src/services/faces/faceImageGeometry.js');

    assert.deepEqual(
        getOrientedDimensions({ width: 2685, height: 3871, orientation: 6 }),
        { width: 3871, height: 2685 }
    );
    assert.deepEqual(
        getOrientedDimensions({ width: 2685, height: 3871, orientation: 1 }),
        { width: 2685, height: 3871 }
    );
});

test('createModelToImageTransform preserves portrait geometry with horizontal padding', async () => {
    const { createModelToImageTransform } = await import('../../dist/core/src/services/faces/faceImageGeometry.js');

    const transform = createModelToImageTransform({
        imageWidth: 100,
        imageHeight: 200,
        modelWidth: 640,
        modelHeight: 640,
    });

    assert.equal(transform.scale, 3.2);
    assert.equal(transform.padX, 160);
    assert.equal(transform.padY, 0);
    assert.equal(transform.contentWidth, 320);
    assert.equal(transform.contentHeight, 640);
});

test('mapBoxFromModelToImage removes square-input padding before normalizing back to image space', async () => {
    const { createModelToImageTransform, mapBoxFromModelToImage } = await import('../../dist/core/src/services/faces/faceImageGeometry.js');

    const transform = createModelToImageTransform({
        imageWidth: 100,
        imageHeight: 200,
        modelWidth: 640,
        modelHeight: 640,
    });

    assert.deepEqual(
        mapBoxFromModelToImage([0.25, 0.1, 0.75, 0.9], transform),
        [0, 0.1, 1, 0.9]
    );
});
