const test = require('node:test');
const assert = require('node:assert/strict');

test('toAssetPayload returns a consistent rich asset shape for grouped orbit members', async () => {
    const { toAssetPayload } = await import('../../src/services/handlers/assetPayloadModel.ts');

    const asset = toAssetPayload({
        id: 'asset-1',
        original_path: 'photo.jpg',
        width: 100,
        height: 200,
        file_size: 1234,
        created_at: '2026-03-16T10:26:33.321Z',
        preview_path: 'photo.webp',
        faces_data: JSON.stringify({ faces: [{ box: [0.1, 0.2, 0.3, 0.4] }] }),
        rec_data: JSON.stringify({ embeddings: [true] }),
        ai_metadata_data: JSON.stringify({ caption: 'Caption text', tags: ['tag-1'] }),
        people_data: JSON.stringify([{ face_index: 0, person_id: 'person-1', name: 'Person 1' }]),
        caption: null,
        sensitivity_score: 5,
        sensitivity_status: 'safe',
        member_group_id: 'group-1',
        member_role: 'canonical',
        member_rank: -1,
        member_match_evidence: JSON.stringify({ kind: 'phash+dhash' }),
        stack_count: 4,
    });

    assert.deepEqual(asset, {
        id: 'asset-1',
        original_path: 'photo.jpg',
        width: 100,
        height: 200,
        file_size: 1234,
        created_at: '2026-03-16T10:26:33.321Z',
        preview_path: 'photo.webp',
        faces: [{ box: [0.1, 0.2, 0.3, 0.4], person_id: 'person-1', person_name: 'Person 1' }],
        face_embeddings: [true],
        ai_metadata: { caption: 'Caption text', tags: ['tag-1'] },
        caption: 'Caption text',
        sensitivity_score: 5,
        sensitivity_status: 'safe',
        group_id: 'group-1',
        group_role: 'canonical',
        stack_count: 4,
        role: 'canonical',
        rank: -1,
        match_evidence: { kind: 'phash+dhash' },
    });
});
