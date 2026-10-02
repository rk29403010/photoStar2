const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp15-face-reset-'));
}

function count(db, table, where = '', ...params) {
    return db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(...params).count;
}

function saveFaceMask(db, assetId, visualRegionId) {
    db.prepare(`
        INSERT INTO asset_mask_metadata (asset_id, source_id, schema_version, data)
        VALUES (?, 'runtime.detect_faces', 1, ?)
    `).run(assetId, JSON.stringify({
        schemaVersion: 1,
        masks: [{
            id: 'face-0',
            label: 'Face',
            kind: 'ellipse',
            box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            visualRegionId,
            source: { moduleId: 'runtime.detect_faces', referenceId: 'face-0' },
        }],
    }));
}

function seedGeneration(db, { id, scopeKey, status, faceId }) {
    db.prepare(`
        INSERT INTO workflow_runs (
            id, workflow_id, trigger_type, status, input_subjects_json,
            parameters_json, started_at
        ) VALUES (?, 'test-face-reset', 'manual', 'completed', '[]', '{}', CURRENT_TIMESTAMP)
    `).run(`run-${id}`);
    db.prepare(`
        INSERT INTO step_runs (id, workflow_run_id, node_id, status)
        VALUES (?, ?, 'generate-face-vectors', 'completed')
    `).run(`step-${id}`, `run-${id}`);
    db.prepare(`
        INSERT INTO subject_executions (
            id, workflow_run_id, step_run_id, subject_type, subject_id, status
        ) VALUES (?, ?, ?, 'face', ?, 'completed')
    `).run(`subject-${id}`, `run-${id}`, `step-${id}`, faceId);
    db.prepare(`
        INSERT INTO analysis_generations (
            id, scope_key, workflow_run_id, step_run_id, subject_execution_id,
            input_fingerprint, provider, model_key, model_version,
            preprocessing_version, config_hash, idempotency_key, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'local', 'arcface', '1', '1', 'config', ?, ?)
    `).run(id, scopeKey, `run-${id}`, `step-${id}`, `subject-${id}`, `fingerprint-${id}`, `key-${id}`, status);
    if (status === 'successful') {
        db.prepare(`
            INSERT INTO analysis_generation_heads (scope_key, active_generation_id)
            VALUES (?, ?)
        `).run(scopeKey, id);
    }
    db.prepare(`
        INSERT INTO feature_vectors (
            id, subject_entity_id, analysis_generation_id, feature_key,
            dimensions, normalization, metric, vector_blob
        ) VALUES (?, ?, ?, 'face_embedding', 2, 'none', 'cosine', ?)
    `).run(`vector-${id}`, faceId, id, Buffer.from(new Float32Array([0.5, 0.5]).buffer));
}

