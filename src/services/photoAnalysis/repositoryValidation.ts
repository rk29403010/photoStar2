import { analysisResultSchema, analysisStageSchema, refinementTargetSchema } from '../../shared/photoAnalysis/contracts';
import type { AnalysisClaim } from '../../shared/photoAnalysis/contracts';
import { assertCanonicalPhotoBox, assertImageDimensions, mapModelBoxToFullPhoto } from './geometry';
import type { AnalysisDb, PersistAnalysisRunInput } from './repositoryTypes';
import { assertClaimEntities } from './repositoryEntities';
import { validateClaimLineage } from './lineage';

export function claimKey(claim: { field: string; subjectId: string | null }): string {
    return JSON.stringify([claim.field, claim.subjectId]);
}

function assertClaimStage(claim: AnalysisClaim, stage: PersistAnalysisRunInput['stage']): void {
    assertAuthorityStage(claim, stage);
    assertObservationStage(claim, stage);
    if (stage === 'user' && claim.kind !== 'user_confirmed') {
        throw new Error('User stage requires user-confirmed claims');
    }
    if ((claim.field === 'appearance' || claim.field === 'identity') && !claim.subjectId) {
        throw new Error('People semantics require a canonical Face ID');
    }
}

function assertObservationStage(claim: AnalysisClaim, stage: PersistAnalysisRunInput['stage']): void {
    if (claim.field === 'appearance' && claim.kind !== 'observation' && stage !== 'user') {
        throw new Error('Visible appearance must remain an observation');
    }
    if (claim.field === 'link_features' && claim.kind !== 'observation') { throw new Error('Link features must remain independent observations'); }
}

function assertAuthorityStage(claim: AnalysisClaim, stage: PersistAnalysisRunInput['stage']): void {
    const allowed = stage === 'local' || stage === 'user';
    if ((claim.kind === 'user_confirmed' && stage !== 'user') || (claim.kind === 'known_fact' && !allowed)) {
        throw new Error('Only local facts or user confirmation may create authoritative claims');
    }
    if (claim.field === 'local_metadata' && !allowed) {
        throw new Error('Deterministic local metadata cannot be produced by AI');
    }
}

function assertNewSource(source: PersistAnalysisRunInput['sources'][number], assetId: string, ids: Set<string>): void {
    if (source.assetId !== assetId || !source.id || !source.refId || !source.text.trim()
        || source.text.length > 180 || ids.has(source.id)) {
        throw new Error('Analysis source must be unique, concise and belong to this asset');
    }
}

function assertSources(db: AnalysisDb, input: PersistAnalysisRunInput): Set<string> {
    const existing = db.prepare('SELECT id FROM analysis_sources WHERE asset_id = ?').all(input.assetId) as { id: string }[];
    const ids = new Set(existing.map(source => source.id));
    const imageIds = new Set((input.images ?? []).map(image => image.id));
    for (const source of input.sources) {
        assertNewSource(source, input.assetId, ids);
        if (source.imageId && !imageIds.has(source.imageId)) {
            throw new Error('Analysis source image must belong to this run');
        }
        ids.add(source.id);
    }
    return ids;
}

function assertSupersession(db: AnalysisDb, input: PersistAnalysisRunInput, claim: AnalysisClaim): void {
    if (!claim.supersedesId) { return; }
    const previous = db.prepare('SELECT field, subject_id, kind, state FROM analysis_claims WHERE id = ? AND asset_id = ?')
        .get(claim.supersedesId, input.assetId) as { field: string; subject_id: string | null; kind: string; state: string } | undefined;
    if (!previous || previous.field !== claim.field || previous.subject_id !== claim.subjectId || previous.state !== 'active') {
        throw new Error('Supersession requires an active claim for the exact field and subject');
    }
    if (input.stage !== 'user' && (previous.kind === 'user_confirmed' || previous.kind === 'known_fact')) {
        throw new Error('AI cannot supersede authoritative data');
    }
}

function assertClaimReferences(input: PersistAnalysisRunInput, claim: AnalysisClaim, sources: Set<string>): void {
    const references = [...claim.sourceIds, ...claim.evidence.flatMap(item => item.sourceIds),
        ...claim.contradictions.flatMap(item => item.sourceIds)];
    if (references.some(source => !sources.has(source))) {
        throw new Error('Claim references must resolve to sources belonging to this asset');
    }
    if (input.stage === 'refine' && !(input.targets ?? []).some(target => claimKey(target) === claimKey(claim))) {
        throw new Error('Refine may update only explicitly targeted fields and subjects');
    }
}

export function validateAnalysisRun(db: AnalysisDb, input: PersistAnalysisRunInput): void {
    analysisStageSchema.parse(input.stage);
    analysisResultSchema.parse(input.result);
    for (const target of input.targets ?? []) { refinementTargetSchema.parse(target); }
    if (!db.prepare('SELECT id FROM assets WHERE id = ?').get(input.assetId)) {
        throw new Error('Analysis requires an existing asset');
    }
    if (!input.provider || !input.promptVersion) { throw new Error('Analysis requires provider and prompt version'); }
    assertImages(input);
    const sources = assertSources(db, input);
    validateClaimLineage(db, input);
    for (const region of input.result.regions) {
        mapModelBoxToFullPhoto({ sourceImageId: region.sourceImageId, box: region.box, sources: input.images ?? [] });
    }
    const keys = input.result.claims.map(claimKey);
    if (new Set(keys).size !== keys.length) { throw new Error('A run may produce only one claim per field and subject'); }
    for (const claim of input.result.claims) {
        assertClaimStage(claim, input.stage);
        assertClaimEntities(db, input, claim);
        assertClaimReferences(input, claim, sources);
        assertSupersession(db, input, claim);
    }
}

function assertImages(input: PersistAnalysisRunInput): void {
    const images = input.images ?? [];
    if (new Set(images.map(image => image.id)).size !== images.length) { throw new Error('Duplicate source image ID'); }
    for (const image of images) {
        if (image.assetId !== input.assetId) { throw new Error('Image belongs to a different asset'); }
        assertImageDimensions(image);
        assertCanonicalPhotoBox(image.fullPhotoBox);
    }
}
