import { promises as fs } from 'node:fs';
import type { DatabaseManager } from '../db';
import type { EventBus } from '../events/bus';
import { MODEL_FLASH, MODEL_PRO } from './ai_metadata_shared';
import { existsSync } from './ai_metadata_job_support';

const LEGACY_FLASH_MODEL = 'gemini-2.0-flash';
const SUPPORTED_MODELS = new Set([MODEL_PRO, MODEL_FLASH, LEGACY_FLASH_MODEL]);

type QuotaReason = 'rate_limit' | 'daily_quota';
type FreshStopReason = 'flash_daily_quota' | 'flash_rate_limit';
export type ProStopReason = 'pro_daily_quota' | 'pro_rate_limit';

export type ModelConfig = { preferredModel: string; flashModel: string; csvContent: string; keyTrimmed: string };
export type JobCounters = {
    processed: number;
    errors: number;
    skipped: number;
    proQueued: number;
    freshStopReason: FreshStopReason | null;
    proStopReason: ProStopReason | null;
    freshDeferredIds: string[];
    proDeferredIds: string[];
    proQueuedIdsByReason: Record<QuotaReason, string[]>;
};

export function initCounters(): JobCounters {
    return {
        processed: 0,
        errors: 0,
        skipped: 0,
        proQueued: 0,
        freshStopReason: null,
        proStopReason: null,
        freshDeferredIds: [],
        proDeferredIds: [],
        proQueuedIdsByReason: { daily_quota: [], rate_limit: [] }
    };
}

export function validateApiKey(dbManager: DatabaseManager, eventBus: EventBus, jobId: string, pipelineStage: string): string | null {
    const apiKey = dbManager.getSetting('gemini_api_key');
    const keyTrimmed = apiKey?.trim() ?? '';
    if (!keyTrimmed) {
        eventBus.emit({ type: 'JobFailed', jobId, pipelineStage, severity: 'fatal', reason: 'MISSING_API_KEY' });
        return null;
    }
    if (!keyTrimmed.startsWith('AIza') || keyTrimmed.length < 30) {
        eventBus.emit({ type: 'JobFailed', jobId, pipelineStage, severity: 'fatal', reason: 'INVALID_API_KEY_FORMAT' });
        return null;
    }
    return keyTrimmed;
}

function getReadableCsvPath(dbManager: DatabaseManager): string | null {
    const csvPath = dbManager.getSetting('gemini_csv_path');
    return csvPath && existsSync(csvPath) ? csvPath : null;
}

async function readCsvContent(csvPath: string | null): Promise<string> {
    if (!csvPath) {
        return '';
    }

    try {
        return await fs.readFile(csvPath, 'utf-8');
    } catch {
        return '';
    }
}

function resolveConfiguredModel(settingModelRaw: string): string {
    const settingModel = settingModelRaw.trim();
    return SUPPORTED_MODELS.has(settingModel) ? settingModel : MODEL_FLASH;
}

function resolveEffectiveModels(configuredModel: string, hasPeopleCsv: boolean) {
    const flashModel = configuredModel === MODEL_PRO ? MODEL_FLASH : configuredModel;
    const preferredModel = configuredModel === MODEL_PRO && !hasPeopleCsv
        ? MODEL_FLASH
        : configuredModel;

    return { flashModel, preferredModel };
}

export async function resolveModelConfig(dbManager: DatabaseManager, keyTrimmed: string): Promise<ModelConfig> {
    const csvPath = getReadableCsvPath(dbManager);
    const csvContent = await readCsvContent(csvPath);
    const hasPeopleCsv = csvContent.trim().length > 0;
    const settingModelRaw = dbManager.getSetting('job_ai_model') || MODEL_FLASH;
    const configuredModel = resolveConfiguredModel(settingModelRaw);
    const { flashModel, preferredModel } = resolveEffectiveModels(configuredModel, hasPeopleCsv);

    console.log(
        `[AiMetadataJob] Effective model: ${preferredModel} | flashQueue=${flashModel} | hasPeopleCsv=${hasPeopleCsv} | setting=${settingModelRaw || '(empty)'} | Key: ...${keyTrimmed.slice(-4)}`
    );
    return { preferredModel, flashModel, csvContent, keyTrimmed };
}