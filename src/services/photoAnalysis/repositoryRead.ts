import { analysisClaimSchema, refinementTargetSchema } from '../../shared/photoAnalysis/contracts';
import type { AnalysisSource, StoredAnalysisClaim, AnalysisResult } from '../../shared/photoAnalysis/contracts';
import type { AnalysisImageSource } from './geometry';
import type { AnalysisDb, LoadedAnalysis, StoredAnalysisRegion, StoredAnalysisRun } from './repositoryTypes';
import { claimKey } from './repositoryValidation';
import { analysisValiditySql } from '../../shared/sql/analysisValidity';

type RunRow = {
    id: string; asset_id: string; stage: StoredAnalysisRun['stage']; provider: string; model_version: string | null;
    prompt_version: string; created_at: string; telemetry_json: string; result_json: string; targets_json: string;
    status: StoredAnalysisRun['status'];
};
type ClaimRow = {
    id: string; asset_id: string; run_id: string; field: string; subject_id: string | null; value_json: string;
    confidence: string; kind: string; state: StoredAnalysisClaim['state']; supersedes_id: string | null;
    stage: StoredAnalysisRun['stage']; provider: string; model_version: string | null;
};
type ReferenceRow = { claim_id: string; role: 'evidence' | 'contradiction' | 'provenance'; ordinal: number; source_id: string; display_text: string | null };

function parseRun(row: RunRow): StoredAnalysisRun {
    const result = JSON.parse(row.result_json) as Pick<AnalysisResult, 'refinementOpportunities'>;
    return {
        id: row.id, assetId: row.asset_id, stage: row.stage, provider: row.provider, modelVersion: row.model_version,
        promptVersion: row.prompt_version, createdAt: row.created_at, status: row.status, telemetry: JSON.parse(row.telemetry_json),
        targets: JSON.parse(row.targets_json), refinementOpportunities: result.refinementOpportunities,
    };
}

function parseClaim(row: ClaimRow, references: ReferenceRow[]): StoredAnalysisClaim {
    const evidence = new Map<number, { text: string; sourceIds: string[] }>();
    const contradictions = new Map<number, { text: string; sourceIds: string[] }>();
    const sourceIds: string[] = [];
    for (const reference of references) {
        if (reference.role === 'provenance') { sourceIds.push(reference.source_id); continue; }
        const items = reference.role === 'evidence' ? evidence : contradictions;
        const item = items.get(reference.ordinal) ?? { text: reference.display_text ?? '', sourceIds: [] };
        item.sourceIds.push(reference.source_id);
        items.set(reference.ordinal, item);
    }
    const claim = analysisClaimSchema.parse({
        field: row.field, subjectId: row.subject_id, value: JSON.parse(row.value_json), confidence: row.confidence,
        kind: row.kind, evidence: [...evidence.values()], contradictions: [...contradictions.values()],
        sourceIds, supersedesId: row.supersedes_id,
    });
    return { ...claim, id: row.id, assetId: row.asset_id, runId: row.run_id, state: row.state,
        stage: row.stage, provider: row.provider, modelVersion: row.model_version };
}

function resolveWinners(claims: StoredAnalysisClaim[]): StoredAnalysisClaim[] {
    const ranks = { user_confirmed: 4, known_fact: 3, inferred_conclusion: 2, hypothesis: 1, observation: 0 };
    const stageRanks = { user: 4, local: 3, refine: 2, scout: 1, perception: 0, context: 0 };
    const winners = new Map<string, StoredAnalysisClaim>();
    for (const claim of claims) {
        if (claim.state !== 'active') { continue; }
        const key = claimKey(claim);
        const current = winners.get(key);
        if (!current || ranks[claim.kind] > ranks[current.kind]
            || (ranks[claim.kind] === ranks[current.kind] && stageRanks[claim.stage] >= stageRanks[current.stage])) {
            winners.set(key, claim);
        }
    }
    return [...winners.values()];
}

function loadRegions(db: AnalysisDb, assetId: string): StoredAnalysisRegion[] {
    const rows = db.prepare('SELECT * FROM analysis_regions WHERE asset_id = ? ORDER BY rowid').all(assetId) as Array<{
        id: string; run_id: string; image_id: string; label: string; source_box_json: string; photo_box_json: string;
    }>;
    return rows.map(row => ({
        id: row.id, runId: row.run_id, sourceImageId: row.image_id, box: JSON.parse(row.source_box_json),
        fullPhotoBox: JSON.parse(row.photo_box_json), ...JSON.parse(row.label),
    }));
}

