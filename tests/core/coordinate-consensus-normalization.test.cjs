const test = require('node:test');
const assert = require('node:assert/strict');

test('solveConsensusTranslation computes correct translation vector', async () => {
    const { solveConsensusTranslation } = await import('../../dist/core/src/services/photoMetadata/coordinateNormalization.js');

    const faces = [
        { box: { x: 0.403 - 0.04, y: 0.270 - 0.04, width: 0.08, height: 0.08 } },
        { box: { x: 0.572 - 0.04, y: 0.274 - 0.04, width: 0.08, height: 0.08 } }
    ];

    const subjects = [
        { label: 'Subject 1', bounding_box: { x: 0.199, y: 0.07, width: 0.128, height: 0.094 }, type: 'person' },
        { label: 'Subject 2', bounding_box: { x: 0.385, y: 0.07, width: 0.128, height: 0.094 }, type: 'person' }
    ];

    const translation = solveConsensusTranslation(faces, subjects);
    assert.ok(translation);
    // Best consensus translation for both subjects:
    // Pair 1: dx = 0.403 - (0.199 + 0.064) = 0.140, dy = 0.270 - (0.07 + 0.047) = 0.153
    // Pair 2: dx = 0.572 - (0.385 + 0.064) = 0.123, dy = 0.274 - (0.07 + 0.047) = 0.157
    // Consensus selects the candidate with maximum matches. Let's verify dx and dy are within expected range.
    assert.ok(Math.abs(translation.dx - 0.123) < 0.02 || Math.abs(translation.dx - 0.140) < 0.02);
    assert.ok(Math.abs(translation.dy - 0.155) < 0.02);
});

test('normalizePhotoMetadataBlockBoxes applies consensus translation to subjects and ROIs', async () => {
    const { normalizePhotoMetadataBlockBoxes } = await import('../../dist/core/src/services/photoMetadata/coordinateNormalization.js');

    const faces = [
        { box: { x: 0.363, y: 0.230, width: 0.08, height: 0.08 } }
    ];

    const block = {
        subjects: [
            { label: 'Subject 1', bounding_box: { x: 0.199, y: 0.07, width: 0.128, height: 0.094 }, type: 'person' }
        ],
        regions_of_interest: [
            { label: 'Hats', bounding_box: { x: 0.19, y: 0.0, width: 0.18, height: 0.15 } }
        ]
    };

    const normalized = normalizePhotoMetadataBlockBoxes(block, undefined, faces);
    assert.ok(normalized);

    // Subject 1 center: x = 0.263, y = 0.117. Face 1 center: x = 0.403, y = 0.270.
    // Translation: dx = 0.140, dy = 0.153.
    // Subject 1 box: x = 0.199 + 0.140 = 0.339, y = 0.07 + 0.153 = 0.223.
    // Hats box: x = 0.19 + 0.140 = 0.330, y = 0 + 0.153 = 0.153.
    assert.ok(Math.abs(normalized.subjects[0].bounding_box.x - 0.339) < 0.01);
    assert.ok(Math.abs(normalized.subjects[0].bounding_box.y - 0.223) < 0.01);
    assert.ok(Math.abs(normalized.regions_of_interest[0].bounding_box.x - 0.330) < 0.01);
    assert.ok(Math.abs(normalized.regions_of_interest[0].bounding_box.y - 0.153) < 0.01);
});