async function seedFixture(db) {
    const stable = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const manual = await import('../../dist/core/src/services/faces/manualFaceSemanticRepository.js');
    const contributors = await import('../../dist/core/src/services/relationships/contributorRepository.js');
    const reviews = await import('../../dist/core/src/services/relationships/reviewResponseRepository.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');

    const faces = [];
    for (const assetId of ['asset-1', 'asset-2']) {
        db.prepare('INSERT INTO assets (id, original_path) VALUES (?, ?)').run(assetId, `C:/photos/${assetId}.jpg`);
        const identity = stable.createStableFaceDetection(db, {
            assetId,
            sourceAnalysisGenerationId: `detector-${assetId}`,
            box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            sourceWidth: 1000,
            sourceHeight: 800,
            sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces',
            provider: 'detector',
            modelVersion: '1',
        });
        saveFaceMask(db, assetId, identity.visualRegionId);
        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES (?, ?, 'face_detection', 'detector', '1', '{"faces":[]}')
        `).run(`derived-${assetId}`, assetId);
        faces.push(identity);
    }

    db.prepare(`
        INSERT INTO people (id, name, lifecycle_status) VALUES
            ('confirmed-person', 'Confirmed', 'confirmed'),
            ('semantic-provisional', 'Semantic provisional', 'provisional'),
            ('machine-person', 'Person 3', 'provisional'),
            ('merged-person', 'Merged', 'merged')
    `).run();
    semantic.ensureSemanticEntity(db, { kind: 'person', nativeId: 'semantic-provisional' });
    db.prepare(`
        INSERT INTO person_redirects (old_person_id, current_person_id)
        VALUES ('merged-person', 'confirmed-person')
    `).run();
    db.prepare(`
        INSERT INTO family_trees (id, filename, file_hash, gedcom_content, tree_group_id)
        VALUES ('tree-1', 'family.ged', 'hash-1', '0 HEAD', 'group-1')
    `).run();
    db.prepare(`
        INSERT INTO people_gedcom_links (person_id, gedcom_tree_id, gedcom_person_id)
        VALUES ('confirmed-person', 'tree-1', 'I1')
    `).run();

    db.prepare(`
        INSERT INTO face_assignments (asset_id, face_index, person_id, confidence, is_suggested)
        VALUES ('asset-1', 0, 'confirmed-person', 1, 0),
               ('asset-2', 0, 'machine-person', 0.8, 1)
    `).run();
    manual.recordManualFacePersonDecisionByFaceId(db, {
        faceId: faces[0].faceId,
        personId: 'confirmed-person',
        personName: 'Confirmed',
        status: 'accepted',
        sourceRef: 'test.wp15',
    });
    const contributor = contributors.createContributor(db, 'Archivist');
    const response = reviews.recordIdentityReviewResponse(db, {
        contributorId: contributor.id,
        faceId: faces[1].faceId,
        kind: 'unknown_no_clue',
        rawWording: 'I do not know this person',
    });

    seedGeneration(db, {
        id: 'generation-asset-1',
        scopeKey: 'face-vectors:asset-1',
        status: 'successful',
        faceId: faces[0].faceId,
    });
    seedGeneration(db, {
        id: 'generation-asset-1-running',
        scopeKey: 'face-vectors:asset-1',
        status: 'running',
        faceId: faces[0].faceId,
    });
    seedGeneration(db, {
        id: 'generation-asset-2',
        scopeKey: 'face-vectors:asset-2',
        status: 'successful',
        faceId: faces[1].faceId,
    });
    db.prepare(`
        INSERT INTO identity_clusters (id, algorithm_key, algorithm_version, threshold, centroid_json)
        VALUES ('cluster-1', 'test', '1', 0.6, '[0.5,0.5]')
    `).run();
    db.prepare(`
        INSERT INTO identity_cluster_members (cluster_id, face_id, confidence)
        VALUES ('cluster-1', ?, 1), ('cluster-1', ?, 1)
    `).run(faces[0].faceId, faces[1].faceId);
    db.prepare(`
        INSERT INTO face_person_candidates (
            face_id, person_id, source_analysis_generation_id,
            anchor_face_id, anchor_analysis_generation_id,
            raw_cosine, rank, model_key, model_version,
            preprocessing_version, config_hash, review_eligible, auto_action_eligible
        ) VALUES (?, 'confirmed-person', 'generation-asset-2', ?,
                  'generation-asset-1', 0.8, 1, 'arcface', '1', '1', 'config', 1, 0)
    `).run(faces[1].faceId, faces[0].faceId);

    return { faces, responseId: response.responseId, contributorId: contributor.id };
}

function commandContext(dbManager, tempDir, payload) {
    let response;
    return {
        ctx: {
            id: 'reset-faces',
            command: 'reset_faces',
            payload,
            dbManager,
            eventBus: {},
            activeJobs: new Map(),
            LIB_DIR: tempDir,
            respond: (_id, status, data, error) => { response = { status, data, error }; },
        },
        response: () => response,
    };
}

test('WP15 face reset preserves stable identity and human history while invalidating machine face state', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const fixture = await seedFixture(db);
        const geometryCount = count(db, 'visual_region_geometry_generations');
        const command = commandContext(dbManager, tempDir, {});

        await handleSystemCommand(command.ctx);

        assert.equal(command.response().status, 'ok');
        assert.equal(count(db, 'faces'), 2);
        assert.equal(count(db, 'visual_regions'), 2);
        assert.equal(count(db, 'visual_region_geometry_generations'), geometryCount);
        assert.equal(count(db, 'review_responses', 'WHERE id = ?', fixture.responseId), 1);
        assert.equal(db.prepare('SELECT raw_wording FROM review_responses WHERE id = ?').get(fixture.responseId).raw_wording,
            'I do not know this person');
        assert.equal(count(db, 'contributors', 'WHERE id = ?', fixture.contributorId), 1);
        assert.equal(count(db, 'semantic_decisions'), 1);
        assert.equal(count(db, 'people', "WHERE id = 'confirmed-person'"), 1);
        assert.equal(count(db, 'people', "WHERE id = 'semantic-provisional'"), 0);
        assert.equal(count(db, 'people', "WHERE id = 'merged-person'"), 1);
        assert.equal(count(db, 'people', "WHERE id = 'machine-person'"), 0);
        assert.equal(count(db, 'person_redirects'), 1);
        assert.equal(count(db, 'people_gedcom_links'), 1);

        assert.equal(count(db, 'derived_results', "WHERE task IN ('face_detection', 'face_recognition')"), 0);
        assert.equal(count(db, 'asset_mask_metadata', "WHERE source_id = 'runtime.detect_faces'"), 0);
        assert.equal(count(db, 'face_assignments'), 0);
        assert.equal(count(db, 'identity_clusters'), 0);
        assert.equal(count(db, 'identity_cluster_members'), 0);
        assert.equal(count(db, 'face_person_candidates'), 0);
        assert.equal(count(db, 'feature_vectors', "WHERE feature_key = 'face_embedding'"), 0);
        assert.equal(count(db, 'analysis_generation_heads', "WHERE scope_key LIKE 'face-vectors:%'"), 0);
        assert.equal(count(db, 'analysis_generations'), 3);
        assert.equal(db.prepare("SELECT status FROM analysis_generations WHERE id = 'generation-asset-1-running'").get().status,
            'failed');
        assert.equal(db.prepare("SELECT status FROM analysis_generations WHERE id = 'generation-asset-1'").get().status,
            'successful');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP15 per-asset face reset keeps other vector generations but clears global dependent projections', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const fixture = await seedFixture(db);
        const command = commandContext(dbManager, tempDir, { mediaId: 'asset-1' });

        await handleSystemCommand(command.ctx);

        assert.equal(command.response().status, 'ok');
        assert.equal(count(db, 'feature_vectors', "WHERE analysis_generation_id = 'generation-asset-1'"), 0);
        assert.equal(count(db, 'feature_vectors', "WHERE analysis_generation_id = 'generation-asset-1-running'"), 0);
        assert.equal(count(db, 'feature_vectors', "WHERE analysis_generation_id = 'generation-asset-2'"), 1);
        assert.equal(count(db, 'analysis_generation_heads', "WHERE scope_key = 'face-vectors:asset-1'"), 0);
        assert.equal(count(db, 'analysis_generation_heads', "WHERE scope_key = 'face-vectors:asset-2'"), 1);
        assert.equal(count(db, 'identity_clusters'), 0);
        assert.equal(count(db, 'face_person_candidates'), 0);
        assert.equal(count(db, 'derived_results', "WHERE asset_id = 'asset-1'"), 0);
        assert.equal(count(db, 'derived_results', "WHERE asset_id = 'asset-2'"), 1);
        assert.equal(count(db, 'asset_mask_metadata', "WHERE asset_id = 'asset-1'"), 0);
        assert.equal(count(db, 'asset_mask_metadata', "WHERE asset_id = 'asset-2'"), 1);
        assert.equal(count(db, 'face_assignments', "WHERE asset_id = 'asset-1'"), 0);
        assert.equal(count(db, 'face_assignments', "WHERE asset_id = 'asset-2'"), 1);
        assert.equal(count(db, 'people', "WHERE id = 'machine-person'"), 1);
        assert.equal(count(db, 'review_responses', 'WHERE id = ?', fixture.responseId), 1);
        assert.equal(count(db, 'faces'), 2);
        assert.equal(count(db, 'visual_region_geometry_generations'), 2);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
