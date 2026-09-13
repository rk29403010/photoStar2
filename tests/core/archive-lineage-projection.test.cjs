const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-archive-lineage-'));
}

function seedAsset(db, id, originalPath) {
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height)
        VALUES (?, ?, ?, 1000, 1000, 800)
    `).run(id, originalPath, `hash-${id}`);
}

test('archive lineage expands only already-resolved Photograph and Artefact subjects', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const representations = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const lineageProjection = await import('../../dist/core/src/services/relationships/archiveLineageProjection.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db, 'front-scan', 'C:/archive/front.tif');
        seedAsset(db, 'reverse-scan', 'C:/archive/reverse.tif');
        seedAsset(db, 'restored-front', 'C:/archive/front-restored.jpg');
        seedAsset(db, 'unrelated', 'C:/archive/unrelated.jpg');

        const photograph = semantic.ensureSemanticEntity(db, {
            kind: 'photograph',
            nativeId: 'photo-family-garden',
            label: 'Family in the garden',
        });
        const artefact = semantic.ensureSemanticEntity(db, {
            kind: 'artefact',
            nativeId: 'print-001',
            label: 'Original photographic print',
        });

        const frontPhotograph = representations.ensureArchiveRepresentation(db, {
            assetId: 'front-scan',
            subjectEntityId: photograph,
            representationKind: 'scan',
            facet: 'front',
            sourceKind: 'human',
            sourceRef: 'owner-confirmed',
        });
        representations.ensureArchiveRepresentation(db, {
            assetId: 'front-scan',
            subjectEntityId: artefact,
            representationKind: 'scan',
            facet: 'front',
            sourceKind: 'human',
            sourceRef: 'owner-confirmed',
        });
        representations.ensureArchiveRepresentation(db, {
            assetId: 'reverse-scan',
            subjectEntityId: artefact,
            representationKind: 'scan',
            facet: 'reverse',
            sourceKind: 'human',
            sourceRef: 'owner-confirmed',
        });
        const restored = representations.ensureArchiveRepresentation(db, {
            assetId: 'restored-front',
            subjectEntityId: photograph,
            representationKind: 'derived_edit',
            facet: 'front',
            sourceKind: 'system',
            sourceRef: 'photo-edit:edit-1',
            derivedFromRepresentationId: frontPhotograph.id,
        });

        const frontLineage = lineageProjection.buildArchiveLineageForAsset(db, 'front-scan');
        assert.equal(frontLineage.assetId, 'front-scan');
        assert.deepEqual(frontLineage.subjects.map((subject) => [subject.kind, subject.label]), [
            ['photograph', 'Family in the garden'],
            ['artefact', 'Original photographic print'],
        ]);
        assert.deepEqual(
            frontLineage.subjects[0].representations.map((representation) => [
                representation.currentAssetId,
                representation.representationKind,
                representation.isCurrentAsset,
            ]),
            [
                ['front-scan', 'scan', true],
                ['restored-front', 'derived_edit', false],
            ],
        );
        assert.deepEqual(
            frontLineage.subjects[1].representations.map((representation) => [
                representation.currentAssetId,
                representation.facet,
                representation.isCurrentAsset,
            ]),
            [
                ['front-scan', 'front', true],
                ['reverse-scan', 'reverse', false],
            ],
        );

        const editLineage = lineageProjection.buildArchiveLineageForAsset(db, 'restored-front');
        assert.equal(editLineage.subjects.length, 1);
        assert.equal(editLineage.subjects[0].kind, 'photograph');
        const currentEdit = editLineage.subjects[0].representations.find((representation) => representation.id === restored.id);
        assert.equal(currentEdit.isCurrentAsset, true);
        assert.equal(currentEdit.derivedFromRepresentationId, frontPhotograph.id);
        assert.equal(editLineage.subjects.some((subject) => subject.kind === 'artefact'), false);

        assert.deepEqual(lineageProjection.buildArchiveLineageForAsset(db, 'unrelated'), {
            assetId: 'unrelated',
            subjects: [],
        });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
