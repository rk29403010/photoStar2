import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import {
    parseArguments, resolveDebugOptions, describeRequest, exportRequestArtifacts, resolveAssetRow, readOnlyDbManager,
} from './photo-analysis-debug-support.mjs';

async function configuredKey() {
    if (process.env.GEMINI_API_KEY) { return process.env.GEMINI_API_KEY; }
    const { ApiKeyManager } = await import('../../../dist/core/src/services/security/ApiKeyManager.js');
    return ApiKeyManager.getPlaintextKey('gemini');
}

async function runCaptures(params) {
    const { createGeminiProvider, createGoogleGenAIClient } = await import('../../../dist/core/src/services/photoAnalysis/geminiProvider.js');
    const { runPhotoAnalysis } = await import('../../../dist/core/src/services/photoAnalysis/pipeline.js');
    const provider = createGeminiProvider({ client: createGoogleGenAIClient(await configuredKey()) });
    const captures = [];
    for (let index = 0; index < params.options.repeats; index += 1) {
        try {
            const capture = await runPhotoAnalysis({ ...params.pipelineOptions, provider });
            captures.push({
                run: index + 1, request: describeRequest(capture), result: capture.result,
                telemetry: { modelVersion: capture.response.modelVersion, responseId: capture.response.responseId,
                    usage: capture.response.usage, attempts: capture.response.attempts, latencyMs: capture.response.latencyMs },
            });
        } catch (error) {
            if (!Array.isArray(error.attempts)) { throw error; }
            captures.push({ run: index + 1, error: error.message, telemetry: { attempts: error.attempts, latencyMs: error.latencyMs } });
        }
    }
    return captures;
}

async function prepareRequest(options) {
    const { prepareAnalysisInput } = await import('../../../dist/core/src/services/photoAnalysis/localInputs.js');
    const { retrieveAnalysisContext } = await import('../../../dist/core/src/services/photoAnalysis/context.js');
    const { preparePhotoAnalysisStage } = await import('../../../dist/core/src/services/photoAnalysis/stageRequest.js');
    const input = await prepareAnalysisInput(options);
    const imageSources = input.sources.map(image => ({
        id: `${options.sourcePrefix}:stage:${image.id}`, assetId: options.row.id, kind: 'image', refId: image.id, imageId: image.id,
        text: image.kind === 'face' ? `Appearance crop for ${input.faces.find(face => face.faceId === image.faceId)?.modelFaceId}` : `${image.kind} image`,
    }));
    const context = options.metadataPass === 'refine' ? retrieveAnalysisContext(options.dbManager, {
        assetId: options.row.id, faces: input.faces, targets: input.targets, sourcePrefix: `${options.sourcePrefix}:context`,
    }) : { sources: [], candidates: [] };
    const sources = [...imageSources, ...context.sources];
    const prepared = preparePhotoAnalysisStage({ input, stage: options.metadataPass, model: options.model,
        sources, candidates: context.candidates, promptVariant: options.promptVariant,
        thinking: options.thinking, mediaResolution: options.mediaResolution });
    return { ...prepared, sources: prepared.scope.sources, images: input.sources, faces: input.faces, targets: input.targets };
}

async function buildReport(options, dbManager, row) {
    const { MODEL_REFINE, MODEL_SCOUT } = await import('../../../dist/core/src/services/workflowRuntime/modules/generateAiMetadata/geminiTypes.js');
    const { refinementTargetSchema } = await import('../../../dist/core/src/shared/photoAnalysis/contracts.js');
    const configuredThinking = dbManager.getSetting(`job_ai_thinking_${options.metadataPass}`);
    const configuredMedia = dbManager.getSetting(`job_ai_media_resolution_${options.metadataPass}`);
    const pipelineOptions = {
        dbManager, row, metadataPass: options.metadataPass, targets: options.targets.map(target => refinementTargetSchema.parse(target)),
        model: options.modelOverride || dbManager.getSetting(`job_ai_model_${options.metadataPass}`)
            || (options.metadataPass === 'refine' ? MODEL_REFINE : MODEL_SCOUT),
        promptVariant: options.promptVariant, persist: false,
        perceptionModel: dbManager.getSetting('job_ai_model_perception') || undefined,
        thinking: options.thinking ?? (configuredThinking ? JSON.parse(configuredThinking) : undefined),
        mediaResolution: options.mediaResolution ?? (configuredMedia || undefined),
        sourcePrefix: `benchmark:${row.id}:${options.metadataPass}`,
    };
    const prepared = await prepareRequest(pipelineOptions);
    const captures = options.dryRun ? [] : await runCaptures({ options, pipelineOptions });
    return {
        prepared,
        report: { assetId: row.id, databaseReadOnly: true, stage: options.metadataPass,
            dryRun: options.dryRun, perceptionModel: pipelineOptions.perceptionModel ?? null,
            preparationNote: options.dryRun && pipelineOptions.perceptionModel
                ? 'Scout request excludes unrun optional perception; capture mode executes it read-only.' : null,
            request: describeRequest(prepared), captures },
    };
}

export async function main(argv = process.argv.slice(2)) {
    const options = await resolveDebugOptions(parseArguments(argv));
    if (!options.assetSelector) {
        throw new Error('Usage: pnpm.cmd run ai-metadata:debug -- --asset=<id-or-path> [--metadataPass=scout|refine] [--targetsFile=<JSON>] [--model=<ID>] [--promptVariant=<variant>] [--repeats=3] [--dryRun=true] [--outDir=<directory>]');
    }
    const db = new Database(options.dbPath, { readonly: true, fileMustExist: true });
    try {
        const row = resolveAssetRow(db, options.assetSelector);
        const { prepared, report } = await buildReport(options, readOnlyDbManager(db), row);
        if (options.showPrompt) { console.log(prepared.request.prompt); }
        if (options.showSchema) { console.log(JSON.stringify(prepared.request.responseJsonSchema, null, 2)); }
        console.log(JSON.stringify(report, null, 2));
        if (options.outDir) {
            await exportRequestArtifacts(prepared, options.outDir);
            await fs.writeFile(path.join(options.outDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        }
        if (report.captures.some(capture => capture.error)) { process.exitCode = 1; }
    } finally {
        db.close();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
