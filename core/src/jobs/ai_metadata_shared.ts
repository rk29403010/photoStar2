import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../db';
import type { EventBus } from '../events/bus';

export const MODEL_PRO = 'gemini-3.1-pro-preview';
export const MODEL_FLASH = 'gemini-3-flash-preview';

export interface GeminiResponse {
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
    _analysis_tier?: 'pro' | 'flash';
    _pending_pro?: boolean;
}

export type RowData = { id: string; original_path: string; sensitivity_status: string; sensitivity_score: number | null };

export function buildProPrompt(filename: string, exifDataString: string, csvContent: string): string {
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

export function buildFlashPrompt(filename: string, exifDataString: string): string {
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

export function queueForProAnalysis(db: ReturnType<DatabaseManager['getDb']>, assetId: string): void {
    const existing = db.prepare(
        `SELECT id FROM derived_results WHERE asset_id = ? AND task = 'ai_metadata_pro_pending'`
    ).get(assetId);
    if (!existing) {
        db.prepare(`
            INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES (?, ?, 'ai_metadata_pro_pending', 'google', ?, '{}')
        `).run(uuidv4(), assetId, MODEL_PRO);
    }

    db.prepare(`
        INSERT INTO task_queue (media_id, pipeline_stage, status, priority)
        VALUES (?, 'ai_metadata_31p', 'pending', -30)
        ON CONFLICT(media_id, pipeline_stage) DO UPDATE SET status = 'pending'
    `).run(assetId);
}

export function getPendingProAssetIds(db: ReturnType<DatabaseManager['getDb']>): string[] {
    return (db.prepare(
        `SELECT asset_id FROM derived_results WHERE task = 'ai_metadata_pro_pending'`
    ).all() as { asset_id: string }[]).map(r => r.asset_id);
}

export function clearProPending(db: ReturnType<DatabaseManager['getDb']>, assetId: string): void {
    db.prepare(`DELETE FROM derived_results WHERE asset_id = ? AND task = 'ai_metadata_pro_pending'`).run(assetId);
    db.prepare(`
        UPDATE task_queue
        SET status = 'completed'
        WHERE media_id = ? AND pipeline_stage = 'ai_metadata_31p' AND status <> 'completed'
    `).run(assetId);
}

export function parseResponse(text: string): GeminiResponse {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
        return JSON.parse(cleaned) as GeminiResponse;
    } catch (e: unknown) {
        throw new Error('Failed to parse AI JSON response: ' + (e as Error).message + '\nRaw: ' + cleaned.slice(0, 200), { cause: e });
    }
}

const MODEL_UNAVAILABLE_PATTERNS = [
    'is not found for api version',
    'not supported for generatecontent',
];

const AUTH_PERMISSION_PATTERNS = [
    'api key not valid',
    'permission denied',
    'insufficient permission',
    '401',
    '403',
];

function includesAnyPattern(value: string, patterns: string[]): boolean {
    return patterns.some((pattern) => value.includes(pattern));
}

function isModelUnavailableError(lowerMessage: string): boolean {
    return (lowerMessage.includes('404') && lowerMessage.includes('models/'))
        || includesAnyPattern(lowerMessage, MODEL_UNAVAILABLE_PATTERNS);
}

function isAuthOrPermissionError(lowerMessage: string): boolean {
    return includesAnyPattern(lowerMessage, AUTH_PERMISSION_PATTERNS);
}

export function getUnrecoverableAiReason(err: Error): string | null {
    const msg = err.message || '';
    const lowerMessage = msg.toLowerCase();

    if (isModelUnavailableError(lowerMessage)) {
        return `Configured model is unavailable or retired: ${msg}`;
    }

    if (isAuthOrPermissionError(lowerMessage)) {
        return `AI API auth/permission error: ${msg}`;
    }

    return null;
}

export function emitAiJobProgress(
    eventBus: EventBus,
    jobId: string,
    processed: number,
    totalItems: number,
    errors: number,
    startedAtMs: number,
    currentItemPath?: string
): void {
    const elapsedSec = Math.max((Date.now() - startedAtMs) / 1000, 0.001);
    const throughputIps = processed / elapsedSec;
    eventBus.emit({
        type: 'JobProgress',
        jobId,
        processedItems: processed,
        totalItems,
        currentItemPath,
        throughputIps,
        errorCount: errors
    });
}
