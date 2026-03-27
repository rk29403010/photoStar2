const test = require('node:test');
const assert = require('node:assert/strict');

function buildBaseRow() {
    return {
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
}

test('toAssetPayload returns projection-backed metadata without machine evidence by default', async () => {
    const { toAssetPayload } = await import('../../src/services/handlers/assetPayloadModel.ts');
    const asset = toAssetPayload(buildBaseRow());

    assert.equal(asset.caption, 'Billy and Dad enjoying Christmas dinner');
    assert.equal(asset.ai_metadata, undefined);
    assert.equal(asset.embedded_metadata, undefined);
    assert.equal(asset.photo_metadata.projection.caption, 'Billy and Dad enjoying Christmas dinner');
    assert.equal(asset.photo_metadata.projection.description, 'A warm family Christmas dinner at the table.');
    assert.equal(asset.photo_metadata.projection.location, 'Blackpool');
    assert.equal(asset.photo_metadata.projection.estimatedDate.display_label, 'late 1968');
    assert.equal(asset.photo_metadata.provenance.caption.sourceKind, 'gemini_pro_refined');
});

test('toAssetPayload attaches machine evidence only when requested', async () => {
    const { toAssetPayload } = await import('../../src/services/handlers/assetPayloadModel.ts');
    const asset = toAssetPayload(buildBaseRow(), { includeEvidence: true });

    assert.equal(asset.ai_metadata?.caption, 'Caption text');
    assert.deepEqual(asset.ai_metadata?.tags, ['tag-1']);
    assert.ok(asset.embedded_metadata);
    assert.equal(asset.embedded_metadata?.embedded?.exif?.DateTimeOriginal, '1944:06:01 12:34:56');
});

