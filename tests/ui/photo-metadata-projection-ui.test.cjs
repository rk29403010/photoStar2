const test = require('node:test');
const assert = require('node:assert/strict');

function createAsset(overrides = {}) {
    return {
        id: 'asset-1',
        original_path: 'family/billy-1968.jpg',
        caption: 'Legacy caption',
        ai_metadata: {
            caption: 'Legacy AI caption',
            description: 'Legacy AI description',
        },
        photo_metadata: {
            projection: {
                assetId: 'asset-1',
                type: 'portrait',
                caption: 'Billy and Dad enjoying Christmas dinner',
                description: 'Billy sits beside his dad at the Christmas dinner table with crackers and candles visible in the background.',
                location: 'Blackpool',
                estimatedDate: {
                    most_likely_date: '1968-12-25',
                    min_date: '1968-12-01',
                    max_date: '1968-12-31',
                    display_label: 'late 1968',
                    rationale: 'Filename and holiday decorations align with Christmas 1968.',
                },
                keywords: ['family', 'christmas'],
                emotionalImpact: 'warm',
                quality: {
                    technical: 0.8,
                    lighting: 0.7,
                    composition: 0.75,
                    emotional: 0.9,
                    discard: false,
                },
                recommendedEnhancements: ['warmth boost'],
                authenticity: {
                    score: 0.95,
                    reasons: ['Family archive label matches filename.'],
                },
                subjects: [{
                    type: 'person',
                    label: 'Subject 1',
                    suggested_names: ['Billy'],
                    uniform: 'school blazer',
                    features: 'holding a paper crown',
                    dob_range: '1958-1959',
                }],
                regionsOfInterest: [],
            },
            provenance: {
                caption: { sourceKind: 'gemini_pro_refined', sourceId: 'block-pro-1' },
                description: { sourceKind: 'manual', sourceId: 'assertion-description-1' },
                location: { sourceKind: 'manual_user', sourceId: 'assertion-location-1' },
                estimatedDate: {
                    sourceKind: 'gemini_pro_refined',
                    sourceId: 'block-pro-1',
                    display_label: { sourceKind: 'manual', sourceId: 'assertion-date-1' },
                    most_likely_date: { sourceKind: 'gemini_pro_refined', sourceId: 'block-pro-1' },
                    min_date: { sourceKind: 'gemini_pro_refined', sourceId: 'block-pro-1' },
                    max_date: { sourceKind: 'gemini_pro_refined', sourceId: 'block-pro-1' },
                    rationale: { sourceKind: 'manual', sourceId: 'assertion-date-1' },
                },
                subjects: { sourceKind: 'manual', sourceId: 'assertion-subjects-1' },
            },
            evidence: {
                machineBlocks: [
                    { id: 'block-pro-1', source_kind: 'gemini_pro_refined' },
                ],
                manualAssertions: [
                    { id: 'assertion-description-1', field_path: 'description', user_id: 'father-in-law' },
                    { id: 'assertion-location-1', field_path: 'location', user_id: 'robin' },
                    { id: 'assertion-subjects-1', field_path: 'subjects', user_id: 'father-in-law' },
                ],
            },
        },
        ...overrides,
    };
}

test('projection-backed file and analysis panel models prefer resolved metadata and preserve caption vs description', async () => {
    const {
        buildPhotoMetadataFileSummary,
        buildPhotoMetadataAnalysisSummary,
    } = await import('../../src/ui/components/single-photo/info-panel/photoMetadataPanelModel.ts');

    const asset = createAsset();
    const fileSummary = buildPhotoMetadataFileSummary(asset);
    const analysisSummary = buildPhotoMetadataAnalysisSummary(asset);

    assert.equal(fileSummary.type, 'portrait');
    assert.equal(fileSummary.location, 'Blackpool');
    assert.equal(fileSummary.estimatedDateLabel, 'late 1968');
    assert.equal(fileSummary.caption, 'Billy and Dad enjoying Christmas dinner');
    assert.equal(fileSummary.captionSourceLabel, 'Pro refined');
    assert.equal(analysisSummary.caption, 'Billy and Dad enjoying Christmas dinner');
    assert.equal(analysisSummary.description, 'Billy sits beside his dad at the Christmas dinner table with crackers and candles visible in the background.');
    assert.equal(analysisSummary.descriptionSourceLabel, 'Manual · father-in-law');
});

test('projection-backed people panel model exposes richer resolved subject fields', async () => {
    const { buildPhotoMetadataPeopleSummary } = await import('../../src/ui/components/single-photo/info-panel/photoMetadataPanelModel.ts');

    const summary = buildPhotoMetadataPeopleSummary(createAsset());

    assert.equal(summary.subjects.length, 1);
    assert.deepEqual(summary.subjects[0].suggestedNames, ['Billy']);
    assert.equal(summary.subjects[0].uniform, 'school blazer');
    assert.equal(summary.subjects[0].features, 'holding a paper crown');
    assert.equal(summary.subjects[0].dobRange, '1958-1959');
    assert.equal(summary.subjects[0].sourceLabel, 'Manual · father-in-law');
});

test('raw evidence stays opt-in and is only requested for the raw tab when it is missing', async () => {
    const { shouldRequestPhotoMetadataEvidence } = await import('../../src/ui/components/single-photo/photoMetadataEvidenceModel.ts');

    const assetWithoutEvidence = createAsset({
        photo_metadata: {
            ...createAsset().photo_metadata,
            evidence: undefined,
        },
    });

    assert.equal(shouldRequestPhotoMetadataEvidence({ activeTab: 'file', asset: assetWithoutEvidence }), false);
    assert.equal(shouldRequestPhotoMetadataEvidence({ activeTab: 'analysis', asset: assetWithoutEvidence }), false);
    assert.equal(shouldRequestPhotoMetadataEvidence({ activeTab: 'json', asset: assetWithoutEvidence }), true);
    assert.equal(shouldRequestPhotoMetadataEvidence({ activeTab: 'json', asset: createAsset() }), false);
});

test('loaded evidence remains sticky across later projection-only asset detail refreshes', async () => {
    const { mergeAssetDetail } = await import('../../src/ui/hooks/assetDetailMerge.ts');

    const existingAsset = createAsset();
    const refreshedAsset = createAsset({
        photo_metadata: {
            ...createAsset().photo_metadata,
            evidence: undefined,
        },
        ai_metadata: undefined,
        embedded_metadata: undefined,
    });

    const merged = mergeAssetDetail(existingAsset, refreshedAsset);

    assert.ok(merged.photo_metadata?.evidence);
    assert.equal(merged.photo_metadata?.evidence?.manualAssertions.length, 3);
    assert.equal(merged.ai_metadata?.caption, 'Legacy AI caption');
});
