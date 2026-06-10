import type { WorkflowRegistry } from '../workflowRuntime/workflowRegistry';

type WorkflowStatusCountRow = {
    workflow_id: string;
    status: string;
    count: number;
};

type WorkflowStatusLatestRow = {
    id: string;
    workflow_id: string;
    status: string;
    created_at: string;
};

type DbLike = {
    prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown[];
    };
};

function asDbLike(db: unknown): DbLike {
    return db as DbLike;
}

const WORKFLOW_FALLBACK_NAMES: Record<string, string> = {
    folder_ingest_v1: 'Folder ingest',
    library_grouping_v1: 'Library grouping',
    library_previews_v1: 'Library previews',
    library_face_pipeline_v1: 'Face workflow',
    library_sensitive_scan_v1: 'Sensitive content workflow',
    library_ai_metadata_v1: 'AI metadata workflow',
    library_photo_date_v1: 'Photo date recalculation',
};

function getWorkflowDisplayName(workflowId: string, workflows?: WorkflowRegistry): string {
    if (workflows) {
        try {
            const def = workflows.get(workflowId);
            if (def.presentation?.defaultRunLabel) {
                return def.presentation.defaultRunLabel;
            }
        } catch {
            // fallback if not found in registry
        }
    }
    return WORKFLOW_FALLBACK_NAMES[workflowId] ?? workflowId;
}

const WORKFLOW_FALLBACK_STAGES: Record<string, string> = {
    library_previews_v1: 'preview_generation',
    library_face_pipeline_v1: 'face_analysis',
    library_ai_metadata_v1: 'ai_metadata',
    library_sensitive_scan_v1: 'sensitive_scan',
};

function getWorkflowStage(workflowId: string, workflows?: WorkflowRegistry): string | undefined {
    if (workflows) {
        try {
            const def = workflows.get(workflowId);
            if (def.presentation?.stage) {
                return def.presentation.stage;
            }
        } catch {
            // fallback if not found in registry
        }
    }
    return WORKFLOW_FALLBACK_STAGES[workflowId] ?? 'scan';
}

export function getWorkflowStatusSnapshot(db: unknown, workflows?: WorkflowRegistry) {
    const typedDb = asDbLike(db);
    const countRows = typedDb.prepare(`
        SELECT workflow_id, status, COUNT(*) AS count
        FROM workflow_runs
        GROUP BY workflow_id, status
    `).all() as WorkflowStatusCountRow[];
    const latestRows = typedDb.prepare(`
        SELECT current.id, current.workflow_id, current.status, current.created_at
        FROM workflow_runs current
        INNER JOIN (
            SELECT workflow_id, MAX(created_at) AS created_at
            FROM workflow_runs
            GROUP BY workflow_id
        ) latest
            ON latest.workflow_id = current.workflow_id
           AND latest.created_at = current.created_at
        ORDER BY current.workflow_id ASC, current.id ASC
    `).all() as WorkflowStatusLatestRow[];

    const totals = {
        running: 0,
        completed: 0,
        failed: 0,
        totalRuns: 0,
    };
    const byWorkflow = new Map<string, {
        workflowId: string;
        displayName: string;
        stage?: string;
        totalRuns: number;
        running: number;
        completed: number;
        failed: number;
        latestRunId: string | null;
        latestStatus: string | null;
        latestCreatedAt: string | null;
    }>();

    for (const row of countRows) {
        const entry = byWorkflow.get(row.workflow_id) ?? {
            workflowId: row.workflow_id,
            displayName: getWorkflowDisplayName(row.workflow_id, workflows),
            stage: getWorkflowStage(row.workflow_id, workflows),
            totalRuns: 0,
            running: 0,
            completed: 0,
            failed: 0,
            latestRunId: null,
            latestStatus: null,
            latestCreatedAt: null,
        };

        entry.totalRuns += row.count;
        totals.totalRuns += row.count;
        if (row.status === 'running') {
            entry.running += row.count;
            totals.running += row.count;
        } else if (row.status === 'completed') {
            entry.completed += row.count;
            totals.completed += row.count;
        } else if (row.status === 'failed') {
            entry.failed += row.count;
            totals.failed += row.count;
        }

        byWorkflow.set(row.workflow_id, entry);
    }

    for (const row of latestRows) {
        const entry = byWorkflow.get(row.workflow_id);
        if (!entry) {
            continue;
        }
        entry.latestRunId = row.id;
        entry.latestStatus = row.status;
        entry.latestCreatedAt = row.created_at;
    }

    return {
        generatedAt: new Date().toISOString(),
        totals,
        workflows: [...byWorkflow.values()].sort((left, right) => left.displayName.localeCompare(right.displayName)),
    };
}
