const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

test('rendered photo edits inherit Photograph provenance without inheriting physical Artefact identity', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-edit-semantic-'));
    const sourcePath = path.join(tempDir, 'source.png');
    await sharp({ create: { width: 64, height: 48, channels: 3, background: '#806040' } }).png().toFile(sourcePath);

    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const representations = await import('../../dist/core/src/services/relationships/archiveRepresentationRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    let response;

    try {
        const db = dbManager.getDb();
        db.prepare('INSERT INTO assets (id, original_path, width, height) VALUES (?, ?, 64, 48)')
            .run('source', sourcePath);

        const photograph = semantic.ensureSemanticEntity(db, {
            kind: 'photograph',
            nativeId: 'family-garden-photo',
        });
        const artefact = semantic.ensureSemanticEntity(db, {
            kind: 'artefact',
            nativeId: 'original-print',
        });
        const sourcePhotographRepresentation = representations.ensureArchiveRepresentation(db, {
            assetId: 'source',
            subjectEntityId: photograph,
            representationKind: 'scan',
            facet: 'front',
            sourceKind: 'human',
            sourceRef: 'owner',
        });
        representations.ensureArchiveRepresentation(db, {
            assetId: 'source',
            subjectEntityId: artefact,
            representationKind: 'scan',
            facet: 'front',
            sourceKind: 'human',
            sourceRef: 'owner',
        });

        await handleSystemCommand({
            id: 'render-semantic-edit',
            command: 'render_photo_edit',
            payload: {
                id: 'edit-semantic-1',
                sourceAssetId: 'source',
                name: 'Restored',
                mode: 'new_version',
                masks: [],
                operations: [{
                    id: 'adjust-1',
                    tool: 'adjust',
                    name: 'Tune image',
                    enabled: true,
                    maskId: null,
                    values: { brightness: 1.1, contrast: 0.05, saturation: 1, hue: 0 },
                }],
            },
            dbManager,
            eventBus: { emit() {} },
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: (id, status, data, error) => { response = { id, status, data, error }; },
        });

        assert.equal(response.status, 'ok');
        const renderedAssetId = response.data.assetId;
        const renderedRepresentations = representations.getArchiveRepresentationsForAsset(db, renderedAssetId);
        assert.equal(renderedRepresentations.length, 1);
        assert.equal(renderedRepresentations[0].subjectEntityId, photograph);
        assert.equal(renderedRepresentations[0].subjectKind, 'photograph');
        assert.equal(renderedRepresentations[0].representationKind, 'derived_edit');
        assert.equal(renderedRepresentations[0].facet, 'front');
        assert.equal(renderedRepresentations[0].sourceKind, 'system');
        assert.equal(renderedRepresentations[0].sourceRef, 'photo-edit:edit-semantic-1');
        assert.equal(renderedRepresentations[0].derivedFromRepresentationId, sourcePhotographRepresentation.id);

        const artefactRepresentations = representations.getArchiveRepresentationsForSubject(db, artefact);
        assert.deepEqual(artefactRepresentations.map((item) => item.currentAssetId), ['source']);

        const group = db.prepare("SELECT * FROM asset_groups WHERE type = 'edit_version'").get();
        assert.equal(group.status, 'locked');
        assert.equal(group.canonical_asset_id, renderedAssetId);
        assert.deepEqual(
            db.prepare('SELECT asset_id, role FROM asset_group_members WHERE group_id = ? ORDER BY role').all(group.id),
            [{ asset_id: renderedAssetId, role: 'canonical' }, { asset_id: 'source', role: 'original' }],
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
