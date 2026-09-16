const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-capture-sequence-'));
}

function seedAsset(db, id, exifDatetime) {
    db.prepare(`
        INSERT INTO assets (
            id, original_path, file_hash, file_size, width, height,
            exif_datetime, created_at
        )
        VALUES (?, ?, ?, 1000, 1200, 800, ?, ?)
    `).run(id, `C:/photos/${id}.jpg`, `${id}-hash`, exifDatetime, exifDatetime);
}

function unit(overrides) {
    return {
        unitId: overrides.unitId,
        sourceGroupId: overrides.sourceGroupId ?? null,
        representativeAssetId: overrides.representativeAssetId,
        memberAssetIds: overrides.memberAssetIds,
        originalPath: `C:/photos/${overrides.representativeAssetId}.jpg`,
        fileHash: `${overrides.representativeAssetId}-hash`,
        fileSize: 1000,
        width: 1200,
        height: 800,
        exifDatetime: overrides.exifDatetime,
        phash64: '0000000000000000',
        dhash64: '0000000000000000',
    };
}

test('burst graph projects to durable proposed CaptureSequence candidates with evidence and ordering', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const projection = await import('../../dist/core/src/services/workflowRuntime/modules/grouping/captureSequenceProjection.js');
    const repository = await import('../../dist/core/src/services/relationships/captureSequenceRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db, 'frame-a', '2026-01-01T10:00:00.000Z');
        seedAsset(db, 'frame-a-copy', '2026-01-01T10:00:00.200Z');
        seedAsset(db, 'frame-b', '2026-01-01T10:00:01.000Z');

        const firstUnit = unit({
            unitId: 'legacy-duplicate-unit',
            sourceGroupId: 'legacy-duplicate-group',
            representativeAssetId: 'frame-a',
            memberAssetIds: ['frame-a', 'frame-a-copy'],
            exifDatetime: '2026-01-01T10:00:00.000Z',
        });
        const secondUnit = unit({
            unitId: 'frame-b',
            representativeAssetId: 'frame-b',
            memberAssetIds: ['frame-b'],
            exifDatetime: '2026-01-01T10:00:01.000Z',
        });
        const graph = {
            units: [firstUnit, secondUnit],
            edges: [{
                leftId: 'frame-b',
                rightId: 'legacy-duplicate-unit',
                distance: 2,
                score: 1 - (2 / 64),
            }],
            components: [['legacy-duplicate-unit', 'frame-b']],
        };

        const insertedIds = projection.syncBurstCaptureSequenceProposals({
            db,
            changedAssetIds: ['frame-a', 'frame-a-copy', 'frame-b'],
            ...graph,
            maxSeconds: 3,
            maxDistance: 12,
        });
        assert.equal(insertedIds.length, 1);

        const sequences = repository.getCaptureSequencesForAsset(db, 'frame-a');
        assert.equal(sequences.length, 1);
        const sequence = sequences[0];
        assert.equal(sequence.status, 'proposed');
        assert.equal(sequence.sourceKind, 'system');
        assert.equal(sequence.sourceIdentity, 'runtime.group_similar_photos:burst');
        assert.equal(sequence.sourceRef, 'runtime.group_similar_photos@1');
        assert.equal(sequence.algorithmVersion, '1.0');
        assert.deepEqual(JSON.parse(sequence.paramsJson), {
            maxSeconds: 3,
            maxPerceptualHashDistance: 12,
        });
        assert.deepEqual(
            sequence.members.map((member) => member.currentAssetId),
            ['frame-a', 'frame-a-copy', 'frame-b'],
        );
        assert.deepEqual(
            sequence.members.map((member) => member.ordinal),
            [0, 1, 2],
        );
        assert.deepEqual(
            sequence.members.map((member) => member.status),
            ['candidate', 'candidate', 'candidate'],
        );
        assert.deepEqual(
            sequence.members.map((member) => member.capturedAt),
            [
                '2026-01-01T10:00:00.000Z',
                '2026-01-01T10:00:00.200Z',
                '2026-01-01T10:00:01.000Z',
            ],
        );

        const firstEvidence = JSON.parse(sequence.members[0].evidenceJson);
        assert.equal(firstEvidence.detectorUnitId, 'legacy-duplicate-unit');
        assert.deepEqual(firstEvidence.detectorUnitMemberAssetIds, ['frame-a', 'frame-a-copy']);
        assert.deepEqual(firstEvidence.incidentEdges, [{
            otherUnitId: 'frame-b',
            score: 1 - (2 / 64),
            perceptualHashDistance: 2,
            secondsApart: 1,
        }]);
        assert.deepEqual(JSON.parse(sequence.evidenceJson), {
            detector: 'burst_connected_component',
            detectorUnitIds: ['frame-b', 'legacy-duplicate-unit'],
            transitiveComponent: true,
        });

        const replacementIds = projection.syncBurstCaptureSequenceProposals({
            db,
            changedAssetIds: ['frame-a'],
            ...graph,
            maxSeconds: 3,
            maxDistance: 12,
        });
        assert.equal(replacementIds.length, 1);
        assert.notEqual(replacementIds[0], sequence.id);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM capture_sequences').get().count, 1);

        db.prepare("UPDATE capture_sequences SET status = 'accepted' WHERE id = ?")
            .run(replacementIds[0]);
        projection.syncBurstCaptureSequenceProposals({
            db,
            changedAssetIds: ['frame-a'],
            units: [],
            edges: [],
            components: [],
            maxSeconds: 3,
            maxDistance: 12,
        });
        const accepted = repository.getCaptureSequencesForAsset(db, 'frame-a');
        assert.equal(accepted.length, 1);
        assert.equal(accepted[0].status, 'accepted');
        assert.equal(accepted[0].id, replacementIds[0]);

        projection.syncBurstCaptureSequenceProposals({
            db,
            changedAssetIds: ['frame-a'],
            ...graph,
            maxSeconds: 3,
            maxDistance: 12,
        });
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM capture_sequences').get().count, 2);

        dbManager.resetPreservingManualData();
        const resetDb = dbManager.getDb();
        assert.equal(resetDb.prepare('SELECT COUNT(*) AS count FROM assets').get().count, 0);
        assert.equal(resetDb.prepare('SELECT COUNT(*) AS count FROM capture_sequences').get().count, 1);
        assert.equal(resetDb.prepare("SELECT status FROM capture_sequences").get().status, 'accepted');
        assert.equal(resetDb.prepare('SELECT COUNT(*) AS count FROM capture_sequence_members').get().count, 3);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
