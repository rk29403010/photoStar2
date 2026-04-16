const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-reset-library-'));
}

function createResponseCollector() {
    const responses = [];
    return {
        respond: (id, status, data, error) => {
            responses.push({ id, status, data, error });
        },
        takeLast() {
            const response = responses.at(-1);
            if (!response) {
                throw new Error('expected a command response');
            }
            return response;
        },
    };
}

function seedResetFixture(db) {
    db.prepare("INSERT INTO assets (id, original_path, created_at) VALUES ('asset-1', 'C:/photos/one.jpg', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO events (id, type, payload, created_at) VALUES ('event-1', 'JobStarted', '{}', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO jobs (id, stage, status, created_at) VALUES ('job-1', 'preview_generation', 'completed', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO previews (asset_id, size, path, version) VALUES ('asset-1', 'thumbnail', 'C:/tmp/thumb.webp', 4)").run();
    db.prepare("INSERT INTO processing_issues (id, asset_id, task, severity, message, created_at) VALUES ('issue-1', 'asset-1', 'preview', 'error', 'boom', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO workflow_runs (id, workflow_id, trigger_type, status, input_subjects_json, parameters_json, started_at, created_at) VALUES ('run-1', 'folder_ingest_v1', 'manual', 'completed', '[]', '{}', '2026-03-13T00:00:00.000Z', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO workflow_run_milestones (workflow_run_id, milestone_id, label, status, created_at, updated_at) VALUES ('run-1', 'library_ready', 'Library ready', 'completed', '2026-03-13T00:00:00.000Z', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO step_runs (id, workflow_run_id, node_id, status, created_at, updated_at) VALUES ('step-1', 'run-1', 'generate-previews', 'completed', '2026-03-13T00:00:00.000Z', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO subject_executions (id, workflow_run_id, step_run_id, subject_type, subject_id, status, created_at, updated_at) VALUES ('subject-1', 'run-1', 'step-1', 'asset', 'asset-1', 'completed', '2026-03-13T00:00:00.000Z', '2026-03-13T00:00:00.000Z')").run();

    db.prepare("INSERT INTO asset_identities (guid, original_path, created_at) VALUES ('identity-1', 'C:/photos/one.jpg', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO assets_manual (identity_guid, sensitivity_status, updated_at) VALUES ('identity-1', 'review', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO manual_face_names (original_path, face_index, name, created_at) VALUES ('C:/photos/one.jpg', 0, 'Alice', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO manual_face_isolations (original_path, face_index, from_person_id, created_at) VALUES ('C:/photos/one.jpg', 0, 'person-1', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO folder_history (path, last_scanned_at) VALUES ('C:/photos', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT OR REPLACE INTO settings (id, value) VALUES ('custom-setting', 'keep-me')").run();
}

