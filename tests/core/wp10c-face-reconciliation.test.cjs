const test = require('node:test');
const assert = require('node:assert/strict');

const SOURCE = { provider: 'onnx_retina_10g', modelVersion: '1.0' };

function policy(overrides = {}) {
    return {
        id: 'test.face_reconciliation',
        version: '1',
        compatiblePriorSources: [SOURCE],
        minimumIoU: 0.2,
        landmarkWeight: 0.25,
        ambiguityMargin: 0.02,
        ...overrides,
    };
}

function prior(visualRegionId, box, landmarks) {
    return { visualRegionId, box, landmarks, ...SOURCE };
}

function current(detectionId, box, landmarks) {
    return { detectionId, box, landmarks };
}

test('WP10c reconciliation preserves stable region IDs when detector order changes', async () => {
    const { reconcileFaceDetections } = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const priorRegions = [
        prior('region:left', { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }),
        prior('region:right', { x: 0.65, y: 0.15, width: 0.2, height: 0.2 }),
    ];
    const detections = [
        current('new-first', { x: 0.64, y: 0.15, width: 0.2, height: 0.2 }),
        current('new-second', { x: 0.11, y: 0.1, width: 0.2, height: 0.2 }),
    ];

    const result = reconcileFaceDetections(policy(), priorRegions, detections);

    assert.deepEqual(result.matches.map(({ detectionId, visualRegionId }) => ({ detectionId, visualRegionId })), [
        { detectionId: 'new-first', visualRegionId: 'region:right' },
        { detectionId: 'new-second', visualRegionId: 'region:left' },
    ]);
    assert.deepEqual(result.unmatchedDetectionIds, []);
    assert.deepEqual(result.unmatchedVisualRegionIds, []);
    assert.deepEqual(result.ambiguousDetectionIds, []);
});

test('WP10c reconciliation uses landmark evidence when compatible landmarks are available', async () => {
    const { reconcileFaceDetections } = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const box = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
    const priorRegions = [
        prior('region:landmark-match', box, [{ x: 0.28, y: 0.3 }, { x: 0.42, y: 0.3 }]),
        prior('region:landmark-other', box, [{ x: 0.22, y: 0.22 }, { x: 0.48, y: 0.48 }]),
    ];
    const detections = [
        current('new-face', box, [{ x: 0.28, y: 0.3 }, { x: 0.42, y: 0.3 }]),
    ];

    const result = reconcileFaceDetections(policy({ landmarkWeight: 0.5, ambiguityMargin: 0.05 }), priorRegions, detections);

    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].visualRegionId, 'region:landmark-match');
    assert.equal(result.matches[0].landmarkSimilarity, 1);
    assert.deepEqual(result.ambiguousDetectionIds, []);
});

test('WP10c reconciliation fails safe when the best stable identity is ambiguous', async () => {
    const { reconcileFaceDetections } = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const box = { x: 0.3, y: 0.3, width: 0.2, height: 0.2 };
    const landmarks = [{ x: 0.35, y: 0.36 }, { x: 0.45, y: 0.36 }];
    const priorRegions = [
        prior('region:a', box, landmarks),
        prior('region:b', box, landmarks),
    ];
    const detections = [current('new-face', box, landmarks)];

    const result = reconcileFaceDetections(policy(), priorRegions, detections);

    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.ambiguousDetectionIds, ['new-face']);
    assert.deepEqual(result.unmatchedDetectionIds, ['new-face']);
    assert.deepEqual(result.unmatchedVisualRegionIds, ['region:a', 'region:b']);
});

test('WP10c reconciliation rejects prior regions from incompatible detector sources', async () => {
    const { reconcileFaceDetections } = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const box = { x: 0.1, y: 0.1, width: 0.25, height: 0.25 };
    const priorRegions = [{
        visualRegionId: 'region:legacy-provider',
        box,
        provider: 'different_detector',
        modelVersion: '9',
    }];

    const result = reconcileFaceDetections(policy(), priorRegions, [current('new-face', box)]);

    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.unmatchedDetectionIds, ['new-face']);
    assert.deepEqual(result.unmatchedVisualRegionIds, ['region:legacy-provider']);
});


