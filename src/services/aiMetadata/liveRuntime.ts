import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import type { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type { DomainEvent } from '../events/types';
import type { PhotoMetadataBlock } from '../photoMetadata/types';
import { isPhotoMetadataBlock } from '../photoMetadata/validation';
import { buildGeminiFlashPrompt, buildGeminiProPrompt } from './geminiPrompts';
import {
    buildGeminiFlashResponseSchema,
    buildGeminiProResponseSchema,
} from './geminiResponseSchema';
import {
    getUnrecoverableAiReason,
    MODEL_FLASH,
    MODEL_PRO,
    parseGeminiResponse,
    type GeminiResponse,
    type ParsedAiMetadataRow,
    type StoredAiMetadataResult,
} from './geminiTypes';
import {
    classifyAndRecordError,
    isDailyQuotaExceeded,
    isRateLimited,
    MAX_WAIT_BEFORE_FALLBACK_MS,
    msUntilRateLimitClears,
    recordRequest,
    sleepWithLog,
} from './quotaManager';

type GoogleGenerativeAIConstructor = new (apiKey: string) => GoogleGenerativeAI;
type PendingReason = 'rate_limit' | 'daily_quota';
type EventSink = { emit: (event: DomainEvent) => void };
type ModelConfig = {
    preferredModel: string;
    flashModel: string;
    apiKey: string;
};
type ImageStrategy = 'overview_only' | 'overview_plus_tiles';
type PreparedImagePart = {
    imageBase64: string;
    mimeType: string;
};
type PreparedImagePayload = {
    filename: string;
    exifDataString: string;
    imageParts: PreparedImagePart[];
};
type MetadataSourceKind = 'gemini_flash_scout' | 'gemini_pro_refined';
export type LiveMetadataEvidence = StoredAiMetadataResult & {
    metadataBlock: PhotoMetadataBlock;
    metadataSourceKind: MetadataSourceKind;
};
type CropRegion = {
    left: number;
    top: number;
    width: number;
    height: number;
};

const GEMINI_IMAGE_MAX_DIMENSION = 768;
const TILE_OVERLAP_RATIO = 0.2;
const TILE_COUNT = 4;

function validateApiKey(dbManager: DatabaseManager): string {
    const apiKey = dbManager.getSetting('ai_metadata_v2_api_key')
        || dbManager.getSetting('gemini_api_key')
        || process.env.GEMINI_API_KEY;
    const keyTrimmed = apiKey?.trim() ?? '';
    if (!keyTrimmed) {
        throw new Error('MISSING_API_KEY');
    }
    if (!keyTrimmed.startsWith('AIza') || keyTrimmed.length < 30) {
        throw new Error('INVALID_API_KEY_FORMAT');
    }
    return keyTrimmed;
}

export function getLiveAiConfigurationError(dbManager: DatabaseManager): string | null {
    try {
        validateApiKey(dbManager);
        return null;
    } catch (error) {
        return getUnrecoverableAiReason(error as Error) ?? (error as Error).message;
    }
}

function resolveConfiguredModel(settingValue: string): string {
    const configured = settingValue.trim();
    if (configured === MODEL_PRO || configured === MODEL_FLASH || configured === 'gemini-2.0-flash') {
        return configured;
    }
    return MODEL_FLASH;
}

async function resolveModelConfig(dbManager: DatabaseManager): Promise<ModelConfig> {
    const apiKey = validateApiKey(dbManager);
    const configuredModel = resolveConfiguredModel(dbManager.getSetting('job_ai_model') || MODEL_FLASH);
    const flashModel = configuredModel === MODEL_PRO ? MODEL_FLASH : configuredModel;
    const preferredModel = configuredModel;

    return { preferredModel, flashModel, apiKey };
}

async function toGeminiJpeg(buffer: Buffer): Promise<PreparedImagePart> {
    const optimizedBuffer = await sharp(buffer)
        .rotate()
        .resize(GEMINI_IMAGE_MAX_DIMENSION, GEMINI_IMAGE_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();

    return {
        imageBase64: optimizedBuffer.toString('base64'),
        mimeType: 'image/jpeg',
    };
}

function buildLinearCropRegions(params: {
    width: number;
    height: number;
    axis: 'x' | 'y';
}): CropRegion[] {
    const total = params.axis === 'x' ? params.width : params.height;
    const cross = params.axis === 'x' ? params.height : params.width;
    const segment = Math.max(1, Math.ceil(total / TILE_COUNT));
    const overlap = Math.round(segment * TILE_OVERLAP_RATIO);
    const windowSize = Math.min(total, segment + overlap);
    const maxStart = Math.max(0, total - windowSize);
    const regions: CropRegion[] = [];

    for (let index = 0; index < TILE_COUNT; index += 1) {
        const start = Math.min(maxStart, Math.max(0, index * segment - overlap));
        if (params.axis === 'x') {
            regions.push({ left: start, top: 0, width: windowSize, height: cross });
        } else {
            regions.push({ left: 0, top: start, width: cross, height: windowSize });
        }
    }

    return regions;
}

function buildGridCropRegions(width: number, height: number): CropRegion[] {
    const columnWidth = Math.max(1, Math.ceil(width / 2));
    const rowHeight = Math.max(1, Math.ceil(height / 2));
    const overlapX = Math.round(columnWidth * TILE_OVERLAP_RATIO);
    const overlapY = Math.round(rowHeight * TILE_OVERLAP_RATIO);
    const tileWidth = Math.min(width, columnWidth + overlapX);
    const tileHeight = Math.min(height, rowHeight + overlapY);
    const leftPositions = [0, Math.max(0, width - tileWidth)];
    const topPositions = [0, Math.max(0, height - tileHeight)];

    return topPositions.flatMap((top) => leftPositions.map((left) => ({
        left,
        top,
        width: tileWidth,
        height: tileHeight,
    })));
}

function buildTileCropRegions(width: number, height: number): CropRegion[] {
    const aspectRatio = width / Math.max(1, height);
    if (aspectRatio >= 1.5) {
        return buildLinearCropRegions({ width, height, axis: 'x' });
    }
    if (aspectRatio <= 1 / 1.5) {
        return buildLinearCropRegions({ width, height, axis: 'y' });
    }
    return buildGridCropRegions(width, height);
}

async function buildOverviewPlusTiles(fileBuffer: Buffer): Promise<PreparedImagePart[]> {
    const image = sharp(fileBuffer).rotate();
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const overview = await toGeminiJpeg(await image.clone().toBuffer());
    if (width <= 0 || height <= 0) {
        return [overview];
    }

    const tiles: PreparedImagePart[] = [];
    for (const crop of buildTileCropRegions(width, height)) {
        const tileBuffer = await image.clone().extract(crop).toBuffer();
        tiles.push(await toGeminiJpeg(tileBuffer));
    }

    return [overview, ...tiles];
}

async function prepareImagePayload(
    row: ParsedAiMetadataRow,
    imageStrategy: ImageStrategy,
): Promise<PreparedImagePayload> {
    const filename = row.original_path.split(/[/\\]/).pop() || '';
    const fileBuffer = await fs.readFile(row.original_path);

    let exifDataString = '';
    try {
        const Parser = await import('exif-parser');
        const parser = Parser.create(fileBuffer) as { parse: () => { tags: Record<string, unknown> } };
        exifDataString = JSON.stringify(parser.parse().tags);
    } catch {
        exifDataString = '';
    }

    try {
        const imageParts = imageStrategy === 'overview_plus_tiles'
            ? await buildOverviewPlusTiles(fileBuffer)
            : [await toGeminiJpeg(fileBuffer)];
        return {
            filename,
            exifDataString,
            imageParts,
        };
    } catch {
        const ext = extname(row.original_path).toLowerCase().replace('.', '') || 'jpeg';
        const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        return {
            filename,
            exifDataString,
            imageParts: [{
                imageBase64: fileBuffer.toString('base64'),
                mimeType,
            }],
        };
    }
}

async function waitForRateLimitWindow(model: string, allowLongWait = false): Promise<boolean> {
    if (!isRateLimited(model)) {
        return true;
    }
    const waitMs = msUntilRateLimitClears(model);
    if (!allowLongWait && waitMs > MAX_WAIT_BEFORE_FALLBACK_MS) {
        return false;
    }
    await sleepWithLog(waitMs);
    return !isRateLimited(model);
}

function shouldWaitForModel(model: string): boolean {
    return isRateLimited(model) && msUntilRateLimitClears(model) <= MAX_WAIT_BEFORE_FALLBACK_MS;
}

function buildGeminiRequest(prompt: string, imageParts: PreparedImagePart[]) {
    return [
        prompt,
        ...imageParts.map((imagePart) => ({
            inlineData: {
                data: imagePart.imageBase64,
                mimeType: imagePart.mimeType,
            },
        })),
    ];
}

async function generateContent(
    genAI: GoogleGenerativeAI,
    modelName: string,
    prompt: string,
    imageParts: PreparedImagePart[],
    responseSchema: GeminiResponseSchema,
): Promise<GeminiResponse> {
    recordRequest(modelName);
    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema,
        },
    });
    const response = await model.generateContent(buildGeminiRequest(prompt, imageParts));
    return parseGeminiResponse(response.response.text());
}

