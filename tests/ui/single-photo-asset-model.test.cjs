const test = require('node:test');
const assert = require('node:assert/strict');

function createProjection(params = {}) {
    const defaults = {
        type: null,
        caption: null,
        description: null,
        location: null,
        estimatedDateLabel: null,
        keywords: [],
        emotionalImpact: null,
        subjects: [],
        regionsOfInterest: [],
    };
    const next = { ...defaults, ...params };

    return {
        assetId: 'asset-1',
        type: next.type,
        caption: next.caption,
        description: next.description,
        location: next.location,
        estimatedDate: {
            most_likely_date: null,
            min_date: null,
            max_date: null,
            display_label: next.estimatedDateLabel,
            rationale: null,
        },
        keywords: next.keywords,
        emotionalImpact: next.emotionalImpact,
        quality: { technical: null, lighting: null, composition: null, emotional: null, discard: false },
        recommendedEnhancements: [],
        authenticity: { score: null, reasons: [] },
        subjects: next.subjects,
        regionsOfInterest: next.regionsOfInterest,
    };
}

test('mergeSinglePhotoAssets preserves richer gallery metadata when expanded assets are sparse', async () => {
    const { mergeSinglePhotoAssets } = await import('../../src/ui/components/single-photo/singlePhotoAssetModel.ts');

    const merged = mergeSinglePhotoAssets(
        [{
            id: 'asset-1',
            original_path: 'one.jpg',
            ai_metadata: { caption: 'Rich AI caption' },
            photo_metadata: {
                projection: createProjection({
                    type: 'portrait',
                    caption: 'Rich gallery caption',
                    description: 'Detailed gallery description',
                    location: 'Blackpool',
                    estimatedDateLabel: 'late 1968',
                    keywords: ['family'],
                    emotionalImpact: 'warm',
                    subjects: [{ label: 'Billy' }],
                    regionsOfInterest: [{ label: 'Face' }],
                }),
                provenance: {
                    caption: { sourceKind: 'manual_user', sourceId: 'caption-1' },
                },
            },
        }],
        [{
            id: 'asset-1',
            original_path: 'one.jpg',
            photo_metadata: {
                projection: createProjection(),
                provenance: {},
            },
        }],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0].photo_metadata?.projection.caption, 'Rich gallery caption');
    assert.equal(merged[0].photo_metadata?.projection.type, 'portrait');
    assert.equal(merged[0].photo_metadata?.projection.location, 'Blackpool');
    assert.equal(merged[0].photo_metadata?.projection.estimatedDate.display_label, 'late 1968');
    assert.deepEqual(merged[0].photo_metadata?.projection.keywords, ['family']);
    assert.equal(merged[0].ai_metadata?.caption, 'Rich AI caption');
});

test('mergeSinglePhotoAssets keeps refreshed gallery metadata when expanded copies are stale', async () => {
    const { mergeSinglePhotoAssets } = await import('../../src/ui/components/single-photo/singlePhotoAssetModel.ts');

    const merged = mergeSinglePhotoAssets(
        [{
            id: 'asset-1',
            original_path: 'one.jpg',
            ai_metadata: {
                caption: 'Enhanced caption',
                _analysis_tier: 'pro',
                keywords: ['enhanced', 'portrait'],
            },
            photo_metadata: {
                projection: createProjection({
                    caption: 'Enhanced gallery caption',
                    description: 'Fresh projection description',
                    keywords: ['enhanced', 'portrait'],
                }),
                provenance: {
                    caption: { sourceKind: 'manual_user', sourceId: 'caption-2' },
                },
            },
        }],
        [{
            id: 'asset-1',
            original_path: 'one.jpg',
            ai_metadata: {
                caption: 'Stale caption',
                _analysis_tier: 'flash',
                keywords: ['stale'],
            },
            photo_metadata: {
                projection: createProjection({
                    caption: 'Stale projection caption',
                    description: null,
                    keywords: [],
                }),
                provenance: {},
            },
        }],
    );

    assert.equal(merged.length, 1);
    assert.equal(merged[0].ai_metadata?.caption, 'Enhanced caption');
    assert.equal(merged[0].ai_metadata?._analysis_tier, 'pro');
    assert.deepEqual(merged[0].ai_metadata?.keywords, ['enhanced', 'portrait']);
    assert.equal(merged[0].photo_metadata?.projection.caption, 'Enhanced gallery caption');
    assert.equal(merged[0].photo_metadata?.projection.description, 'Fresh projection description');
});

test('isLibrarySelectionAnchorAsset excludes expansion-only assets from replacing the library anchor', async () => {
    const { isLibrarySelectionAnchorAsset } = await import('../../src/ui/components/single-photo/singlePhotoAssetModel.ts');

    const libraryAssets = [
        { id: 'asset-1', original_path: 'one.jpg' },
        { id: 'asset-2', original_path: 'two.jpg' },
    ];

    assert.equal(isLibrarySelectionAnchorAsset(libraryAssets, 'asset-1'), true);
    assert.equal(isLibrarySelectionAnchorAsset(libraryAssets, 'expanded-member'), false);
    assert.equal(isLibrarySelectionAnchorAsset(libraryAssets, undefined), false);
});

test('single-photo asset indexes resolve presentation expansion members without group state', async () => {
    const { mergeSinglePhotoAssets, resolveSinglePhotoAssetIndex } = await import('../../src/ui/components/single-photo/singlePhotoAssetModel.ts');

    const merged = mergeSinglePhotoAssets(
        [{ id: 'representative', original_path: 'representative.jpg' }],
        [
            { id: 'member', original_path: 'member.jpg' },
            { id: 'member', original_path: 'member-better.jpg', preview_path: 'member.webp' },
        ],
    );

    assert.deepEqual(merged.map((asset) => asset.id), ['representative', 'member']);
    assert.equal(merged[1].original_path, 'member-better.jpg');
    assert.equal(merged[1].preview_path, 'member.webp');
    assert.equal(resolveSinglePhotoAssetIndex(merged, 'member'), 1);
    assert.equal(resolveSinglePhotoAssetIndex(merged, 'missing'), -1);
});
