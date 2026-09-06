const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-semantic-kernel-'));
}

test('semantic kernel schema is installed through the numbered migration ledger', () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const tables = db.prepare(`
            SELECT name
            FROM sqlite_master
            WHERE type = 'table' AND name LIKE 'semantic_%'
            ORDER BY name ASC
        `).all().map((row) => row.name);
        assert.deepEqual(tables, [
            'semantic_attestations',
            'semantic_decisions',
            'semantic_entities',
            'semantic_evidence',
            'semantic_propositions',
        ]);
        const migration = db.prepare(`
            SELECT id, checksum
            FROM schema_migrations
            WHERE id = '20260906_001_semantic_kernel'
        `).get();
        assert.equal(migration.id, '20260906_001_semantic_kernel');
        assert.equal(typeof migration.checksum, 'string');
        assert.equal(migration.checksum.length, 64);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('semantic resolver stays conservative through disagreement, supersession, and explicit decisions', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const faceRegion = semantic.ensureSemanticEntity(db, {
            kind: 'region',
            nativeId: 'asset-1:face:0',
            label: 'Face 1',
        });
        const alice = semantic.ensureSemanticEntity(db, { kind: 'person', nativeId: 'person-alice', label: 'Alice' });
        const bob = semantic.ensureSemanticEntity(db, { kind: 'person', nativeId: 'person-bob', label: 'Bob' });
        const scopeKey = 'region:asset-1:face:0:depicts';

        const aliceProposition = semantic.putSemanticProposition(db, {
            scopeKey,
            subjectEntityId: faceRegion,
            predicate: 'depicts',
            object: { type: 'entity', entityId: alice },
        });
        const duplicateAliceProposition = semantic.putSemanticProposition(db, {
            scopeKey,
            subjectEntityId: faceRegion,
            predicate: 'depicts',
            object: { type: 'entity', entityId: alice },
        });
        const bobProposition = semantic.putSemanticProposition(db, {
            scopeKey,
            subjectEntityId: faceRegion,
            predicate: 'depicts',
            object: { type: 'entity', entityId: bob },
        });
        assert.equal(duplicateAliceProposition, aliceProposition);

        const firstMachineAttestation = semantic.addSemanticAttestation(db, {
            propositionId: aliceProposition,
            stance: 'support',
            sourceKind: 'machine',
            sourceRef: 'arcface:1.0',
            confidence: 0.84,
            evidence: [{
                kind: 'region',
                ref: { assetId: 'asset-1', faceIndex: 0 },
                label: 'Detected face region',
            }],
        });
        assert.deepEqual(semantic.resolveSemanticScope(db, scopeKey), {
            scopeKey,
            status: 'proposed',
            propositionId: aliceProposition,
            candidatePropositionIds: [aliceProposition],
            decisionId: null,
        });

        semantic.addSemanticAttestation(db, {
            propositionId: bobProposition,
            stance: 'support',
            sourceKind: 'human',
            sourceRef: 'family:jean',
            confidence: 1,
        });
        const disputed = semantic.resolveSemanticScope(db, scopeKey);
        assert.equal(disputed.status, 'disputed');
        assert.deepEqual(new Set(disputed.candidatePropositionIds), new Set([aliceProposition, bobProposition]));

        semantic.addSemanticAttestation(db, {
            propositionId: bobProposition,
            stance: 'support',
            sourceKind: 'machine',
            sourceRef: 'arcface:1.1',
            confidence: 0.91,
            supersedesAttestationId: firstMachineAttestation,
        });
        assert.deepEqual(semantic.resolveSemanticScope(db, scopeKey), {
            scopeKey,
            status: 'proposed',
            propositionId: bobProposition,
            candidatePropositionIds: [bobProposition],
            decisionId: null,
        });

        const acceptedDecision = semantic.recordSemanticDecision(db, {
            scopeKey,
            status: 'accepted',
            propositionId: bobProposition,
            sourceKind: 'human',
            sourceRef: 'owner',
            rationale: 'Confirmed from family knowledge.',
        });
        const accepted = semantic.resolveSemanticScope(db, scopeKey);
        assert.equal(accepted.status, 'accepted');
        assert.equal(accepted.propositionId, bobProposition);
        assert.equal(accepted.decisionId, acceptedDecision);

        const disputedDecision = semantic.recordSemanticDecision(db, {
            scopeKey,
            status: 'disputed',
            sourceKind: 'human',
            sourceRef: 'owner',
            rationale: 'Reopened after conflicting evidence.',
        });
        assert.deepEqual(semantic.resolveSemanticScope(db, scopeKey), {
            scopeKey,
            status: 'disputed',
            propositionId: null,
            candidatePropositionIds: [],
            decisionId: disputedDecision,
        });
        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count
            FROM semantic_decisions
            WHERE scope_key = ? AND is_current = 1
        `).get(scopeKey).count, 1);
        assert.equal(db.prepare(`
            SELECT COUNT(*) AS count
            FROM semantic_decisions
            WHERE scope_key = ?
        `).get(scopeKey).count, 2);

        assert.deepEqual(semantic.getSemanticEvidenceForAttestation(db, firstMachineAttestation), [{
            kind: 'region',
            ref: { assetId: 'asset-1', faceIndex: 0 },
            label: 'Detected face region',
        }]);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('attestation supersession cannot cross semantic scopes', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const dbManager = new DatabaseManager(tempDir);
    try {
        const db = dbManager.getDb();
        const subject = semantic.ensureSemanticEntity(db, { kind: 'asset', nativeId: 'asset-1' });
        const person = semantic.ensureSemanticEntity(db, { kind: 'person', nativeId: 'person-1' });
        const first = semantic.putSemanticProposition(db, {
            scopeKey: 'asset:asset-1:depicts',
            subjectEntityId: subject,
            predicate: 'depicts',
            object: { type: 'entity', entityId: person },
        });
        const second = semantic.putSemanticProposition(db, {
            scopeKey: 'asset:asset-1:photographedBy',
            subjectEntityId: subject,
            predicate: 'photographedBy',
            object: { type: 'entity', entityId: person },
        });
        const firstAttestation = semantic.addSemanticAttestation(db, {
            propositionId: first,
            stance: 'support',
            sourceKind: 'machine',
        });
        assert.throws(() => semantic.addSemanticAttestation(db, {
            propositionId: second,
            stance: 'support',
            sourceKind: 'machine',
            supersedesAttestationId: firstAttestation,
        }), /same scope/);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
