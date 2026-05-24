import { promises as fs } from 'node:fs';
import { extname } from 'node:path';
import type { GoogleGenerativeAI } from '@google/generative-ai';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../../data/db';
import type { DomainEvent } from '../events/types';
import type { PhotoMetadataBlock } from '../photoMetadata/types';
import {
    normalizePhotoMetadataBlockBoxes,
    type LocalFaceLike,
} from '../photoMetadata/coordinateNormalization';
import { isPhotoMetadataBlock } from '../photoMetadata/validation';
import {
    assertGeminiResponseContract,
    isGeminiResponseContractError,
    remapGeminiResponseBoxesFromTileSpace,
    repairGeminiOverviewOnlyResponseMetadata,
} from './geminiResponseBoxes';
import { buildGeminiFlashPrompt, buildGeminiProPrompt } from './geminiPrompts';
import {
    buildGeminiFlashResponseSchema,
    buildGeminiProResponseSchema,
} from './geminiResponseSchema';
import {
    getUnrecoverableAiReason,
    MODEL_REFINE,
    MODEL_SCOUT,
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
import {
    loadApprovedTagVocabulary,
    resolveGeminiMetadataSourceKind,
    sanitizeGeminiResponseTags,
    type MetadataSourceKind,
} from './liveRuntimeTagHelpers';

type GoogleGenerativeAIConstructor = new (apiKey: string) => GoogleGenerativeAI;
type PendingReason = 'rate_limit' | 'daily_quota';
type EventSink = { emit: (event: DomainEvent) => void };
type ModelConfig = {
    refineModel: string;
    scoutModel: string;
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
    imageWidth: number | null;
    imageHeight: number | null;
    tileCoordinateInstructions: string[];
    tileRegions: IndexedCropRegion[];
};
type MetadataPass = 'scout' | 'refine';
export type LiveMetadataEvidence = StoredAiMetadataResult & {
    metadataBlock: PhotoMetadataBlock;
    metadataSourceKind: MetadataSourceKind;
    approvedKeywords: string[];
    tagProposals: string[];
    imageWidth?: number | null;
    imageHeight?: number | null;
};
type CropRegion = {
    left: number;
    top: number;
    width: number;
    height: number;
};
type IndexedCropRegion = CropRegion & {
    imageIndex: number;
};

const GEMINI_IMAGE_MAX_DIMENSION = 768;
const TILE_OVERLAP_RATIO = 0.2;
const TILE_COUNT = 4;
const GEMINI_GENERATION_CONFIG_BASE = {
    candidateCount: 1,
    temperature: 0,
    topK: 1,
} as const;

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
    if (configured === MODEL_REFINE || configured === MODEL_SCOUT || configured === 'gemini-2.0-flash') {
        return configured;
    }
    return '';
}

