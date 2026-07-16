const test = require('node:test');
const assert = require('node:assert/strict');

// 1. Set up keytar mock in require.cache
let shouldFail = false;
const mockStore = {};

const keytarMock = {
    setPassword: async (service, account, password) => {
        if (shouldFail) {
            throw new Error('Keyring access denied');
        }
        mockStore[`${service}:${account}`] = password;
    },
    getPassword: async (service, account) => {
        if (shouldFail) {
            throw new Error('Keyring read error');
        }
        return mockStore[`${service}:${account}`] || null;
    },
    deletePassword: async (service, account) => {
        if (shouldFail) {
            throw new Error('Keyring delete error');
        }
        const key = `${service}:${account}`;
        if (key in mockStore) {
            delete mockStore[key];
            return true;
        }
        return false;
    }
};

// Inject mock keytar into CommonJS require cache
require.cache[require.resolve('keytar')] = {
    id: require.resolve('keytar'),
    filename: require.resolve('keytar'),
    loaded: true,
    exports: keytarMock
};

// 2. Import ApiKeyManager after mocking keytar
const { ApiKeyManager } = require('../../dist/core/src/services/security/ApiKeyManager.js');

test('ApiKeyManager - setKey and getKey', async () => {
    // Clear mock store
    for (const key of Object.keys(mockStore)) {
        delete mockStore[key];
    }
    shouldFail = false;

    // Initially null
    const noKey = await ApiKeyManager.getKey('gemini');
    assert.equal(noKey, null);

    // Set key
    await ApiKeyManager.setKey('gemini', 'AIzaSyDUMMYKEY12345678901234567890');

    // Retrieve key
    const retrieved = await ApiKeyManager.getKey('gemini');
    assert.equal(retrieved, 'AIzaSyDUMMYKEY12345678901234567890');
});

test('ApiKeyManager - deleteKey', async () => {
    for (const key of Object.keys(mockStore)) {
        delete mockStore[key];
    }
    shouldFail = false;

    // Delete non-existent key
    const deleteNone = await ApiKeyManager.deleteKey('openai');
    assert.equal(deleteNone, false);

    // Set and delete
    await ApiKeyManager.setKey('openai', 'sk-proj-123456789');
    const deleteExists = await ApiKeyManager.deleteKey('openai');
    assert.equal(deleteExists, true);

    const checkDeleted = await ApiKeyManager.getKey('openai');
    assert.equal(checkDeleted, null);
});

test('ApiKeyManager - getRedactedKey', async () => {
    for (const key of Object.keys(mockStore)) {
        delete mockStore[key];
    }
    shouldFail = false;

    // Non-existent redacted key
    const redactedNone = await ApiKeyManager.getRedactedKey('gemini');
    assert.equal(redactedNone, null);

    // Normal long key redaction
    await ApiKeyManager.setKey('gemini', 'AIzaSyDUMMYKEY12345678901234567890');
    const redactedLong = await ApiKeyManager.getRedactedKey('gemini');
    assert.equal(redactedLong, 'AIza••••7890');

    // Short key redaction (<= 8 characters)
    await ApiKeyManager.setKey('openai', 'abcdefg'); // 7 chars
    const redactedShort = await ApiKeyManager.getRedactedKey('openai');
    assert.equal(redactedShort, 'ab••••fg');

    // Very short key redaction (<= 4 characters)
    await ApiKeyManager.setKey('openai', 'abc'); // 3 chars
    const redactedVeryShort = await ApiKeyManager.getRedactedKey('openai');
    assert.equal(redactedVeryShort, 'a••••c');
});

test('ApiKeyManager - error handling (fast fail)', async () => {
    shouldFail = true;

    await assert.rejects(
        ApiKeyManager.setKey('gemini', 'somekey'),
        /Failed to store API key/
    );

    await assert.rejects(
        ApiKeyManager.getKey('gemini'),
        /Failed to retrieve API key/
    );

    await assert.rejects(
        ApiKeyManager.deleteKey('gemini'),
        /Failed to delete API key/
    );

    await assert.rejects(
        ApiKeyManager.getRedactedKey('gemini'),
        /Failed to retrieve API key/
    );
});

test('ApiKeyManager - testProviderKey', async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    let fetchApiKey = null;
    let shouldFetchFail = false;

    globalThis.fetch = async (url) => {
        fetchCalled = true;
        const urlObj = new URL(url);
        fetchApiKey = urlObj.searchParams.get('key');
        if (shouldFetchFail) {
            return {
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                json: async () => ({ error: { message: 'API key not valid' } })
            };
        }
        return {
            ok: true,
            json: async () => ({ models: [{ name: 'models/gemini-2.5-flash' }] })
        };
    };

    try {
        fetchCalled = false;
        const validRes = await ApiKeyManager.testProviderKey('gemini', 'AIzaSyDUMMYKEY12345678901234567890');
        assert.equal(validRes.valid, true);
        assert.equal(fetchCalled, true);
        assert.equal(fetchApiKey, 'AIzaSyDUMMYKEY12345678901234567890');

        fetchCalled = false;
        shouldFetchFail = true;
        const invalidRes = await ApiKeyManager.testProviderKey('gemini', 'AIzaSyDUMMYKEY98765432109876543210');
        assert.equal(invalidRes.valid, false);
        assert.equal(invalidRes.error, 'AI API auth/permission error: API key not valid');
        assert.equal(fetchCalled, true);
        assert.equal(fetchApiKey, 'AIzaSyDUMMYKEY98765432109876543210');

        const unsupportedRes = await ApiKeyManager.testProviderKey('openai', 'somekey');
        assert.equal(unsupportedRes.valid, false);
        assert.equal(unsupportedRes.error, 'Unsupported provider: openai');
    } finally {
        globalThis.fetch = originalFetch;
    }
});
