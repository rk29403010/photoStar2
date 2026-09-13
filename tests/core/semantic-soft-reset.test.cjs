const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-semantic-soft-reset-'));
}

function seedAsset(db, id, filePath) {
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height)
        VALUES (?, ?, ?, 1000, 1000, 800)
    `).run(id, filePath, `hash-${id}`);
}

test('soft reset preserves human semantic work and discards rebuildable machine-only state', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const representations = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        let db = dbManager.getDb();
        const sourcePath = 'C:/archive/source.tif';
        const cropPath = 'C:/archive/crop.tif';
        const disposablePath = 'C:/archive/disposable.tif';
        seedAsset(db, 'source-before-reset', sourcePath);
        seedAsset(db, 'crop-before-reset', cropPath);
        seedAsset(db, 'disposable-before-reset', disposablePath);

        const photograph = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-1' });
        const place = semantic.ensureSemanticEntity(db, { kind: 'place', nativeId: 'place-1' });
        const person = semantic.ensureSemanticEntity(db, { kind: 'person', nativeId: 'person-1' });

        const placeScope = 'photograph:photo-1:takenAt';
        const placeProposition = semantic.putSemanticProposition(db, {
            scopeKey: placeScope,
            subjectEntityId: photograph,
            predicate: 'takenAt',
            object: { type: 'entity', entityId: place },
        });
        const humanAttestation = semantic.addSemanticAttestation(db, {
            propositionId: placeProposition,
            stance: 'support',
            sourceKind: 'human',
            sourceRef: 'family:jean',
            rationale: 'Jean recognised the garden.',
            evidence: [{ kind: 'external_record', ref: { noteId: 'memory-1' }, label: 'Family memory' }],
        });
        semantic.addSemanticAttestation(db, {
            propositionId: placeProposition,
            stance: 'support',
            sourceKind: 'machine',
            sourceRef: 'place-model:1',
            confidence: 0.88,
        });
        const decisionId = semantic.recordSemanticDecision(db, {
            scopeKey: placeScope,
            status: 'accepted',
            propositionId: placeProposition,
            sourceKind: 'human',
            sourceRef: 'owner',
        });

        const machineOnlyProposition = semantic.putSemanticProposition(db, {
            scopeKey: 'photograph:photo-1:depicts',
            subjectEntityId: photograph,
            predicate: 'depicts',
            object: { type: 'entity', entityId: person },
        });
        semantic.addSemanticAttestation(db, {
            propositionId: machineOnlyProposition,
            stance: 'support',
            sourceKind: 'machine',
            sourceRef: 'arcface:1',
            confidence: 0.72,
        });

        const sourceRepresentation = representations.ensureArchiveRepresentation(db, {
            assetId: 'source-before-reset',
            subjectEntityId: photograph,
            representationKind: 'scan',
            facet: 'front',
            sourceKind: 'system',
            sourceRef: 'capture-import',
        });
        const humanCropRepresentation = representations.ensureArchiveRepresentation(db, {
            assetId: 'crop-before-reset',
            subjectEntityId: photograph,
            representationKind: 'crop',
            facet: 'front-detail',
            sourceKind: 'human',
            sourceRef: 'owner',
            derivedFromRepresentationId: sourceRepresentation.id,
        });
        representations.ensureArchiveRepresentation(db, {
            assetId: 'disposable-before-reset',
            subjectEntityId: photograph,
            representationKind: 'reference',
            sourceKind: 'system',
            sourceRef: 'temporary-analysis',
        });

        dbManager.resetPreservingManualData();
        db = dbManager.getDb();

        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM assets').get().count, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_entities').get().count, 3);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_propositions').get().count, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_attestations').get().count, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_evidence').get().count, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM semantic_decisions').get().count, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM archive_representations').get().count, 2);

        assert.equal(db.prepare('SELECT id FROM semantic_attestations').get().id, humanAttestation);
        assert.equal(db.prepare('SELECT id FROM semantic_decisions').get().id, decisionId);
        assert.equal(
            db.prepare('SELECT COUNT(*) AS count FROM semantic_propositions WHERE id = ?').get(machineOnlyProposition).count,
            0,
        );

        const detachedRepresentations = representations.getArchiveRepresentationsForSubject(db, photograph);
        assert.deepEqual(
            new Set(detachedRepresentations.map((representation) => representation.id)),
            new Set([sourceRepresentation.id, humanCropRepresentation.id]),
        );
        assert.ok(detachedRepresentations.every((representation) => representation.currentAssetId === null));

        seedAsset(db, 'source-after-reset', sourcePath);
        seedAsset(db, 'crop-after-reset', cropPath);
        const reattachedRepresentations = representations.getArchiveRepresentationsForSubject(db, photograph);
        const sourceAfter = reattachedRepresentations.find((representation) => representation.id === sourceRepresentation.id);
        const cropAfter = reattachedRepresentations.find((representation) => representation.id === humanCropRepresentation.id);
        assert.equal(sourceAfter.currentAssetId, 'source-after-reset');
        assert.equal(cropAfter.currentAssetId, 'crop-after-reset');
        assert.equal(cropAfter.derivedFromRepresentationId, sourceRepresentation.id);

        assert.deepEqual(semantic.resolveSemanticScope(db, placeScope), {
            scopeKey: placeScope,
            status: 'accepted',
            propositionId: placeProposition,
            candidatePropositionIds: [placeProposition],
            decisionId,
        });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('machine attestations cannot supersede human testimony or record decisions', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const photograph = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-1' });
        const place = semantic.ensureSemanticEntity(db, { kind: 'place', nativeId: 'place-1' });
        const proposition = semantic.putSemanticProposition(db, {
            scopeKey: 'photograph:photo-1:takenAt',
            subjectEntityId: photograph,
            predicate: 'takenAt',
            object: { type: 'entity', entityId: place },
        });
        const humanAttestation = semantic.addSemanticAttestation(db, {
            propositionId: proposition,
            stance: 'support',
            sourceKind: 'human',
            sourceRef: 'family:jean',
        });

        assert.throws(() => semantic.addSemanticAttestation(db, {
            propositionId: proposition,
            stance: 'oppose',
            sourceKind: 'machine',
            sourceRef: 'place-model:2',
            supersedesAttestationId: humanAttestation,
        }), /same source kind/);

        assert.throws(() => semantic.recordSemanticDecision(db, {
            scopeKey: 'photograph:photo-1:takenAt',
            status: 'accepted',
            propositionId: proposition,
            sourceKind: 'machine',
            sourceRef: 'place-model:2',
        }), /Machine sources cannot record semantic decisions/);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
