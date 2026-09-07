const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-library-presentation-'));
}

function seedAssets(db) {
    const insert = db.prepare(`
        INSERT INTO assets (
            id, original_path, file_hash, file_size, width, height,
            photo_created_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const assets = [
        ['jpeg-copy', 'C:/photos/copy.jpg', 'same-content', 1200, 1200, 800, '2025-03-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z'],
        ['png-copy', 'C:/photos/copy.png', 'same-content', 2200, 1200, 800, '2025-03-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z'],
        ['small-copy', 'C:/photos/small.jpg', 'same-content', 600, 600, 400, '2025-03-01T00:00:00.000Z', '2025-03-01T00:00:00.000Z'],
        ['unique-new', 'C:/photos/unique-new.jpg', 'unique-new-content', 900, 900, 600, '2025-02-01T00:00:00.000Z', '2025-02-01T00:00:00.000Z'],
        ['unique-old', 'C:/photos/unique-old.jpg', null, 800, 800, 600, '2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.000Z'],
    ];
    for (const asset of assets) {
        insert.run(...asset);
    }
}

function seedRelationshipPresentationAssets(db) {
    const insert = db.prepare(`
        INSERT INTO assets (
            id, original_path, file_hash, file_size, width, height,
            photo_created_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const assets = [
        ['source', 'C:/photos/source.jpg', 'source-content', 1400, 1200, 800, '2025-06-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z'],
        ['source-copy', 'C:/photos/source-copy.jpg', 'source-content', 700, 600, 400, '2025-06-01T00:00:00.000Z', '2025-06-01T00:00:00.000Z'],
        ['edit-one', 'C:/photos/source-edit-1.jpg', 'edit-one-content', 1500, 1200, 800, '2025-06-02T00:00:00.000Z', '2025-06-02T00:00:00.000Z'],
        ['edit-two', 'C:/photos/source-edit-2.jpg', 'edit-two-content', 1600, 1200, 800, '2025-06-03T00:00:00.000Z', '2025-06-03T00:00:00.000Z'],
        ['independent-scan', 'C:/photos/independent-scan.jpg', 'independent-scan-content', 2100, 1400, 900, '2025-05-15T00:00:00.000Z', '2025-05-15T00:00:00.000Z'],
        ['exact-jpeg', 'C:/photos/exact-copy.jpg', 'exact-content', 1200, 1200, 800, '2025-05-01T00:00:00.000Z', '2025-05-01T00:00:00.000Z'],
        ['exact-png', 'C:/photos/exact-copy.png', 'exact-content', 2200, 1200, 800, '2025-05-01T00:00:00.000Z', '2025-05-01T00:00:00.000Z'],
        ['unique', 'C:/photos/unique.jpg', 'unique-content', 900, 900, 600, '2025-04-01T00:00:00.000Z', '2025-04-01T00:00:00.000Z'],
    ];
    for (const asset of assets) {
        insert.run(...asset);
    }
}

async function seedRelationshipSemantics(db) {
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const representations = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const photograph = semantic.ensureSemanticEntity(db, {
        kind: 'photograph',
        nativeId: 'relationship-presentation-photo',
    });
    const sourceRepresentation = representations.ensureArchiveRepresentation(db, {
        assetId: 'source',
        subjectEntityId: photograph,
        representationKind: 'scan',
        facet: 'front',
        sourceKind: 'human',
        sourceRef: 'owner',
    });
    const firstEditRepresentation = representations.ensureArchiveRepresentation(db, {
        assetId: 'edit-one',
        subjectEntityId: photograph,
        representationKind: 'derived_edit',
        facet: 'front',
        sourceKind: 'system',
        sourceRef: 'photo-edit:first',
        derivedFromRepresentationId: sourceRepresentation.id,
    });
    representations.ensureArchiveRepresentation(db, {
        assetId: 'edit-two',
        subjectEntityId: photograph,
        representationKind: 'derived_edit',
        facet: 'front',
        sourceKind: 'system',
        sourceRef: 'photo-edit:second',
        derivedFromRepresentationId: firstEditRepresentation.id,
    });
    representations.ensureArchiveRepresentation(db, {
        assetId: 'independent-scan',
        subjectEntityId: photograph,
        representationKind: 'scan',
        facet: 'front',
        sourceKind: 'human',
        sourceRef: 'owner:second-scan',
    });
}

test('exact-copy presentation collapses before pagination without persisted groups', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const presentation = await import('../../dist/core/src/services/relationships/libraryPresentationProjection.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedAssets(db);

        const firstPage = presentation.getExactCopyPresentationPage(db, { limit: 2, offset: 0 });
        const secondPage = presentation.getExactCopyPresentationPage(db, { limit: 2, offset: 2 });
        assert.equal(presentation.countExactCopyPresentationItems(db), 3);
        assert.deepEqual(firstPage.map((item) => item.representativeAssetId), ['png-copy', 'unique-new']);
        assert.deepEqual(secondPage.map((item) => item.representativeAssetId), ['unique-old']);
        assert.deepEqual(firstPage[0], {
            presentationKey: 'exact:same-content',
            representativeAssetId: 'png-copy',
            relationshipKind: 'exact_copy',
            stackCount: 3,
            assetIds: ['jpeg-copy', 'png-copy', 'small-copy'],
            originalPath: 'C:/photos/copy.png',
            photoCreatedAt: '2025-03-01T00:00:00.000Z',
            createdAt: '2025-03-01T00:00:00.000Z',
            previewPath: null,
        });
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('relationship presentation collapses edit lineage without collapsing an independent scan of the same Photograph', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const presentation = await import('../../dist/core/src/services/relationships/libraryPresentationProjection.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedRelationshipPresentationAssets(db);
        await seedRelationshipSemantics(db);

        const relationshipItems = presentation.getRelationshipPresentationPage(db, { limit: 20, offset: 0 });

        assert.equal(presentation.countRelationshipPresentationItems(db), 4);
        assert.deepEqual(
            relationshipItems.map((item) => item.representativeAssetId),
            ['edit-two', 'independent-scan', 'exact-png', 'unique'],
        );

        const editLineage = relationshipItems[0];
        assert.equal(editLineage.relationshipKind, 'edit_lineage');
        assert.equal(editLineage.stackCount, 4);
        assert.deepEqual(editLineage.assetIds, ['edit-one', 'edit-two', 'source', 'source-copy']);
        assert.match(editLineage.presentationKey, /^edit:representation:/);

        const independentScan = relationshipItems.find((item) => item.representativeAssetId === 'independent-scan');
        assert.ok(independentScan);
        assert.equal(independentScan.relationshipKind, null);
        assert.equal(independentScan.stackCount, 1);
        assert.deepEqual(independentScan.assetIds, ['independent-scan']);

        const exactCopies = relationshipItems.find((item) => item.relationshipKind === 'exact_copy');
        assert.ok(exactCopies);
        assert.equal(exactCopies.representativeAssetId, 'exact-png');
        assert.equal(exactCopies.stackCount, 2);
        assert.deepEqual(exactCopies.assetIds, ['exact-jpeg', 'exact-png']);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('capture-sequence presentation treats edit lineages and exact copies as moments rather than extra frames', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const capturePresentation = await import('../../dist/core/src/services/relationships/libraryCaptureSequencePresentationProjection.js');
    const captureSequences = await import('../../dist/core/src/services/relationships/captureSequenceRepository.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        seedRelationshipPresentationAssets(db);
        await seedRelationshipSemantics(db);

        captureSequences.replaceSystemCaptureSequenceProposals(db, {
            impactedAssetIds: ['source', 'source-copy', 'edit-two', 'exact-jpeg', 'exact-png'],
            sourceIdentity: 'test:capture-moments',
            sourceRef: 'test',
            algorithmVersion: '1',
            sequences: [{
                members: [
                    { assetId: 'source', capturedAt: '2025-01-01T10:00:00.000Z' },
                    { assetId: 'source-copy', capturedAt: '2025-01-01T10:00:00.000Z' },
                    { assetId: 'edit-two', capturedAt: '2025-01-01T10:00:00.000Z' },
                    { assetId: 'exact-jpeg', capturedAt: '2025-01-01T10:00:01.000Z' },
                    { assetId: 'exact-png', capturedAt: '2025-01-01T10:00:01.000Z' },
                ],
            }],
        });

        const items = capturePresentation.getCaptureSequencePresentationPage(db, { limit: 20, offset: 0 });
        assert.equal(capturePresentation.countCaptureSequencePresentationItems(db), 3);
        assert.deepEqual(
            items.map((item) => item.representativeAssetId),
            ['independent-scan', 'exact-png', 'unique'],
        );

        const sequence = items.find((item) => item.relationshipKind === 'capture_sequence');
        assert.ok(sequence);
        assert.equal(sequence.representativeAssetId, 'exact-png');
        assert.equal(sequence.momentCount, 2);
        assert.equal(sequence.stackCount, 6);
        assert.deepEqual(sequence.assetIds, [
            'edit-one',
            'edit-two',
            'exact-jpeg',
            'exact-png',
            'source',
            'source-copy',
        ]);
        assert.match(sequence.presentationKey, /^sequence:/);

        const independentScan = items.find((item) => item.representativeAssetId === 'independent-scan');
        assert.ok(independentScan);
        assert.equal(independentScan.relationshipKind, null);
        assert.equal(independentScan.momentCount, 1);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
