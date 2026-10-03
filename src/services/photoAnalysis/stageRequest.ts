import type { MediaResolution } from '@google/genai';
import type { AnalysisSource, StoredAnalysisClaim } from '../../shared/photoAnalysis/contracts';
import type { GeminiStructuredRequest, GeminiThinking } from './geminiProvider';
import type { prepareAnalysisInput } from './localInputs';
import { buildStagePrompt } from './prompts';
import { buildStageResponseSchema, type ModelStage, type StageScope } from './stageContracts';

type PreparedInput = Awaited<ReturnType<typeof prepareAnalysisInput>>;

function independentObservations(input: PreparedInput, stage: ModelStage) {
    const eligible = input.prior.claims.filter(claim => claim.kind === 'observation' && claim.state === 'active'
        && (stage !== 'scout' || claim.stage === 'perception'));
    const latest = new Map(eligible.map(claim => [`${claim.field}:${claim.subjectId ?? ''}`, claim]));
    return [...latest.values()].slice(-24);
}

function authoritativeWinners(input: PreparedInput) {
    return input.prior.winners.filter(claim =>
        (claim.kind === 'known_fact' || claim.kind === 'user_confirmed')
        && input.targets.some(target => target.field === claim.field && target.subjectId === claim.subjectId));
}

function scopeSources(input: PreparedInput, stage: ModelStage, sources: AnalysisSource[]): AnalysisSource[] {
    if (stage === 'perception') { return sources; }
    const claims = [...independentObservations(input, stage), ...authoritativeWinners(input)];
    const references = new Set(claims.flatMap(claim => [
        ...claim.sourceIds, ...claim.evidence.flatMap(item => item.sourceIds), ...claim.contradictions.flatMap(item => item.sourceIds),
    ]));
    const prior = input.prior.sources.filter(source => references.has(source.id) && (stage === 'refine' || source.kind === 'image'));
    return [...new Map([...prior, ...sources].map(source => [source.id, source])).values()];
}

function contextualSources(input: PreparedInput, scope: StageScope): AnalysisSource[] {
    const claims = authoritativeWinners(input).flatMap(claim => {
        const source = scope.sources.find(item => claim.sourceIds.includes(item.id));
        return source ? [{ ...source, text: `${claim.kind} ${claim.field}: ${JSON.stringify(claim.value)}`.slice(0, 1200) }] : [];
    });
    return [...scope.sources.filter(source => source.kind !== 'image'), ...claims];
}

export function preparePhotoAnalysisStage(params: {
    input: PreparedInput;
    stage: ModelStage;
    model: string;
    sources: AnalysisSource[];
    candidates: StageScope['candidates'];
    thinking?: GeminiThinking;
    mediaResolution?: MediaResolution;
    signal?: AbortSignal;
    promptVariant?: string;
}): { request: GeminiStructuredRequest; scope: StageScope; visualObservations: StoredAnalysisClaim[] } {
    const { input, stage } = params;
    if (stage === 'refine' && input.targets.length === 0) { throw new Error('Refine requires explicit concerns'); }
    if (stage === 'refine' && input.targets.length > 6) { throw new Error('Refine supports at most six selected concerns'); }
    const scope: StageScope = {
        stage, faces: input.faces, images: input.sources, sources: scopeSources(input, stage, params.sources),
        targets: input.targets.map(target => ({
            ...target, subjectId: input.faces.find(face => face.faceId === target.subjectId)?.modelFaceId ?? target.subjectId,
        })),
        candidates: params.candidates.map(candidate => ({
            ...candidate, faceId: input.faces.find(face => face.faceId === candidate.faceId)?.modelFaceId ?? candidate.faceId,
        })),
        regionIds: input.prior.regions.map(region => region.id),
    };
    const visualObservations = independentObservations(input, stage);
    const prompt = buildStagePrompt({
        scope, targets: scope.targets,
        visualObservations,
        contextualSources: contextualSources(input, scope),
    });
    return { scope, visualObservations, request: {
        model: params.model, prompt: params.promptVariant ? `${prompt}\nVariant:${params.promptVariant}` : prompt,
        responseJsonSchema: buildStageResponseSchema(scope),
        images: input.parts.map(part => ({ id: part.sourceImageId, imageBase64: part.data, mimeType: part.mimeType })),
        thinking: params.thinking, mediaResolution: params.mediaResolution, signal: params.signal,
    } };
}
