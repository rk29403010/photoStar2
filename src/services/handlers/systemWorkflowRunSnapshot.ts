type WorkflowRunRow = {
    id: string;
    workflow_id: string;
    status: string;
    created_at: string;
    parameters_json: string;
};

type WorkflowRunMilestoneRow = {
    workflow_run_id: string;
    milestone_id: string;
    label: string;
    status: string;
};

type WorkflowRunCountRow = {
    workflow_run_id: string;
    total_items: number;
    completed_items: number | null;
    failed_items: number | null;
};

type WorkflowStepCountRow = {
    workflow_run_id: string;
    node_id: string;
    status: string;
    total_items: number;
    completed_items: number | null;
    failed_items: number | null;
};

type DbLike = {
    prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown[];
    };
};

function asDbLike(db: unknown): DbLike {
    return db as DbLike;
}

function parseParametersJson(raw: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(raw) as unknown;
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
}

function getWorkflowDisplayName(workflowId: string): string {
    return workflowId === 'folder_ingest_v1' ? 'Folder ingest' : workflowId;
}

function loadWorkflowRuns(db: DbLike): WorkflowRunRow[] {
    return db.prepare(`
        SELECT id, workflow_id, status, created_at, parameters_json
        FROM workflow_runs
        ORDER BY created_at DESC
        LIMIT 10
    `).all() as WorkflowRunRow[];
}

function loadMilestoneRows(db: DbLike, placeholders: string, runIds: string[]): WorkflowRunMilestoneRow[] {
    return db.prepare(`
        SELECT workflow_run_id, milestone_id, label, status
        FROM workflow_run_milestones
        WHERE workflow_run_id IN (${placeholders})
        ORDER BY created_at ASC, milestone_id ASC
    `).all(...runIds) as WorkflowRunMilestoneRow[];
}

function loadStepRows(db: DbLike, placeholders: string, runIds: string[]): WorkflowStepCountRow[] {
    return db.prepare(`
        SELECT
            sr.workflow_run_id,
            sr.node_id,
            sr.status,
            COALESCE(NULLIF(MAX(sr.expected_items), 0), COUNT(se.id)) AS total_items,
            COALESCE(SUM(CASE WHEN se.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed_items,
            COALESCE(SUM(CASE WHEN se.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_items
        FROM step_runs sr
        LEFT JOIN subject_executions se ON se.step_run_id = sr.id
        WHERE sr.workflow_run_id IN (${placeholders})
        GROUP BY sr.workflow_run_id, sr.node_id, sr.status, sr.created_at, sr.id
        ORDER BY sr.created_at ASC, sr.id ASC
    `).all(...runIds) as WorkflowStepCountRow[];
}

function loadCountRows(db: DbLike, placeholders: string, runIds: string[]): WorkflowRunCountRow[] {
    return db.prepare(`
        SELECT
            workflow_run_id,
            COUNT(*) AS total_items,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_items,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_items
        FROM subject_executions
        WHERE workflow_run_id IN (${placeholders})
        GROUP BY workflow_run_id
    `).all(...runIds) as WorkflowRunCountRow[];
}

function groupRowsByRunId<RowType extends { workflow_run_id: string }>(rows: RowType[]): Map<string, RowType[]> {
    const rowsByRun = new Map<string, RowType[]>();
    for (const row of rows) {
        const existing = rowsByRun.get(row.workflow_run_id) ?? [];
        existing.push(row);
        rowsByRun.set(row.workflow_run_id, existing);
    }
    return rowsByRun;
}

function mapMilestones(rows: WorkflowRunMilestoneRow[]) {
    return rows.map((milestone) => ({
        milestoneId: milestone.milestone_id,
        label: milestone.label,
        status: milestone.status,
    }));
}

function mapStepSummaries(rows: WorkflowStepCountRow[]) {
    return rows.map((step) => ({
        nodeId: step.node_id,
        status: step.status,
        totalItems: step.total_items,
        completedItems: step.completed_items ?? 0,
        failedItems: step.failed_items ?? 0,
    }));
}

function buildRunSnapshot(
    run: WorkflowRunRow,
    countsByRun: Map<string, WorkflowRunCountRow>,
    milestonesByRun: Map<string, WorkflowRunMilestoneRow[]>,
    stepsByRun: Map<string, WorkflowStepCountRow[]>,
) {
    const counts = countsByRun.get(run.id);
    return {
        runId: run.id,
        workflowId: run.workflow_id,
        displayName: getWorkflowDisplayName(run.workflow_id),
        status: run.status,
        createdAt: run.created_at,
        parameters: parseParametersJson(run.parameters_json),
        totalItems: counts?.total_items ?? 0,
        completedItems: counts?.completed_items ?? 0,
        failedItems: counts?.failed_items ?? 0,
        milestones: mapMilestones(milestonesByRun.get(run.id) ?? []),
        stepSummaries: mapStepSummaries(stepsByRun.get(run.id) ?? []),
    };
}

export function getWorkflowRunsSnapshot(db: unknown) {
    const typedDb = asDbLike(db);
    const runs = loadWorkflowRuns(typedDb);
    if (runs.length === 0) {
        return [];
    }

    const runIds = runs.map((run) => run.id);
    const placeholders = runIds.map(() => '?').join(',');
    const milestoneRows = loadMilestoneRows(typedDb, placeholders, runIds);
    const stepRows = loadStepRows(typedDb, placeholders, runIds);
    const countRows = loadCountRows(typedDb, placeholders, runIds);

    const milestonesByRun = groupRowsByRunId(milestoneRows);
    const stepsByRun = groupRowsByRunId(stepRows);
    const countsByRun = new Map(countRows.map((row) => [row.workflow_run_id, row]));

    return runs.map((run) => buildRunSnapshot(run, countsByRun, milestonesByRun, stepsByRun));
}
