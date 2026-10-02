const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseManager } = require('../../dist/core/src/data/db.js');
const semantic = require('../../dist/core/src/services/relationships/semanticRepository.js');
const contributors = require('../../dist/core/src/services/relationships/contributorRepository.js');
const reviews = require('../../dist/core/src/services/relationships/reviewResponseRepository.js');
const stable = require('../../dist/core/src/services/faces/stableFaceRepository.js');

test('WP13e unknown-only testimony retains its stable Face through soft rebuild', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photostar-wp13e-face-'));
    const manager = new DatabaseManager(directory);
    try {
        const db = manager.getDb();
        db.prepare("INSERT INTO assets (id, original_path) VALUES ('asset', 'C:/test/unknown.png')").run();
        const face = stable.createStableFaceDetection(db, {
            assetId: 'asset', sourceAnalysisGenerationId: 'test-generation',
            box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            sourceWidth: 100, sourceHeight: 100, sourceOrientation: 1,
            sourceModuleId: 'runtime.detect_faces', provider: 'test', modelVersion: '1',
        });
        const contributor = contributors.createContributor(db, 'Unknown witness');
        reviews.recordIdentityReviewResponse(db, {
            contributorId: contributor.id, faceId: face.faceId, kind: 'unknown_no_clue',
            rawWording: 'No clue',
        });
        const before = db.prepare('SELECT * FROM faces WHERE id = ?').get(face.faceId);
        manager.resetPreservingManualData();
        assert.deepEqual(manager.getDb().prepare('SELECT * FROM faces WHERE id = ?').get(face.faceId), before);
        assert.equal(manager.getDb().prepare('SELECT COUNT(*) AS count FROM semantic_attestations').get().count, 0);
    } finally {
        manager.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('WP13e soft rebuild and restart preserve attributed testimony including unknown responses', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'photostar-wp13e-'));
    let manager = new DatabaseManager(directory);
    try {
        const db = manager.getDb();
        db.prepare("INSERT INTO people (id, name) VALUES ('person-test', 'Test person')").run();
        const faceId = semantic.ensureSemanticEntity(db, { kind: 'face', nativeId: 'durability-face' });
        const contributor = contributors.createContributor(db, 'Test witness');
        contributors.selectContributor(db, contributor.id);
        for (const kind of ['tentative_identification', 'unknown_no_clue', 'reject_candidate', 'abstain']) {
            reviews.recordIdentityReviewResponse(db, {
                contributorId: contributor.id, faceId, kind,
                personId: 'person-test', rawWording: `Original ${kind}`,
            });
        }
        for (const status of ['disputed', 'deferred']) {
            contributors.recordContributorDecision(db, contributor.id, {
                scopeKey: `${faceId}:depicts`, status, sourceRef: 'durability-test',
            });
        }
        const tables = ['contributors', 'review_responses', 'review_response_propositions', 'semantic_attestations', 'semantic_decisions'];
        const before = Object.fromEntries(tables.map((table) => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all()]));
        manager.resetPreservingManualData();
        manager.close();
        manager = new DatabaseManager(directory);
        for (const table of tables) {
            assert.deepEqual(manager.getDb().prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all(), before[table], table);
        }
        assert.equal(contributors.getCurrentContributor(manager.getDb()).id, contributor.id);
    } finally {
        manager.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