function loadSources(db: AnalysisDb, assetId: string): AnalysisSource[] {
    const rows = db.prepare('SELECT * FROM analysis_sources WHERE asset_id = ? ORDER BY rowid').all(assetId) as Array<{
        id: string; asset_id: string; kind: AnalysisSource['kind']; ref_id: string; image_id: string | null; display_text: string;
        evidence_confidence: AnalysisSource['evidenceConfidence'] | null;
    }>;
    return rows.map(row => {
        const roots = db.prepare('SELECT root_claim_id FROM analysis_source_roots WHERE source_id = ? ORDER BY root_claim_id')
            .all(row.id) as { root_claim_id: string }[];
        const memberships = db.prepare(`SELECT event_id AS eventId, asset_id AS assetId, revision
            FROM analysis_source_memberships WHERE source_id = ?`).all(row.id) as NonNullable<AnalysisSource['memberships']>;
        return { id: row.id, assetId: row.asset_id, kind: row.kind, refId: row.ref_id,
            ...(row.image_id ? { imageId: row.image_id } : {}), text: row.display_text,
            ...(row.evidence_confidence ? { evidenceConfidence: row.evidence_confidence } : {}),
            ...(roots.length ? { rootClaimIds: roots.map(root => root.root_claim_id) } : {}),
            ...(memberships.length ? { memberships } : {}) };
    });
}

function resolveOpportunities(runs: StoredAnalysisRun[], winners: StoredAnalysisClaim[]): AnalysisResult['refinementOpportunities'] {
    const opportunities = new Map<string, AnalysisResult['refinementOpportunities'][number]>();
    for (const run of runs) {
        if (run.status === 'failed') { continue; }
        if (run.stage === 'refine') {
            for (const target of run.targets) { opportunities.delete(claimKey(target)); }
        }
        for (const opportunity of run.refinementOpportunities) { opportunities.set(claimKey(opportunity), opportunity); }
    }
    for (const winner of winners) {
        if (winner.kind === 'user_confirmed' || winner.kind === 'known_fact') { opportunities.delete(claimKey(winner)); }
    }
    return [...opportunities.values()];
}

export function loadStoredAnalysis(db: AnalysisDb, assetId: string): LoadedAnalysis {
    const runs = (db.prepare('SELECT * FROM analysis_runs WHERE asset_id = ? ORDER BY rowid').all(assetId) as RunRow[]).map(parseRun);
    const rows = db.prepare(`SELECT c.*, CASE WHEN ${analysisValiditySql('c')} THEN c.state ELSE 'superseded' END AS state,
        r.stage, r.provider, r.model_version FROM analysis_claims c
        JOIN analysis_runs r ON r.id = c.run_id WHERE c.asset_id = ? ORDER BY c.rowid`).all(assetId) as ClaimRow[];
    const references = db.prepare(`SELECT * FROM analysis_claim_sources WHERE asset_id = ?
        ORDER BY claim_id, role, ordinal, source_ordinal`).all(assetId) as ReferenceRow[];
    const byClaim = new Map<string, ReferenceRow[]>();
    for (const reference of references) {
        const group = byClaim.get(reference.claim_id) ?? [];
        group.push(reference);
        byClaim.set(reference.claim_id, group);
    }
    const claims = rows.map(row => parseClaim(row, byClaim.get(row.id) ?? []));
    const winners = resolveWinners(claims);
    const images = (db.prepare('SELECT manifest_json FROM analysis_images WHERE asset_id = ? ORDER BY rowid')
        .all(assetId) as { manifest_json: string }[]).map(row => JSON.parse(row.manifest_json) as AnalysisImageSource);
    const contextualOpportunities = (db.prepare(`SELECT targets_json FROM related_refinement_opportunities
        WHERE asset_id = ? AND state = 'pending' ORDER BY field, subject_id LIMIT 12`).all(assetId) as { targets_json: string }[])
        .map(row => ({ ...refinementTargetSchema.parse(JSON.parse(row.targets_json)), expectedValue: 'high' as const, reason: 'New attributable event or identity context is available.' }));
    const opportunities = new Map(resolveOpportunities(runs, winners).map(item => [claimKey(item), item]));
    for (const item of contextualOpportunities) { opportunities.set(claimKey(item), item); }
    return { runs, claims, winners, sources: loadSources(db, assetId), images, regions: loadRegions(db, assetId),
        refinementOpportunities: [...opportunities.values()],
        enhancementRecommendations: winners.flatMap(claim => claim.field === 'enhancements' ? claim.value : []) };
}