type GeminiResponseSchema = ReturnType<typeof buildGeminiFlashResponseSchema>;

function resolveMetadataSourceKind(response: GeminiResponse): MetadataSourceKind {
    return response._analysis_tier === 'pro' ? 'gemini_pro_refined' : 'gemini_flash_scout';
}

function extractMetadataBlock(response: GeminiResponse): PhotoMetadataBlock {
    const { _analysis_tier: _analysisTier, _pending_pro: _pendingPro, ...block } = response;
    if (!isPhotoMetadataBlock(block)) {
        throw new Error('AI response did not match the photo metadata schema');
    }
    return block;
}

function buildLiveMetadataEvidence(params: {
    provider: string;
    modelVersion: string;
    response: GeminiResponse;
}): LiveMetadataEvidence {
    const metadataBlock = extractMetadataBlock(params.response);
    return {
        provider: params.provider,
        modelVersion: params.modelVersion,
        data: params.response as unknown as Record<string, unknown>,
        metadataBlock,
        metadataSourceKind: resolveMetadataSourceKind(params.response),
    };
}

async function tryProModel(
    genAI: GoogleGenerativeAI,
    prompt: string,
    imageParts: PreparedImagePart[],
): Promise<GeminiResponse | null> {
    if (isDailyQuotaExceeded(MODEL_PRO)) {
        return null;
    }
    if (!(await waitForRateLimitWindow(MODEL_PRO))) {
        return null;
    }

    try {
        const parsed = await generateContent(
            genAI,
            MODEL_PRO,
            prompt,
            imageParts,
            buildGeminiProResponseSchema(),
        );
        parsed._analysis_tier = 'pro';
        return parsed;
    } catch (error) {
        const quotaType = classifyAndRecordError(MODEL_PRO, error as Error);
        if (quotaType === 'rate_limit' && shouldWaitForModel(MODEL_PRO)) {
            await waitForRateLimitWindow(MODEL_PRO);
            const retryParsed = await generateContent(
                genAI,
                MODEL_PRO,
                prompt,
                imageParts,
                buildGeminiProResponseSchema(),
            );
            retryParsed._analysis_tier = 'pro';
            return retryParsed;
        }
        return null;
    }
}

