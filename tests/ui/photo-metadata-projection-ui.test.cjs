const test = require('node:test');
const assert = require('node:assert/strict');

const BASE_ASSET = {
    id: 'asset-1',
    original_path: 'family/billy-1968.jpg',
    photo_created_at: '1945-05-08T12:00:00.000Z',
    photo_created_at_confidence: 0.66,
    caption: 'Legacy caption',
    ai_metadata: {
        caption: 'Legacy AI caption',
        description: 'Legacy AI description',
    },
    photo_date_estimate: {
        schema_version: 1,
        photoCreatedAt: '1945-05-08T12:00:00.000Z',
        range: {
            start: '1945-01-01T00:00:00.000Z',
            end: '1945-12-31T23:59:59.999Z',
        },
        confidence: {
            score: 0.66,
            reasons: ['high-value signals disagreed materially with the winning date'],
        },
        signals: [
            {
                source: 'embedded.exif.ModifyDate',
                origin: 'embedded',
                label: 'Embedded timestamp exif.ModifyDate',
                precision: 'exact',
                start: '2021-07-01T00:00:00.000Z',
                end: '2021-07-01T00:00:00.000Z',
                representativeAt: '2021-07-01T00:00:00.000Z',
                weight: 0.41,
            },
            {
                source: 'ai.estimated_date.year',
                origin: 'ai',
                label: 'AI year 1945',
                precision: 'year',
                start: '1945-01-01T00:00:00.000Z',
                end: '1945-12-31T23:59:59.999Z',
                representativeAt: '1945-07-02T11:59:59.999Z',
                weight: 0.64,
            },
        ],
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
};

function createAsset(overrides = {}) {
    return {
        ...structuredClone(BASE_ASSET),
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

test('photo date diagnostics expose confidence, range, and top signals for review', async () => {
    const { buildPhotoDateDiagnosticsSummary } = await import('../../src/ui/components/single-photo/info-panel/photoDateDiagnosticsModel.ts');

    const summary = buildPhotoDateDiagnosticsSummary(createAsset());

    assert.equal(summary.confidenceLabel, '66%');
    assert.equal(summary.rangeLabel, '1945-01-01 to 1945-12-31');
    assert.deepEqual(summary.reasons, ['high-value signals disagreed materially with the winning date']);
    assert.equal(summary.signals.length, 2);
    assert.equal(summary.signals[0].label, 'AI year 1945');
    assert.equal(summary.signals[0].weightLabel, '0.64');
    assert.equal(summary.signals[1].originLabel, 'Embedded');
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

    assert.equal(shouldRequestPhotoMetadataEvidence({ activeTab: 'file', asset: assetWithoutEvidence }), true);
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
        photo_date_estimate: undefined,
    });

    const merged = mergeAssetDetail(existingAsset, refreshedAsset);

    assert.ok(merged.photo_metadata?.evidence);
    assert.equal(merged.photo_metadata?.evidence?.manualAssertions.length, 3);
    assert.equal(merged.ai_metadata?.caption, 'Legacy AI caption');
    assert.equal(merged.photo_date_estimate?.photoCreatedAt, '1945-05-08T12:00:00.000Z');
});
