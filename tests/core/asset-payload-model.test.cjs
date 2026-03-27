const test = require('node:test');
const assert = require('node:assert/strict');

const projectionAssetInput = {
    id: 'asset-1',
    original_path: 'photo.jpg',
    width: 100,
    height: 200,
    file_size: 1234,
    created_at: '2026-03-16T10:26:33.321Z',
    photo_created_at: '1944-06-01T12:34:56.000Z',
    photo_created_at_confidence: 0.82,
    exif_datetime: '1944-06-01T12:34:56.000Z',
    metadata_timestamp_source: 'exif.DateTimeOriginal',
    preview_path: 'photo.webp',
    faces_data: JSON.stringify({ faces: [{ box: [0.1, 0.2, 0.3, 0.4] }] }),
    rec_data: JSON.stringify({ embeddings: [true] }),
    ai_metadata_data: JSON.stringify({ caption: 'Caption text', tags: ['tag-1'] }),
    embedded_metadata_data: JSON.stringify({ embedded: { exif: { DateTimeOriginal: '1944:06:01 12:34:56' } } }),
    people_data: JSON.stringify([{ face_index: 0, person_id: 'person-1', name: 'Person 1' }]),
    caption: 'Billy and Dad enjoying Christmas dinner',
    description: 'A warm family Christmas dinner at the table.',
    location: 'Blackpool',
    estimated_date_most_likely: '1968-12-25',
    estimated_date_min: '1968-12-01',
    estimated_date_max: '1968-12-31',
    estimated_date_display_label: 'late 1968',
    estimated_date_rationale: 'Christmas dinner context and filename hints.',
    caption_source_kind: 'gemini_pro_refined',
    caption_source_id: 'block-pro-1',
    description_source_kind: 'manual_user',
    description_source_id: 'assertion-desc-1',
    location_source_kind: 'manual_user',
    location_source_id: 'assertion-loc-1',
    estimated_date_source_kind: 'gemini_pro_refined',
    estimated_date_source_id: 'block-pro-1',
    sensitivity_score: 5,
    sensitivity_status: 'safe',
    member_group_id: 'group-1',
    member_role: 'canonical',
    member_rank: -1,
    member_match_evidence: JSON.stringify({ kind: 'phash+dhash' }),
    stack_count: 4,
};

const projectionAssetExpectation = {
    id: 'asset-1',
    original_path: 'photo.jpg',
    width: 100,
    height: 200,
    file_size: 1234,
    created_at: '2026-03-16T10:26:33.321Z',
    photo_created_at: '1944-06-01T12:34:56.000Z',
    photo_created_at_confidence: 0.82,
    exif_datetime: '1944-06-01T12:34:56.000Z',
    metadata_timestamp_source: 'exif.DateTimeOriginal',
    preview_path: 'photo.webp',
    faces: [{ box: [0.1, 0.2, 0.3, 0.4], person_id: 'person-1', person_name: 'Person 1' }],
    face_embeddings: [true],
    photo_metadata: {
        projection: {
            assetId: 'asset-1',
            type: null,
            caption: 'Billy and Dad enjoying Christmas dinner',
            description: 'A warm family Christmas dinner at the table.',
            location: 'Blackpool',
            estimatedDate: {
                most_likely_date: '1968-12-25',
                min_date: '1968-12-01',
                max_date: '1968-12-31',
                display_label: 'late 1968',
                rationale: 'Christmas dinner context and filename hints.',
            },
            keywords: [],
            emotionalImpact: null,
            quality: {
                technical: null,
                lighting: null,
                composition: null,
                emotional: null,
                discard: null,
            },
            recommendedEnhancements: [],
            authenticity: {
                score: null,
                reasons: [],
            },
            subjects: [],
            regionsOfInterest: [],
        },
        provenance: {
            caption: { sourceKind: 'gemini_pro_refined', sourceId: 'block-pro-1' },
            description: { sourceKind: 'manual_user', sourceId: 'assertion-desc-1' },
            location: { sourceKind: 'manual_user', sourceId: 'assertion-loc-1' },
            estimatedDate: { sourceKind: 'gemini_pro_refined', sourceId: 'block-pro-1' },
        },
    },
    ai_metadata: undefined,
    embedded_metadata: undefined,
    caption: 'Billy and Dad enjoying Christmas dinner',
    sensitivity_score: 5,
    sensitivity_status: 'safe',
    group_id: 'group-1',
    group_role: 'canonical',
    stack_count: 4,
    role: 'canonical',
    rank: -1,
    match_evidence: { kind: 'phash+dhash' },
    group_memberships: [
        {
            group_id: 'group-1',
            group_role: 'canonical',
            stack_count: 4,
            role: 'canonical',
            rank: -1,
            match_evidence: { kind: 'phash+dhash' },
            group_type: null,
        },
    ],
};

