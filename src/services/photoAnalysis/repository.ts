import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';
import type { AnalysisClaim } from '../../shared/photoAnalysis/contracts';
import { mapModelBoxToFullPhoto } from './geometry';
import { loadStoredAnalysis } from './repositoryRead';
import { validateAnalysisRun } from './repositoryValidation';
import type { AnalysisDb, PersistAnalysisRunInput, LoadedAnalysis } from './repositoryTypes';
import { persistSourceLineage, persistClaimLineage, resolveSourceLineage } from './lineage';
import { queuePhotoEvidenceChange } from '../../data/relatedPhotoQueue';

export type { PersistAnalysisRunInput, LoadedAnalysis } from './repositoryTypes';

function insertRun(db: AnalysisDb, input: PersistAnalysisRunInput, runId: string, now: string): void {
    db.prepare(`INSERT INTO analysis_runs
        (id, asset_id, stage, provider, model_version, prompt_version, status,
         telemetry_json, result_json, targets_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'successful', ?, ?, ?, ?)`)
        .run(runId, input.assetId, input.stage, input.provider, input.modelVersion, input.promptVersion,
            JSON.stringify(input.telemetry ?? {}),
            JSON.stringify({ refinementOpportunities: input.result.refinementOpportunities }),
            JSON.stringify(input.targets ?? []), now);
}

function insertInputs(db: AnalysisDb, input: PersistAnalysisRunInput, runId: string): void {
    const imageStatement = db.prepare('INSERT INTO analysis_images (id, asset_id, run_id, manifest_json) VALUES (?, ?, ?, ?)');
    for (const image of input.images ?? []) {
        imageStatement.run(image.id, input.assetId, runId, JSON.stringify(image));
    }
    const sourceStatement = db.prepare(`INSERT INTO analysis_sources
        (id, asset_id, run_id, kind, ref_id, image_id, display_text, evidence_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const source of input.sources) {
        sourceStatement.run(source.id, input.assetId, runId, source.kind, source.refId, source.imageId ?? null, source.text, resolveSourceLineage(db, source).confidence);
        persistSourceLineage(db, source);
    }
}

function insertClaimReferences(db: AnalysisDb, input: PersistAnalysisRunInput, claim: AnalysisClaim, claimId: string): void {
    const statement = db.prepare(`INSERT INTO analysis_claim_sources
        (claim_id, asset_id, role, ordinal, source_ordinal, source_id, display_text) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const [role, items] of [['evidence', claim.evidence], ['contradiction', claim.contradictions]] as const) {
        items.forEach((item, ordinal) => item.sourceIds.forEach((sourceId, sourceOrdinal) => {
            statement.run(claimId, input.assetId, role, ordinal, sourceOrdinal, sourceId, item.text);
        }));
    }
    claim.sourceIds.forEach((sourceId, ordinal) => {
        statement.run(claimId, input.assetId, 'provenance', ordinal, 0, sourceId, null);
    });
}

function insertClaims(db: AnalysisDb, input: PersistAnalysisRunInput, runId: string, now: string): void {
    const insert = db.prepare(`INSERT INTO analysis_claims
        (id, asset_id, run_id, field, subject_id, value_json, confidence, kind, state, supersedes_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`);
    const supersede = db.prepare("UPDATE analysis_claims SET state = 'superseded' WHERE id = ? AND asset_id = ?");
    for (const claim of input.result.claims) {
        const id = randomUUID();
        insert.run(id, input.assetId, runId, claim.field, claim.subjectId, JSON.stringify(claim.value),
            claim.confidence, claim.kind, claim.supersedesId, now);
        insertClaimReferences(db, input, claim, id);
        persistClaimLineage(db, claim, id);
        if (claim.supersedesId) { supersede.run(claim.supersedesId, input.assetId); }
    }
}

function insertRegions(db: AnalysisDb, input: PersistAnalysisRunInput, runId: string): void {
    const statement = db.prepare(`INSERT INTO analysis_regions
        (id, asset_id, run_id, image_id, label, source_box_json, photo_box_json) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const region of input.result.regions) {
        const mapped = mapModelBoxToFullPhoto({ sourceImageId: region.sourceImageId, box: region.box, sources: input.images ?? [] });
        statement.run(region.id, input.assetId, runId, region.sourceImageId, JSON.stringify({
            kind: region.kind, observation: region.observation, confidence: region.confidence,
        }), JSON.stringify(region.box), JSON.stringify(mapped));
    }
}

/** One validated immutable run and its claims become visible atomically. */
export function persistAnalysisRun(dbManager: DatabaseManager, input: PersistAnalysisRunInput): string {
    const db = dbManager.getDb();
    const runId = input.runId ?? randomUUID();
    db.transaction(() => {
        validateAnalysisRun(db, input);
        const now = new Date().toISOString();
        insertRun(db, input, runId, now);
        insertInputs(db, input, runId);
        insertClaims(db, input, runId, now);
        insertRegions(db, input, runId);
        if (input.stage === 'refine' || input.stage === 'user') {
            for (const claim of input.result.claims) {
                db.prepare(`UPDATE related_refinement_opportunities SET state = 'resolved' WHERE asset_id = ? AND field = ? AND subject_id = ?`)
                    .run(input.assetId, claim.field, claim.subjectId ?? '');
            }
        }
        if (input.provider !== 'related-photo-network') { queuePhotoEvidenceChange(db, input.assetId, `analysis:${input.stage}`); }
    })();
    return runId;
}

export function loadAnalysis(dbManager: DatabaseManager, assetId: string): LoadedAnalysis {
    return loadStoredAnalysis(dbManager.getDb(), assetId);
}

export type PersistFailedAnalysisRunInput = Omit<PersistAnalysisRunInput, 'result' | 'sources' | 'images'>;

/** Failures retain measured telemetry without manufacturing claims or clearing concerns. */
export function persistFailedAnalysisRun(dbManager: DatabaseManager, input: PersistFailedAnalysisRunInput): string {
    const db = dbManager.getDb();
    const runId = input.runId ?? randomUUID();
    db.transaction(() => {
        const complete = { ...input, result: { claims: [], regions: [], refinementOpportunities: [] }, sources: [] };
        validateAnalysisRun(db, complete);
        insertRun(db, complete, runId, new Date().toISOString());
        db.prepare("UPDATE analysis_runs SET status = 'failed' WHERE id = ?").run(runId);
    })();
    return runId;
}
