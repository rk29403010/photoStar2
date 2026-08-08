const test = require('node:test');
const assert = require('node:assert/strict');

test('mask candidates expose every persisted analysed region', async () => {
    const { buildPhotoMaskCandidates } = await import('../../src/ui/components/photo-editor/maskCandidates.ts');
    const candidates = buildPhotoMaskCandidates({
        id: 'asset-1',
        original_path: 'photo.jpg',
        frame_detection: {
            type: 'polygon',
            points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.8, y: 0.9 }],
        },
        faces: [{ box: { x: 0.2, y: 0.2, width: 0.1, height: 0.15 }, person_name: 'Robin' }],
        photo_metadata: {
            projection: {
                subjects: [{ label: 'Child', bounding_box: { x: 0.3, y: 0.25, width: 0.3, height: 0.6 } }],
                regionsOfInterest: [{ label: 'Birthday cake', bounding_box: { x: 0.55, y: 0.6, width: 0.25, height: 0.2 } }],
            },
        },
    });

    assert.deepEqual(candidates.map((candidate) => candidate.mask.name), [
        'Detected photo area',
        'Outside detected photo',
        'Robin',
        'Child',
        'Birthday cake',
    ]);
    assert.equal(candidates[0].mask.kind, 'polygon');
    assert.equal(candidates[1].mask.inverted, true);
    assert.equal(candidates[2].mask.kind, 'ellipse');
    assert.equal(candidates[3].mask.kind, 'subject');
    assert.equal(candidates[4].mask.kind, 'element');
});

test('mask candidates support rectangle frame results and canonical bounding boxes', async () => {
    const { buildPhotoMaskCandidates, readNormalizedBox } = await import('../../src/ui/components/photo-editor/maskCandidates.ts');
    const frameBox = { x: 0.05, y: 0.1, width: 0.9, height: 0.8 };
    const candidates = buildPhotoMaskCandidates({ id: 'asset-2', original_path: 'photo.jpg', frame_detection: { type: 'rectangle', box: frameBox } });

    assert.deepEqual(candidates[0].mask.box, frameBox);
    assert.deepEqual(readNormalizedBox({ bounding_box: { x: -0.2, y: 0.8, width: 0.5, height: 0.5 } }), { x: 0, y: 0.8, width: 0.5, height: 0.2 });
    assert.equal(readNormalizedBox({ bounding_box: { x: 0.2, y: 0.2, width: 0, height: 0.2 } }), null);
});

test('mask candidates retain standardized metadata alongside legacy candidates', async () => {
    const { buildPhotoMaskCandidates } = await import('../../src/ui/components/photo-editor/maskCandidates.ts');
    const candidates = buildPhotoMaskCandidates({
        id: 'asset-3',
        original_path: 'photo.jpg',
        faces: [{ box: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 }, person_name: 'Legacy face' }],
        mask_metadata: {
            schemaVersion: 1,
            masks: [{
                id: 'face-0',
                label: 'Caroline',
                description: 'Locally segmented person',
                kind: 'raster',
                raster: { width: 2, height: 2, pngBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC' },
                source: { moduleId: 'runtime.detect_faces', referenceId: 'face-0' },
            }],
        },
    });

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].mask.name, 'Caroline');
    assert.equal(candidates[0].mask.kind, 'raster');
    assert.equal(candidates[0].mask.raster.width, 2);
    assert.equal(candidates[1].mask.name, 'Legacy face');
});
