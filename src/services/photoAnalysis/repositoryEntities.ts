import type { AnalysisClaim, EnhancementRecommendation } from '../../shared/photoAnalysis/contracts';
import type { AnalysisDb, PersistAnalysisRunInput } from './repositoryTypes';

function assertFace(db: AnalysisDb, assetId: string, faceId: string): void {
    const face = db.prepare(`SELECT face.id FROM faces face
        JOIN visual_regions region ON region.id = face.visual_region_id
        JOIN assets asset ON asset.asset_identity_guid = region.asset_identity_guid
        WHERE asset.id = ? AND face.id = ?`).get(assetId, faceId);
    if (!face) { throw new Error('Canonical Face ID must belong to this asset'); }
}

function assertRegion(db: AnalysisDb, input: PersistAnalysisRunInput, regionId: string): void {
    const supplied = input.result.regions.some(region => region.id === regionId);
    const stored = db.prepare('SELECT id FROM analysis_regions WHERE asset_id = ? AND id = ?').get(input.assetId, regionId);
    if (!supplied && !stored) { throw new Error('Canonical region ID must belong to this asset'); }
}

function assertEnhancementEntities(db: AnalysisDb, input: PersistAnalysisRunInput, item: EnhancementRecommendation): void {
    const faces = item.target.kind === 'faces' ? item.target.faceIds : [];
    const regions = item.target.kind === 'regions' ? item.target.regionIds : [];
    for (const faceId of [...faces, ...item.protectedFaceIds]) { assertFace(db, input.assetId, faceId); }
    for (const regionId of [...regions, ...item.protectedRegionIds]) { assertRegion(db, input, regionId); }
}

export function assertClaimEntities(db: AnalysisDb, input: PersistAnalysisRunInput, claim: AnalysisClaim): void {
    if (claim.field === 'appearance' || claim.field === 'identity') {
        assertFace(db, input.assetId, claim.subjectId!);
    } else if (claim.subjectId !== null) {
        assertRegion(db, input, claim.subjectId);
    }
    if (claim.field === 'identity' && claim.value.personId !== null) {
        if (!db.prepare('SELECT id FROM people WHERE id = ?').get(claim.value.personId)) {
            throw new Error('Identity must reference an existing Person ID');
        }
    }
    if (claim.field === 'enhancements') {
        for (const item of claim.value) { assertEnhancementEntities(db, input, item); }
    }
}
