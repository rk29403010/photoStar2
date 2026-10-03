import type { DatabaseManager } from '../../data/db';
import type { PhotoMetadataBundle, PhotoMetadataProjection } from '../../boundary/contracts/core';
import type { StoredAnalysisClaim } from '../../shared/photoAnalysis/contracts';
import { loadAnalysis } from './repository';
import type { LoadedAnalysis } from './repositoryTypes';

function findField<F extends StoredAnalysisClaim['field']>(claims: StoredAnalysisClaim[], field: F) {
    return claims.find(claim => claim.field === field && claim.subjectId === null) as
        Extract<StoredAnalysisClaim, { field: F }> | undefined;
}

function buildProjection(assetId: string, analysis: LoadedAnalysis): PhotoMetadataProjection {
    return {
        assetId, type: findField(analysis.winners, 'classification')?.value[0] ?? null,
        caption: findField(analysis.winners, 'caption')?.value ?? null,
        description: findField(analysis.winners, 'description')?.value ?? null,
        location: findField(analysis.winners, 'location')?.value?.label ?? null,
        estimatedDate: buildDateDisplay(findField(analysis.winners, 'date')),
        keywords: findField(analysis.winners, 'tags')?.value ?? [], emotionalImpact: null,
        quality: { technical: null, lighting: null, composition: null, emotional: null, discard: null },
        recommendedEnhancements: [], authenticity: { score: null, reasons: [] },
        subjects: analysis.winners.filter(claim => claim.field === 'appearance')
            .map(claim => ({ face_id: claim.subjectId, ...claim.value })),
        regionsOfInterest: analysis.regions.map(region => ({ id: region.id, kind: region.kind,
            label: region.observation, bounding_box: region.fullPhotoBox })),
    };
}

function buildDateDisplay(date: Extract<StoredAnalysisClaim, { field: 'date' }> | undefined): PhotoMetadataProjection['estimatedDate'] {
    const value = date?.value;
    return {
        most_likely_date: value?.start === value?.end ? value?.start ?? null : null,
        min_date: value?.start ?? null, max_date: value?.end ?? null, display_label: value?.label ?? null,
        rationale: date?.evidence.map(item => item.text).join('; ') || null,
    };
}

function buildProvenance(claims: StoredAnalysisClaim[]): PhotoMetadataBundle['provenance'] {
    const names = { classification: 'type', caption: 'caption', description: 'description', location: 'location', date: 'estimatedDate',
        tags: 'keywords', quality: 'quality', enhancements: 'recommendedEnhancements' } as const;
    return Object.fromEntries(Object.entries(names).flatMap(([field, name]) => {
        const claim = claims.find(item => item.field === field && item.subjectId === null);
        return claim ? [[name, { sourceKind: claim.stage, sourceId: claim.id }]] : [];
    }));
}

/** Existing presentation fields are computed directly from evidence claims. */
export function buildAnalysisDisplay(dbManager: DatabaseManager, assetId: string): PhotoMetadataBundle & { analysis: LoadedAnalysis } {
    const analysis = loadAnalysis(dbManager, assetId);
    return { projection: buildProjection(assetId, analysis), provenance: buildProvenance(analysis.winners), analysis };
}
