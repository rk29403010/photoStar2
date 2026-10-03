import { z } from 'zod';
import {
    analysisResultSchema, analysisClaimSchema, type AnalysisField, type AnalysisResult,
    type AnalysisSource, type RefinementTarget,
} from '../../shared/photoAnalysis/contracts';
import { mapModelBoxToFullPhoto, type AnalysisImageSource, type StableAnalysisFace } from './geometry';

const SCOUT_FIELDS: AnalysisField[] = ['caption', 'classification', 'tags', 'date', 'location', 'appearance', 'archive_clue', 'quality', 'enhancements'];
const PERCEPTION_FIELDS: AnalysisField[] = ['text', 'archive_clue'];
export type ModelStage = 'perception' | 'scout' | 'refine';
export type CandidateIdentity = { faceId: string; personId: string; sourceId: string; label: string };
export type StageScope = {
    stage: ModelStage; faces: StableAnalysisFace[]; images: AnalysisImageSource[]; sources: AnalysisSource[];
    targets: RefinementTarget[]; candidates: CandidateIdentity[]; regionIds?: string[];
};

export function buildStageResponseSchema(scope: StageScope): Record<string, unknown> {
    const fields = allowedFields(scope);
    const choices = analysisClaimSchema.options.filter(option => fields.includes(option.shape.field.value))
        .map(option => option.extend({
            kind: scope.stage === 'perception' ? z.literal('observation') : z.enum(['observation', 'hypothesis', 'inferred_conclusion']),
            supersedesId: z.null(), sourceIds: z.array(z.enum(scope.sources.map(source => source.id) as [string, ...string[]])).min(1).max(6),
        }));
    const schema = analysisResultSchema.extend({ claims: z.array(z.union(choices as [typeof choices[number], typeof choices[number], ...Array<typeof choices[number]>])).max(100) });
    const jsonSchema = z.toJSONSchema(schema, { unrepresentable: 'any' });
    // Semantic cross-field constraints are enforced again after the API response.
    delete jsonSchema.$schema;
    return jsonSchema;
}

function allowedFields(scope: StageScope): AnalysisField[] {
    if (scope.stage === 'perception') { return PERCEPTION_FIELDS; }
    if (scope.stage === 'scout') { return SCOUT_FIELDS; }
    return [...new Set(scope.targets.map(target => target.field))];
}

function assertSourceReferences(result: AnalysisResult, scope: StageScope): void {
    const available = new Set(scope.sources.map(source => source.id));
    for (const claim of result.claims) {
        const references = [...claim.sourceIds, ...claim.evidence.flatMap(item => item.sourceIds), ...claim.contradictions.flatMap(item => item.sourceIds)];
        if (references.some(reference => !available.has(reference))) { throw new Error('Unknown evidence source reference'); }
        if (claim.supersedesId !== null) { throw new Error('Models cannot choose supersession'); }
        if (claim.kind === 'known_fact' || claim.kind === 'user_confirmed') { throw new Error('Models cannot assert authoritative truth'); }
    }
}

function assertPersonClaim(claim: AnalysisResult['claims'][number], scope: StageScope, faceIds: Set<string>): void {
    if (claim.field !== 'appearance' && claim.field !== 'identity') { return; }
    if (!claim.subjectId || !faceIds.has(claim.subjectId)) { throw new Error('Unknown supplied Face ID'); }
    if (claim.field !== 'identity' || claim.value.personId === null) { return; }
    if (!scope.candidates.some(candidate => candidate.faceId === claim.subjectId && candidate.personId === claim.value.personId)) {
        throw new Error('Identity must belong to the bounded candidate set for this Face ID');
    }
}

function assertTargetedClaim(claim: AnalysisResult['claims'][number], scope: StageScope): void {
    if (scope.stage !== 'refine') { return; }
    if (!scope.targets.some(target => target.field === claim.field && target.subjectId === claim.subjectId)) {
        throw new Error('Refine attempted an unrelated field or subject update');
    }
}

function assertOpportunitySubject(opportunity: AnalysisResult['refinementOpportunities'][number],
    faceIds: Set<string>, regionIds: Set<string>): void {
    if (opportunity.field === 'identity' || opportunity.field === 'appearance') {
        if (!opportunity.subjectId || !faceIds.has(opportunity.subjectId)) { throw new Error('Unknown refinement Face ID'); }
    }
    if (opportunity.subjectId && !faceIds.has(opportunity.subjectId) && !regionIds.has(opportunity.subjectId)) {
        throw new Error('Unknown refinement subject');
    }
}

function assertOpportunityScope(result: AnalysisResult, faceIds: Set<string>, regionIds: Set<string>): void {
    for (const opportunity of result.refinementOpportunities) {
        if (opportunity.field === 'local_metadata' || opportunity.field === 'description') { throw new Error('Local/user fields cannot be AI refinement concerns'); }
        assertOpportunitySubject(opportunity, faceIds, regionIds);
    }
}

