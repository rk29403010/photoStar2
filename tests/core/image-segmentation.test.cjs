const test = require('node:test');
const assert = require('node:assert/strict');
const ort = require('onnxruntime-node');

test('initImageSegmentation and segmentPhotoFromFrame run correctly', async () => {
    // Mock InferenceSession.create
    const originalCreate = ort.InferenceSession.create;
    let createCalled = false;
    let mockRunCalled = false;

    ort.InferenceSession.create = async () => {
        createCalled = true;
        return {
            run: async (feeds) => {
                mockRunCalled = true;
                assert.ok(feeds.images);
                assert.ok(feeds.point_coords);
                assert.ok(feeds.point_labels);

                // Verify inputs
                assert.deepEqual(feeds.images.dims, [1, 3, 10, 10]);
                assert.deepEqual(feeds.point_coords.dims, [1, 1, 2]);
                assert.deepEqual(feeds.point_labels.dims, [1, 1]);

                // Check programmatically generated point prompt coordinates at center (10/2, 10/2) -> (5, 5)
                assert.equal(feeds.point_coords.data[0], 5);
                assert.equal(feeds.point_coords.data[1], 5);
                assert.equal(feeds.point_labels.data[0], 1);

                // Mock return value for a 10x10 mask output
                const mockMaskData = new Float32Array(100).fill(1.0); // all foreground
                return {
                    masks: {
                        data: mockMaskData,
                        dims: [1, 1, 10, 10]
                    }
                };
            }
        };
    };

    try {
        const { initImageSegmentation, segmentPhotoFromFrame } = await import('../../dist/core/src/services/faces/imageSegmentation.js');
        
        await initImageSegmentation();
        assert.ok(createCalled);

        const imageBuffer = new Float32Array(3 * 10 * 10).fill(0.5);
        const mask = await segmentPhotoFromFrame(imageBuffer, 10, 10);

        assert.ok(mockRunCalled);
        assert.equal(mask.length, 100);
        assert.ok(mask.every(val => val === 1));
    } finally {
        ort.InferenceSession.create = originalCreate;
    }
});
