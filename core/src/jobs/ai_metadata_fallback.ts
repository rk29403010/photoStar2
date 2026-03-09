import type { DatabaseManager } from '../db';
import {
    recordRequest,
    isDailyQuotaExceeded,
    isRateLimited,
    msUntilRateLimitClears,
    classifyAndRecordError,
    sleepWithLog,
    MAX_WAIT_BEFORE_FALLBACK_MS,
} from './quota_manager';
import type {
    GeminiResponse,
    RowData} from './ai_metadata_shared';
import {
    MODEL_PRO,
    MODEL_FLASH,
    buildProPrompt,
    buildFlashPrompt,
    parseResponse,
    queueForProAnalysis,
} from './ai_metadata_shared';

export type ProPendingReason = 'rate_limit' | 'daily_quota';

export interface CallResult {
    result: GeminiResponse;
    usedModel: string;
    proPendingReason?: ProPendingReason;
}

async function waitForRateLimitWindow(model: string, label: string, allowLongWait = false): Promise<boolean> {
    if (!isRateLimited(model)) {return true;}
    const waitMs = msUntilRateLimitClears(model);
    if (!allowLongWait && waitMs > MAX_WAIT_BEFORE_FALLBACK_MS) {
        return false;
    }
    await sleepWithLog(waitMs, label);
    return !isRateLimited(model);
}

function shouldWaitForModel(model: string): boolean {
    if (!isRateLimited(model)) {return false;}
    return msUntilRateLimitClears(model) <= MAX_WAIT_BEFORE_FALLBACK_MS;
}

async function tryProModel(
    genAI: import('@google/generative-ai').GoogleGenerativeAI,
    filename: string,
    exifDataString: string,
    csvContent: string,
    imagePart: { inlineData: { data: string; mimeType: string } }
): Promise<GeminiResponse | null> {
    if (isDailyQuotaExceeded(MODEL_PRO)) {return null;}
    if (!(await waitForRateLimitWindow(MODEL_PRO, `Waiting for ${MODEL_PRO} rate limit`))) {return null;}

    try {
        recordRequest(MODEL_PRO);
        const model = genAI.getGenerativeModel({ model: MODEL_PRO, generationConfig: { responseMimeType: 'application/json' } });
        const response = await model.generateContent([buildProPrompt(filename, exifDataString, csvContent), imagePart]);
        const parsed = parseResponse(response.response.text());
        parsed._analysis_tier = 'pro';
        return parsed;
    } catch (err: unknown) {
        const errType = classifyAndRecordError(MODEL_PRO, err as Error);
        if (errType === 'rate_limit' && shouldWaitForModel(MODEL_PRO)) {
            await waitForRateLimitWindow(MODEL_PRO, `Retry wait for ${MODEL_PRO}`);
            try {
                recordRequest(MODEL_PRO);
                const model = genAI.getGenerativeModel({ model: MODEL_PRO, generationConfig: { responseMimeType: 'application/json' } });
                const response = await model.generateContent([buildProPrompt(filename, exifDataString, csvContent), imagePart]);
                const parsed = parseResponse(response.response.text());
                parsed._analysis_tier = 'pro';
                return parsed;
            } catch (retryErr: unknown) {
                classifyAndRecordError(MODEL_PRO, retryErr as Error);
            }
        }
        return null;
    }
}

async function tryFlashModel(
    genAI: import('@google/generative-ai').GoogleGenerativeAI,
    filename: string,
    exifDataString: string,
    imagePart: { inlineData: { data: string; mimeType: string } },
    flashModelName: string
): Promise<GeminiResponse> {
    if (isDailyQuotaExceeded(flashModelName)) {throw new Error('DAILY_QUOTA_EXCEEDED');}
    await waitForRateLimitWindow(flashModelName, `Waiting for ${flashModelName} rate limit`, true);

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            recordRequest(flashModelName);
            const flashModel = genAI.getGenerativeModel({ model: flashModelName, generationConfig: { responseMimeType: 'application/json' } });
            const flashResult = await flashModel.generateContent([buildFlashPrompt(filename, exifDataString), imagePart]);
            const parsed = parseResponse(flashResult.response.text());
            parsed._analysis_tier = 'flash';
            return parsed;
        } catch (err: unknown) {
            const errType = classifyAndRecordError(flashModelName, err as Error);
            if (errType === 'daily_quota') {throw new Error('DAILY_QUOTA_EXCEEDED');}
            if (errType !== 'rate_limit') {throw err;}

            await waitForRateLimitWindow(flashModelName, `Retry wait for ${flashModelName}`, true);
        }
    }

    throw new Error('FLASH_RATE_LIMITED_STOP');
}

export async function callWithFallback(
    genAI: import('@google/generative-ai').GoogleGenerativeAI,
    row: RowData,
    filename: string,
    exifDataString: string,
    csvContent: string,
    imageBase64: string,
    mimeType: string,
    preferredModel: string,
    db: ReturnType<DatabaseManager['getDb']>
): Promise<CallResult> {
    const imagePart = { inlineData: { data: imageBase64, mimeType } };
    const proRequested = preferredModel === MODEL_PRO;
    const flashFallback = proRequested ? MODEL_FLASH : preferredModel;

    if (proRequested) {
        const proResult = await tryProModel(genAI, filename, exifDataString, csvContent, imagePart);
        if (proResult) {return { result: proResult, usedModel: MODEL_PRO };}
    }

    const flashResult = await tryFlashModel(genAI, filename, exifDataString, imagePart, flashFallback);
    if (proRequested) {
        flashResult._pending_pro = true;
        queueForProAnalysis(db, row.id);
        const proPendingReason: ProPendingReason = isDailyQuotaExceeded(MODEL_PRO) ? 'daily_quota' : 'rate_limit';
        return { result: flashResult, usedModel: flashFallback, proPendingReason };
    }

    return { result: flashResult, usedModel: flashFallback };
}

export async function callProUpgrade(
    genAI: import('@google/generative-ai').GoogleGenerativeAI,
    filename: string,
    exifDataString: string,
    csvContent: string,
    imageBase64: string,
    mimeType: string
): Promise<CallResult | null> {
    const imagePart = { inlineData: { data: imageBase64, mimeType } };
    const proResult = await tryProModel(genAI, filename, exifDataString, csvContent, imagePart);
    if (!proResult) {return null;}
    return { result: proResult, usedModel: MODEL_PRO };
}
