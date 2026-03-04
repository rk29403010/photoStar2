import { DatabaseManager } from '../db';
import { EventBus } from '../events/bus';
import { waitIfPaused } from '../state';
import { existsSync, promises as fs } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'node:path';

// Types for Gemini Response
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
}

export async function runAiMetadataJob(
    mediaIds: string[] | 'auto',
    dbManager: DatabaseManager,
    eventBus: EventBus,
    uiJobId?: string
) {
    const db = dbManager.getDb();

    const jobId = uiJobId || `ai_meta-${Date.now()}`;

    // 1. Check for API key
    const apiKeyRow = db.prepare('SELECT value FROM settings WHERE id = ?').get('gemini_api_key') as { value: string } | undefined;
    if (!apiKeyRow || !apiKeyRow.value || apiKeyRow.value.trim() === '') {
        console.error(`[AiMetadataJob] Cannot run without Gemini API Key. (Job: ${jobId})`);
        eventBus.emit({
            type: 'JobFailed',
            jobId: jobId,
            severity: 'fatal',
            reason: 'MISSING_API_KEY'
        });
        return;
    }
    const apiKey = apiKeyRow.value;

    // 2. Load CSV names if available
    const csvPathRow = db.prepare('SELECT value FROM settings WHERE id = ?').get('gemini_csv_path') as { value: string } | undefined;
    let csvContent = '';
    if (csvPathRow && csvPathRow.value && existsSync(csvPathRow.value)) {
        try {
            csvContent = await fs.readFile(csvPathRow.value, 'utf-8');
        } catch (e) {
            console.warn('[AiMetadataJob] Failed to read CSV file:', e);
        }
    }

    // 3. Determine items to process
    let rows: { id: string; original_path: string; sensitivity_status: string; sensitivity_score: number | null }[];
    if (mediaIds === 'auto') {
        // Select assets that don't have AI metadata yet
        rows = db.prepare(`
      SELECT a.id, a.original_path, a.sensitivity_score, am.sensitivity_status
      FROM assets a
      LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
      LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
      LEFT JOIN derived_results dr ON a.id = dr.asset_id AND dr.task = 'ai_metadata'
      WHERE dr.id IS NULL
      ORDER BY a.created_at ASC
    `).all() as any[];
    } else {
        const placeholders = mediaIds.map(() => '?').join(',');
        rows = db.prepare(`
        SELECT a.id, a.original_path, a.sensitivity_score, am.sensitivity_status
        FROM assets a
        LEFT JOIN asset_identities ai ON ai.original_path = a.original_path
        LEFT JOIN assets_manual am ON am.identity_guid = ai.guid
        WHERE a.id IN (${placeholders})
    `).all(...mediaIds) as any[];
    }

    if (rows.length === 0) {
        console.log('[AiMetadataJob] Nothing to scan.');
        return;
    }

    const totalItems = rows.length;
    let processed = 0;
    let errors = 0;
    let skipped = 0;
    eventBus.emit({ type: 'JobStarted', jobId, pipelineStage: 'ai_metadata', totalItems });

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use robust production model 1.5 pro (1206 preview is unstable/rate-limited)
    const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-pro',
        generationConfig: {
            responseMimeType: 'application/json'
        }
    });

    for (const row of rows) {
        await waitIfPaused();

        // Skip sensitive content
        const isUnsafe = row.sensitivity_status === 'unsafe' || (row.sensitivity_status !== 'safe' && row.sensitivity_score !== null && row.sensitivity_score > 75);
        if (isUnsafe) {
            console.log(`[AiMetadataJob] Skipping sensitive asset ${row.id}`);
            skipped++;
            processed++;
            eventBus.emit({
                type: 'JobProgress', jobId, processedItems: processed, totalItems, currentItemPath: row.original_path, throughputIps: 0, errorCount: errors
            });
            continue;
        }

        try {
            if (!existsSync(row.original_path)) {
                errors++;
                processed++;
                continue;
            }

            // Dynamically import exif-parser if needed, or rely on file name 
            const filename = row.original_path.split(/[\\/]/).pop() || '';
            let exifDataString = '';
            try {
                const Parser = await import('exif-parser');
                const buffer = await fs.readFile(row.original_path);
                const parser = Parser.create(buffer);
                const result = parser.parse();
                exifDataString = JSON.stringify(result.tags);
            } catch {
                // no EXIF or not a JPEG
            }

            const imageBase64 = await fs.readFile(row.original_path, { encoding: 'base64' });
            const ext = extname(row.original_path).toLowerCase().replace('.', '') || 'jpeg';
            let mimeType = 'image/jpeg';
            if (ext === 'png') mimeType = 'image/png';
            if (ext === 'webp') mimeType = 'image/webp';

            const prompt = `
You are an expert photo archivist and AI analyst. Analyze the following image and its metadata to provide a highly structured JSON response.

Metadata for context:
- Filename: ${filename}
- EXIF Data (if any): ${exifDataString}

${csvContent ? `Potential Subjects Reference (Names and DOBs):\n${csvContent}\nIf you identify people in the image, you may use this list to suggest their names based on estimated age and photo context.` : ''}

Provide your analysis strictly matching this JSON schema:
{
  "type": "string (Landscape, Large group portrait, family portrait, document, newspaper clipping, drawing, painting, selfie, gravestone)",
  "estimated_date": "string (Decade, Year, Date, Full Date and Time. Be as accurate as possible based on clothing, hairstyles, technology, borders, paper texture, filename, EXIF)",
  "location": "string (Estimated location, or 'Unknown')",
  "subjects": [
    {
      "label": "string (e.g. 'Subject1', unique per subject)",
      "bounding_box": { "x": number, "y": number, "width": number, "height": number } // pixels from bottom left corner
      "type": "string ('person' or 'pet')",
      "location_desc": "string (e.g. '2nd from left', 'center')",
      "gender": "string (male, female, other - for persons)",
      "animal_type": "string (for pets, e.g. dog, cat)",
      "age_range": "string",
      "dob_range": "string",
      "emotion": "string",
      "gaze": "string",
      "features": "string",
      "suggested_names": ["string"],
      "uniform": "string (if applicable)"
    }
  ],
  "caption": "string (Descriptive caption using Subject labels)",
  "keywords": ["string"],
  "emotional_impact": "string",
  "quality": {
    "technical": number (0-100),
    "lighting": number (0-100),
    "composition": number (0-100),
    "emotional": number (0-100),
    "discard": boolean (true if unusable)
  },
  "recommended_enhancements": ["string"],
  "authenticity": {
    "score": number (0-100),
    "reasons": ["string"]
  }
}
        `;

            const imagePart = {
                inlineData: {
                    data: imageBase64,
                    mimeType
                }
            };

            const result = await model.generateContent([prompt, imagePart]);
            const responseText = result.response.text();

            let parsedResult: GeminiResponse;
            try {
                parsedResult = JSON.parse(responseText.replace(/^\`\`\`json\s*/, '').replace(/\s*\`\`\`$/, ''));
            } catch (e: any) {
                throw new Error("Failed to parse AI JSON response: " + e.message);
            }

            // Save Raw Result
            db.prepare(`
            INSERT OR REPLACE INTO derived_results (id, asset_id, task, provider, model_version, data)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), row.id, 'ai_metadata', 'google', 'gemini-3.1-pro', JSON.stringify(parsedResult));

            // Note: Joining up bounds and matching people is handled asynchronously or in a secondary sweep logic, 
            // but we can emit an event here to trigger UI refreshes or secondary face linkage.

            processed++;
            eventBus.emit({
                type: 'JobProgress', jobId, processedItems: processed, totalItems, currentItemPath: row.original_path, throughputIps: 0, errorCount: errors
            });

        } catch (e: any) {
            console.error(`[AiMetadataJob] Failed for ${row.id}:`, e);
            errors++;
            try {
                db.prepare(`
                INSERT INTO processing_issues (id, asset_id, job_id, task, severity, message)
                VALUES (?, ?, ?, 'ai_metadata', 'warning', ?)
            `).run(uuidv4(), row.id, jobId, e.message);
            } catch { /* ignore log failures */ }

            eventBus.emit({
                type: 'JobFailed',
                jobId: jobId,
                severity: 'error',
                reason: e.message
            });

            processed++;
            eventBus.emit({
                type: 'JobProgress', jobId, processedItems: processed, totalItems, currentItemPath: row.original_path, throughputIps: 0, errorCount: errors
            });
        }
    }

    eventBus.emit({ type: 'JobCompleted', jobId, pipelineStage: 'ai_metadata' });
    console.log(`[AiMetadataJob] Done. ${processed - errors - skipped} succeeded, ${skipped} skipped, ${errors} errors.`);
}
