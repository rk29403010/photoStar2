import { randomUUID } from 'node:crypto';
import type { MediaResolution } from '@google/genai';
import type { DatabaseManager } from '../../data/db';
import type { AnalysisResult, AnalysisSource, RefinementTarget } from '../../shared/photoAnalysis/contracts';
import { retrieveAnalysisContext } from './context';
import { GeminiProviderError, type createGeminiProvider, type GeminiStructuredResult, type GeminiThinking } from './geminiProvider';
import { mapModelBoxToFullPhoto } from './geometry';
import { prepareAnalysisInput, type AnalysisAssetRow } from './localInputs';
import { PHOTO_ANALYSIS_PROMPT_VERSION } from './prompts';
import { loadAnalysis, persistAnalysisRun, persistFailedAnalysisRun } from './repository';
import { preparePhotoAnalysisStage } from './stageRequest';
import { resolveSuppliedFaceIds, resolveSuppliedRegionIds, validateStageResult, type ModelStage, type StageScope } from './stageContracts';
import { syncAnalysisTagAssignments } from './tagProjection';

type Provider = Pick<ReturnType<typeof createGeminiProvider>, 'generateStructured'>;
export type AnalysisPipelineOptions = {
    dbManager: DatabaseManager; row: AnalysisAssetRow; metadataPass?: 'scout' | 'refine'; targets?: RefinementTarget[];
    model: string; provider: Provider; perceptionModel?: string; thinking?: GeminiThinking; mediaResolution?: MediaResolution;
    signal?: AbortSignal; persist?: boolean; promptVariant?: string; sourcePrefix?: string;
};
const emptyResult = (): AnalysisResult => ({ claims: [], regions: [], refinementOpportunities: [] });

function visualSources(assetId: string, prefix: string, input: Awaited<ReturnType<typeof prepareAnalysisInput>>): AnalysisSource[] {
    return input.sources.map(image => ({
        id: `${prefix}:${image.id}`, assetId, kind: 'image', refId: image.id, imageId: image.id,
        text: image.kind === 'face' ? `Appearance crop for ${input.faces.find(face => face.faceId === image.faceId)?.modelFaceId}` : `${image.kind} image`,
    }));
}

async function executeModelStage(params: {
    options: AnalysisPipelineOptions; input: Awaited<ReturnType<typeof prepareAnalysisInput>>; stage: ModelStage;
    sources: AnalysisSource[]; candidates: StageScope['candidates']; model: string;
}) {
    const { options, input, stage } = params;
    const { request, scope } = preparePhotoAnalysisStage({
        input, stage, model: params.model, sources: params.sources, candidates: params.candidates,
        thinking: options.thinking, mediaResolution: options.mediaResolution, signal: options.signal, promptVariant: options.promptVariant,
    });
    let response: GeminiStructuredResult | undefined;
    try {
        response = await options.provider.generateStructured(request);
        const faceResolved = resolveSuppliedFaceIds(validateStageResult(response.data, scope), input.faces);
        const result = resolveSuppliedRegionIds(faceResolved, `region:${options.sourcePrefix ?? randomUUID()}:${stage}`);
        return { result, response, request };
    } catch (error) {
        if (options.persist !== false) {
            persistFailedAnalysisRun(options.dbManager, {
                assetId: options.row.id, stage, provider: 'gemini', modelVersion: response?.modelVersion ?? params.model,
                promptVersion: PHOTO_ANALYSIS_PROMPT_VERSION, targets: stage === 'refine' ? input.targets : [],
                telemetry: { failure: response ? 'contract_validation' : 'provider', usage: response?.usage,
                    attempts: error instanceof GeminiProviderError ? error.attempts : response?.attempts,
                    latencyMs: error instanceof GeminiProviderError ? error.latencyMs : response?.latencyMs },
            });
        }
        throw error;
    }
}

function persistModelStage(params: {
    options: AnalysisPipelineOptions; stage: ModelStage; input: Awaited<ReturnType<typeof prepareAnalysisInput>>;
    sources: AnalysisSource[]; result: AnalysisResult; response: GeminiStructuredResult;
}): string | null {
    if (params.options.persist === false) { return null; }
    const { options, input, result, response } = params;
    const claims = result.claims.map(claim => ({ ...claim, supersedesId: supersededClaimId(input, claim, params.stage) }));
    return options.dbManager.getDb().transaction(() => {
        const runId = persistAnalysisRun(options.dbManager, {
            assetId: options.row.id, stage: params.stage, provider: 'gemini', modelVersion: response.modelVersion ?? options.model,
            promptVersion: PHOTO_ANALYSIS_PROMPT_VERSION, result: { ...result, claims }, sources: params.sources,
            images: input.sources, targets: params.stage === 'refine' ? input.targets : [],
            telemetry: { usage: response.usage, attempts: response.attempts, latencyMs: response.latencyMs, responseId: response.responseId, requestedModel: options.model, promptVariant: options.promptVariant ?? null },
        });
        if (claims.some(claim => claim.field === 'tags')) { syncAnalysisTagAssignments(options.dbManager, options.row.id); }
        return runId;
    })();
}

