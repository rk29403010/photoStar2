import { DatabaseManager } from '../db';
import { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { existsSync, promises as fs } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'node:path';
import {
    recordRequest,
    isDailyQuotaExceeded,
    isRateLimited,
    msUntilRateLimitClears,
    classifyAndRecordError,
    sleepWithLog,
    MAX_WAIT_BEFORE_FALLBACK_MS,
} from './quota_manager';

// ── Model names ────────────────────────────────────────────────────────────────
const MODEL_PRO = 'gemini-3.1-pro-preview';
const MODEL_FLASH = 'gemini-3-flash-preview';

// ── Types ──────────────────────────────────────────────────────────────────────
interface GeminiResponse {
    type: string;
    estimated_date: string;
    location: string;
    subjects: Array<{
        label: string;
        bounding_box: { x: number; y: number; width: number; height: number };
        type: 'person' | 'pet';
        location_desc: string;
        gender?: string;
        animal_type?: string;
        age_range?: string;
        dob_range?: string;
        emotion?: string;
        gaze?: string;
        features?: string;
        suggested_names?: string[];
        uniform?: string;
    }>;
    caption: string;
    keywords: string[];
    emotional_impact: string;
    quality: {
        technical: number;
        lighting: number;
        composition: number;
        emotional: number;
        discard: boolean;
    };
    recommended_enhancements: string[];
    authenticity: {
        score: number;
        reasons: string[];
    };
    _analysis_tier?: 'pro' | 'flash'; // injected before save
    _pending_pro?: boolean;            // injected when queued for pro upgrade
}

type RowData = { id: string; original_path: string; sensitivity_status: string; sensitivity_score: number | null };

// ── Prompts ────────────────────────────────────────────────────────────────────

/** Full prompt using 3.1-pro multi-step thinking + CSV person matching */
function buildProPrompt(filename: string, exifDataString: string, csvContent: string): string {
    return `You are an expert photo archivist and AI analyst with access to extended thinking.
Use step-by-step reasoning to carefully analyse this image, then respond ONLY with valid JSON.

Context metadata:
- Filename: ${filename}
- EXIF Data: ${exifDataString || 'none'}
${csvContent ? `\nPotential Subjects (name / DOB reference list — use multi-step reasoning to match age, gender, and context):\n${csvContent}` : ''}

Analyse and return JSON matching this exact schema:
{
  "type": "string (Landscape, Large group portrait, Family portrait, Document, Newspaper clipping, Drawing, Painting, Selfie, Gravestone)",
  "estimated_date": "string — be as accurate as possible (decade, year, or full date). Use clothing, hairstyles, technology, EXIF, filename.",
  "location": "string (estimated location or 'Unknown')",
  "subjects": [
    {
      "label": "string (e.g. Subject1, unique per subject)",
      "bounding_box": { "x": number, "y": number, "width": number, "height": number },
      "type": "person | pet",
      "location_desc": "string (e.g. '2nd from left')",
      "gender": "male | female | other",
      "animal_type": "string (for pets)",
      "age_range": "string",
      "dob_range": "string (estimated birth decade or range)",
      "emotion": "string",
      "gaze": "string",
      "features": "string (distinctive features)",
      "suggested_names": ["string — from the reference list if confident"],
      "uniform": "string (if applicable)"
    }
  ],
  "caption": "string (descriptive, using subject labels)",
  "keywords": ["string"],
  "emotional_impact": "string",
  "quality": {
    "technical": number,
    "lighting": number,
    "composition": number,
    "emotional": number,
    "discard": boolean
  },
  "recommended_enhancements": ["string"],
  "authenticity": { "score": number, "reasons": ["string"] }
}`;
}

/** Simplified prompt for 3-flash — drop CSV matching, lighter schema */
function buildFlashPrompt(filename: string, exifDataString: string): string {
    return `You are a photo archivist. Analyse this image and return ONLY valid JSON.

Context:
- Filename: ${filename}
- EXIF Data: ${exifDataString || 'none'}

Return JSON matching this schema exactly (no extra keys):
{
  "type": "string (Landscape, Group portrait, Family portrait, Document, Selfie, etc.)",
  "estimated_date": "string (decade or year — use EXIF, clothing, hairstyles)",
  "location": "string (estimated location or 'Unknown')",
  "subjects": [
    {
      "label": "string (Subject1, Subject2, etc.)",
      "bounding_box": { "x": number, "y": number, "width": number, "height": number },
      "type": "person | pet",
      "location_desc": "string (e.g. 'centre', '2nd from left')",
      "gender": "male | female | other",
      "age_range": "string",
      "emotion": "string"
    }
  ],
  "caption": "string",
  "keywords": ["string"],
  "emotional_impact": "string",
  "quality": {
    "technical": number,
    "lighting": number,
    "composition": number,
    "emotional": number,
    "discard": boolean
  },
  "recommended_enhancements": ["string"],
  "authenticity": { "score": number, "reasons": ["string"] }
}`;
}

// ── Queue helpers ──────────────────────────────────────────────────────────────

/** Mark an asset as pending pro re-analysis in the DB */
function queueForProAnalysis(db: ReturnType<DatabaseManager['getDb']>, assetId: string): void {
    // Upsert a marker row in derived_results — won't overwrite existing ai_metadata
    const existing = db.prepare(
        `SELECT id FROM derived_results WHERE asset_id = ? AND task = 'ai_metadata_pro_pending'`
    ).get(assetId);
    if (!existing) {
        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES (?, ?, 'ai_metadata_pro_pending', 'google', ?, '{}')
        `).run(uuidv4(), assetId, MODEL_PRO);
    }
}

/** Return all asset IDs currently queued for pro re-analysis */
export function getPendingProAssetIds(db: ReturnType<DatabaseManager['getDb']>): string[] {
    return (db.prepare(
        `SELECT asset_id FROM derived_results WHERE task = 'ai_metadata_pro_pending'`
    ).all() as { asset_id: string }[]).map(r => r.asset_id);
}

/** Clear the pending-pro marker for an asset */
function clearProPending(db: ReturnType<DatabaseManager['getDb']>, assetId: string): void {
    db.prepare(`DELETE FROM derived_results WHERE asset_id = ? AND task = 'ai_metadata_pro_pending'`).run(assetId);
}

// ── Core: call one model with one image ───────────────────────────────────────

interface CallResult {
    result: GeminiResponse;
    usedModel: string;
}

/**
 * Attempt to call the Gemini API for a single asset.
 * Implements the fallback chain: pro → (wait or flash) → stop
 *
 * @returns CallResult on success
 * @throws Error('DAILY_QUOTA_EXCEEDED') if both models are daily-exhausted
 * @throws Error('FLASH_RATE_LIMITED_STOP') if flash hit per-minute limit (caller should stop batch)
 */
async function callWithFallback(
    genAI: import('@google/generative-ai').GoogleGenerativeAI,
    row: RowData,
    filename: string,
    exifDataString: string,
    csvContent: string,
    imageBase64: string,
    mimeType: string,
    preferredModel: string,
    db: ReturnType<DatabaseManager['getDb']>,
    eventBus: EventBus
): Promise<CallResult> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    void GoogleGenerativeAI; // type import reference

    const imagePart = { inlineData: { data: imageBase64, mimeType } };

    // Decide which models to try
    const proRequested = preferredModel === MODEL_PRO;
    const flashFallback = MODEL_FLASH;

    // ── Attempt 1: preferred model (only if it's the pro model) ─────────────
    if (proRequested) {
        // Skip pro if already daily-exceeded or in a long rate limit
        if (isDailyQuotaExceeded(MODEL_PRO)) {
            console.warn(`[AiMetadataJob] ${MODEL_PRO} daily quota exceeded — skipping to flash`);
        } else if (isRateLimited(MODEL_PRO)) {
            const waitMs = msUntilRateLimitClears(MODEL_PRO);
            if (waitMs <= MAX_WAIT_BEFORE_FALLBACK_MS) {
                await sleepWithLog(waitMs, `Waiting for ${MODEL_PRO} rate limit`);
            } else {
                console.warn(`[AiMetadataJob] ${MODEL_PRO} rate-limited for ${Math.ceil(waitMs / 1000)}s — falling back to flash`);
            }
        }

        if (!isDailyQuotaExceeded(MODEL_PRO) && !isRateLimited(MODEL_PRO)) {
            try {
                recordRequest(MODEL_PRO);
                const proModel = genAI.getGenerativeModel({ model: MODEL_PRO, generationConfig: { responseMimeType: 'application/json' } });
                const proResult = await proModel.generateContent([buildProPrompt(filename, exifDataString, csvContent), imagePart]);
                const parsed = parseResponse(proResult.response.text());
                parsed._analysis_tier = 'pro';
                return { result: parsed, usedModel: MODEL_PRO };
            } catch (err: unknown) {
                const e = err as Error;
                const errType = classifyAndRecordError(MODEL_PRO, e);
                if (errType === 'daily_quota') {
                    console.warn(`[AiMetadataJob] ${MODEL_PRO} daily quota hit — falling to flash`);
                } else if (errType === 'rate_limit') {
                    const waitMs = msUntilRateLimitClears(MODEL_PRO);
                    if (waitMs <= MAX_WAIT_BEFORE_FALLBACK_MS) {
                        console.log(`[AiMetadataJob] ${MODEL_PRO} rate-limited, retrying once after ${Math.ceil(waitMs / 1000)}s`);
                        await sleepWithLog(waitMs, `Retry wait for ${MODEL_PRO}`);
                        // Retry once
                        try {
                            recordRequest(MODEL_PRO);
                            const proModel = genAI.getGenerativeModel({ model: MODEL_PRO, generationConfig: { responseMimeType: 'application/json' } });
                            const proResult = await proModel.generateContent([buildProPrompt(filename, exifDataString, csvContent), imagePart]);
                            const parsed = parseResponse(proResult.response.text());
                            parsed._analysis_tier = 'pro';
                            return { result: parsed, usedModel: MODEL_PRO };
                        } catch (retryErr: unknown) {
                            classifyAndRecordError(MODEL_PRO, retryErr as Error);
                            console.warn(`[AiMetadataJob] ${MODEL_PRO} retry failed — falling to flash`);
                        }
                    } else {
                        console.warn(`[AiMetadataJob] ${MODEL_PRO} wait too long (${Math.ceil(waitMs / 1000)}s) — falling to flash immediately`);
                    }
                } else {
                    // Non-quota error on pro — still try flash
                    console.warn(`[AiMetadataJob] ${MODEL_PRO} error (non-quota): ${e.message} — trying flash`);
                }
            }
        }
    }

    // ── Attempt 2: flash fallback ────────────────────────────────────────────
    if (isDailyQuotaExceeded(flashFallback)) {
        // Both models daily-exhausted — stop the job
        throw new Error('DAILY_QUOTA_EXCEEDED');
    }

    if (isRateLimited(flashFallback)) {
        // Flash rate-limited — don't wait, signal caller to stop batch
        throw new Error('FLASH_RATE_LIMITED_STOP');
    }

    try {
        recordRequest(flashFallback);
        const flashModel = genAI.getGenerativeModel({ model: flashFallback, generationConfig: { responseMimeType: 'application/json' } });
        const flashResult = await flashModel.generateContent([buildFlashPrompt(filename, exifDataString), imagePart]);
        const parsed = parseResponse(flashResult.response.text());
        parsed._analysis_tier = 'flash';

        // If we fell back from pro, queue this asset for pro re-analysis later
        if (proRequested) {
            parsed._pending_pro = true;
            queueForProAnalysis(db, row.id);
            console.log(`[AiMetadataJob] Flash used for ${row.id} — queued for ${MODEL_PRO} re-analysis`);
            eventBus.emit({
                type: 'QuotaWarning',
                model: MODEL_PRO,
                fallbackModel: flashFallback,
                reason: isDailyQuotaExceeded(MODEL_PRO) ? 'daily_quota' : 'rate_limit',
                assetIds: [row.id],
                pendingProCount: 1
            });
        }

        return { result: parsed, usedModel: flashFallback };
    } catch (err: unknown) {
        const e = err as Error;
        const errType = classifyAndRecordError(flashFallback, e);
        if (errType === 'rate_limit') {
            throw new Error('FLASH_RATE_LIMITED_STOP');
        }
        if (errType === 'daily_quota') {
            throw new Error('DAILY_QUOTA_EXCEEDED');
        }
        throw e; // Re-throw non-quota errors
    }
}

/** Strip optional markdown code fence and parse JSON */
function parseResponse(text: string): GeminiResponse {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
        return JSON.parse(cleaned) as GeminiResponse;
    } catch (e: unknown) {
        throw new Error('Failed to parse AI JSON response: ' + (e as Error).message + '\nRaw: ' + cleaned.slice(0, 200));
    }
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function runAiMetadataJob(
    mediaIds: string[] | 'auto',
    dbManager: DatabaseManager,
    eventBus: EventBus,
    uiJobId?: string
) {
    const db = dbManager.getDb();
    const jobId = uiJobId || `ai_meta-${Date.now()}`;

    // 1. Validate API key
    const apiKey = dbManager.getSetting('gemini_api_key');
    const keyTrimmed = apiKey?.trim() ?? '';
    if (!keyTrimmed) {
        console.error(`[AiMetadataJob] Aborted: No Gemini API key configured. (Job: ${jobId})`);
        eventBus.emit({ type: 'JobFailed', jobId, severity: 'fatal', reason: 'MISSING_API_KEY' });
        return;
    }
    if (!keyTrimmed.startsWith('AIza') || keyTrimmed.length < 30) {
        console.error(`[AiMetadataJob] Aborted: API key invalid (...${keyTrimmed.slice(-4)}). (Job: ${jobId})`);
        eventBus.emit({ type: 'JobFailed', jobId, severity: 'fatal', reason: 'INVALID_API_KEY_FORMAT' });
        return;
    }

    // 2. Determine preferred model from settings (default to pro for best person ID)
    const preferredModel = dbManager.getSetting('job_ai_model') || MODEL_PRO;
    console.log(`[AiMetadataJob] Preferred model: ${preferredModel} | Key: ...${keyTrimmed.slice(-4)}`);

    // 3. Load CSV names if available
    const csvPath = dbManager.getSetting('gemini_csv_path');
    let csvContent = '';
    if (csvPath && existsSync(csvPath)) {
        try { csvContent = await fs.readFile(csvPath, 'utf-8'); }
        catch (e) { console.warn('[AiMetadataJob] Failed to read CSV:', e); }
    }

    // 4. Load rows to process
    let rows: RowData[];
    if (mediaIds === 'auto') {
        rows = db.prepare(`
            SELECT a.id, a.original_path, a.sensitivity_score, am.sensitivity_status
            FROM assets a
            LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
            LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
            LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'ai_metadata'
            WHERE dr.id IS NULL
            ORDER BY a.created_at ASC
        `).all() as RowData[];
    } else {
        const placeholders = mediaIds.map(() => '?').join(',');
        rows = db.prepare(`
            SELECT a.id, a.original_path, a.sensitivity_score, am.sensitivity_status
            FROM assets a
            LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
            LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
            WHERE a.id IN (${placeholders})
        `).all(...mediaIds) as RowData[];
    }

    if (rows.length === 0) {
        console.log('[AiMetadataJob] Nothing to process.');
        return;
    }

    const totalItems = rows.length;
    let processed = 0, errors = 0, skipped = 0, proQueued = 0;
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(keyTrimmed);

    eventBus.emit({ type: 'JobStarted', jobId, pipelineStage: 'ai_metadata', totalItems });

    // 5. Process each row
    let dailyQuotaStop = false;
    let flashRateLimitStop = false;
    const stoppedEarlyIds: string[] = [];

    for (const row of rows) {
        await waitIfPaused();

        if (dailyQuotaStop || flashRateLimitStop) {
            stoppedEarlyIds.push(row.id);
            continue; // Count remaining as unprocessed
        }

        // Skip sensitive content
        const isUnsafe =
            row.sensitivity_status === 'unsafe' ||
            (row.sensitivity_status !== 'safe' && row.sensitivity_score !== null && row.sensitivity_score > 75);
        if (isUnsafe) {
            console.log(`[AiMetadataJob] Skipping sensitive asset ${row.id}`);
            skipped++;
            processed++;
            eventBus.emit({ type: 'JobProgress', jobId, processedItems: processed, totalItems, currentItemPath: row.original_path, throughputIps: 0, errorCount: errors });
            continue;
        }

        try {
            if (!existsSync(row.original_path)) {
                console.warn(`[AiMetadataJob] File not found: ${row.original_path}`);
                errors++;
                processed++;
                eventBus.emit({ type: 'JobProgress', jobId, processedItems: processed, totalItems, currentItemPath: row.original_path, throughputIps: 0, errorCount: errors });
                continue;
            }

            // Load image
            const filename = row.original_path.split(/[/\\]/).pop() || '';
            let exifDataString = '';
            try {
                const Parser = (await import('exif-parser')) as typeof import('exif-parser');
                const buffer = await fs.readFile(row.original_path);
                const parser = Parser.create(buffer) as { parse: () => { tags: Record<string, unknown> } };
                exifDataString = JSON.stringify(parser.parse().tags);
            } catch { /* no EXIF */ }

            const imageBase64 = await fs.readFile(row.original_path, { encoding: 'base64' });
            const ext = extname(row.original_path).toLowerCase().replace('.', '') || 'jpeg';
            const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

            // Call API with quota management
            const { result: parsedResult, usedModel } = await callWithFallback(
                genAI, row, filename, exifDataString, csvContent,
                imageBase64, mimeType, preferredModel, db, eventBus
            );

            if (parsedResult._pending_pro) proQueued++;

            // If this asset previously had a pending-pro marker and we used pro now, clear it
            if (usedModel === MODEL_PRO) {
                clearProPending(db, row.id);
            }

            // Save result
            db.prepare(`
                INSERT OR REPLACE INTO derived_results (id, asset_id, task, provider, model_version, data)
                VALUES (?, ?, 'ai_metadata', 'google', ?, ?)
            `).run(uuidv4(), row.id, usedModel, JSON.stringify(parsedResult));

            eventBus.emit({ type: 'AssetUpdated', assetId: row.id });
            processed++;
            eventBus.emit({ type: 'JobProgress', jobId, processedItems: processed, totalItems, currentItemPath: row.original_path, throughputIps: 0, errorCount: errors });

        } catch (err: unknown) {
            const e = err as Error;

            if (e.message === 'DAILY_QUOTA_EXCEEDED') {
                console.error('[AiMetadataJob] Daily quota exceeded on all models — stopping job.');
                dailyQuotaStop = true;
                stoppedEarlyIds.push(row.id);
                eventBus.emit({
                    type: 'QuotaWarning',
                    model: preferredModel,
                    fallbackModel: '',
                    reason: 'daily_quota',
                    assetIds: [row.id],
                    pendingProCount: 0
                });
                continue;
            }

            if (e.message === 'FLASH_RATE_LIMITED_STOP') {
                console.error('[AiMetadataJob] Flash model rate-limited — stopping batch. Remaining items left for future run.');
                flashRateLimitStop = true;
                stoppedEarlyIds.push(row.id);
                // Queue all remaining for pro when available
                queueForProAnalysis(db, row.id);
                proQueued++;
                continue;
            }

            // Regular error
            const keySuffix = keyTrimmed.slice(-4);
            console.error(`[AiMetadataJob] FAILED asset ${row.id} | key: ...${keySuffix} | ${e.message}`);
            errors++;
            try {
                db.prepare(`
                    INSERT INTO processing_issues (id, asset_id, job_id, task, severity, message)
                    VALUES (?, ?, ?, 'ai_metadata', 'warning', ?)
                `).run(uuidv4(), row.id, jobId, e.message);
            } catch { /* ignore */ }

            eventBus.emit({ type: 'JobFailed', jobId, severity: 'error', reason: e.message });
            processed++;
            eventBus.emit({ type: 'JobProgress', jobId, processedItems: processed, totalItems, currentItemPath: row.original_path, throughputIps: 0, errorCount: errors });
        }
    }

    // 6. Queue any flash-stopped remaining items for pro analysis
    if (stoppedEarlyIds.length > 0 && !dailyQuotaStop) {
        for (const id of stoppedEarlyIds) queueForProAnalysis(db, id);
        proQueued += stoppedEarlyIds.length;
        eventBus.emit({
            type: 'ProAnalysisPending',
            assetIds: stoppedEarlyIds,
            proModel: MODEL_PRO
        });
    }

    // 7. Complete
    const succeeded = processed - errors - skipped;
    const stopReason = dailyQuotaStop
        ? ` STOPPED EARLY: daily quota exhausted. ${stoppedEarlyIds.length} items left for future run.`
        : flashRateLimitStop
            ? ` STOPPED EARLY: flash rate limit. ${stoppedEarlyIds.length} items queued for future run.`
            : '';

    console.log(`[AiMetadataJob] Done. ${succeeded} succeeded, ${skipped} skipped, ${errors} errors, ${proQueued} queued for pro.${stopReason}`);

    eventBus.emit({ type: 'JobCompleted', jobId, pipelineStage: 'ai_metadata' });

    if (dailyQuotaStop || flashRateLimitStop) {
        const reason = dailyQuotaStop
            ? `Daily API quota exhausted — ${stoppedEarlyIds.length} photos not yet analysed. Try again tomorrow.`
            : `Rate limit reached — ${stoppedEarlyIds.length} photos queued for processing when quota resets.`;
        eventBus.emit({ type: 'JobFailed', jobId, severity: 'warning', reason });
    }
}
