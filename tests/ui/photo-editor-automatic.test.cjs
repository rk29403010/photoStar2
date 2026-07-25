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

test('photo suggestions omit Tune Image auto-improve and retain crop and portrait focus', async () => {
    const { buildPhotoAutomaticSuggestions } = await import('../../src/ui/components/photo-editor/photoAutomatic.ts');
    const suggestions = buildPhotoAutomaticSuggestions({
        id: 'asset-1',
        original_path: '/photo.jpg',
        frame_detection: { type: 'rectangle', box: { x: 0.05, y: 0.06, width: 0.9, height: 0.88 } },
        faces: [{ box: { x: 0.3, y: 0.2, width: 0.2, height: 0.3 } }],
    }, analysis());

    assert.deepEqual(suggestions.map((item) => item.tool), ['crop', 'focus']);
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

test('automatic host collects registered providers deterministically and contains one failing provider', async () => {
    const { buildPhotoAutomaticSuggestions } = await import('../../src/ui/components/photo-editor/photoAutomatic.ts');
    const providers = [
        { id: 'no_suggestion', recipeVersion: 1, label: 'None', icon: 'None', group: 'test', defaults: {} },
        { id: 'broken', recipeVersion: 1, label: 'Broken', icon: 'Broken', group: 'test', defaults: {}, suggest: () => { throw new Error('isolated'); } },
        { id: 'later', recipeVersion: 1, label: 'Later', icon: 'Later', group: 'test', defaults: {}, suggest: () => ({ id: 'later', label: 'Later', name: 'Later', rationale: '', confidence: 0.8, values: {}, order: 2 }) },
        { id: 'first', recipeVersion: 1, label: 'First', icon: 'First', group: 'test', defaults: {}, suggest: () => ({ id: 'first', label: 'First', name: 'First', rationale: '', confidence: 0.8, values: {}, order: 1 }) },
        { id: 'second-first', recipeVersion: 1, label: 'Second', icon: 'Second', group: 'test', defaults: {}, suggest: () => ({ id: 'second-first', label: 'Second', name: 'Second', rationale: '', confidence: 0.8, values: {}, order: 1 }) },
    ];
    const suggestions = buildPhotoAutomaticSuggestions(
        { id: 'asset-1', original_path: '/photo.jpg' },
        analysis(),
        true,
        providers,
    );

    assert.deepEqual(suggestions.map((suggestion) => suggestion.provider), ['first', 'second-first', 'later']);
});

test('automatic operations use provider defaults, migration, validation, and declared add/update policy', async () => {
    const { mergeAutomaticSuggestions } = await import('../../src/ui/components/photo-editor/photoAutomatic.ts');
    const provider = {
        id: 'provider-tool', recipeVersion: 3, label: 'Provider', icon: 'Provider', group: 'test',
        defaults: { baseline: 1, enabledByDefault: true },
        migrateOperation: (operation, fromVersion) => ({ ...operation, values: { ...operation.values, migratedFrom: fromVersion } }),
        validateOperation: (operation) => assert.equal(operation.values.baseline, 1),
    };
    const suggestions = [
        { id: 'update', provider: 'provider-tool', tool: 'provider-tool', name: 'Updated', label: 'Updated', rationale: '', confidence: 1, recipeVersion: 2, values: { strength: 4 } },
        { id: 'append', provider: 'provider-tool', tool: 'provider-tool', name: 'Appended', label: 'Appended', rationale: '', confidence: 1, operationPolicy: 'append', values: { strength: 6 } },
    ];
    const originalRandomUUID = globalThis.crypto.randomUUID;
    globalThis.crypto.randomUUID = () => 'automatic-id';
    try {
        const result = mergeAutomaticSuggestions([
            { id: 'existing', tool: 'provider-tool', name: 'Existing', enabled: true, maskId: null, values: { existing: 1 } },
        ], suggestions, [provider]);
        assert.equal(result.length, 2);
        assert.deepEqual(result[0].values, { existing: 1, baseline: 1, enabledByDefault: true, strength: 4, migratedFrom: 2 });
        assert.equal(result[1].id, 'automatic-id');
        assert.equal(result[1].values.baseline, 1);
    } finally {
        globalThis.crypto.randomUUID = originalRandomUUID;
    }
});

test('automatic suggestion host has no individual photo-tool branches', () => {
    const fs = require('node:fs');
    const source = fs.readFileSync('src/ui/components/photo-editor/photoAutomatic.ts', 'utf8');
    assert.doesNotMatch(source, /['"](?:crop|rotate|focus)['"]/);
});
