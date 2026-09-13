const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'photo-star-semantic-explanation-'));
}

test('semantic explanation exposes alternatives, supersession chains, evidence, and current decision', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const explanation = await import('../../dist/core/src/services/relationships/semanticExplanation.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const photograph = semantic.ensureSemanticEntity(db, {
            kind: 'photograph', nativeId: 'photo-1', label: 'Garden photograph',
        });
        const norwich = semantic.ensureSemanticEntity(db, {
            kind: 'place', nativeId: 'norwich', label: 'Norwich',
        });
        const cromer = semantic.ensureSemanticEntity(db, {
            kind: 'place', nativeId: 'cromer', label: 'Cromer',
        });
        const scopeKey = 'photograph:photo-1:takenAt';
        const norwichProposition = semantic.putSemanticProposition(db, {
            scopeKey,
            subjectEntityId: photograph,
            predicate: 'takenAt',
            object: { type: 'entity', entityId: norwich },
        });
        const cromerProposition = semantic.putSemanticProposition(db, {
            scopeKey,
            subjectEntityId: photograph,
            predicate: 'takenAt',
            object: { type: 'entity', entityId: cromer },
        });

        const oldMachineAttestation = semantic.addSemanticAttestation(db, {
            propositionId: norwichProposition,
            stance: 'support',
            sourceKind: 'machine',
            sourceIdentity: 'place-model',
            sourceRef: 'place-model:1',
            confidence: 0.78,
            rationale: 'Visual place match.',
            evidence: [{
                kind: 'region',
                ref: { assetId: 'asset-1', region: 'background' },
                label: 'Background architecture',
            }],
        });
        semantic.addSemanticAttestation(db, {
            propositionId: cromerProposition,
            stance: 'support',
            sourceKind: 'human',
            sourceIdentity: 'family:jean',
            sourceRef: 'interview:jean:1',
            rationale: 'Jean remembers the holiday.',
        });

        const disputed = explanation.getSemanticScopeExplanation(db, scopeKey);
        assert.equal(disputed.resolution.status, 'disputed');
        assert.equal(disputed.propositions.length, 2);
        const norwichBefore = disputed.propositions.find((item) => item.id === norwichProposition);
        assert.equal(norwichBefore.object.type, 'entity');
        assert.equal(norwichBefore.object.entity.label, 'Norwich');
        assert.equal(norwichBefore.activeSupportCount, 1);
        assert.deepEqual(norwichBefore.attestations[0].evidence.map((item) => ({
            kind: item.kind,
            ref: item.ref,
            label: item.label,
        })), [{
            kind: 'region',
            ref: { assetId: 'asset-1', region: 'background' },
            label: 'Background architecture',
        }]);

        const newMachineAttestation = semantic.addSemanticAttestation(db, {
            propositionId: cromerProposition,
            stance: 'support',
            sourceKind: 'machine',
            sourceIdentity: 'place-model',
            sourceRef: 'place-model:2',
            confidence: 0.91,
            rationale: 'Rerun with stronger reference set.',
            supersedesAttestationId: oldMachineAttestation,
        });

        const proposed = explanation.getSemanticScopeExplanation(db, scopeKey);
        assert.equal(proposed.resolution.status, 'proposed');
        assert.equal(proposed.resolution.propositionId, cromerProposition);
        const norwichAfter = proposed.propositions.find((item) => item.id === norwichProposition);
        assert.equal(norwichAfter.activeSupportCount, 0);
        assert.equal(norwichAfter.attestations[0].isActive, false);
        assert.equal(norwichAfter.attestations[0].sourceIdentity, 'place-model');
        assert.equal(norwichAfter.attestations[0].supersededByAttestationId, newMachineAttestation);
        const cromerAfter = proposed.propositions.find((item) => item.id === cromerProposition);
        assert.equal(cromerAfter.activeSupportCount, 2);
        const replacement = cromerAfter.attestations.find((item) => item.id === newMachineAttestation);
        assert.equal(replacement.isActive, true);
        assert.equal(replacement.supersedesAttestationId, oldMachineAttestation);

        const decisionId = semantic.recordSemanticDecision(db, {
            scopeKey,
            status: 'accepted',
            propositionId: cromerProposition,
            sourceKind: 'human',
            sourceRef: 'owner',
            rationale: 'Confirmed after comparing the family account and visual evidence.',
        });
        const accepted = explanation.getSemanticScopeExplanation(db, scopeKey);
        assert.equal(accepted.resolution.status, 'accepted');
        assert.equal(accepted.resolution.propositionId, cromerProposition);
        assert.equal(accepted.decisions.length, 1);
        assert.equal(accepted.decisions[0].id, decisionId);
        assert.equal(accepted.decisions[0].isCurrent, true);
        assert.equal(accepted.decisions[0].rationale, 'Confirmed after comparing the family account and visual evidence.');
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('semantic explanation preserves typed value claims for uncertain dates', async () => {
    const tempDir = createTempDir();
    const { DatabaseManager } = require('../../dist/core/src/data/db.js');
    const semantic = await import('../../dist/core/src/services/relationships/semanticRepository.js');
    const explanation = await import('../../dist/core/src/services/relationships/semanticExplanation.js');
    const dbManager = new DatabaseManager(tempDir);

    try {
        const db = dbManager.getDb();
        const photograph = semantic.ensureSemanticEntity(db, {
            kind: 'photograph', nativeId: 'photo-date-1', label: 'Undated portrait',
        });
        const scopeKey = 'photograph:photo-date-1:date';
        const proposition = semantic.putSemanticProposition(db, {
            scopeKey,
            subjectEntityId: photograph,
            predicate: 'date',
            object: {
                type: 'value',
                valueType: 'date_range',
                value: { min: '1962', max: '1964', label: 'about 1963' },
            },
        });
        semantic.addSemanticAttestation(db, {
            propositionId: proposition,
            stance: 'support',
            sourceKind: 'human',
            sourceIdentity: 'family:jean',
            sourceRef: 'interview:jean:2',
            rationale: 'Jean remembers moving house in 1964 and says this was before the move.',
        });

        const result = explanation.getSemanticScopeExplanation(db, scopeKey);
        assert.equal(result.resolution.status, 'proposed');
        assert.equal(result.propositions.length, 1);
        assert.deepEqual(result.propositions[0].object, {
            type: 'value',
            valueType: 'date_range',
            value: { label: 'about 1963', max: '1964', min: '1962' },
        });
        assert.equal(result.propositions[0].subject.kind, 'photograph');
        assert.equal(result.propositions[0].activeSupportCount, 1);
    } finally {
        dbManager.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