test('WP10d reconciliation keeps one-to-one identity for overlapping faces', async () => {
    const { reconcileFaceDetections } = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const priorRegions = [
        prior('region:overlap-left', { x: 0.1, y: 0.2, width: 0.4, height: 0.3 }),
        prior('region:overlap-right', { x: 0.35, y: 0.2, width: 0.4, height: 0.3 }),
    ];
    const detections = [
        current('current-right', { x: 0.36, y: 0.2, width: 0.4, height: 0.3 }),
        current('current-left', { x: 0.11, y: 0.2, width: 0.4, height: 0.3 }),
    ];

    const result = reconcileFaceDetections(policy(), priorRegions, detections);

    assert.deepEqual(result.matches.map(({ detectionId, visualRegionId }) => ({ detectionId, visualRegionId })), [
        { detectionId: 'current-left', visualRegionId: 'region:overlap-left' },
        { detectionId: 'current-right', visualRegionId: 'region:overlap-right' },
    ]);
    assert.deepEqual(result.ambiguousDetectionIds, []);
    assert.deepEqual(result.ambiguousVisualRegionIds, []);
});

test('WP10d landmark evidence prevents swapped similar faces from exchanging stable identity', async () => {
    const { reconcileFaceDetections } = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const box = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
    const upperLandmarks = [{ x: 0.25, y: 0.3 }, { x: 0.35, y: 0.3 }];
    const lowerLandmarks = [{ x: 0.25, y: 0.4 }, { x: 0.35, y: 0.4 }];
    const priorRegions = [
        prior('region:upper', box, upperLandmarks),
        prior('region:lower', box, lowerLandmarks),
    ];
    const detections = [
        current('swapped-first', box, lowerLandmarks),
        current('swapped-second', box, upperLandmarks),
    ];

    const result = reconcileFaceDetections(
        policy({ landmarkWeight: 0.5 }),
        priorRegions,
        detections,
    );

    assert.deepEqual(result.matches.map(({ detectionId, visualRegionId }) => ({ detectionId, visualRegionId })), [
        { detectionId: 'swapped-first', visualRegionId: 'region:lower' },
        { detectionId: 'swapped-second', visualRegionId: 'region:upper' },
    ]);
    assert.deepEqual(result.ambiguousDetectionIds, []);
});

test('WP10d geometry drift preserves a clear match while added and removed detections stay unmatched', async () => {
    const { reconcileFaceDetections } = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const priorRegions = [
        prior('region:keep', { x: 0.2, y: 0.2, width: 0.25, height: 0.25 }),
        prior('region:removed', { x: 0.65, y: 0.1, width: 0.2, height: 0.2 }),
    ];
    const detections = [
        current('drifted', { x: 0.23, y: 0.21, width: 0.25, height: 0.25 }),
        current('added', { x: 0.6, y: 0.65, width: 0.2, height: 0.2 }),
    ];

    const result = reconcileFaceDetections(policy(), priorRegions, detections);

    assert.deepEqual(result.matches.map(({ detectionId, visualRegionId }) => ({ detectionId, visualRegionId })), [
        { detectionId: 'drifted', visualRegionId: 'region:keep' },
    ]);
    assert.deepEqual(result.unmatchedDetectionIds, ['added']);
    assert.deepEqual(result.unmatchedVisualRegionIds, ['region:removed']);
});

test('WP10d model-version changes do not silently reuse stable identity', async () => {
    const { reconcileFaceDetections } = await import('../../dist/core/src/services/faces/faceReconciliation.js');
    const box = { x: 0.15, y: 0.15, width: 0.25, height: 0.25 };
    const priorRegions = [{
        visualRegionId: 'region:old-model',
        box,
        provider: SOURCE.provider,
        modelVersion: '0.9',
    }];

    const result = reconcileFaceDetections(policy(), priorRegions, [current('new-model-face', box)]);

    assert.deepEqual(result.matches, []);
    assert.deepEqual(result.unmatchedDetectionIds, ['new-model-face']);
    assert.deepEqual(result.unmatchedVisualRegionIds, ['region:old-model']);
});
