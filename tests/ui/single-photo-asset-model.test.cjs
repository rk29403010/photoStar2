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

test('mergeSinglePhotoAssets preserves richer gallery metadata when orbit assets are sparse', async () => {
    const { mergeSinglePhotoAssets } = await import('../../src/ui/components/single-photo/singlePhotoAssetModel.ts');

    const merged = mergeSinglePhotoAssets(
        [{
            id: 'asset-1',
            original_path: 'one.jpg',
            group_id: 'group-1',
            group_role: 'member',
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
            group_id: 'group-1',
            group_role: 'member',
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