async function resolveModelConfig(dbManager: DatabaseManager): Promise<ModelConfig> {
    const apiKey = validateApiKey(dbManager);
    const configuredScoutModel = resolveConfiguredModel(dbManager.getSetting('job_ai_model_scout') || '');
    const configuredRefineModel = resolveConfiguredModel(
        dbManager.getSetting('job_ai_model_refine') || dbManager.getSetting('job_ai_model') || '',
    );
    const scoutModel = configuredScoutModel || MODEL_SCOUT;
    const refineModel = configuredRefineModel || MODEL_REFINE;

    return { refineModel, scoutModel, apiKey };
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

async function buildOverviewPlusTiles(fileBuffer: Buffer): Promise<{
    imageParts: PreparedImagePart[];
    imageWidth: number | null;
    imageHeight: number | null;
    tileCoordinateInstructions: string[];
    tileRegions: IndexedCropRegion[];
}> {
    const image = sharp(fileBuffer).rotate();
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const overview = await toGeminiJpeg(await image.clone().toBuffer());
    if (width <= 0 || height <= 0) {
        return {
            imageParts: [overview],
            imageWidth: null,
            imageHeight: null,
            tileCoordinateInstructions: [],
            tileRegions: [],
        };
    }

    const tiles: PreparedImagePart[] = [];
    const tileCoordinateInstructions: string[] = [];
    const tileRegions: IndexedCropRegion[] = [];
    let imageIndex = 2;
    for (const crop of buildTileCropRegions(width, height)) {
        const tileBuffer = await image.clone().extract(crop).toBuffer();
        tiles.push(await toGeminiJpeg(tileBuffer));
        tileRegions.push({
            imageIndex,
            ...crop,
        });
        tileCoordinateInstructions.push(
            `Image ${imageIndex} covers the full-photo pixel region left=${crop.left}, top=${crop.top}, width=${crop.width}, height=${crop.height}.`,
        );
        imageIndex += 1;
    }

    return {
        imageParts: [overview, ...tiles],
        imageWidth: width,
        imageHeight: height,
        tileCoordinateInstructions,
        tileRegions,
    };
}

async function readExifDataString(fileBuffer: Buffer): Promise<string> {
    try {
        const Parser = await import('exif-parser');
        const parser = Parser.create(fileBuffer) as { parse: () => { tags: Record<string, unknown> } };
        return JSON.stringify(parser.parse().tags);
    } catch {
        return '';
    }
}

async function buildOverviewOnlyPreparedParts(fileBuffer: Buffer): Promise<{
    imageParts: PreparedImagePart[];
    imageWidth: number | null;
    imageHeight: number | null;
    tileCoordinateInstructions: string[];
    tileRegions: IndexedCropRegion[];
}> {
    const oriented = sharp(fileBuffer).rotate();
    const metadata = await oriented.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const overview = await toGeminiJpeg(await oriented.toBuffer());
    const safeWidth = width > 0 ? width : null;
    const safeHeight = height > 0 ? height : null;

    return {
        imageParts: [overview],
        imageWidth: safeWidth,
        imageHeight: safeHeight,
        tileCoordinateInstructions: [],
        tileRegions: [],
    };
}

async function buildPreparedImageParts(
    fileBuffer: Buffer,
    imageStrategy: ImageStrategy,
): Promise<{
    imageParts: PreparedImagePart[];
    imageWidth: number | null;
    imageHeight: number | null;
    tileCoordinateInstructions: string[];
    tileRegions: IndexedCropRegion[];
}> {
    if (imageStrategy === 'overview_plus_tiles') {
        return buildOverviewPlusTiles(fileBuffer);
    }

    return buildOverviewOnlyPreparedParts(fileBuffer);
}

function buildFallbackPreparedImagePayload(
    row: ParsedAiMetadataRow,
    filename: string,
    exifDataString: string,
    fileBuffer: Buffer,
): PreparedImagePayload {
    const ext = extname(row.original_path).toLowerCase().replace('.', '') || 'jpeg';
    let mimeType = 'image/jpeg';
    if (ext === 'png') {
        mimeType = 'image/png';
    } else if (ext === 'webp') {
        mimeType = 'image/webp';
    }
    return {
        filename,
        exifDataString,
        imageParts: [{
            imageBase64: fileBuffer.toString('base64'),
            mimeType,
        }],
        imageWidth: row.width,
        imageHeight: row.height,
        tileCoordinateInstructions: [],
        tileRegions: [],
    };
}

async function prepareImagePayload(
    row: ParsedAiMetadataRow,
    imageStrategy: ImageStrategy,
): Promise<PreparedImagePayload> {
    const filename = row.original_path.split(/[/\\]/).pop() || '';
    const fileBuffer = await fs.readFile(row.original_path);
    const exifDataString = await readExifDataString(fileBuffer);

    try {
        const preparedImageParts = await buildPreparedImageParts(fileBuffer, imageStrategy);
        return {
            filename,
            exifDataString,
            imageParts: preparedImageParts.imageParts,
            imageWidth: preparedImageParts.imageWidth ?? row.width,
            imageHeight: preparedImageParts.imageHeight ?? row.height,
            tileCoordinateInstructions: preparedImageParts.tileCoordinateInstructions,
            tileRegions: preparedImageParts.tileRegions,
        };
    } catch {
        return buildFallbackPreparedImagePayload(row, filename, exifDataString, fileBuffer);
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

function logAiCall(params: {
    dbManager?: DatabaseManager;
    assetId: string;
    callType: string;
    modelName: string;
    prompt: string;
    result?: string;
    errorMessage?: string;
}) {
    if (!params.dbManager) {
        return;
    }
    try {
        const diagnosticsDb = params.dbManager.getDiagnosticsDb();
        diagnosticsDb.prepare(`
            INSERT INTO ai_calls_log (id, asset_id, call_type, model_name, prompt, result, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            uuidv4(),
            params.assetId,
            params.callType,
            params.modelName,
            params.prompt,
            params.result ?? null,
            params.errorMessage ?? null
        );
    } catch (e) {
        console.error('[AI Metadata] Failed to log AI call to diagnostics DB:', e);
    }
}

async function generateContent(
    genAI: GoogleGenerativeAI,
    modelName: string,
    prompt: string,
    imageParts: PreparedImagePart[],
    responseSchema: GeminiResponseSchema,
    logContext: {
        assetId: string;
        metadataPass: MetadataPass;
        imageStrategy: ImageStrategy;
        moduleId?: string;
        signal?: AbortSignal;
        dbManager?: DatabaseManager;
    },
): Promise<GeminiResponse> {
    recordRequest(modelName);
    
    const customHeaders: Record<string, string> = {
        'x-photostar-asset-id': logContext.assetId,
        'x-photostar-metadata-pass': logContext.metadataPass,
    };
    if (logContext.moduleId) {
        customHeaders['x-photostar-module-id'] = logContext.moduleId;
    }

    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
            ...GEMINI_GENERATION_CONFIG_BASE,
            responseMimeType: 'application/json',
            responseSchema,
        },
    }, { customHeaders });
    const startedAt = Date.now();
    try {
        const response = await model.generateContent(buildGeminiRequest(prompt, imageParts), { signal: logContext.signal });
        const elapsedMs = Date.now() - startedAt;
        console.log(`[AI Metadata] Gemini call ${modelName} completed in ${elapsedMs}ms for asset ${logContext.assetId} (${logContext.metadataPass})`);
        
        const responseText = response.response.text();
        logAiCall({
            dbManager: logContext.dbManager,
            assetId: logContext.assetId,
            callType: logContext.metadataPass,
            modelName,
            prompt,
            result: responseText,
        });

        const parsedResponse = parseGeminiResponse(responseText);
        const contractReadyResponse = repairGeminiOverviewOnlyResponseMetadata(
            parsedResponse,
            logContext.imageStrategy,
        );
        assertGeminiResponseContract({
            response: contractReadyResponse,
            imageStrategy: logContext.imageStrategy,
            imagePartCount: imageParts.length,
        });
        return contractReadyResponse;
    } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        console.warn(`[AI Metadata] Gemini call ${modelName} failed after ${elapsedMs}ms for asset ${logContext.assetId} (${logContext.metadataPass})`);
        
        logAiCall({
            dbManager: logContext.dbManager,
            assetId: logContext.assetId,
            callType: logContext.metadataPass,
            modelName,
            prompt,
            errorMessage: error instanceof Error ? error.message : String(error),
        });

        throw error;
    }
}

type GeminiResponseSchema = ReturnType<typeof buildGeminiFlashResponseSchema>;

function extractMetadataBlock(response: GeminiResponse): PhotoMetadataBlock {
    const { tag_proposals: _tagProposals, _analysis_tier: _analysisTier, _pending_pro: _pendingPro, ...block } = response;
    if (!isPhotoMetadataBlock(block)) {
        throw new Error('AI response did not match the photo metadata schema');
    }
    return block;
}

function buildLiveMetadataEvidence(params: {
    provider: string;
    modelVersion: string;
    response: GeminiResponse;
    approvedTagVocabulary: string[];
    assetId: string;
    imageWidth: number | null;
    imageHeight: number | null;
    tileRegions: IndexedCropRegion[];
    db: ReturnType<DatabaseManager['getDb']>;
}): LiveMetadataEvidence {
    const remappedResponse = remapGeminiResponseBoxesFromTileSpace({
        response: params.response,
        tileRegions: params.tileRegions,
        imageWidth: params.imageWidth,
        imageHeight: params.imageHeight,
    });
    const rawMetadataBlock = extractMetadataBlock(remappedResponse);

    let faces: LocalFaceLike[] = [];
    try {
        const faceRow = params.db.prepare(
            "SELECT data FROM derived_results WHERE asset_id = ? AND task = 'face_detection'"
        ).get(params.assetId) as { data: string } | undefined;
        if (faceRow) {
            faces = (JSON.parse(faceRow.data).faces || []) as LocalFaceLike[];
        }
    } catch {
        // ignore
    }

    const normalizedMetadataBlock = normalizePhotoMetadataBlockBoxes(rawMetadataBlock, {
        width: params.imageWidth,
        height: params.imageHeight,
    }, faces);
    const droppedSubjects = rawMetadataBlock.subjects.length - normalizedMetadataBlock.subjects.length;
    const droppedRegions = rawMetadataBlock.regions_of_interest.length - normalizedMetadataBlock.regions_of_interest.length;
    if (droppedSubjects > 0 || droppedRegions > 0) {
        console.warn(
            `[AI Metadata] Dropped ${droppedSubjects} subject boxes and ${droppedRegions} ROI boxes that could not be normalized for asset ${params.assetId}`,
        );
    }

    const sanitizedResponse = sanitizeGeminiResponseTags({
        ...remappedResponse,
        subjects: normalizedMetadataBlock.subjects,
        regions_of_interest: normalizedMetadataBlock.regions_of_interest,
    }, params.approvedTagVocabulary);
    const metadataBlock = {
        ...normalizedMetadataBlock,
        keywords: sanitizedResponse.approvedKeywords,
    };
    return {
        provider: params.provider,
        modelVersion: params.modelVersion,
        data: sanitizedResponse.storedResponse,
        metadataBlock,
        metadataSourceKind: resolveGeminiMetadataSourceKind(remappedResponse),
        approvedKeywords: sanitizedResponse.approvedKeywords,
        tagProposals: sanitizedResponse.tagProposals,
        imageWidth: params.imageWidth,
        imageHeight: params.imageHeight,
    };
}

async function tryProModel(
    genAI: GoogleGenerativeAI,
    prompt: string,
    imageParts: PreparedImagePart[],
    logContext: {
        assetId: string;
        metadataPass: MetadataPass;
        imageStrategy: ImageStrategy;
        moduleId?: string;
        signal?: AbortSignal;
        dbManager?: DatabaseManager;
    },
): Promise<GeminiResponse | null> {
    if (isDailyQuotaExceeded(MODEL_REFINE)) {
        return null;
    }
    if (!(await waitForRateLimitWindow(MODEL_REFINE))) {
        return null;
    }

    try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const parsed = await generateContent(
                    genAI,
                    MODEL_REFINE,
                    prompt,
                    imageParts,
                    buildGeminiProResponseSchema(logContext.imageStrategy),
                    logContext,
                );
                parsed._analysis_tier = 'pro';
                return parsed;
            } catch (error) {
                if (isGeminiResponseContractError(error) && attempt === 0) {
                    console.warn(`[AI Metadata] Retrying ${MODEL_REFINE} after contract-invalid response for asset ${logContext.assetId}`);
                    continue;
                }
                throw error;
            }
        }
        return null;
    } catch (error) {
        const quotaType = classifyAndRecordError(MODEL_REFINE, error as Error);
        if (quotaType === 'rate_limit' && shouldWaitForModel(MODEL_REFINE)) {
            await waitForRateLimitWindow(MODEL_REFINE);
            const retryParsed = await generateContent(
                genAI,
                MODEL_REFINE,
                prompt,
                imageParts,
                buildGeminiProResponseSchema(logContext.imageStrategy),
                logContext,
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
    logContext: {
        assetId: string;
        metadataPass: MetadataPass;
        imageStrategy: ImageStrategy;
        moduleId?: string;
        signal?: AbortSignal;
        dbManager?: DatabaseManager;
    },
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
                buildGeminiFlashResponseSchema(logContext.imageStrategy),
                logContext,
            );
            parsed._analysis_tier = 'flash';
            return parsed;
        } catch (error) {
            if (isGeminiResponseContractError(error) && attempt === 0) {
                console.warn(`[AI Metadata] Retrying ${modelName} after contract-invalid response for asset ${logContext.assetId}`);
                continue;
            }
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
    `).run(uuidv4(), assetId, MODEL_REFINE);
}

function clearProPendingRecord(db: ReturnType<DatabaseManager['getDb']>, assetId: string): void {
    db.prepare("DELETE FROM derived_results WHERE asset_id = ? AND task = 'ai_metadata_pro_pending'").run(assetId);
}

function emitPendingEvents(eventSink: EventSink | undefined, assetId: string, scoutModel: string, reason: PendingReason): void {
    if (!eventSink) {
        return;
    }
    eventSink.emit({
        type: 'AiMetadataV2UpgradeQueued',
        mediaId: assetId,
        reason,
        proModel: MODEL_REFINE,
    });
    eventSink.emit({
        type: 'QuotaWarning',
        model: MODEL_REFINE,
        fallbackModel: scoutModel,
        reason,
        assetIds: [assetId],
        pendingProCount: 1,
    });
}

function buildEvidenceParams(params: {
    provider: string;
    modelVersion: string;
    response: GeminiResponse;
    approvedTagVocabulary: string[];
    assetId: string;
    imageWidth: number | null;
    imageHeight: number | null;
    tileRegions: IndexedCropRegion[];
    db: ReturnType<DatabaseManager['getDb']>;
}) {
    return {
        provider: params.provider,
        modelVersion: params.modelVersion,
        response: params.response,
        approvedTagVocabulary: params.approvedTagVocabulary,
        assetId: params.assetId,
        imageWidth: params.imageWidth,
        imageHeight: params.imageHeight,
        tileRegions: params.tileRegions,
        db: params.db,
    };
}

function buildModelEvidence(params: {
    modelVersion: string;
    response: GeminiResponse;
    approvedTagVocabulary: string[];
    assetId: string;
    imageWidth: number | null;
    imageHeight: number | null;
    tileRegions: IndexedCropRegion[];
    db: ReturnType<DatabaseManager['getDb']>;
}) {
    return buildLiveMetadataEvidence(buildEvidenceParams({
        provider: 'google',
        modelVersion: params.modelVersion,
        response: params.response,
        approvedTagVocabulary: params.approvedTagVocabulary,
        assetId: params.assetId,
        imageWidth: params.imageWidth,
        imageHeight: params.imageHeight,
        tileRegions: params.tileRegions,
        db: params.db,
    }));
}

function buildPromptContext(params: {
    filename: string;
    exifDataString: string;
    imageStrategy: ImageStrategy;
    approvedTagVocabulary: string[];
    tileCoordinateInstructions: string[];
    originalImagePixelWidth: number | null;
    originalImagePixelHeight: number | null;
}) {
    return {
        filename: params.filename,
        exifDataString: params.exifDataString,
        imageStrategy: params.imageStrategy,
        approvedTagVocabulary: params.approvedTagVocabulary,
        tileCoordinateInstructions: params.tileCoordinateInstructions,
        originalImagePixelWidth: params.originalImagePixelWidth,
        originalImagePixelHeight: params.originalImagePixelHeight,
    };
}

async function tryRefineModelFirst(params: {
    genAI: GoogleGenerativeAI;
    promptContext: ReturnType<typeof buildPromptContext>;
    imageParts: PreparedImagePart[];
    assetId: string;
    metadataPass: MetadataPass;
    imageStrategy: 'overview_only' | 'overview_plus_tiles';
    moduleId?: string;
    signal?: AbortSignal;
    approvedTagVocabulary: string[];
    imageWidth: number | null;
    imageHeight: number | null;
    tileRegions: IndexedCropRegion[];
    db: ReturnType<DatabaseManager['getDb']>;
    dbManager: DatabaseManager;
}): Promise<LiveMetadataEvidence | null> {
    const proPrompt = buildGeminiProPrompt(params.promptContext);
    const proResult = await tryProModel(params.genAI, proPrompt, params.imageParts, {
        assetId: params.assetId,
        metadataPass: params.metadataPass,
        imageStrategy: params.imageStrategy,
        moduleId: params.moduleId,
        signal: params.signal,
        dbManager: params.dbManager,
    });
    if (proResult) {
        clearProPendingRecord(params.db, params.assetId);
        return buildModelEvidence({
            modelVersion: MODEL_REFINE,
            response: proResult,
            approvedTagVocabulary: params.approvedTagVocabulary,
            assetId: params.assetId,
            imageWidth: params.imageWidth,
            imageHeight: params.imageHeight,
            tileRegions: params.tileRegions,
            db: params.db,
        });
    }
    return null;
}

function reconcileProPendingRecord(params: {
    db: ReturnType<DatabaseManager['getDb']>;
    assetId: string;
    scoutModel: string;
    eventSink?: EventSink;
    flashResult: GeminiResponse;
    shouldRunRefineFirst: boolean;
}): void {
    if (params.shouldRunRefineFirst) {
        params.flashResult._pending_pro = true;
        const pendingReason: PendingReason = isDailyQuotaExceeded(MODEL_REFINE) ? 'daily_quota' : 'rate_limit';
        ensureProPendingRecord(params.db, params.assetId);
        emitPendingEvents(params.eventSink, params.assetId, params.scoutModel, pendingReason);
    } else {
        clearProPendingRecord(params.db, params.assetId);
    }
}

async function buildLivePromptContext(
    row: ParsedAiMetadataRow,
    imageStrategy: 'overview_only' | 'overview_plus_tiles',
    approvedTagVocabulary: string[],
) {
    const payload = await prepareImagePayload(row, imageStrategy);
    const promptContext = buildPromptContext({
        filename: payload.filename,
        exifDataString: payload.exifDataString,
        imageStrategy,
        approvedTagVocabulary,
        tileCoordinateInstructions: payload.tileCoordinateInstructions,
        originalImagePixelWidth: payload.imageWidth,
        originalImagePixelHeight: payload.imageHeight,
    });
    return { payload, promptContext };
}

export async function generateLiveAiMetadata(params: {
    dbManager: DatabaseManager;
    row: ParsedAiMetadataRow;
    imageStrategy: 'overview_only' | 'overview_plus_tiles';
    metadataPass?: MetadataPass;
    eventSink?: EventSink;
    GoogleGenerativeAIClass?: GoogleGenerativeAIConstructor;
    moduleId?: string;
    signal?: AbortSignal;
}): Promise<LiveMetadataEvidence> {
    const modelConfig = await resolveModelConfig(params.dbManager);
    const GoogleGenerativeAIClass = params.GoogleGenerativeAIClass
        ?? (await import('@google/generative-ai')).GoogleGenerativeAI;
    const genAI = new GoogleGenerativeAIClass(modelConfig.apiKey);
    const db = params.dbManager.getDb();
    const approvedTagVocabulary = loadApprovedTagVocabulary(params.dbManager);
    const { payload, promptContext } = await buildLivePromptContext(
        params.row,
        params.imageStrategy,
        approvedTagVocabulary,
    );
    const metadataPass = params.metadataPass ?? 'scout';

    try {
        const shouldRunRefineFirst = metadataPass === 'refine' && modelConfig.refineModel === MODEL_REFINE;
        if (shouldRunRefineFirst) {
            const proResult = await tryRefineModelFirst({
                genAI,
                promptContext,
                imageParts: payload.imageParts,
                assetId: params.row.id,
                metadataPass,
                imageStrategy: params.imageStrategy,
                moduleId: params.moduleId,
                signal: params.signal,
                approvedTagVocabulary,
                imageWidth: payload.imageWidth,
                imageHeight: payload.imageHeight,
                tileRegions: payload.tileRegions,
                db,
                dbManager: params.dbManager,
            });
            if (proResult) {
                return proResult;
            }
        }

        const flashPrompt = buildGeminiFlashPrompt(promptContext);
        const flashResult = await tryFlashModel(genAI, modelConfig.scoutModel, flashPrompt, payload.imageParts, {
            assetId: params.row.id,
            metadataPass,
            imageStrategy: params.imageStrategy,
            moduleId: params.moduleId,
            signal: params.signal,
            dbManager: params.dbManager,
        });
        reconcileProPendingRecord({
            db,
            assetId: params.row.id,
            scoutModel: modelConfig.scoutModel,
            eventSink: params.eventSink,
            flashResult,
            shouldRunRefineFirst,
        });

        return buildModelEvidence({
            modelVersion: modelConfig.scoutModel,
            response: flashResult,
            approvedTagVocabulary,
            assetId: params.row.id,
            imageWidth: payload.imageWidth,
            imageHeight: payload.imageHeight,
            tileRegions: payload.tileRegions,
            db,
        });
    } catch (error) {
        const unrecoverableReason = getUnrecoverableAiReason(error as Error);
        if (unrecoverableReason) {
            throw new Error(unrecoverableReason);
        }
        throw error;
    }
}
