import keytar from 'keytar';
import { getUnrecoverableAiReason } from '../workflowRuntime/modules/generateAiMetadata/geminiTypes.js';

export class KeyNotFoundError extends Error {
    constructor(provider: string) {
        super(`API key not found for provider '${provider}'`);
        this.name = 'KeyNotFoundError';
    }
}

export type ApiProvider = 'gemini' | 'openai' | (string & {});

const SERVICE_NAME = 'PhotoStar2';

type GeminiModelClient = {
    listModels?: () => Promise<unknown>;
    models?: { list?: () => Promise<unknown> };
};

async function listModelsWithClient(client: GeminiModelClient): Promise<boolean> {
    if (client.models && typeof client.models.list === 'function') {
        await client.models.list();
        return true;
    }
    if (typeof client.listModels === 'function') {
        await client.listModels();
        return true;
    }
    return false;
}

async function listModelsWithFetch(proposedKey: string): Promise<void> {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${proposedKey}`
    );
    if (response.ok) { return; }
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `HTTP ${response.status} ${response.statusText}`);
}

async function verifyGeminiKey(proposedKey: string): Promise<void> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(proposedKey) as GeminiModelClient;
    if (await listModelsWithClient(client)) { return; }
    await listModelsWithFetch(proposedKey);
}

function invalidKeyResult(error: unknown): { valid: false; error?: string } {
    const typedError = error as Error;
    return {
        valid: false,
        error: getUnrecoverableAiReason(typedError) || typedError.message,
    };
}

export const ApiKeyManager = {
    /**
     * Stores an API key securely for a provider.
     */
    async setKey(provider: ApiProvider, key: string): Promise<void> {
        try {
            await keytar.setPassword(SERVICE_NAME, provider, key);
        } catch (error) {
            throw new Error(`Failed to store API key: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    /**
     * Retrieves an API key securely for a provider.
     */
    async getKey(provider: ApiProvider): Promise<string | null> {
        try {
            return await keytar.getPassword(SERVICE_NAME, provider);
        } catch (error) {
            throw new Error(`Failed to retrieve API key: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    /**
     * Retrieves the plaintext API key for a provider, throwing KeyNotFoundError if missing.
     */
    async getPlaintextKey(provider: ApiProvider): Promise<string> {
        const key = await ApiKeyManager.getKey(provider);
        if (key === null) {
            throw new KeyNotFoundError(provider);
        }
        return key;
    },

    /**
     * Deletes a stored API key for a provider.
     */
    async deleteKey(provider: ApiProvider): Promise<boolean> {
        try {
            return await keytar.deletePassword(SERVICE_NAME, provider);
        } catch (error) {
            throw new Error(`Failed to delete API key: ${error instanceof Error ? error.message : String(error)}`);
        }
    },

    /**
     * Retrieves a redacted representation of the stored API key for a provider.
     * Returns null if no key exists.
     */
    async getRedactedKey(provider: ApiProvider): Promise<string | null> {
        let key: string | null = null;
        try {
            key = await ApiKeyManager.getKey(provider);
        } catch (error) {
            if (error instanceof KeyNotFoundError) {
                return null;
            }
            throw error;
        }

        if (!key) {
            return null;
        }

        if (key.length <= 8) {
            const half = Math.floor(key.length / 2);
            const first = key.substring(0, Math.min(2, half));
            const last = key.substring(key.length - Math.min(2, half));
            return `${first}••••${last}`;
        }

        const first = key.substring(0, 4);
        const last = key.substring(key.length - 4);
        return `${first}••••${last}`;
    },

    /**
     * Validates the structure and presence of an API key for a given provider.
     * Throws an error if invalid.
     */
    validateKeyFormat(provider: string, key: string | null | undefined): void {
        const keyTrimmed = key?.trim() ?? '';
        if (!keyTrimmed) {
            throw new Error('MISSING_API_KEY');
        }
        if (provider === 'gemini') {
            if (!(keyTrimmed.startsWith('AIza') || keyTrimmed.startsWith('AQ.')) || keyTrimmed.length < 30) {
                throw new Error('INVALID_API_KEY_FORMAT');
            }
        }
    },

    /**
     * Tests a proposed API key for a provider on-the-fly.
     * Does not save the key or mutate global app state.
     */
    async testProviderKey(provider: string, proposedKey: string): Promise<{ valid: boolean; error?: string }> {
        if (provider !== 'gemini') {
            return { valid: false, error: `Unsupported provider: ${provider}` };
        }
        try {
            ApiKeyManager.validateKeyFormat(provider, proposedKey);
            await verifyGeminiKey(proposedKey);
            return { valid: true };
        } catch (error) {
            return invalidKeyResult(error);
        }
    },
};