async function tryFlashModel(
    genAI: GoogleGenerativeAI,
    modelName: string,
    prompt: string,
    imageParts: PreparedImagePart[],
): Promise<GeminiResponse> {
    if (isDailyQuotaExceeded(modelName)) {
        throw new Error('DAILY_QUOTA_EXCEEDED');
    }
    await waitForRateLimitWindow(modelName, true);

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const parsed = await generateContent(
                genAI,
                modelName,
                prompt,
                imageParts,
                buildGeminiFlashResponseSchema(),
            );
            parsed._analysis_tier = 'flash';
            return parsed;
        } catch (error) {
            const quotaType = classifyAndRecordError(modelName, error as Error);
            if (quotaType === 'daily_quota') {
                throw new Error('DAILY_QUOTA_EXCEEDED');
            }
            if (quotaType !== 'rate_limit') {
                throw error;
            }
            await waitForRateLimitWindow(modelName, true);
        }
    }

    throw new Error('FLASH_RATE_LIMITED_STOP');
}

function ensureProPendingRecord(db: ReturnType<DatabaseManager['getDb']>, assetId: string): void {
    const existing = db.prepare(
        "SELECT id FROM derived_results WHERE asset_id = ? AND task = 'ai_metadata_pro_pending'"
    ).get(assetId);
    if (existing) {
        return;
    }
    db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (?, ?, 'ai_metadata_pro_pending', 'google', ?, '{}')
    `).run(uuidv4(), assetId, MODEL_PRO);
}

function clearProPendingRecord(db: ReturnType<DatabaseManager['getDb']>, assetId: string): void {
    db.prepare("DELETE FROM derived_results WHERE asset_id = ? AND task = 'ai_metadata_pro_pending'").run(assetId);
}

function emitPendingEvents(eventSink: EventSink | undefined, assetId: string, flashModel: string, reason: PendingReason): void {
    if (!eventSink) {
        return;
    }
    eventSink.emit({
        type: 'AiMetadataV2UpgradeQueued',
        mediaId: assetId,
        reason,
        proModel: MODEL_PRO,
    });
    eventSink.emit({
        type: 'QuotaWarning',
        model: MODEL_PRO,
        fallbackModel: flashModel,
        reason,
        assetIds: [assetId],
        pendingProCount: 1,
    });
}

export async function generateLiveAiMetadata(params: {
    dbManager: DatabaseManager;
    row: ParsedAiMetadataRow;
    imageStrategy: 'overview_only' | 'overview_plus_tiles';
    eventSink?: EventSink;
    GoogleGenerativeAIClass?: GoogleGenerativeAIConstructor;
}): Promise<LiveMetadataEvidence> {
    const modelConfig = await resolveModelConfig(params.dbManager);
    const GoogleGenerativeAIClass = params.GoogleGenerativeAIClass
        ?? (await import('@google/generative-ai')).GoogleGenerativeAI;
    const genAI = new GoogleGenerativeAIClass(modelConfig.apiKey);
    const db = params.dbManager.getDb();
    const { filename, exifDataString, imageParts } = await prepareImagePayload(params.row, params.imageStrategy);

    try {
        const prefersPro = modelConfig.preferredModel === MODEL_PRO;
        if (prefersPro) {
            const proPrompt = buildGeminiProPrompt({ filename, exifDataString, imageStrategy: params.imageStrategy });
            const proResult = await tryProModel(genAI, proPrompt, imageParts);
            if (proResult) {
                clearProPendingRecord(db, params.row.id);
                return buildLiveMetadataEvidence({
                    provider: 'google',
                    modelVersion: MODEL_PRO,
                    response: proResult,
                });
            }
        }

        const flashPrompt = buildGeminiFlashPrompt({ filename, exifDataString, imageStrategy: params.imageStrategy });
        const flashResult = await tryFlashModel(genAI, modelConfig.flashModel, flashPrompt, imageParts);
        if (prefersPro) {
            flashResult._pending_pro = true;
            const pendingReason: PendingReason = isDailyQuotaExceeded(MODEL_PRO) ? 'daily_quota' : 'rate_limit';
            ensureProPendingRecord(db, params.row.id);
            emitPendingEvents(params.eventSink, params.row.id, modelConfig.flashModel, pendingReason);
        } else {
            clearProPendingRecord(db, params.row.id);
        }

        return buildLiveMetadataEvidence({
            provider: 'google',
            modelVersion: modelConfig.flashModel,
            response: flashResult,
        });
    } catch (error) {
        const unrecoverableReason = getUnrecoverableAiReason(error as Error);
        if (unrecoverableReason) {
            throw new Error(unrecoverableReason);
        }
        throw error;
    }
}
