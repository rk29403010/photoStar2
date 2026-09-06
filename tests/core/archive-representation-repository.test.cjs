const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-archive-representations-'));
}

function seedAsset(db, id, filePath) {
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height)
        VALUES (?, ?, ?, 1000, 1000, 800)
    `).run(id, filePath, `hash-${id}`);
}

test('archive representations separate files from photographs and physical artefacts', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const representations = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db, 'front-scan', 'C:/archive/photo-front.tif');
        seedAsset(db, 'reverse-scan', 'C:/archive/photo-reverse.tif');
        seedAsset(db, 'restored-front', 'C:/archive/photo-front-restored.tif');

        const photograph = semantic.ensureSemanticEntity(db, {
            kind: 'photograph',
            nativeId: 'photo-1948-family-garden',
            label: 'Family in garden, c. 1948',
        });
        const artefact = semantic.ensureSemanticEntity(db, {
            kind: 'artefact',
            nativeId: 'print-001',
            label: 'Original photographic print',
        });

        const frontPhotoRepresentation = representations.ensureArchiveRepresentation(db, {
            assetId: 'front-scan',
            subjectEntityId: photograph,
            representationKind: 'scan',
            facet: 'front',
            sourceKind: 'human',
            sourceRef: 'owner-confirmed',
        });
        const repeatedFrontPhotoRepresentation = representations.ensureArchiveRepresentation(db, {
            assetId: 'front-scan',
            subjectEntityId: photograph,
            representationKind: 'scan',
            facet: 'front',
            sourceKind: 'import',
            sourceRef: 'later-import',
        });
        assert.equal(repeatedFrontPhotoRepresentation.id, frontPhotoRepresentation.id);
        assert.equal(repeatedFrontPhotoRepresentation.sourceKind, 'human');
        assert.equal(repeatedFrontPhotoRepresentation.sourceRef, 'owner-confirmed');

        const frontArtefactRepresentation = representations.ensureArchiveRepresentation(db, {
            assetId: 'front-scan',
            subjectEntityId: artefact,
            representationKind: 'scan',
            facet: 'front',
            sourceKind: 'human',
        });
        const reverseArtefactRepresentation = representations.ensureArchiveRepresentation(db, {
            assetId: 'reverse-scan',
            subjectEntityId: artefact,
            representationKind: 'scan',
            facet: 'reverse',
            sourceKind: 'human',
        });
        const restoredRepresentation = representations.ensureArchiveRepresentation(db, {
            assetId: 'restored-front',
            subjectEntityId: photograph,
            representationKind: 'derived_edit',
            facet: 'front',
            sourceKind: 'system',
            sourceRef: 'photo-edit:edit-1',
            derivedFromRepresentationId: frontPhotoRepresentation.id,
        });

        assert.notEqual(frontPhotoRepresentation.id, frontArtefactRepresentation.id);
        assert.equal(reverseArtefactRepresentation.subjectEntityId, artefact);
        assert.equal(restoredRepresentation.derivedFromRepresentationId, frontPhotoRepresentation.id);

        const frontLinks = representations.getArchiveRepresentationsForAsset(db, 'front-scan');
        assert.equal(frontLinks.length, 2);
        assert.deepEqual(new Set(frontLinks.map((link) => link.subjectKind)), new Set(['photograph', 'artefact']));

        const artefactLinks = representations.getArchiveRepresentationsForSubject(db, artefact);
        assert.deepEqual(
            artefactLinks.map((link) => [link.assetId, link.facet]),
            [['front-scan', 'front'], ['reverse-scan', 'reverse']],
        );
        assert.equal(representations.getArchiveRepresentationsForSubject(db, photograph).length, 2);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('archive representations reject invalid subjects and missing derivation parents', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const representations = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db, 'scan', 'C:/archive/scan.tif');
        const person = semantic.ensureSemanticEntity(db, { kind: 'person', nativeId: 'person-1' });
        const photograph = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-1' });

        assert.throws(() => representations.ensureArchiveRepresentation(db, {
            assetId: 'scan',
            subjectEntityId: person,
            representationKind: 'scan',
            sourceKind: 'human',
        }), /photograph or artefact/);

        assert.throws(() => representations.ensureArchiveRepresentation(db, {
            assetId: 'scan',
            subjectEntityId: photograph,
            representationKind: 'derived_edit',
            sourceKind: 'system',
            derivedFromRepresentationId: 'representation:missing',
        }), /Unknown derived-from representation/);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('archive representation identity cannot silently change derivation parent', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const representations = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAsset(db, 'source-a', 'C:/archive/source-a.tif');
        seedAsset(db, 'source-b', 'C:/archive/source-b.tif');
        seedAsset(db, 'derived', 'C:/archive/derived.tif');
        const photograph = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'photo-1' });
        const sourceA = representations.ensureArchiveRepresentation(db, {
            assetId: 'source-a', subjectEntityId: photograph, representationKind: 'scan', sourceKind: 'system',
        });
        const sourceB = representations.ensureArchiveRepresentation(db, {
            assetId: 'source-b', subjectEntityId: photograph, representationKind: 'scan', sourceKind: 'system',
        });
        representations.ensureArchiveRepresentation(db, {
            assetId: 'derived',
            subjectEntityId: photograph,
            representationKind: 'derived_edit',
            sourceKind: 'system',
            derivedFromRepresentationId: sourceA.id,
        });

        assert.throws(() => representations.ensureArchiveRepresentation(db, {
            assetId: 'derived',
            subjectEntityId: photograph,
            representationKind: 'derived_edit',
            sourceKind: 'system',
            derivedFromRepresentationId: sourceB.id,
        }), /different derivation parent/);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
