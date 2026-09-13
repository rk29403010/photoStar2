import type { DatabaseManager } from '../../data/db';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type EvidenceRow = {
    ref_json: string;
};

type GenerationCandidateRow = {
    id: string;
};

export type CompactAnalysisGenerationVectorsInput = {
    completedBefore: string;
};

export type AnalysisGenerationCompactionResult = {
    compactedGenerationIds: string[];
    deletedVectorCount: number;
};

function assertValidCutoff(value: string): void {
    if (value.trim().length === 0 || !Number.isFinite(Date.parse(value))) {
        throw new Error('Analysis-generation compaction requires a valid completedBefore timestamp.');
    }
}

function loadEvidenceProtectedGenerationIds(db: DbHandle): Set<string> {
    const rows = db.prepare(`
        SELECT ref_json
        FROM semantic_evidence
        WHERE ref_kind = 'analysis_generation'
    `).all() as EvidenceRow[];
    const protectedIds = new Set<string>();
    for (const row of rows) {
        try {
            const ref = JSON.parse(row.ref_json) as { generationId?: unknown };
            if (typeof ref?.generationId === 'string' && ref.generationId.trim().length > 0) {
                protectedIds.add(ref.generationId);
            }
        } catch {
            // Invalid legacy/custom evidence must not make compaction fail globally.
        }
    }
    return protectedIds;
}

function loadLifecycleProtectedGenerationIds(db: DbHandle): Set<string> {
    const rows = db.prepare(`
        SELECT head.active_generation_id AS generation_id
        FROM analysis_generation_heads head
        UNION
        SELECT active.supersedes_generation_id AS generation_id
        FROM analysis_generation_heads head
        JOIN analysis_generations active ON active.id = head.active_generation_id
        WHERE active.supersedes_generation_id IS NOT NULL
    `).all() as Array<{ generation_id: string }>;
    return new Set(rows.map((row) => row.generation_id));
}

function loadCompactionCandidates(
    db: DbHandle,
    completedBefore: string,
    protectedIds: ReadonlySet<string>,
): string[] {
    const rows = db.prepare(`
        SELECT id
        FROM analysis_generations
        WHERE status IN ('failed', 'superseded')
          AND datetime(COALESCE(finished_at, updated_at)) < datetime(?)
        ORDER BY created_at ASC, id ASC
    `).all(completedBefore) as GenerationCandidateRow[];
    return rows
        .map((row) => row.id)
        .filter((generationId) => !protectedIds.has(generationId));
}

export function compactAnalysisGenerationVectors(
    db: DbHandle,
    input: CompactAnalysisGenerationVectorsInput,
): AnalysisGenerationCompactionResult {
    assertValidCutoff(input.completedBefore);
    return db.transaction(() => {
        const protectedIds = loadLifecycleProtectedGenerationIds(db);
        for (const generationId of loadEvidenceProtectedGenerationIds(db)) {
            protectedIds.add(generationId);
        }
        const compactedGenerationIds = loadCompactionCandidates(db, input.completedBefore, protectedIds);
        if (compactedGenerationIds.length === 0) {
            return { compactedGenerationIds: [], deletedVectorCount: 0 };
        }
        const placeholders = compactedGenerationIds.map(() => '?').join(', ');
        const result = db.prepare(`
            DELETE FROM feature_vectors
            WHERE analysis_generation_id IN (${placeholders})
        `).run(...compactedGenerationIds);
        return {
            compactedGenerationIds,
            deletedVectorCount: result.changes,
        };
    })();
}
