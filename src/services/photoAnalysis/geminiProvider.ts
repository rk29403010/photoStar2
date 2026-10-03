import {
    GoogleGenAI,
    type GenerateContentParameters,
    type GenerateContentResponseUsageMetadata,
    MediaResolution,
    type Part,
    PartMediaResolutionLevel,
    ThinkingLevel,
} from '@google/genai';

/** Model-specific controls are opt-in; model names never select hidden defaults. */
export type GeminiThinking =
    | { thinkingBudget: number; thinkingLevel?: never }
    | { thinkingLevel: ThinkingLevel; thinkingBudget?: never };

export type GeminiImageInput = {
    id: string;
    imageBase64: string;
    mimeType: string;
    mediaResolution?: PartMediaResolutionLevel;
}

export type GeminiStructuredRequest = {
    model: string;
    prompt: string;
    responseJsonSchema: Record<string, unknown>;
    images: GeminiImageInput[];
    thinking?: GeminiThinking;
    mediaResolution?: MediaResolution;
    signal?: AbortSignal;
}

export type GeminiAttempt = {
    attempt: number;
    latencyMs: number;
    status: 'success' | 'error' | 'aborted';
    requested: boolean;
    error?: string;
    httpStatus?: number;
    usage?: GenerateContentResponseUsageMetadata;
}

export type GeminiStructuredResult = {
    data: unknown;
    modelVersion?: string;
    responseId?: string;
    usage?: GenerateContentResponseUsageMetadata;
    attempts: GeminiAttempt[];
    latencyMs: number;
}

/** Narrow injectable boundary keeps transport tests independent of credentials. */
export type GeminiClient = {
    models: {
        generateContent(request: GenerateContentParameters): Promise<{
            text?: string;
            modelVersion?: string;
            responseId?: string;
            usageMetadata?: GenerateContentResponseUsageMetadata;
        }>;
    };
}

export type GeminiProviderOptions = {
    client: GeminiClient;
    maxAttempts?: number;
    retryDelayMs?: number;
    now?: () => number;
}

export class GeminiProviderError extends Error {
    readonly attempts: GeminiAttempt[];
    readonly latencyMs: number;

    constructor(message: string, attempts: GeminiAttempt[], latencyMs: number) {
        super(message);
        this.name = 'GeminiProviderError';
        this.attempts = attempts;
        this.latencyMs = latencyMs;
    }
}

/** Credentials are supplied by the caller's environment/key manager. */
export function createGoogleGenAIClient(apiKey: string): GoogleGenAI {
    return new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
}

function imageParts(images: GeminiImageInput[]): Part[] {
    return images.flatMap((image) => [
        { text: `Source image ID: ${image.id}` },
        {
            inlineData: { data: image.imageBase64, mimeType: image.mimeType },
            ...(image.mediaResolution ? { mediaResolution: { level: image.mediaResolution } } : {}),
        },
    ]);
}

function requestParameters(request: GeminiStructuredRequest): GenerateContentParameters {
    if (!request.model.trim()) { throw new Error('A Gemini model ID is required.'); }
    const ids = new Set(request.images.map((image) => image.id));
    if (ids.size !== request.images.length || ids.has('')) {
        throw new Error('Source image IDs must be nonempty and unique.');
    }
    validateThinking(request.thinking);
    validateResolution(request.mediaResolution, Object.values(MediaResolution));
    for (const image of request.images) { validateResolution(image.mediaResolution, Object.values(PartMediaResolutionLevel)); }
    return {
        model: request.model,
        contents: [{ role: 'user', parts: [{ text: request.prompt }, ...imageParts(request.images)] }],
        config: {
            responseMimeType: 'application/json',
            responseJsonSchema: request.responseJsonSchema,
            // Disable SDK retries so every charged request is represented in attempts.
            httpOptions: { retryOptions: { attempts: 1 } },
            ...(request.signal ? { abortSignal: request.signal } : {}),
            ...(request.thinking ? { thinkingConfig: { ...request.thinking, includeThoughts: false } } : {}),
            ...(request.mediaResolution ? { mediaResolution: request.mediaResolution } : {}),
        },
    };
}

function validateResolution(value: unknown, allowed: string[]): void {
    if (value === undefined) { return; }
    if (typeof value !== 'string' || !allowed.includes(value)) { throw new Error('Unsupported mediaResolution setting.'); }
}

