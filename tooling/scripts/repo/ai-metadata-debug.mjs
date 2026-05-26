import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { GoogleGenerativeAI } from '@google/generative-ai';

function parseArgs(argv) {
    const options = {};
    for (const arg of argv) {
        if (!arg.startsWith('--')) {
            continue;
        }
        const [key, rawValue] = arg.slice(2).split('=');
        options[key] = rawValue ?? 'true';
    }
    return options;
}

function resolveDbPath(args) {
    if (typeof args.db === 'string' && args.db.length > 0) {
        return path.resolve(args.db);
    }
    if (typeof process.env.PHOTO_STAR_DB_PATH === 'string' && process.env.PHOTO_STAR_DB_PATH.length > 0) {
        return path.resolve(process.env.PHOTO_STAR_DB_PATH);
    }
    const appDataDir = process.env.APPDATA || process.env.HOME || '.';
    return path.join(appDataDir, 'PhotoLibraryDesktop', 'library.db');
}

function resolveBoolean(value, defaultValue = false) {
    if (value === undefined) {
        return defaultValue;
    }
    return value !== 'false';
}

function resolvePositiveInteger(value, defaultValue) {
    const parsed = Number.parseInt(String(value ?? defaultValue), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function printUsage() {
    console.log('Usage: npm.cmd run ai-metadata:debug -- --asset=<asset-id-or-path-fragment> [--repeats=3] [--imageStrategy=overview_only|overview_plus_tiles] [--metadataPass=scout|refine] [--model=<gemini-model>] [--showPrompt=true] [--showSchema=true] [--showResponseText=false] [--dryRun=false] [--outDir=artifacts/ai-metadata-debug]');
}

function buildDryRunResponse() {
    return {
        type: 'Family portrait',
        caption: 'Dry run response.',
        description: 'Dry run response for prompt and schema inspection.',
        location: 'Unknown',
        estimated_date: {
            most_likely_date: null,
            min_date: null,
            max_date: null,
            display_label: 'Unknown',
            rationale: 'Dry run only.',
        },
        subjects: [],
        regions_of_interest: [],
        keywords: [],
        tag_proposals: [],
        emotional_impact: 'Neutral',
        quality: {
            technical: 0,
            lighting: 0,
            composition: 0,
            emotional: 0,
            discard: false,
        },
        recommended_enhancements: [],
        authenticity: {
            score: 0,
            reasons: ['Dry run only.'],
        },
    };
}

function hashText(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function summarizeParsedResponse(parsedResponse) {
    return {
        subjects: Array.isArray(parsedResponse?.subjects)
            ? parsedResponse.subjects.map((subject) => ({
                label: subject.label,
                box: subject.bounding_box,
                source_image_index: subject.source_image_index ?? null,
                space: subject.bounding_box_coordinate_space ?? null,
            }))
            : [],
        regions_of_interest: Array.isArray(parsedResponse?.regions_of_interest)
            ? parsedResponse.regions_of_interest.map((region) => ({
                label: region.label,
                kind: region.kind,
                box: region.bounding_box,
                source_image_index: region.source_image_index ?? null,
                space: region.bounding_box_coordinate_space ?? null,
            }))
            : [],
    };
}

function resolveCliOptions(args) {
    const assetSelector = typeof args.asset === 'string' ? args.asset.trim() : '';
    return {
        assetSelector,
        dbPath: resolveDbPath(args),
        repeats: resolvePositiveInteger(args.repeats, 1),
        imageStrategy: args.imageStrategy === 'overview_plus_tiles' ? 'overview_plus_tiles' : 'overview_only',
        metadataPass: args.metadataPass === 'refine' ? 'refine' : 'scout',
        showPrompt: resolveBoolean(args.showPrompt, false),
        showSchema: resolveBoolean(args.showSchema, false),
        showResponseText: resolveBoolean(args.showResponseText, false),
        dryRun: resolveBoolean(args.dryRun, false),
        outDir: typeof args.outDir === 'string' && args.outDir.length > 0
            ? path.resolve(args.outDir)
            : '',
        modelOverride: typeof args.model === 'string' && args.model.length > 0 ? args.model : null,
    };
}

function resolveAssetRow(db, assetSelector) {
    const asset = db.prepare(`
        SELECT id, original_path, width, height, sensitivity_score, created_at
        FROM assets
        WHERE id = ?
           OR lower(original_path) LIKE '%' || lower(?) || '%'
        ORDER BY datetime(created_at) DESC, rowid DESC
        LIMIT 1
    `).get(assetSelector, assetSelector);
    if (!asset) {
        throw new Error(`No asset matched '${assetSelector}'.`);
    }

    const manual = db.prepare(`
        SELECT am.sensitivity_status
        FROM assets_manual am
        JOIN asset_identities ai ON ai.guid = am.identity_guid
        WHERE ai.original_path = ?
        LIMIT 1
    `).get(asset.original_path);

    return {
        ...asset,
        sensitivity_status: manual?.sensitivity_status ?? null,
    };
}

function loadDebugContext(db, options) {
    const asset = resolveAssetRow(db, options.assetSelector);
    const settingsRows = db.prepare(`
        SELECT id, value
        FROM settings
        WHERE id IN ('ai_metadata_v2_api_key', 'gemini_api_key', 'job_ai_model_scout', 'job_ai_model_refine', 'job_ai_model')
    `).all();
    const settings = new Map(settingsRows.map((row) => [row.id, row.value]));
    const approvedTagRows = db.prepare(`
        SELECT canonical_label
        FROM tag_definitions
        WHERE status = 'active'
        ORDER BY canonical_label COLLATE NOCASE ASC
    `).all();
    const approvedTags = approvedTagRows.map((row) => row.canonical_label);
    const apiKey = settings.get('ai_metadata_v2_api_key') || settings.get('gemini_api_key') || process.env.GEMINI_API_KEY || '';
    if (!apiKey && !options.dryRun) {
        throw new Error('No Gemini API key configured for live debug runs.');
    }

    return { apiKey, approvedTags, asset, settings };
}

function createFakeDb(approvedTags) {
    return {
        prepare(sql) {
            if (/FROM tag_definitions/i.test(sql)) {
                return {
                    all() {
                        return approvedTags.map((canonical_label) => ({ canonical_label }));
                    },
                };
            }
            if (/SELECT id FROM derived_results WHERE asset_id = \? AND task = 'ai_metadata_pro_pending'/i.test(sql)) {
                return { get() { return undefined; } };
            }
            if (/DELETE FROM derived_results WHERE asset_id = \? AND task = 'ai_metadata_pro_pending'/i.test(sql)) {
                return { run() { return { changes: 0 }; } };
            }
            if (/INSERT INTO derived_results .*ai_metadata_pro_pending/i.test(sql.replaceAll(/\s+/g, ' '))) {
                return { run() { return { changes: 1 }; } };
            }
            throw new Error(`Unexpected SQL in ai-metadata debug harness: ${sql}`);
        },
    };
}

function createFakeDbManager(settings, fakeDb, options) {
    const debugSettings = new Map(settings);
    if (options.modelOverride) {
        if (options.metadataPass === 'refine') {
            debugSettings.set('job_ai_model_refine', options.modelOverride);
        } else {
            debugSettings.set('job_ai_model_scout', options.modelOverride);
        }
    }

    return {
        getSetting(key) {
            return debugSettings.get(key) || '';
        },
        getDb() {
            return fakeDb;
        },
    };
}

function createProxyGoogleGenerativeAI(options, runs) {
    return class ProxyGoogleGenerativeAI {
        constructor(apiKey) {
            this.inner = options.dryRun ? null : new GoogleGenerativeAI(apiKey);
        }

        getGenerativeModel(modelParams) {
            const model = this.inner?.getGenerativeModel(modelParams);
            return {
                generateContent: async (request) => {
                    const prompt = Array.isArray(request) ? request[0] : request;
                    const imageParts = Array.isArray(request) ? request.slice(1) : [];
                    const responseText = options.dryRun
                        ? JSON.stringify(buildDryRunResponse())
                        : (await model.generateContent(request)).response.text();

                    runs.push({
                        model: modelParams.model,
                        generationConfig: modelParams.generationConfig ?? {},
                        prompt,
                        imageParts,
                        responseText,
                    });

                    return {
                        response: {
                            text() {
                                return responseText;
                            },
                        },
                    };
                },
            };
        }
    };
}

async function runDebugCaptures(params) {
    const liveRuntime = await import('../../../dist/core/src/services/aiMetadata/liveRuntime.js');
    const runs = [];
    const ProxyGoogleGenerativeAI = createProxyGoogleGenerativeAI(params.options, runs);

    for (let index = 0; index < params.options.repeats; index += 1) {
        await liveRuntime.generateLiveAiMetadata({
            dbManager: params.dbManager,
            row: params.asset,
            imageStrategy: params.options.imageStrategy,
            metadataPass: params.options.metadataPass,
            GoogleGenerativeAIClass: ProxyGoogleGenerativeAI,
        });
    }

    return runs;
}

function buildSummary(runs) {
    return runs.map((run, index) => {
        let parsedResponse = null;
        try {
            parsedResponse = JSON.parse(run.responseText);
        } catch {
            parsedResponse = null;
        }

        return {
            run: index + 1,
            model: run.model,
            promptHash: hashText(run.prompt),
            promptLength: String(run.prompt).length,
            schemaHash: hashText(JSON.stringify(run.generationConfig.responseSchema || {})),
            generationConfig: run.generationConfig,
            imagePartCount: run.imageParts.length,
            imagePartHashes: run.imageParts.map((part) => hashText(part?.inlineData?.data || '')),
            imagePartLengths: run.imageParts.map((part) => String(part?.inlineData?.data || '').length),
            responseHash: hashText(run.responseText),
            parsedSummary: parsedResponse ? summarizeParsedResponse(parsedResponse) : null,
            responseText: run.responseText,
        };
    });
}

function buildRequestReport(options, summary) {
    return {
        metadataPass: options.metadataPass,
        imageStrategy: options.imageStrategy,
        repeats: options.repeats,
        modelOverride: options.modelOverride,
        promptHashesUnique: new Set(summary.map((entry) => entry.promptHash)).size,
        responseHashesUnique: new Set(summary.map((entry) => entry.responseHash)).size,
        imageHashesUnique: new Set(summary.flatMap((entry) => entry.imagePartHashes)).size,
    };
}

function buildReport(asset, options, runs) {
    const summary = buildSummary(runs);
    return {
        prompt: String(runs[0]?.prompt || ''),
        responseSchema: runs[0]?.generationConfig?.responseSchema ?? null,
        report: {
            asset: {
                id: asset.id,
                original_path: asset.original_path,
                width: asset.width,
                height: asset.height,
            },
            request: buildRequestReport(options, summary),
            summary,
        },
    };
}

function emitReportOutput(reportBundle, options) {
    if (options.showPrompt) {
        console.log('PROMPT');
        console.log(reportBundle.prompt);
    }
    if (options.showSchema) {
        console.log('RESPONSE_SCHEMA');
        console.log(JSON.stringify(reportBundle.responseSchema, null, 2));
    }
    console.log(JSON.stringify(reportBundle.report, null, 2));
    if (options.showResponseText) {
        reportBundle.report.summary.forEach((entry) => {
            console.log(`RAW_RESPONSE_RUN_${entry.run}`);
            console.log(entry.responseText);
        });
    }
}

async function persistReportArtifacts(reportBundle, outDir) {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'prompt.txt'), `${reportBundle.prompt}\n`, 'utf8');
    await fs.writeFile(path.join(outDir, 'response-schema.json'), `${JSON.stringify(reportBundle.responseSchema, null, 2)}\n`, 'utf8');
    await fs.writeFile(path.join(outDir, 'summary.json'), `${JSON.stringify(reportBundle.report, null, 2)}\n`, 'utf8');
    await Promise.all(reportBundle.report.summary.map((entry) => fs.writeFile(
        path.join(outDir, `run-${entry.run}-response.json`),
        `${entry.responseText}\n`,
        'utf8',
    )));
    console.log(`Saved debug artifacts to ${outDir}`);
}

async function main() {
    const options = resolveCliOptions(parseArgs(process.argv.slice(2)));
    if (!options.assetSelector) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    const sourceDb = new Database(options.dbPath, { readonly: true, fileMustExist: true });
    try {
        const context = loadDebugContext(sourceDb, options);
        const fakeDb = createFakeDb(context.approvedTags);
        const dbManager = createFakeDbManager(context.settings, fakeDb, options);
        const runs = await runDebugCaptures({
            asset: context.asset,
            dbManager,
            options,
        });
        const reportBundle = buildReport(context.asset, options, runs);
        emitReportOutput(reportBundle, options);
        if (options.outDir) {
            await persistReportArtifacts(reportBundle, options.outDir);
        }
    } finally {
        sourceDb.close();
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
