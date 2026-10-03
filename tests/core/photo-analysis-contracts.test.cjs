const test = require('node:test');
const assert = require('node:assert/strict');
const { analysisClaimSchema, analysisResultSchema, isSafeAutomaticEnhancement } = require('../../dist/core/src/shared/photoAnalysis/contracts.js');
const { validateStageResult, buildStageResponseSchema, resolveSuppliedRegionIds } = require('../../dist/core/src/services/photoAnalysis/stageContracts.js');
const { buildStagePrompt } = require('../../dist/core/src/services/photoAnalysis/prompts.js');

const source = { id: 'image-source', assetId: 'photo', kind: 'image', refId: 'overview', imageId: 'overview', text: 'Overview' };
const scope = { stage: 'scout', faces: [{ faceId: 'canonical-face', modelFaceId: 'F1', box: { x: .1, y: .1, width: .2, height: .2 } }],
    images: [{ id: 'overview', assetId: 'photo', kind: 'overview', width: 1600, height: 1000, fullPhotoBox: { x: 0, y: 0, width: 1, height: 1 } }],
    sources: [source], targets: [], candidates: [] };
function claim(field, value, overrides = {}) { return { field, value, subjectId: null, confidence: 'medium', kind: 'hypothesis',
    evidence: [{ text: 'Clothing consistent with late 1920s', sourceIds: [source.id] }], contradictions: [], sourceIds: [source.id], supersedesId: null, ...overrides }; }
function result(claims = [], regions = [], refinementOpportunities = []) { return { claims, regions, refinementOpportunities }; }
const recommendation = { action: 'tonal_recovery', target: { kind: 'whole_image' }, expectedBenefit: 'high', confidence: 'high', risk: 'low', reason: 'Recover faded tones', protectedFaceIds: ['F1'], protectedRegionIds: [], generative: false };

test('field evidence caps, confidence and value ranges reject invented precision/essays', () => {
    const date = claim('date', { start: '1920-01-01', end: '1930-12-31', label: '1920s' });
    assert.ok(analysisClaimSchema.safeParse(date).success);
    assert.equal(analysisClaimSchema.safeParse({ ...date, confidence: .98 }).success, false);
    assert.equal(analysisClaimSchema.safeParse({ ...date, evidence: Array.from({ length: 4 }, () => date.evidence[0]) }).success, false);
    assert.equal(analysisClaimSchema.safeParse({ ...date, contradictions: Array.from({ length: 3 }, () => date.evidence[0]) }).success, false);
    assert.equal(analysisClaimSchema.safeParse({ ...date, value: { ...date.value, start: '1940-01-01' } }).success, false);
    assert.equal(analysisClaimSchema.safeParse({ ...date, evidence: [{ text: 'x'.repeat(181), sourceIds: [source.id] }] }).success, false);
});

test('unknown sources, invented Face IDs, authoritative kinds and model supersession fail closed', () => {
    for (const overrides of [{ sourceIds: ['missing'] }, { kind: 'user_confirmed' }, { kind: 'known_fact' }, { supersedesId: 'ai-picked' }]) {
        assert.throws(() => validateStageResult(result([claim('caption', 'People outdoors', overrides)]), scope));
    }
    const appearance = { apparentAge: { min: 20, max: 30 }, presentation: 'adult', expression: 'neutral', clothing: 'formal coat' };
    assert.throws(() => validateStageResult(result([claim('appearance', appearance, { subjectId: 'F99', kind: 'observation' })]), scope), /Face ID/);
    assert.throws(() => validateStageResult(result([], [], [{ field: 'identity', subjectId: 'F99', question: 'Who?', concern: 'identity', expectedValue: 'high', reason: 'Recognition candidate' }]), scope), /Face ID/);
});

test('targeted Refine cannot regenerate unrelated fields or invent candidate names', () => {
    const refine = { ...scope, stage: 'refine', targets: [{ field: 'identity', subjectId: 'F1', question: 'Assess this candidate', concern: 'identity' }], candidates: [{ faceId: 'F1', personId: 'person-1', sourceId: source.id, label: 'Known person' }] };
    validateStageResult(result([claim('identity', { personId: 'person-1' }, { subjectId: 'F1', kind: 'inferred_conclusion' })]), refine);
    assert.throws(() => validateStageResult(result([claim('identity', { personId: 'invented-name' }, { subjectId: 'F1' })]), refine), /candidate/);
    assert.throws(() => validateStageResult(result([claim('caption', 'Rewritten unrelated caption')]), refine), /scope/);
    assert.throws(() => validateStageResult(result([claim('identity', { personId: 'person-1', name: 'Invented extra name' }, { subjectId: 'F1' })]), refine));
    const schema = buildStageResponseSchema(refine);
    const claimsSchema = JSON.stringify(schema.properties.claims);
    assert.ok(claimsSchema.includes('identity')); assert.ok(!claimsSchema.includes('caption'));
});

test('enhancement actionability is structured and safe automatic eligibility is derived conservatively', () => {
    validateStageResult(result([claim('enhancements', [recommendation])]), scope);
    assert.equal(isSafeAutomaticEnhancement(recommendation), true);
    for (const overrides of [{ risk: 'unknown' }, { confidence: 'medium' }, { expectedBenefit: 'low' }, { generative: true }, { action: 'face_restoration' }]) {
        assert.equal(isSafeAutomaticEnhancement({ ...recommendation, ...overrides }), false);
    }
    assert.throws(() => validateStageResult(result([claim('enhancements', [{ ...recommendation, target: { kind: 'faces', faceIds: ['F99'] } }])]), scope));
    assert.equal(analysisResultSchema.safeParse(result([claim('quality', { discard: true })])).success, false);
});

test('perception has extraction-only responsibility and all new region references namespace together', () => {
    const region = { id: 'R1', sourceImageId: 'overview', box: { left: 100, top: 100, right: 200, bottom: 200 }, kind: 'inscription', observation: 'Faint handwriting', confidence: 'low' };
    const perception = { ...scope, stage: 'perception' };
    assert.throws(() => validateStageResult(result([claim('date', null)]), perception));
    const output = result([claim('text', { transcription: 'uncertain', language: null }, { subjectId: 'R1', kind: 'observation' })], [region], [{ field: 'text', subjectId: 'R1', question: 'Transcribe', concern: 'transcription', expectedValue: 'high', reason: 'Faint script' }]);
    const canonical = resolveSuppliedRegionIds(validateStageResult(output, perception), 'run-one');
    assert.equal(canonical.regions[0].id, 'run-one:R1');
    assert.equal(canonical.claims[0].subjectId, 'run-one:R1');
    assert.equal(canonical.refinementOpportunities[0].subjectId, 'run-one:R1');
    assert.throws(() => validateStageResult(result([], [{ ...region, box: { left: 200, top: 100, right: 100, bottom: 200 } }]), perception));
});

test('Scout and Refine prompts request concise evidence without reasoning essays or prior hypothesis anchoring', () => {
    const scout = buildStagePrompt({ scope });
    const refine = buildStagePrompt({ scope: { ...scope, stage: 'refine', targets: [{ field: 'date', subjectId: null, concern: 'date', question: 'Narrow the date' }] } });
    assert.ok(!scout.includes('think step by step')); assert.ok(!refine.includes('think step by step'));
    assert.ok(scout.includes('visual-only')); assert.ok(refine.includes('Prior AI conclusions are omitted'));
    assert.ok(refine.includes(source.id));
});
