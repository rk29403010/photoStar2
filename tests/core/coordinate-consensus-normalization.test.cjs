const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../../dist/core/src/services/photoMetadata/coordinateNormalization.js');

test('local faces never translate or scale subjects and unrelated points of interest', () => {
    const block = {
        subjects: [{ label: 'Person', bounding_box: { x: 0.2, y: 0.1, width: 0.1, height: 0.1 } }],
        regions_of_interest: [{ label: 'Sign', bounding_box: { x: 0.7, y: 0.3, width: 0.2, height: 0.1 } }],
    };
    const faces = [{ box: { x: 0.4, y: 0.3, width: 0.1, height: 0.1 } }];
    assert.deepEqual(geometry.normalizePhotoMetadataBlockBoxes(block, undefined, faces), block);
    assert.deepEqual(geometry.normalizePhotoMetadataSubjects(block.subjects, undefined, faces), block.subjects);
    assert.deepEqual(geometry.normalizePhotoMetadataRegionsOfInterest(block.regions_of_interest, undefined, faces, block.subjects), block.regions_of_interest);
});

test('stored metadata rejects ambiguous array, pixel and 1000 scale boxes', () => {
    const invalid = [
        [0.1, 0.2, 0.3, 0.4],
        { x: 100, y: 100, width: 200, height: 200 },
        { x: 1000, y: 0, width: 1000, height: 1200 },
    ];
    for (const box of invalid) {
        const block = { subjects: [{ bounding_box: box }], regions_of_interest: [{ bounding_box: box }] };
        assert.deepEqual(geometry.normalizePhotoMetadataBlockBoxes(block, { width: 4000, height: 3000 }), {
            subjects: [], regions_of_interest: [],
        });
    }
});
