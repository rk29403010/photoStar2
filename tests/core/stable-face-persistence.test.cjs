const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('stable face persistence keeps semantic identity, append-only geometry and analysis-mask linkage', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-stable-face-'));
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const {
        appendVisualRegionGeometryGeneration,
        createStableFaceDetection,
    } = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const { saveAssetMaskMetadata } = await import('../../dist/core/src/services/photoEditing/assetMaskMetadata.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset-1', 'C:/photos/portrait.jpg')").run();

        const stableFace = createStableFaceDetection(db, {
            assetId: 'asset-1',
            sourceAnalysisGenerationId: 'analysis-generation-1',
            box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
            sourceWidth: 2400,
            sourceHeight: 3600,
            sourceOrientation: 6,
            sourceModuleId: 'runtime.detect_faces',
            provider: 'onnx_retina_10g',
            modelVersion: '1.0',
        });

        assert.match(stableFace.visualRegionId, /^region:/);
        assert.match(stableFace.faceId, /^face:/);

        const semanticRows = db.prepare(`
            SELECT id, kind
            FROM semantic_entities
            WHERE id IN (?, ?)
            ORDER BY kind ASC
        `).all(stableFace.visualRegionId, stableFace.faceId);
        assert.deepEqual(semanticRows, [
            { id: stableFace.faceId, kind: 'face' },
            { id: stableFace.visualRegionId, kind: 'region' },
        ]);

        const region = db.prepare(`
            SELECT vr.id, ai.original_path
            FROM visual_regions vr
            JOIN asset_identities ai ON ai.guid = vr.asset_identity_guid
            WHERE vr.id = ?
        `).get(stableFace.visualRegionId);
        assert.deepEqual(region, {
            id: stableFace.visualRegionId,
            original_path: 'C:/photos/portrait.jpg',
        });

        const face = db.prepare('SELECT id, visual_region_id FROM faces WHERE id = ?')
            .get(stableFace.faceId);
        assert.deepEqual(face, {
            id: stableFace.faceId,
            visual_region_id: stableFace.visualRegionId,
        });

        const firstGeneration = db.prepare(`
            SELECT source_analysis_generation_id, x, y, width, height,
                   source_width, source_height, source_orientation,
                   source_module_id, provider, model_version, status
            FROM visual_region_geometry_generations
            WHERE id = ?
        `).get(stableFace.geometryGenerationId);
        assert.deepEqual(firstGeneration, {
            source_analysis_generation_id: 'analysis-generation-1',
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.4,
            source_width: 2400,
            source_height: 3600,
            source_orientation: 6,
            source_module_id: 'runtime.detect_faces',
            provider: 'onnx_retina_10g',
            model_version: '1.0',
            status: 'active',
        });

        appendVisualRegionGeometryGeneration(db, {
            visualRegionId: stableFace.visualRegionId,
            sourceAnalysisGenerationId: 'analysis-generation-2',
            box: { x: 0.11, y: 0.19, width: 0.31, height: 0.39 },
            sourceWidth: 2400,
            sourceHeight: 3600,
            sourceOrientation: 6,
            sourceModuleId: 'runtime.detect_faces',
            provider: 'onnx_retina_10g',
            modelVersion: '1.0',
        });

        const generations = db.prepare(`
            SELECT source_analysis_generation_id, x, y, width, height
            FROM visual_region_geometry_generations
            WHERE visual_region_id = ?
            ORDER BY source_analysis_generation_id ASC
        `).all(stableFace.visualRegionId);
        assert.deepEqual(generations, [
            {
                source_analysis_generation_id: 'analysis-generation-1',
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.4,
            },
            {
                source_analysis_generation_id: 'analysis-generation-2',
                x: 0.11,
                y: 0.19,
                width: 0.31,
                height: 0.39,
            },
        ]);

        const editorMaskSnapshot = JSON.stringify([{
            id: 'editor-mask-1',
            name: 'Hand painted correction',
            kind: 'ellipse',
            box: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
            feather: 4,
            source: 'user',
        }]);
        db.prepare(`
            INSERT INTO photo_edit_documents (id, source_asset_id, name, operations_json, masks_json)
            VALUES ('edit-1', 'asset-1', 'Portrait restoration', '[]', ?)
        `).run(editorMaskSnapshot);

        saveAssetMaskMetadata(db, {
            assetId: 'asset-1',
            sourceId: 'runtime.detect_faces',
            masks: [{
                id: 'face-0',
                label: 'Face 1',
                description: 'Locally detected face',
                kind: 'ellipse',
                box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
                visualRegionId: stableFace.visualRegionId,
                source: { moduleId: 'runtime.detect_faces', referenceId: 'face-0' },
            }],
        });

        const maskRow = db.prepare(`
            SELECT schema_version, data
            FROM asset_mask_metadata
            WHERE asset_id = 'asset-1' AND source_id = 'runtime.detect_faces'
        `).get();
        assert.equal(maskRow.schema_version, 1);
        const maskMetadata = JSON.parse(maskRow.data);
        assert.equal(maskMetadata.schemaVersion, 1);
        assert.equal(maskMetadata.masks[0].visualRegionId, stableFace.visualRegionId);
        assert.equal(maskMetadata.masks[0].source.referenceId, 'face-0');

        const editRow = db.prepare("SELECT masks_json FROM photo_edit_documents WHERE id = 'edit-1'").get();
        assert.equal(editRow.masks_json, editorMaskSnapshot);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
