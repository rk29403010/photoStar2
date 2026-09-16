const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp14-edit-policy-'));
}

function seedAsset(db, id, originalPath) {
    db.prepare(`
        INSERT INTO assets (id, original_path, file_hash, file_size, width, height)
        VALUES (?, ?, ?, 1000, 1000, 800)
    `).run(id, originalPath, `hash-${id}`);
}

async function setupCase(intent) {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const representations = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const projection = await import('../../dist/core/src/services/relationships/photoEditRepresentationProjection.js');
    const dbManager = new DatabaseManager(tempDir);
    const db = dbManager.getDb();
    seedAsset(db, 'source', path.join(tempDir, 'source.jpg'));
    seedAsset(db, 'rendered', path.join(tempDir, `${intent}.jpg`));
    const photograph = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'historical-photo' });
    const sourceRepresentation = representations.ensureArchiveRepresentation(db, {
        assetId: 'source',
        subjectEntityId: photograph,
        representationKind: 'scan',
        sourceKind: 'human',
    });
    projection.projectPhotoEditRepresentations(db, {
        sourceAssetId: 'source',
        renderedAssetId: 'rendered',
        editId: `edit-${intent}`,
        photographIntent: intent,
    });
    return { tempDir, dbManager, db, photograph, sourceRepresentation, representations };
}

for (const intent of ['restoration', 'crop', 'ordinary_edit']) {
    test(`WP14c ${intent} preserves the source Photograph`, async () => {
        const state = await setupCase(intent);
        try {
            const rendered = state.representations.getArchiveRepresentationsForAsset(state.db, 'rendered');
            assert.equal(rendered.length, 1);
            assert.equal(rendered[0].subjectEntityId, state.photograph);
            assert.equal(rendered[0].representationKind, intent === 'crop' ? 'crop' : 'derived_edit');
            assert.equal(rendered[0].derivedFromRepresentationId, state.sourceRepresentation.id);
        } finally {
            state.dbManager.close();
            fs.rmSync(state.tempDir, { recursive: true, force: true });
        }
    });
}

test('WP14c deliberate authored composite creates a stable new Photograph boundary', async () => {
    const state = await setupCase('authored_composite');
    try {
        const rendered = state.representations.getArchiveRepresentationsForAsset(state.db, 'rendered');
        assert.equal(rendered.length, 1);
        assert.notEqual(rendered[0].subjectEntityId, state.photograph);
        assert.equal(rendered[0].subjectKind, 'photograph');
        assert.equal(rendered[0].subjectEntityId, 'photograph:photo-edit-composite:edit-authored_composite');
        assert.equal(rendered[0].derivedFromRepresentationId, state.sourceRepresentation.id);

        const photographCount = state.db.prepare(`
            SELECT COUNT(*) AS count FROM semantic_entities WHERE kind = 'photograph'
        `).get().count;
        assert.equal(photographCount, 2);
    } finally {
        state.dbManager.close();
        fs.rmSync(state.tempDir, { recursive: true, force: true });
    }
});

test('WP14c ordinary editor projection inherits Photograph through exact-copy membership', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const representations = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const projection = await import('../../dist/core/src/services/relationships/photoEditRepresentationProjection.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        seedAsset(db, 'canonical', path.join(tempDir, 'canonical.jpg'));
        seedAsset(db, 'source-copy', path.join(tempDir, 'copy.jpg'));
        seedAsset(db, 'rendered', path.join(tempDir, 'rendered.jpg'));
        db.prepare('UPDATE assets SET file_hash = ? WHERE id IN (?, ?)')
            .run('same-content', 'canonical', 'source-copy');
        const photograph = semantic.ensureSemanticEntity(db, { kind: 'photograph', nativeId: 'copy-photo' });
        const canonicalRepresentation = representations.ensureArchiveRepresentation(db, {
            assetId: 'canonical',
            subjectEntityId: photograph,
            representationKind: 'original',
            sourceKind: 'human',
        });

        projection.projectPhotoEditRepresentations(db, {
            sourceAssetId: 'source-copy',
            renderedAssetId: 'rendered',
            editId: 'edit-copy',
        });

        const rendered = representations.getArchiveRepresentationsForAsset(db, 'rendered');
        assert.equal(rendered.length, 1);
        assert.equal(rendered[0].subjectEntityId, photograph);
        assert.equal(rendered[0].derivedFromRepresentationId, canonicalRepresentation.id);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
