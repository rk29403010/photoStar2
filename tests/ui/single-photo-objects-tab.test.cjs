const test = require('node:test');
const assert = require('node:assert/strict');

test('single photo objects model exposes irregular segmentation polygons and excludes the frame mask', async () => {
    const { buildSinglePhotoPeopleModel } = await import('../../src/ui/components/single-photo/singlePhotoPeopleModel.ts');
    const model = buildSinglePhotoPeopleModel({
        id: 'asset-1',
        original_path: 'C:\\photos\\room.jpg',
        mask_metadata: {
            schemaVersion: 1,
            masks: [
                {
                    id: 'lamp',
                    label: 'Table lamp',
                    description: 'Image segmentation result',
                    kind: 'polygon',
                    points: [
                        { x: 0.1, y: 0.4 },
                        { x: 0.2, y: 0.3 },
                        { x: 0.3, y: 0.5 },
                        { x: 0.2, y: 0.6 },
                    ],
                    source: { moduleId: 'runtime.segment_objects', referenceId: 'lamp' },
                },
                {
                    id: 'photo-content',
                    label: 'Detected photo area',
                    description: 'Frame segmentation result',
                    kind: 'polygon',
                    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
                    source: { moduleId: 'runtime.detect_frame', referenceId: 'photo-content' },
                },
            ],
        },
    });

    assert.deepEqual(model.segmentedObjects.map((item) => item.label), ['Table lamp']);
    assert.equal(model.segmentedObjects[0].points.length, 4);
    assert.deepEqual(model.segmentedObjects[0].box, { x: 0.1, y: 0.3, w: 0.2, h: 0.3 });
});

test('single photo overlays follow the selected People or Objects tab', async () => {
    const { getVisibleSinglePhotoOverlayItems } = await import('../../src/ui/components/single-photo/singlePhotoPeopleModel.ts');
    const asset = {
        id: 'asset-2',
        original_path: 'C:\\photos\\portrait.jpg',
        faces: [{ box: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 } }],
        photo_metadata: {
            projection: {
                regionsOfInterest: [{ label: 'Tie', bounding_box: { x: 0.4, y: 0.5, width: 0.1, height: 0.2 } }],
            },
        },
        mask_metadata: {
            schemaVersion: 1,
            masks: [{
                id: 'jacket',
                label: 'Jacket',
                description: 'Image segmentation result',
                kind: 'polygon',
                points: [{ x: 0.1, y: 0.4 }, { x: 0.3, y: 0.4 }, { x: 0.3, y: 0.8 }],
                source: { moduleId: 'runtime.segment_objects', referenceId: 'jacket' },
            }],
        },
    };

    assert.deepEqual(getVisibleSinglePhotoOverlayItems(asset, 'people').map((item) => item.label), ['Unknown person']);
    assert.deepEqual(getVisibleSinglePhotoOverlayItems(asset, 'objects').map((item) => item.label), ['Tie', 'Jacket']);
    assert.deepEqual(getVisibleSinglePhotoOverlayItems(asset, null), []);
});