function count(db, tableName) {
    return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

function createResetContext({ dbManager, respond, libDir, activeJobs }) {
    return {
        id: 'cmd-reset',
        command: 'reset_library',
        payload: {},
        dbManager,
        eventBus: {},
        activeJobs,
        LIB_DIR: libDir,
        respond,
    };
}

function seedFaceResetFixture(db) {
    db.prepare("INSERT INTO assets (id, original_path, created_at) VALUES ('asset-1', 'C:/photos/one.jpg', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO derived_results (id, asset_id, task, provider, model_version, data, created_at) VALUES ('face-detect-1', 'asset-1', 'face_detection', 'detector', '1.0', '{\"faces\":[{\"box\":{\"x\":0.1,\"y\":0.1,\"width\":0.2,\"height\":0.2}}]}', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO derived_results (id, asset_id, task, provider, model_version, data, created_at) VALUES ('face-rec-1', 'asset-1', 'face_recognition', 'recognizer', '1.0', '{\"embeddings\":[[0.1,0.2,0.3]]}', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO people (id, name, thumbnail_path, created_at) VALUES ('person-1', 'Alice', 'C:/tmp/person-1.webp', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO face_assignments (asset_id, face_index, person_id, confidence, created_at) VALUES ('asset-1', 0, 'person-1', 0.99, '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO manual_face_names (original_path, face_index, name, created_at) VALUES ('C:/photos/one.jpg', 0, 'Alice', '2026-03-13T00:00:00.000Z')").run();
    db.prepare("INSERT INTO manual_face_isolations (original_path, face_index, from_person_id, created_at) VALUES ('C:/photos/one.jpg', 0, 'person-1', '2026-03-13T00:00:00.000Z')").run();
}

test('soft reset recreates schema while preserving manual tables, settings, and folder history', async () => {
    const tempDir = createTempDir();
    const previewsDir = path.join(tempDir, 'previews');
    fs.mkdirSync(previewsDir, { recursive: true });
    fs.writeFileSync(path.join(previewsDir, 'stale-thumb.webp'), 'preview');

    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    const collector = createResponseCollector();

    try {
        seedResetFixture(dbManager.getDb());

        handleSystemCommand({
            ...createResetContext({
                dbManager,
                respond: collector.respond,
                libDir: tempDir,
                activeJobs: new Map(),
            }),
            payload: { mode: 'soft' },
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');

        const db = dbManager.getDb();
        assert.equal(count(db, 'assets'), 0);
        assert.equal(count(db, 'events'), 0);
        assert.equal(count(db, 'jobs'), 0);
        assert.equal(count(db, 'processing_issues'), 0);
        assert.equal(count(db, 'workflow_runs'), 0);
        assert.equal(count(db, 'workflow_run_milestones'), 0);
        assert.equal(count(db, 'step_runs'), 0);
        assert.equal(count(db, 'subject_executions'), 0);

        assert.equal(count(db, 'asset_identities'), 1);
        assert.equal(count(db, 'assets_manual'), 1);
        assert.equal(count(db, 'manual_face_names'), 1);
        assert.equal(count(db, 'manual_face_isolations'), 1);
        assert.equal(count(db, 'folder_history'), 1);
        assert.equal(db.prepare("SELECT value FROM settings WHERE id = 'custom-setting'").get().value, 'keep-me');
        assert.ok(db.prepare("SELECT value FROM settings WHERE id = 'cleanup_legacy_ai_metadata_split_v1'").get().value);
        assert.equal(fs.existsSync(previewsDir), false);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('factory reset recreates schema with only built-in defaults remaining', async () => {
    const tempDir = createTempDir();
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    const collector = createResponseCollector();
    const activeJobs = new Map([
        ['job-a', new AbortController()],
    ]);

    try {
        seedResetFixture(dbManager.getDb());

        handleSystemCommand({
            ...createResetContext({
                dbManager,
                respond: collector.respond,
                libDir: tempDir,
                activeJobs,
            }),
            payload: { mode: 'factory' },
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');
        assert.equal(activeJobs.size, 0);

        const db = dbManager.getDb();
        assert.equal(count(db, 'assets'), 0);
        assert.equal(count(db, 'events'), 0);
        assert.equal(count(db, 'workflow_runs'), 0);
        assert.equal(count(db, 'workflow_run_milestones'), 0);
        assert.equal(count(db, 'step_runs'), 0);
        assert.equal(count(db, 'subject_executions'), 0);
        assert.equal(count(db, 'asset_identities'), 0);
        assert.equal(count(db, 'assets_manual'), 0);
        assert.equal(count(db, 'manual_face_names'), 0);
        assert.equal(count(db, 'manual_face_isolations'), 0);
        assert.equal(count(db, 'folder_history'), 0);
        assert.equal(db.prepare("SELECT value FROM settings WHERE id = 'custom-setting'").get(), undefined);
        assert.ok(db.prepare("SELECT value FROM settings WHERE id = 'cleanup_legacy_ai_metadata_split_v1'").get().value);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('reset faces clears derived face results, people assignments, and manual face overrides', async () => {
    const tempDir = createTempDir();
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    const collector = createResponseCollector();

    try {
        seedFaceResetFixture(dbManager.getDb());

        handleSystemCommand({
            ...createResetContext({
                dbManager,
                respond: collector.respond,
                libDir: tempDir,
                activeJobs: new Map(),
            }),
            command: 'reset_faces',
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');

        const db = dbManager.getDb();
        assert.equal(count(db, 'people'), 0);
        assert.equal(count(db, 'face_assignments'), 0);
        assert.equal(count(db, 'manual_face_names'), 0);
        assert.equal(count(db, 'manual_face_isolations'), 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM derived_results WHERE task = 'face_detection'").get().count, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM derived_results WHERE task = 'face_recognition'").get().count, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('reset faces can target a single asset without clearing other face data', async () => {
    const tempDir = createTempDir();
    const { handleSystemCommand } = await import('../../dist/core/src/services/handlers.js');
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    const collector = createResponseCollector();

    try {
        seedFaceResetFixture(dbManager.getDb());
        dbManager.getDb().prepare("INSERT INTO assets (id, original_path, created_at) VALUES ('asset-2', 'C:/photos/two.jpg', '2026-03-13T00:00:00.000Z')").run();
        dbManager.getDb().prepare("INSERT INTO derived_results (id, asset_id, task, provider, model_version, data, created_at) VALUES ('face-detect-2', 'asset-2', 'face_detection', 'detector', '1.0', '{\"faces\":[{\"box\":{\"x\":0.3,\"y\":0.3,\"width\":0.2,\"height\":0.2}}]}', '2026-03-13T00:00:00.000Z')").run();
        dbManager.getDb().prepare("INSERT INTO derived_results (id, asset_id, task, provider, model_version, data, created_at) VALUES ('face-rec-2', 'asset-2', 'face_recognition', 'recognizer', '1.0', '{\"embeddings\":[[0.4,0.5,0.6]]}', '2026-03-13T00:00:00.000Z')").run();

        handleSystemCommand({
            ...createResetContext({
                dbManager,
                respond: collector.respond,
                libDir: tempDir,
                activeJobs: new Map(),
            }),
            command: 'reset_faces',
            payload: { mediaId: 'asset-1' },
        });

        const response = collector.takeLast();
        assert.equal(response.status, 'ok');

        const db = dbManager.getDb();
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM derived_results WHERE asset_id = 'asset-1' AND task = 'face_detection'").get().count, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM derived_results WHERE asset_id = 'asset-1' AND task = 'face_recognition'").get().count, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM derived_results WHERE asset_id = 'asset-2' AND task = 'face_detection'").get().count, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM derived_results WHERE asset_id = 'asset-2' AND task = 'face_recognition'").get().count, 1);
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM face_assignments WHERE asset_id = 'asset-1'").get().count, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
