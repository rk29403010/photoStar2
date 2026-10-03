const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, loadAnalysis } = require('./photo-analysis-fixtures.cjs');

test('AI produces constrained individual claims and cannot create local facts or user truth', t => {
    const { manager } = setup(t);
    assert.throws(() => add(manager, { field: 'caption', value: 'Invented truth', kind: 'known_fact' }), /authoritative/);
    assert.throws(() => add(manager, { field: 'caption', value: 'Invented truth', kind: 'user_confirmed' }), /authoritative/);
    assert.throws(() => add(manager, { field: 'local_metadata', value: { width: 2000 } }), /local metadata/);
    assert.equal(loadAnalysis(manager, 'asset-1').runs.length, 0);
});

test('all writers require existing canonical Face and Person identities from this photo', t => {
    const { manager } = setup(t);
    assert.throws(() => add(manager, { field: 'identity', subjectId: 'F1', value: { personId: 'known-person' } }), /Canonical Face ID/);
    assert.throws(() => add(manager, { field: 'identity', subjectId: 'other-photo-face', value: { personId: 'known-person' } }), /Canonical Face ID/);
    assert.throws(() => add(manager, { field: 'identity', subjectId: 'canonical-face-id', value: { personId: 'invented-person' }, stage: 'user', kind: 'user_confirmed' }), /existing Person/);
    const identity = add(manager, { field: 'identity', subjectId: 'canonical-face-id', value: { personId: 'known-person' }, stage: 'user', kind: 'user_confirmed' });
    assert.equal(identity.value.personId, 'known-person');
});

test('enhancement targets and protected areas must resolve to canonical entities of this photo', t => {
    const { manager } = setup(t);
    const base = { action: 'dust_scratches', target: { kind: 'whole_image' }, expectedBenefit: 'high',
        confidence: 'high', risk: 'low', reason: 'Visible damage', protectedFaceIds: [], protectedRegionIds: [], generative: false };
    assert.throws(() => add(manager, { field: 'enhancements', value: [{ ...base, protectedFaceIds: ['other-photo-face'] }] }), /Canonical Face ID/);
    assert.throws(() => add(manager, { field: 'enhancements', value: [{ ...base, target: { kind: 'regions', regionIds: ['invented-region'] } }] }), /Canonical region ID/);
    add(manager, { field: 'enhancements', value: [{ ...base, protectedFaceIds: ['canonical-face-id'] }] });
});

test('appearance observation is distinct from known demographic fact', t => {
    const { manager } = setup(t);
    const value = { apparentAge: { min: 25, max: 35 }, presentation: 'Adult', expression: 'Smiling', clothing: null };
    assert.throws(() => add(manager, { field: 'appearance', subjectId: 'canonical-face-id', value, kind: 'inferred_conclusion' }), /observation/);
    const appearance = add(manager, { field: 'appearance', subjectId: 'canonical-face-id', value, kind: 'observation' });
    assert.equal(appearance.subjectId, 'canonical-face-id');
    assert.deepEqual(appearance.value.apparentAge, { min: 25, max: 35 });
});
