const test = require('node:test');
const assert = require('node:assert/strict');

const stageModule = () => import('../../dist/core/src/services/photoAnalysis/stageRequest.js');
const source = id => ({ id, assetId: 'photo-1', kind: 'image', refId: 'overview', imageId: 'overview', text: 'Overview image' });
function input() {
    return {
        faces: [{ faceId: 'canonical-face-1', modelFaceId: 'F1', box: { x: 0.1, y: 0.2, width: 0.2, height: 0.3 } }],
        sources: [{ id: 'overview', assetId: 'photo-1', kind: 'overview', width: 1536, height: 1024,
            fullPhotoBox: { x: 0, y: 0, width: 1, height: 1 } }],
        parts: [{ sourceImageId: 'overview', mimeType: 'image/jpeg', data: 'AA==' }],
        targets: [{ field: 'identity', subjectId: 'canonical-face-1', concern: 'identity', question: 'Which supplied candidate fits?' }],
        prior: {
            sources: [source('prior:visual')], regions: [], winners: [],
            claims: [
                { id: 'observed-1', kind: 'observation', state: 'active', field: 'archive_clue', value: 'Visible historical badge', evidence: [], contradictions: [], sourceIds: ['prior:visual'] },
                { id: 'rejected-1', kind: 'observation', state: 'rejected', field: 'archive_clue', value: 'REJECTED_OBSERVATION', evidence: [], contradictions: [], sourceIds: ['prior:visual'] },
                { id: 'hypothesis-1', kind: 'hypothesis', state: 'active', field: 'date', value: 'ANCHOR_DATE', evidence: [], contradictions: [], sourceIds: ['prior:visual'] },
            ],
        },
    };
}

test('stage preparation uses stable Face IDs for targets and bounded candidates without changing local geometry', async () => {
    const { preparePhotoAnalysisStage } = await stageModule();
    const preparedInput = input();
    const prepared = preparePhotoAnalysisStage({
        input: preparedInput, stage: 'refine', model: 'future-refine-model', sources: [source('new:visual')],
        candidates: [{ faceId: 'canonical-face-1', personId: 'known-person-1', sourceId: 'prior:visual', label: 'Candidate one' }],
    });
    assert.equal(prepared.scope.targets[0].subjectId, 'F1');
    assert.equal(prepared.scope.candidates[0].faceId, 'F1');
    assert.deepEqual(prepared.scope.faces[0].box, preparedInput.faces[0].box);
    assert.equal(prepared.request.images[0].id, 'overview');
    assert.equal(prepared.request.model, 'future-refine-model');
    assert.equal(preparedInput.targets[0].subjectId, 'canonical-face-1');
});

test('Refine retains independently observed evidence and references while excluding prior hypotheses/rejected observations', async () => {
    const { preparePhotoAnalysisStage } = await stageModule();
    const prepared = preparePhotoAnalysisStage({ input: input(), stage: 'refine', model: 'configured-model',
        sources: [source('new:visual')], candidates: [] });
    assert.deepEqual(prepared.scope.sources.map(item => item.id), ['prior:visual', 'new:visual']);
    assert.match(prepared.request.prompt, /Visible historical badge/);
    assert.match(prepared.request.prompt, /prior:visual/);
    assert.equal(prepared.request.prompt.includes('ANCHOR_DATE'), false);
    assert.equal(prepared.request.prompt.includes('REJECTED_OBSERVATION'), false);
});

test('Scout excludes contextual filename, confirmed answers and prior claims', async () => {
    const { preparePhotoAnalysisStage } = await stageModule();
    const preparedInput = input();
    const prepared = preparePhotoAnalysisStage({ input: preparedInput, stage: 'scout', model: 'scout-model', candidates: [],
        sources: [source('new:visual'), { id: 'filename', assetId: 'photo-1', kind: 'local', refId: 'filename', text: 'CHRISTMAS_1976_FILENAME' }] });
    assert.equal(prepared.request.prompt.includes('CHRISTMAS_1976_FILENAME'), false);
    assert.equal(prepared.request.prompt.includes('Visible historical badge'), false);
    assert.equal(prepared.scope.sources.some(item => item.id === 'prior:visual'), false);
});

test('same input yields reproducible prompt/schema and configurable variants change only prompt', async () => {
    const { preparePhotoAnalysisStage } = await stageModule();
    const params = { input: input(), stage: 'refine', model: 'configured-model', sources: [source('new:visual')], candidates: [] };
    const first = preparePhotoAnalysisStage(params);
    const second = preparePhotoAnalysisStage(params);
    const variant = preparePhotoAnalysisStage({ ...params, promptVariant: 'independent-clue-test' });
    assert.equal(first.request.prompt, second.request.prompt);
    assert.deepEqual(first.request.responseJsonSchema, second.request.responseJsonSchema);
    assert.deepEqual(first.request.images, variant.request.images);
    assert.equal(variant.request.prompt, `${first.request.prompt}\nVariant:independent-clue-test`);
});

test('Refine refuses to prepare an untargeted request', async () => {
    const { preparePhotoAnalysisStage } = await stageModule();
    assert.throws(() => preparePhotoAnalysisStage({ input: { ...input(), targets: [] }, stage: 'refine',
        model: 'refine-model', sources: [], candidates: [] }), /explicit concerns/);
});

test('Refine bounds historical observations and carries only their referenced sources', async () => {
    const { preparePhotoAnalysisStage } = await stageModule();
    const preparedInput = input();
    const observed = preparedInput.prior.claims[0];
    preparedInput.prior.claims = Array.from({ length: 40 }, (_, index) => ({
        ...observed, id: `observation:${index}`, subjectId: `object:${index}`, sourceIds: [`visual:${index}`],
    }));
    preparedInput.prior.sources = Array.from({ length: 40 }, (_, index) => source(`visual:${index}`));
    const prepared = preparePhotoAnalysisStage({ input: preparedInput, stage: 'refine', model: 'refine-model',
        sources: [source('new:visual')], candidates: [] });
    assert.equal(prepared.visualObservations.length, 24);
    assert.equal(prepared.scope.sources.length, 25);
    assert.equal(prepared.scope.sources.some(item => item.id === 'visual:0'), false);
    assert.equal(prepared.scope.sources.some(item => item.id === 'visual:39'), true);
});