function validateThinking(thinking?: GeminiThinking): void {
    if (!thinking) { return; }
    if (thinking.thinkingBudget !== undefined && thinking.thinkingLevel !== undefined) {
        throw new Error('Choose thinkingBudget or thinkingLevel, not both.');
    }
    if (thinking.thinkingBudget !== undefined) {
        if (!Number.isInteger(thinking.thinkingBudget) || thinking.thinkingBudget < -1) {
            throw new Error('thinkingBudget must be an integer of at least -1.');
        }
        return;
    }
    if (!Object.values(ThinkingLevel).includes(thinking.thinkingLevel!)) {
        throw new Error('Unsupported thinkingLevel setting.');
    }
}

function httpStatus(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) { return undefined; }
    const value = 'status' in error ? error.status : undefined;
    return typeof value === 'number' ? value : undefined;
}

function isAborted(error: unknown, signal?: AbortSignal): boolean {
    return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError');
}

function isRetryable(status?: number): boolean {
    return status === 408 || status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

function safeErrorMessage(error: unknown, signal?: AbortSignal): string {
    if (isAborted(error, signal)) { return 'Gemini request aborted.'; }
    const status = httpStatus(error);
    if (status !== undefined) { return `Gemini request failed (HTTP ${status}).`; }
    if (error instanceof SyntaxError) { return 'Gemini returned invalid JSON.'; }
    // SDK errors can contain credential URLs, image data or prompts. Persist only safe summaries.
    return 'Gemini request failed without an HTTP status.';
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
        function cleanup() { signal?.removeEventListener('abort', abort); }
        function abort() {
            clearTimeout(timer);
            cleanup();
            reject(new DOMException('Request aborted', 'AbortError'));
        }
        const timer = setTimeout(() => { cleanup(); resolve(); }, delayMs);
        signal?.addEventListener('abort', abort, { once: true });
    });
}

function providerSettings(options: GeminiProviderOptions) {
    const maxAttempts = options.maxAttempts ?? 3;
    const retryDelayMs = options.retryDelayMs ?? 500;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
        throw new Error('maxAttempts must be an integer between 1 and 5.');
    }
    if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 30_000) {
        throw new Error('retryDelayMs must be between 0 and 30000.');
    }
    return { maxAttempts, retryDelayMs, now: options.now ?? (() => performance.now()) };
}

async function generateAttempt(input: {
    client: GeminiClient;
    parameters: GenerateContentParameters;
    signal?: AbortSignal;
    attempt: number;
    now: () => number;
}): Promise<{ result?: Omit<GeminiStructuredResult, 'attempts' | 'latencyMs'>; telemetry: GeminiAttempt }> {
    const started = input.now();
    let requested = false;
    let usage: GenerateContentResponseUsageMetadata | undefined;
    try {
        input.signal?.throwIfAborted();
        requested = true;
        const response = await input.client.models.generateContent(input.parameters);
        usage = response.usageMetadata;
        input.signal?.throwIfAborted();
        const data: unknown = JSON.parse(response.text ?? '');
        return {
            result: { data, modelVersion: response.modelVersion, responseId: response.responseId, usage },
            telemetry: { attempt: input.attempt, latencyMs: input.now() - started, status: 'success', requested, usage },
        };
    } catch (error) {
        return { telemetry: {
            attempt: input.attempt,
            latencyMs: input.now() - started,
            status: isAborted(error, input.signal) ? 'aborted' : 'error',
            requested,
            error: safeErrorMessage(error, input.signal),
            httpStatus: httpStatus(error),
            usage,
        } };
    }
}

export function createGeminiProvider(options: GeminiProviderOptions) {
    const { maxAttempts, retryDelayMs, now } = providerSettings(options);
    return { async generateStructured(request: GeminiStructuredRequest): Promise<GeminiStructuredResult> {
        const parameters = requestParameters(request);
        const started = now();
        const attempts: GeminiAttempt[] = [];
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const outcome = await generateAttempt({ client: options.client, parameters, signal: request.signal, attempt, now });
            attempts.push(outcome.telemetry);
            if (outcome.result) { return { ...outcome.result, attempts, latencyMs: now() - started }; }
            const { status, httpStatus: failedStatus } = outcome.telemetry;
            if (status === 'aborted' || !isRetryable(failedStatus) || attempt === maxAttempts) { break; }
            const waitingStarted = now();
            try {
                await waitForRetry(Math.min(retryDelayMs * (2 ** (attempt - 1)), 30_000), request.signal);
            } catch {
                attempts.push({ attempt: attempt + 1, latencyMs: now() - waitingStarted, status: 'aborted', requested: false,
                    error: 'Gemini request aborted while awaiting retry.' });
                break;
            }
        }
        throw new GeminiProviderError(attempts.at(-1)?.error ?? 'Gemini request failed.', attempts, now() - started);
    } };
}
