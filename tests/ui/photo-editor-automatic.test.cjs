const assert = require('node:assert/strict');
const test = require('node:test');

function analysis(overrides = {}) {
    return {
        attentionCrop: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        clippedHighlights: 0,
        clippedShadows: 0,
        confidence: 0.8,
        globalMedian: 100,
        scene: 'portrait',
        straightenAngle: 0,
        straightenConfidence: 0,
        subjectMedian: 90,
        tune: {
            blackPoint: 6,
            brightness: 1.1,
            contrast: 0.08,
            highlights: -0.08,
            hue: 0,
            saturation: 1.05,
            shadows: 0.1,
            temperature: 0.04,
            tint: 0,
            whitePoint: 247,
        },
        ...overrides,
    };
}

test('automatic context consumes frame, face, subject, and scene metadata', async () => {
    const { automaticContextFromAsset } = await import('../../src/ui/components/photo-editor/photoAutomatic.ts');
    const context = automaticContextFromAsset({
        id: 'asset-1',
        original_path: '/photo.jpg',
        frame_detection: { type: 'rectangle', box: { x: 0.05, y: 0.06, width: 0.9, height: 0.88 } },
        faces: [{ box: { x: 0.3, y: 0.2, width: 0.2, height: 0.3 } }],
        photo_metadata: { projection: {
            type: 'portrait',
            subjects: [{ bounding_box: { x: 0.25, y: 0.15, width: 0.3, height: 0.6 } }],
            regionsOfInterest: [],
        } },
    });

    assert.deepEqual(context.frameBox, { x: 0.05, y: 0.06, width: 0.9, height: 0.88 });
    assert.equal(context.faceBoxes.length, 1);
    assert.equal(context.attentionBoxes.length, 1);
    assert.equal(context.sceneHint, 'portrait');
});

test('photo suggestions combine conservative corrections and portrait focus', async () => {
    const { buildPhotoAutomaticSuggestions } = await import('../../src/ui/components/photo-editor/photoAutomatic.ts');
    const suggestions = buildPhotoAutomaticSuggestions({
        id: 'asset-1',
        original_path: '/photo.jpg',
        frame_detection: { type: 'rectangle', box: { x: 0.05, y: 0.06, width: 0.9, height: 0.88 } },
        faces: [{ box: { x: 0.3, y: 0.2, width: 0.2, height: 0.3 } }],
    }, analysis());

    assert.deepEqual(suggestions.map((item) => item.tool), ['crop', 'adjust', 'focus']);
});

test('EXIF orientation never creates a second rotation suggestion', async () => {
    const { buildPhotoAutomaticSuggestions } = await import('../../src/ui/components/photo-editor/photoAutomatic.ts');
    const suggestions = buildPhotoAutomaticSuggestions({
        id: 'asset-1',
        original_path: '/photo.jpg',
        embedded_metadata: { file: { orientation: 6 } },
    }, analysis({ attentionCrop: null, straightenAngle: 0, straightenConfidence: 0 }));

    assert.equal(suggestions.some((item) => item.tool === 'rotate'), false);
});

test('semantic crop and face focus are suppressed after geometry-changing edits', async () => {
    const { buildPhotoAutomaticSuggestions } = await import('../../src/ui/components/photo-editor/photoAutomatic.ts');
    const suggestions = buildPhotoAutomaticSuggestions({
        id: 'asset-1',
        original_path: '/photo.jpg',
        frame_detection: { type: 'rectangle', box: { x: 0.05, y: 0.06, width: 0.9, height: 0.88 } },
        faces: [{ box: { x: 0.3, y: 0.2, width: 0.2, height: 0.3 } }],
    }, analysis({ attentionCrop: null }), false);

    assert.equal(suggestions.some((item) => item.tool === 'crop'), false);
    assert.equal(suggestions.some((item) => item.tool === 'focus'), false);
});

test('applying automatic suggestions updates matching tools and preserves unrelated operations', async () => {
    const originalRandomUUID = globalThis.crypto.randomUUID;
    globalThis.crypto.randomUUID = () => 'automatic-id';
    try {
        const { mergeAutomaticSuggestions } = await import('../../src/ui/components/photo-editor/photoAutomatic.ts');
        const existing = [
            { id: 'adjust-1', tool: 'adjust', name: 'Tune image', enabled: true, maskId: null, values: { brightness: 1 } },
            { id: 'effect-1', tool: 'effects', name: 'Effects', enabled: true, maskId: null, values: { effectType: 0 } },
        ];
        const suggestions = [
            { id: 'tune', tool: 'adjust', name: 'Automatic tune', label: 'Tune', rationale: '', confidence: 1, values: { brightness: 1.08 } },
            { id: 'crop', tool: 'crop', name: 'Smart crop', label: 'Crop', rationale: '', confidence: 1, values: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } },
        ];
        const output = mergeAutomaticSuggestions(existing, suggestions);

        assert.equal(output[0].id, 'adjust-1');
        assert.equal(output[0].values.brightness, 1.08);
        assert.equal(output[1], existing[1]);
        assert.equal(output[2].tool, 'crop');
        assert.equal(output[2].id, 'automatic-id');
    } finally {
        globalThis.crypto.randomUUID = originalRandomUUID;
    }
});