function assertClaimScope(result: AnalysisResult, scope: StageScope): void {
    const fields = allowedFields(scope);
    const faceIds = new Set(scope.faces.map(face => face.modelFaceId));
    const regionIds = new Set([...(scope.regionIds ?? []), ...result.regions.map(region => region.id)]);
    for (const claim of result.claims) {
        if (!fields.includes(claim.field)) { throw new Error(`Field ${claim.field} outside ${scope.stage} scope`); }
        if (scope.stage === 'perception' && claim.kind !== 'observation') { throw new Error('Perception only extracts observations'); }
        if (claim.field === 'appearance' && claim.kind !== 'observation') { throw new Error('Appearance must be an observation'); }
        assertPersonClaim(claim, scope, faceIds);
        if (claim.field === 'enhancements') { assertEnhancementTargets(claim.value, faceIds, regionIds); }
        assertTargetedClaim(claim, scope);
    }
    assertOpportunityScope(result, faceIds, regionIds);
}

/** New localized entities receive globally unambiguous host IDs, never bare repeated R1 aliases. */
export function resolveSuppliedRegionIds(result: AnalysisResult, prefix: string): AnalysisResult {
    const ids = new Map(result.regions.map(region => [region.id, `${prefix}:${region.id}`]));
    const translate = (value: string) => ids.get(value) ?? value;
    return {
        ...result, regions: result.regions.map(region => ({ ...region, id: translate(region.id) })),
        claims: result.claims.map(claim => {
            const subjectId = claim.subjectId ? translate(claim.subjectId) : null;
            if (claim.field !== 'enhancements') { return { ...claim, subjectId }; }
            return { ...claim, subjectId, value: claim.value.map(item => ({
                ...item, protectedRegionIds: item.protectedRegionIds.map(translate),
                target: item.target.kind === 'regions' ? { ...item.target, regionIds: item.target.regionIds.map(translate) } : item.target,
            })) };
        }),
        refinementOpportunities: result.refinementOpportunities.map(item => ({ ...item, subjectId: item.subjectId ? translate(item.subjectId) : null })),
    };
}

function assertEnhancementTargets(recommendations: Extract<AnalysisResult['claims'][number], { field: 'enhancements' }>['value'], faceIds: Set<string>, regionIds: Set<string>): void {
    for (const recommendation of recommendations) {
        const targetFaces = recommendation.target.kind === 'faces' ? recommendation.target.faceIds : [];
        const targetRegions = recommendation.target.kind === 'regions' ? recommendation.target.regionIds : [];
        if ([...targetFaces, ...recommendation.protectedFaceIds].some(faceId => !faceIds.has(faceId))) { throw new Error('Unknown enhancement Face ID'); }
        if ([...targetRegions, ...recommendation.protectedRegionIds].some(regionId => !regionIds.has(regionId))) { throw new Error('Unknown enhancement region'); }
        if (recommendation.generative && (recommendation.action === 'text_preservation' || targetRegions.some(regionId => regionIds.has(regionId)))) {
            throw new Error('Generative detail modification requires protected evidence handling');
        }
    }
}

export function validateStageResult(value: unknown, scope: StageScope): AnalysisResult {
    const result = analysisResultSchema.parse(value);
    if (scope.stage === 'refine' && scope.targets.length === 0) { throw new Error('Refine requires explicit concerns'); }
    assertSourceReferences(result, scope);
    assertClaimScope(result, scope);
    const regionIds = new Set<string>();
    for (const region of result.regions) {
        if (regionIds.has(region.id)) { throw new Error('Duplicate region ID'); }
        regionIds.add(region.id);
        const image = scope.images.find(source => source.id === region.sourceImageId);
        if (!image) { throw new Error('Unknown source image for region'); }
        mapModelBoxToFullPhoto({ box: region.box, sourceImageId: region.sourceImageId, sources: scope.images });
    }
    return result;
}

/** Only ID translation occurs here; model coordinates never move local faces. */
export function resolveSuppliedFaceIds(result: AnalysisResult, faces: StableAnalysisFace[]): AnalysisResult {
    const translate = (modelId: string) => {
        const face = faces.find(item => item.modelFaceId === modelId);
        if (!face) { throw new Error('Unknown supplied Face ID'); }
        return face.faceId;
    };
    return {
        ...result,
        claims: result.claims.map(claim => {
            if (claim.field === 'appearance' || claim.field === 'identity') { return { ...claim, subjectId: translate(claim.subjectId!) }; }
            if (claim.field !== 'enhancements') { return claim; }
            return { ...claim, value: claim.value.map(item => ({
                ...item, target: item.target.kind === 'faces' ? { ...item.target, faceIds: item.target.faceIds.map(translate) } : item.target,
                protectedFaceIds: item.protectedFaceIds.map(translate),
            })) };
        }),
        refinementOpportunities: result.refinementOpportunities.map(item => ({
            ...item, subjectId: item.subjectId && faces.some(face => face.modelFaceId === item.subjectId) ? translate(item.subjectId) : item.subjectId,
        })),
    };
}
