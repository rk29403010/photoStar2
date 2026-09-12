const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp13c-'));
}

async function createFixture(db) {
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const contributors = await import('../../dist/core/src/services/relationships/contributorRepository.js');
    db.prepare("INSERT INTO people (id, name) VALUES ('person-jean', 'Jean'), ('person-mary', 'Mary')").run();
    const faceId = semantic.ensureSemanticEntity(db, { kind: 'face', nativeId: 'wp13c-face' });
    const robin = contributors.createContributor(db, 'Robin');
    const elise = contributors.createContributor(db, 'Elise');
    return { semantic, contributors, faceId, robin, elise };
}

test('WP13c competing testimony stays side-by-side while decisions supersede append-only', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const reviews = await import('../../dist/core/src/services/relationships/reviewResponseRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const { semantic, contributors, faceId, robin, elise } = await createFixture(db);
        const robinResponse = reviews.recordIdentityReviewResponse(db, {
            contributorId: robin.id,
            faceId,
            kind: 'definite_identification',
            personId: 'person-jean',
            rawWording: 'Definitely Jean',
        });
        reviews.recordIdentityReviewResponse(db, {
            contributorId: elise.id,
            faceId,
            kind: 'definite_identification',
            personId: 'person-mary',
            rawWording: 'Definitely Mary',
        });

        const scopeKey = `${faceId}:depicts`;
        const unresolvedConflict = semantic.resolveSemanticScope(db, scopeKey);
        assert.equal(unresolvedConflict.status, 'disputed');
        assert.equal(unresolvedConflict.candidatePropositionIds.length, 2);

        const disputedId = contributors.recordContributorDecision(db, robin.id, {
            scopeKey,
            status: 'disputed',
            sourceRef: 'wp13c.disputed',
            rationale: 'Witnesses disagree',
        });
        const deferredId = contributors.recordContributorDecision(db, elise.id, {
            scopeKey,
            status: 'deferred',
            sourceRef: 'wp13c.deferred',
            rationale: 'Need more evidence',
        });
        const acceptedId = contributors.recordContributorDecision(db, robin.id, {
            scopeKey,
            status: 'accepted',
            propositionId: robinResponse.propositionIds[0],
            sourceRef: 'wp13c.accepted',
            rationale: 'Later corroboration',
        });

        const history = semantic.listSemanticDecisionHistory(db, scopeKey);
        assert.equal(history.length, 3);
        assert.deepEqual(history.map((entry) => entry.status), ['disputed', 'deferred', 'accepted']);
        assert.equal(history[0].id, disputedId);
        assert.equal(history[0].deciderEntityId, robin.id);
        assert.equal(history[0].isCurrent, false);
        assert.equal(history[1].id, deferredId);
        assert.equal(history[1].supersedesDecisionId, disputedId);
        assert.equal(history[1].deciderEntityId, elise.id);
        assert.equal(history[1].isCurrent, false);
        assert.equal(history[2].id, acceptedId);
        assert.equal(history[2].supersedesDecisionId, deferredId);
        assert.equal(history[2].deciderEntityId, robin.id);
        assert.equal(history[2].isCurrent, true);

        const testimony = db.prepare(`
            SELECT a.stance, a.raw_wording, a.source_actor_entity_id
            FROM semantic_attestations a
            JOIN semantic_propositions p ON p.id = a.proposition_id
            WHERE p.scope_key = ?
            ORDER BY a.raw_wording ASC
        `).all(scopeKey);
        assert.deepEqual(testimony, [
            { stance: 'support', raw_wording: 'Definitely Jean', source_actor_entity_id: robin.id },
            { stance: 'support', raw_wording: 'Definitely Mary', source_actor_entity_id: elise.id },
        ]);
        assert.equal(semantic.resolveSemanticScope(db, scopeKey).status, 'accepted');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
