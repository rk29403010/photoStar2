import type { MediaResolution } from '@google/genai';
import type { DatabaseManager } from '../../../../data/db';
import type { RefinementTarget } from '../../../../shared/photoAnalysis/contracts';
import { ApiKeyManager, KeyNotFoundError } from '../../../security/ApiKeyManager';
import { createGeminiProvider, createGoogleGenAIClient, type GeminiThinking } from '../../../photoAnalysis/geminiProvider';
import { runPhotoAnalysis } from '../../../photoAnalysis/pipeline';
import type { AnalysisAssetRow } from '../../../photoAnalysis/localInputs';
import { getUnrecoverableAiReason, MODEL_REFINE, MODEL_SCOUT } from './geminiTypes';

async function resolveApiKey(): Promise<string> {
    try { return await ApiKeyManager.getPlaintextKey('gemini'); }
    catch (error) {
        if (!(error instanceof KeyNotFoundError)) { throw error; }
        const key = process.env.GEMINI_API_KEY;
        if (!key) { throw new Error('MISSING_API_KEY'); }
        return key;
    }
}

export async function getLiveAiConfigurationError(): Promise<string | null> {
    try { await resolveApiKey(); return null; }
    catch (error) { return getUnrecoverableAiReason(error as Error) ?? (error as Error).message; }
}

export async function generateLiveAiMetadata(params: {
    dbManager: DatabaseManager; row: AnalysisAssetRow; metadataPass?: 'scout' | 'refine'; targets?: RefinementTarget[];
    signal?: AbortSignal; persist?: boolean; modelOverride?: string; promptVariant?: string;
}) {
    const stage = params.metadataPass ?? 'scout';
    const configuredModel = params.modelOverride ?? params.dbManager.getSetting(`job_ai_model_${stage}`);
    const thinkingSetting = params.dbManager.getSetting(`job_ai_thinking_${stage}`);
    const mediaSetting = params.dbManager.getSetting(`job_ai_media_resolution_${stage}`);
    return runPhotoAnalysis({
        ...params, model: configuredModel || (stage === 'refine' ? MODEL_REFINE : MODEL_SCOUT),
        provider: createGeminiProvider({ client: createGoogleGenAIClient(await resolveApiKey()) }),
        perceptionModel: params.dbManager.getSetting('job_ai_model_perception') || undefined,
        thinking: thinkingSetting ? JSON.parse(thinkingSetting) as GeminiThinking : undefined,
        mediaResolution: mediaSetting ? mediaSetting as MediaResolution : undefined,
    });
}
