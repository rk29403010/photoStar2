const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-wp13b-'));
}

function loadResponseRows(db, responseId) {
    const response = db.prepare(`
        SELECT contributor_id, subject_entity_id, response_kind, raw_wording
        FROM review_responses
        WHERE id = ?
    `).get(responseId);
    const propositions = db.prepare(`
        SELECT proposition_id, relation
        FROM review_response_propositions
        WHERE response_id = ?
        ORDER BY proposition_id ASC
    `).all(responseId);
    const attestations = db.prepare(`
        SELECT stance, subjective_certainty, raw_wording, source_actor_entity_id
        FROM semantic_attestations
        WHERE source_ref = ?
        ORDER BY id ASC
    `).all(`review-response:${responseId}`);
    return { response, propositions, attestations };
}

async function createFixture(db) {
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const contributors = await import('../../dist/core/src/services/relationships/contributorRepository.js');
    db.prepare("INSERT INTO people (id, name) VALUES ('person-jean', 'Jean'), ('person-mary', 'Mary')").run();
    const faceId = semantic.ensureSemanticEntity(db, { kind: 'face', nativeId: 'wp13b-face' });
    const contributor = contributors.createContributor(db, 'Witness');
    return { faceId, contributor };
}

test('WP13b identity review responses normalize certainty without turning unknown into negative evidence', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const reviews = await import('../../dist/core/src/services/relationships/reviewResponseRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const { faceId, contributor } = await createFixture(db);
        const cases = [
            ['definite_identification', 'person-jean', 'definite', 'support'],
            ['tentative_identification', 'person-jean', 'tentative', 'support'],
            ['possible_identification', 'person-jean', 'possible', 'support'],
            ['reject_candidate', 'person-jean', 'definite', 'oppose'],
        ];
        for (const [kind, personId, certainty, stance] of cases) {
            const result = reviews.recordIdentityReviewResponse(db, {
                contributorId: contributor.id,
                faceId,
                kind,
                personId,
                rawWording: `wording:${kind}`,
            });
            const rows = loadResponseRows(db, result.responseId);
            assert.equal(rows.response.contributor_id, contributor.id);
            assert.equal(rows.response.response_kind, kind);
            assert.equal(rows.propositions.length, 1);
            assert.equal(rows.propositions[0].relation, 'subject');
            assert.deepEqual(rows.attestations, [{
                stance,
                subjective_certainty: certainty,
                raw_wording: `wording:${kind}`,
                source_actor_entity_id: contributor.id,
            }]);
        }

        for (const kind of ['unknown_no_clue', 'recognise_cannot_name']) {
            const result = reviews.recordIdentityReviewResponse(db, {
                contributorId: contributor.id,
                faceId,
                kind,
                rawWording: `wording:${kind}`,
            });
            const rows = loadResponseRows(db, result.responseId);
            assert.equal(rows.response.response_kind, kind);
            assert.equal(rows.propositions.length, 0);
            assert.equal(rows.attestations.length, 0);
        }
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('WP13b ambiguous and abstain responses preserve candidate context without false support or opposition', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const reviews = await import('../../dist/core/src/services/relationships/reviewResponseRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const { faceId, contributor } = await createFixture(db);
        const ambiguous = reviews.recordIdentityReviewResponse(db, {
            contributorId: contributor.id,
            faceId,
            kind: 'unsure_between_candidates',
            candidatePersonIds: ['person-jean', 'person-mary'],
            rawWording: 'Jean or Mary',
        });
        const ambiguousRows = loadResponseRows(db, ambiguous.responseId);
        assert.equal(ambiguousRows.propositions.length, 2);
        assert.deepEqual(ambiguousRows.propositions.map((row) => row.relation), ['candidate', 'candidate']);
        assert.equal(ambiguousRows.attestations.length, 0);

        const abstain = reviews.recordIdentityReviewResponse(db, {
            contributorId: contributor.id,
            faceId,
            kind: 'abstain',
            personId: 'person-jean',
            rawWording: 'Prefer not to judge',
        });
        const abstainRows = loadResponseRows(db, abstain.responseId);
        assert.equal(abstainRows.propositions.length, 1);
        assert.equal(abstainRows.propositions[0].relation, 'abstained_from');
        assert.equal(abstainRows.attestations.length, 0);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
