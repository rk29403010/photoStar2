const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { randomUUID } = require('node:crypto');
require.cache[require.resolve('keytar')] = {
    id: require.resolve('keytar'), filename: require.resolve('keytar'), loaded: true,
    exports: { getPassword: async () => null, setPassword: async () => {}, deletePassword: async () => true },
};
const { DatabaseManager } = require('../../dist/core/src/data/db.js');
const providerBoundary = require('../../dist/core/src/services/photoAnalysis/geminiProvider.js');
const { ApiKeyManager, KeyNotFoundError } = require('../../dist/core/src/services/security/ApiKeyManager.js');
const live = require('../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/liveRuntime.js');

async function fixture(t, respond) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'photostar-live-'));
    const filename = path.join(directory, 'photo.jpg');
    await sharp({ create: { width: 2200, height: 1100, channels: 3, background: '#445566' } }).jpeg().toFile(filename);
    const manager = new DatabaseManager(directory);
    manager.getDb().prepare('INSERT INTO assets (id, original_path, width, height) VALUES (?, ?, ?, ?)').run('photo', filename, 2200, 1100);
    t.after(async () => { manager.close(); await fs.rm(directory, { recursive: true, force: true }); });
    const requests = [];
    const client = { models: { generateContent: async request => {
        requests.push(request);
        return { text: JSON.stringify(await respond(request)), modelVersion: 'actual-api-model', responseId: 'response-1',
            usageMetadata: { promptTokenCount: 450, candidatesTokenCount: 40, thoughtsTokenCount: 12 } };
    } } };
    // Replace the narrow network factory, preserving the real modern provider and pipeline.
    t.mock.method(providerBoundary, 'createGoogleGenAIClient', () => client);
    t.mock.method(ApiKeyManager, 'getPlaintextKey', async () => randomUUID());
    return { manager, requests, row: manager.getDb().prepare('SELECT * FROM assets WHERE id = ?').get('photo') };
}

function captionResult(request) {
    const prompt = request.contents[0].parts[0].text;
    const line = prompt.split('\n').find(entry => entry.startsWith('Visual sources:'));
    const source = JSON.parse(line.slice('Visual sources:'.length))[0];
    return { claims: [{ field: 'caption', subjectId: null, value: 'Neutral scene caption', confidence: 'medium',
        kind: 'hypothesis', evidence: [{ text: 'Visible scene', sourceIds: [source.id] }], contradictions: [],
        sourceIds: [source.id], supersedesId: null }], regions: [], refinementOpportunities: [] };
}

test('live runtime uses configurable models and modern structured, thinking and media controls', async t => {
    const setup = await fixture(t, captionResult);
    setup.manager.setSetting('job_ai_model_scout', 'future-configured-model');
    setup.manager.setSetting('job_ai_thinking_scout', JSON.stringify({ thinkingBudget: 1024 }));
    setup.manager.setSetting('job_ai_media_resolution_scout', 'MEDIA_RESOLUTION_HIGH');
    const output = await live.generateLiveAiMetadata({ dbManager: setup.manager, row: setup.row });
    assert.equal(setup.requests.length, 1);
    const request = setup.requests[0];
    assert.equal(request.model, 'future-configured-model');
    assert.equal(request.config.responseMimeType, 'application/json');
    assert.ok(request.config.responseJsonSchema.properties.claims);
    assert.deepEqual(request.config.thinkingConfig, { thinkingBudget: 1024, includeThoughts: false });
    assert.equal(request.config.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
    assert.equal(request.config.maxOutputTokens, undefined);
    assert.equal(request.config.temperature, undefined);
    assert.ok(!request.contents[0].parts[0].text.includes('think step by step'));
    const image = request.contents[0].parts.find(part => part.inlineData).inlineData;
    const metadata = await sharp(Buffer.from(image.data, 'base64')).metadata();
    assert.equal(metadata.width, 1536); assert.equal(metadata.height, 768);
    assert.equal(output.analysis.runs.find(run => run.stage === 'scout').modelVersion, 'actual-api-model');
    const telemetry = output.analysis.runs.find(run => run.stage === 'scout').telemetry;
    assert.equal(telemetry.usage.thoughtsTokenCount, 12);
    assert.equal(telemetry.attempts.length, 1); assert.equal(telemetry.responseId, 'response-1');
});

test('read-only live benchmark runs preserve configurable model override and database state', async t => {
    const setup = await fixture(t, captionResult);
    const before = setup.manager.getDb().prepare('SELECT total_changes() AS count').get().count;
    const output = await live.generateLiveAiMetadata({ dbManager: setup.manager, row: setup.row,
        persist: false, modelOverride: 'benchmark-variant', promptVariant: 'neutral-caption' });
    assert.equal(output.runId, null); assert.equal(output.analysis, undefined);
    assert.equal(setup.requests[0].model, 'benchmark-variant');
    assert.match(setup.requests[0].contents[0].parts[0].text, /Variant:neutral-caption/);
    assert.equal(setup.manager.getDb().prepare('SELECT total_changes() AS count').get().count, before);
});

test('cancelled live calls do not send media or persist model claims', async t => {
    const setup = await fixture(t, captionResult);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(live.generateLiveAiMetadata({ dbManager: setup.manager, row: setup.row, signal: controller.signal }), /aborted/i);
    assert.equal(setup.requests.length, 0);
    const claims = setup.manager.getDb().prepare("SELECT COUNT(*) AS count FROM analysis_claims WHERE field = 'caption'").get();
    assert.equal(claims.count, 0);
});

test('Refine requires explicit or retained valuable concerns before sending a request', async t => {
    const setup = await fixture(t, captionResult);
    await assert.rejects(live.generateLiveAiMetadata({ dbManager: setup.manager, row: setup.row, metadataPass: 'refine' }), /selected unresolved questions|explicit concerns/);
    assert.equal(setup.requests.length, 0);
});

test('configuration resolution reports absent credentials without exposing errors or touching media', async t => {
    const previous = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    t.mock.method(ApiKeyManager, 'getPlaintextKey', async () => { throw new KeyNotFoundError('gemini'); });
    try { assert.match(await live.getLiveAiConfigurationError(), /configured Gemini API key/); }
    finally { if (previous === undefined) {delete process.env.GEMINI_API_KEY;} else {process.env.GEMINI_API_KEY = previous;} }
});
