const test = require('node:test');
const assert = require('node:assert/strict');

const providerModule = () => import('../../dist/core/src/services/photoAnalysis/geminiProvider.js');
const request = (overrides = {}) => ({
    model: 'configurable-future-model',
    prompt: 'Describe supplied Face IDs using concise evidence.',
    responseJsonSchema: { type: 'object', properties: { caption: { type: 'string' } }, required: ['caption'] },
    images: [{ id: 'photo:overview', imageBase64: 'AA==', mimeType: 'image/jpeg' }],
    ...overrides,
});
const response = (overrides = {}) => ({ text: '{"caption":"Family portrait"}', ...overrides });

test('provider uses current structured output, configurable model, explicit image IDs and API usage', async () => {
    const { createGeminiProvider } = await providerModule();
    const usage = {
        promptTokenCount: 10, candidatesTokenCount: 12, thoughtsTokenCount: 4,
        totalTokenCount: 26, cachedContentTokenCount: 3,
        promptTokensDetails: [{ modality: 'IMAGE', tokenCount: 8 }],
    };
    let captured;
    let clock = 100;
    const provider = createGeminiProvider({ now: () => clock, client: { models: {
        generateContent: async (parameters) => {
            captured = parameters;
            clock += 25;
            return response({ usageMetadata: usage, responseId: 'response-1', modelVersion: 'actual-served-version' });
        },
    } } });
    const input = request();
    const result = await provider.generateStructured(input);
    assert.deepEqual(result.data, { caption: 'Family portrait' });
    assert.equal(result.modelVersion, 'actual-served-version');
    assert.equal(result.responseId, 'response-1');
    assert.deepEqual(result.usage, usage);
    assert.equal(result.latencyMs, 25);
    assert.equal(result.attempts[0].latencyMs, 25);
    assert.deepEqual(result.attempts[0].usage, usage);
    assert.equal(captured.model, 'configurable-future-model');
    assert.equal(captured.config.responseJsonSchema, input.responseJsonSchema);
    assert.equal(captured.config.responseMimeType, 'application/json');
    assert.equal(captured.config.httpOptions.retryOptions.attempts, 1);
    assert.equal(captured.contents[0].parts[1].text, 'Source image ID: photo:overview');
    assert.deepEqual(captured.contents[0].parts[2].inlineData, { data: 'AA==', mimeType: 'image/jpeg' });
    for (const key of ['temperature', 'topK', 'topP', 'thinkingConfig', 'mediaResolution']) {
        assert.equal(Object.hasOwn(captured.config, key), false);
    }
});

test('thinking and global/per-part resolution are explicit; thought summaries remain disabled', async () => {
    const { createGeminiProvider } = await providerModule();
    const requests = [];
    const provider = createGeminiProvider({ client: { models: {
        generateContent: async (parameters) => { requests.push(parameters); return response(); },
    } } });
    await provider.generateStructured(request({
        thinking: { thinkingLevel: 'LOW' }, mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        images: [{ id: 'face:F1', imageBase64: 'AA==', mimeType: 'image/jpeg', mediaResolution: 'MEDIA_RESOLUTION_HIGH' }],
    }));
    await provider.generateStructured(request({ thinking: { thinkingBudget: 256 } }));
    assert.deepEqual(requests[0].config.thinkingConfig, { thinkingLevel: 'LOW', includeThoughts: false });
    assert.equal(requests[0].config.mediaResolution, 'MEDIA_RESOLUTION_MEDIUM');
    assert.deepEqual(requests[0].contents[0].parts[2].mediaResolution, { level: 'MEDIA_RESOLUTION_HIGH' });
    assert.deepEqual(requests[1].config.thinkingConfig, { thinkingBudget: 256, includeThoughts: false });
});

test('retry telemetry includes failures and preserves the requested model across every attempt', async () => {
    const { createGeminiProvider } = await providerModule();
    const models = [];
    let clock = 0;
    const provider = createGeminiProvider({ retryDelayMs: 0, now: () => clock, client: { models: {
        generateContent: async (parameters) => {
            models.push(parameters.model);
            clock += 10;
            if (models.length === 1) { throw Object.assign(new Error('private SDK detail'), { status: 503 }); }
            return response();
        },
    } } });
    const result = await provider.generateStructured(request({ model: 'chosen-refine-model' }));
    assert.deepEqual(models, ['chosen-refine-model', 'chosen-refine-model']);
    assert.deepEqual(result.attempts.map((item) => item.status), ['error', 'success']);
    assert.equal(result.attempts[0].httpStatus, 503);
    assert.equal(result.attempts[0].latencyMs, 10);
    assert.equal(result.attempts[0].error, 'Gemini request failed (HTTP 503).');
    assert.equal(result.latencyMs, 20);
});

