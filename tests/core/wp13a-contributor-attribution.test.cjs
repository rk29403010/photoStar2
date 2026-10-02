const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp13a-'));
}

function commandContext(dbManager, payload) {
    let response = null;
    return {
        ctx: {
            id: 'wp13a-command', payload, originWs: undefined, dbManager,
            eventBus: { emit() {} },
            respond(_id, status, data, error) { response = { status, data, error }; },
        },
        response: () => response,
    };
}

test('WP13a local Contributor profiles support explicit current-profile selection', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const contributors = await import('../../dist/core/src/services/relationships/contributorRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const robin = contributors.createContributor(db, 'Robin');
        const elise = contributors.createContributor(db, 'Elise');
        contributors.selectContributor(db, robin.id);
        assert.equal(contributors.getCurrentContributor(db).id, robin.id);
        contributors.selectContributor(db, elise.id);
        assert.equal(contributors.getCurrentContributor(db).id, elise.id);
        assert.deepEqual(
            contributors.listContributors(db).map((contributor) => contributor.displayName).sort(),
            ['Elise', 'Robin'],
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP13a attestations retain explicit Contributor attribution', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const contributors = await import('../../dist/core/src/services/relationships/contributorRepository.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const contributor = contributors.createContributor(db, 'Witness A');
        const subjectId = semantic.ensureSemanticEntity(db, { kind: 'face', nativeId: 'face-a' });
        const objectId = semantic.ensureSemanticEntity(db, { kind: 'person', nativeId: 'person-a', label: 'Alice' });
        const propositionId = semantic.putSemanticProposition(db, {
            scopeKey: 'face-a:depicts',
            subjectEntityId: subjectId,
            predicate: 'depicts',
            object: { type: 'entity', entityId: objectId },
        });
        const attestationId = contributors.addContributorAttestation(db, contributor.id, {
            propositionId,
            stance: 'support',
            sourceRef: 'wp13a.testimony',
            confidence: 0.9,
            rationale: 'Recognised from family photographs',
        });
        assert.deepEqual(
            db.prepare(`
                SELECT a.source_kind, a.source_identity, a.source_actor_entity_id, c.display_name
                FROM semantic_attestations a
                JOIN contributors c ON c.id = a.source_actor_entity_id
                WHERE a.id = ?
            `).get(attestationId),
            {
                source_kind: 'human',
                source_identity: contributor.id,
                source_actor_entity_id: contributor.id,
                display_name: 'Witness A',
            },
        );
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP13a People review decisions use selected Contributor and keep prior attribution readable', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const stableFaces = await import('../../dist/core/src/services/faces/stableFaceRepository.js');
    const contributors = await import('../../dist/core/src/services/relationships/contributorRepository.js');
    const { peopleCandidateCommandHandlers } = await import('../../dist/core/src/services/handlers/peopleCandidateCommands.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset-a', 'C:/wp13a.jpg')").run();
        db.prepare("INSERT INTO people (id, name) VALUES ('person-a', 'Alice')").run();
        const face = stableFaces.createStableFaceDetection(db, {
            assetId: 'asset-a', sourceAnalysisGenerationId: 'detect-a',
            box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            sourceWidth: 100, sourceHeight: 100, sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces', provider: 'test', modelVersion: '1',
        });
        const robin = contributors.createContributor(db, 'Robin');
        const elise = contributors.createContributor(db, 'Elise');
        contributors.selectContributor(db, robin.id);

        const approve = commandContext(dbManager, { faceId: face.faceId, personId: 'person-a' });
        peopleCandidateCommandHandlers.confirm_face_person_candidate(approve.ctx);
        assert.equal(approve.response().status, 'ok');

        contributors.selectContributor(db, elise.id);
        const reject = commandContext(dbManager, { faceId: face.faceId, personId: 'person-a' });
        peopleCandidateCommandHandlers.reject_face_person_candidate(reject.ctx);
        assert.equal(reject.response().status, 'ok');

        const history = db.prepare(`
            SELECT d.status, d.is_current, c.display_name
            FROM semantic_decisions d
            JOIN contributors c ON c.id = d.decider_entity_id
            WHERE d.scope_key = ?
            ORDER BY d.created_at ASC, d.id ASC
        `).all(`${face.faceId}:depicts`);
        assert.equal(history.length, 2);
        assert.deepEqual(
            history.map((row) => ({ status: row.status, display_name: row.display_name })).sort((a, b) => a.status.localeCompare(b.status)),
            [
                { status: 'accepted', display_name: 'Robin' },
                { status: 'rejected', display_name: 'Elise' },
            ],
        );
        assert.equal(history.filter((row) => row.is_current === 1)[0].display_name, 'Elise');
        assert.equal(history.filter((row) => row.is_current === 0)[0].display_name, 'Robin');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