function supersededClaimId(input: Awaited<ReturnType<typeof prepareAnalysisInput>>,
    claim: AnalysisResult['claims'][number], stage: ModelStage): string | null {
    const previous = input.prior.winners.find(winner => winner.field === claim.field && winner.subjectId === claim.subjectId);
    if (!previous || previous.kind === 'known_fact' || previous.kind === 'user_confirmed' || previous.kind === 'observation') { return null; }
    return stage === 'refine' || previous.stage === stage ? previous.id : null;
}

function persistLocalStage(options: AnalysisPipelineOptions, input: Awaited<ReturnType<typeof prepareAnalysisInput>>): void {
    if (options.persist === false) { return; }
    persistAnalysisRun(options.dbManager, {
        assetId: options.row.id, stage: 'local', provider: 'photostar', modelVersion: null, promptVersion: 'local-1',
        result: { ...emptyResult(), claims: [input.localClaim] }, sources: [input.localSource],
    });
}

async function runPerception(options: AnalysisPipelineOptions, input: Awaited<ReturnType<typeof prepareAnalysisInput>>) {
    if (!options.perceptionModel) { return input; }
    const sources = visualSources(options.row.id, `${options.sourcePrefix ?? randomUUID()}:perception`, input);
    const perception = await executeModelStage({ options, input, stage: 'perception', sources, candidates: [], model: options.perceptionModel });
    if (options.persist !== false) {
        persistModelStage({ options, input, stage: 'perception', sources, ...perception });
        return prepareAnalysisInput(options);
    }
    const claims = perception.result.claims.map((claim, index) => ({ ...claim,
        id: `debug:perception:${index}`, assetId: options.row.id, runId: 'debug:perception',
        stage: 'perception' as const, state: 'active' as const, provider: 'gemini', modelVersion: perception.response.modelVersion ?? null }));
    const regions = perception.result.regions.map(region => ({ ...region, runId: 'debug:perception',
        fullPhotoBox: mapModelBoxToFullPhoto({ sourceImageId: region.sourceImageId, box: region.box, sources: input.sources }) }));
    return { ...input, prior: { ...input.prior, claims: [...input.prior.claims, ...claims],
        sources: [...input.prior.sources, ...sources], regions: [...input.prior.regions, ...regions] } };
}

function persistContextStage(options: AnalysisPipelineOptions, input: Awaited<ReturnType<typeof prepareAnalysisInput>>,
    stage: 'scout' | 'refine', sources: AnalysisSource[]): void {
    if (options.persist === false || stage !== 'refine') { return; }
    persistAnalysisRun(options.dbManager, {
        assetId: options.row.id, stage: 'context', provider: 'photostar', modelVersion: null, promptVersion: 'context-1',
        result: emptyResult(), sources, targets: input.targets,
    });
}

export async function runPhotoAnalysis(options: AnalysisPipelineOptions) {
    let input = await prepareAnalysisInput(options);
    const stage = options.metadataPass ?? 'scout';
    if (stage === 'refine' && input.targets.length === 0) { throw new Error('Refine requires selected unresolved questions'); }
    persistLocalStage(options, input);
    const context = stage === 'refine' ? retrieveAnalysisContext(options.dbManager, {
        assetId: options.row.id, faces: input.faces, targets: input.targets, sourcePrefix: options.sourcePrefix ? `${options.sourcePrefix}:context` : randomUUID(),
    }) : { sources: [] as AnalysisSource[], candidates: [] as StageScope['candidates'] };
    input = await runPerception(options, input);
    const stageSources = visualSources(options.row.id, `${options.sourcePrefix ?? randomUUID()}:stage`, input);
    persistContextStage(options, input, stage, context.sources);
    const sources = [...stageSources, ...context.sources];
    const generated = await executeModelStage({ options, input, stage, sources, candidates: context.candidates, model: options.model });
    const runId = persistModelStage({ options, input, stage, sources: stageSources, ...generated });
    return { runId, ...generated, sources, images: input.sources, faces: input.faces,
        analysis: options.persist === false ? undefined : loadAnalysis(options.dbManager, options.row.id) };
}