test('toAssetPayload returns projection-backed metadata without machine evidence by default', async () => {
    const { toAssetPayload } = await import('../../src/services/handlers/assetPayloadModel.ts');
    assert.deepEqual(toAssetPayload(projectionAssetInput), projectionAssetExpectation);
});

test('toAssetPayload attaches machine evidence only when requested', async () => {
    const { toAssetPayload } = await import('../../src/services/handlers/assetPayloadModel.ts');

    const asset = toAssetPayload({
        ...projectionAssetInput,
        ai_metadata_data: JSON.stringify({ caption: 'Caption text', tags: ['tag-1'] }),
        embedded_metadata_data: JSON.stringify({
            embedded: {
                exif: { DateTimeOriginal: '1944:06:01 12:34:56' },
                xmp: { 'dc:date': '1944-06-01T00:00:00Z' },
            },
            derived: {
                capture_datetime: '1944-06-01T12:34:56.000Z',
                timestamp_source: 'exif.DateTimeOriginal',
            },
        }),
    }, { includeEvidence: true });

    assert.equal(asset.ai_metadata?.caption, 'Caption text');
    assert.deepEqual(asset.ai_metadata?.tags, ['tag-1']);
    assert.ok(asset.embedded_metadata);
    assert.equal(asset.photo_metadata.projection.caption, 'Billy and Dad enjoying Christmas dinner');
});

test('toAssetPayload preserves multiple group memberships while keeping primary group compatibility fields', async () => {
    const { toAssetPayload } = await import('../../src/services/handlers/assetPayloadModel.ts');

    const asset = toAssetPayload({
        id: 'asset-2',
        original_path: 'photo-2.jpg',
        width: 100,
        height: 200,
        file_size: 4321,
        created_at: '2026-03-18T10:26:33.321Z',
        photo_created_at: null,
        photo_created_at_confidence: null,
        exif_datetime: null,
        metadata_timestamp_source: null,
        preview_path: 'photo-2.webp',
        faces_data: null,
        rec_data: null,
        ai_metadata_data: null,
        embedded_metadata_data: JSON.stringify({
            embedded: {
                icc: { parse_status: 'unparsed', byte_length: 3 },
            },
            derived: {
                capture_datetime: null,
                timestamp_source: null,
            },
        }),
        people_data: null,
        caption: null,
        description: null,
        location: null,
        estimated_date_most_likely: null,
        estimated_date_min: null,
        estimated_date_max: null,
        estimated_date_display_label: null,
        estimated_date_rationale: null,
        caption_source_kind: null,
        caption_source_id: null,
        description_source_kind: null,
        description_source_id: null,
        location_source_kind: null,
        location_source_id: null,
        estimated_date_source_kind: null,
        estimated_date_source_id: null,
        sensitivity_score: null,
        sensitivity_status: null,
        member_group_id: 'group-burst',
        member_role: 'canonical',
        member_rank: -1,
        member_match_evidence: JSON.stringify({ kind: 'time' }),
        member_group_type: 'burst',
        stack_count: 2,
        group_memberships_json: JSON.stringify([
            {
                groupId: 'group-burst',
                groupRole: 'canonical',
                stackCount: 2,
                role: 'canonical',
                rank: -1,
                matchEvidence: { kind: 'time' },
                groupType: 'burst',
            },
            {
                groupId: 'group-variant',
                groupRole: 'member',
                stackCount: 5,
                role: 'member',
                rank: 3,
                matchEvidence: { kind: 'phash+dhash' },
                groupType: 'variant_set',
            },
        ]),
    }, { includeEvidence: true });

    assert.equal(asset.group_id, 'group-burst');
    assert.equal(asset.group_role, 'canonical');
    assert.equal(asset.photo_created_at, null);
    assert.equal(asset.photo_created_at_confidence, null);
    assert.equal(asset.metadata_timestamp_source, null);
    assert.deepEqual(asset.embedded_metadata?.embedded?.icc, { parse_status: 'unparsed', byte_length: 3 });
    assert.equal(asset.group_memberships.length, 2);
    assert.deepEqual(asset.group_memberships.map((membership) => membership.group_id), ['group-burst', 'group-variant']);
    assert.equal(asset.group_memberships[1].group_type, 'variant_set');
});
