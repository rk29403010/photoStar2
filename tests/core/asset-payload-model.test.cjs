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
    });
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
        preview_path: 'photo-2.webp',
        faces_data: null,
        rec_data: null,
        ai_metadata_data: null,
        people_data: null,
        caption: null,
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
    });

    assert.equal(asset.group_id, 'group-burst');
    assert.equal(asset.group_role, 'canonical');
    assert.equal(asset.group_memberships.length, 2);
    assert.deepEqual(asset.group_memberships.map((membership) => membership.group_id), ['group-burst', 'group-variant']);
    assert.equal(asset.group_memberships[1].group_type, 'variant_set');
});
