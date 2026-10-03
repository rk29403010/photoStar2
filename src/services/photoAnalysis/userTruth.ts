import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';
import { analysisClaimSchema, type AnalysisField } from '../../shared/photoAnalysis/contracts';
import { loadAnalysis, persistAnalysisRun } from './repository';
import { syncAnalysisTagAssignments } from './tagProjection';

/** Corrections are immutable user claims; subsequent model runs cannot supersede them. */
export function recordUserTruth(dbManager: DatabaseManager, params: {
    assetId: string; field: AnalysisField; subjectId?: string | null; value: unknown; userId: string; note?: string | null;
}) {
    if (!params.userId.trim()) { throw new Error('User attribution is required'); }
    const subjectId = params.subjectId ?? null;
    const previous = loadAnalysis(dbManager, params.assetId).winners.find(claim => claim.field === params.field && claim.subjectId === subjectId);
    const sourceId = `user:${randomUUID()}`;
    const claim = analysisClaimSchema.parse({
        field: params.field, subjectId, value: params.value, kind: 'user_confirmed', confidence: 'high',
        evidence: [], contradictions: [], sourceIds: [sourceId], supersedesId: previous?.id ?? null,
    });
    const runId = dbManager.getDb().transaction(() => {
        const id = persistAnalysisRun(dbManager, {
            assetId: params.assetId, stage: 'user', provider: 'user', modelVersion: null, promptVersion: 'user-1',
            sources: [{ id: sourceId, assetId: params.assetId, kind: 'user', refId: params.userId, text: (params.note || 'User confirmation/correction').slice(0, 180) }],
            result: { claims: [claim], regions: [], refinementOpportunities: [] },
        });
        if (params.field === 'tags') { syncAnalysisTagAssignments(dbManager, params.assetId); }
        return id;
    })();
    const analysis = loadAnalysis(dbManager, params.assetId);
    return { runId, claim: analysis.claims.find(item => item.runId === runId), analysis };
}