test('quota retries are bounded and exhausted failure carries all attempt telemetry', async () => {
    const { createGeminiProvider, GeminiProviderError } = await providerModule();
    let calls = 0;
    const provider = createGeminiProvider({ maxAttempts: 2, retryDelayMs: 0, client: { models: {
        generateContent: async () => { calls += 1; throw Object.assign(new Error('quota detail'), { status: 429 }); },
    } } });
    await assert.rejects(provider.generateStructured(request()), (error) => {
        assert.ok(error instanceof GeminiProviderError);
        assert.equal(error.attempts.length, 2);
        assert.deepEqual(error.attempts.map((item) => item.httpStatus), [429, 429]);
        return true;
    });
    assert.equal(calls, 2);
});

test('permission and unknown transport errors are not retried or persisted verbatim', async () => {
    const { createGeminiProvider } = await providerModule();
    for (const status of [400, 401, 403, 404, undefined]) {
        let calls = 0;
        const provider = createGeminiProvider({ retryDelayMs: 0, client: { models: {
            generateContent: async () => { calls += 1; throw Object.assign(new Error('sensitive input text'), { status }); },
        } } });
        await assert.rejects(provider.generateStructured(request()), (error) => {
            assert.equal(error.attempts.length, 1);
            assert.equal(error.message.includes('sensitive'), false);
            return true;
        });
        assert.equal(calls, 1);
    }
});

test('invalid JSON is not retried and preserves charged response usage', async () => {
    const { createGeminiProvider } = await providerModule();
    const usage = { promptTokenCount: 30, totalTokenCount: 35 };
    const provider = createGeminiProvider({ client: { models: {
        generateContent: async () => response({ text: 'invalid-json', usageMetadata: usage }),
    } } });
    await assert.rejects(provider.generateStructured(request()), (error) => {
        assert.equal(error.attempts.length, 1);
        assert.equal(error.message, 'Gemini returned invalid JSON.');
        assert.deepEqual(error.attempts[0].usage, usage);
        return true;
    });
});

test('pre-aborted requests never call transport and expose abort telemetry', async () => {
    const { createGeminiProvider } = await providerModule();
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const provider = createGeminiProvider({ client: { models: {
        generateContent: async () => { calls += 1; return response(); },
    } } });
    await assert.rejects(provider.generateStructured(request({ signal: controller.signal })), (error) => {
        assert.equal(error.attempts[0].status, 'aborted');
        assert.equal(error.attempts[0].requested, false);
        return true;
    });
    assert.equal(calls, 0);
});

test('in-flight cancellation forwards AbortSignal and retains any returned usage', async () => {
    const { createGeminiProvider } = await providerModule();
    const controller = new AbortController();
    const usage = { totalTokenCount: 45 };
    const provider = createGeminiProvider({ client: { models: {
        generateContent: async (parameters) => {
            assert.equal(parameters.config.abortSignal, controller.signal);
            controller.abort();
            return response({ usageMetadata: usage });
        },
    } } });
    await assert.rejects(provider.generateStructured(request({ signal: controller.signal })), (error) => {
        assert.equal(error.attempts[0].status, 'aborted');
        assert.equal(error.attempts[0].requested, true);
        assert.deepEqual(error.attempts[0].usage, usage);
        return true;
    });
});

test('backoff cancellation does not issue an additional request', async () => {
    const { createGeminiProvider } = await providerModule();
    const controller = new AbortController();
    let calls = 0;
    const provider = createGeminiProvider({ retryDelayMs: 30_000, client: { models: {
        generateContent: async () => {
            calls += 1;
            setImmediate(() => controller.abort());
            throw Object.assign(new Error('unavailable'), { status: 503 });
        },
    } } });
    await assert.rejects(provider.generateStructured(request({ signal: controller.signal })), (error) => {
        assert.deepEqual(error.attempts.map((item) => item.status), ['error', 'aborted']);
        assert.equal(error.attempts[1].requested, false);
        return true;
    });
    assert.equal(calls, 1);
});

test('provider rejects invalid retry controls, model, source IDs and conflicting thinking controls', async () => {
    const { createGeminiProvider } = await providerModule();
    const client = { models: { generateContent: async () => response() } };
    assert.throws(() => createGeminiProvider({ client, maxAttempts: 6 }), /maxAttempts/);
    assert.throws(() => createGeminiProvider({ client, retryDelayMs: Number.NaN }), /retryDelayMs/);
    const provider = createGeminiProvider({ client });
    await assert.rejects(provider.generateStructured(request({ model: ' ' })), /model ID/);
    await assert.rejects(provider.generateStructured(request({ images: [{ id: '' }] })), /image IDs/);
    await assert.rejects(provider.generateStructured(request({ images: [{ id: 'same' }, { id: 'same' }] })), /image IDs/);
    await assert.rejects(provider.generateStructured(request({ thinking: { thinkingBudget: 10, thinkingLevel: 'LOW' } })), /not both/);
    await assert.rejects(provider.generateStructured(request({ thinking: { thinkingBudget: -2 } })), /thinkingBudget/);
    await assert.rejects(provider.generateStructured(request({ thinking: { thinkingLevel: 'unexpected' } })), /thinkingLevel/);
    await assert.rejects(provider.generateStructured(request({ mediaResolution: 'unexpected' })), /mediaResolution/);
});
