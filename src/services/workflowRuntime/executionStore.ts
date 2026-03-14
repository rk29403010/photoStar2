import { randomUUID } from 'node:crypto';
import type { DatabaseManager } from '../../data/db';

export interface SubjectRef {
    subjectType: string;
    subjectId: string;
}

export interface CreateWorkflowRunInput {
    workflowId: string;
    triggerType: string;
    inputSubjects: SubjectRef[];
    parameters?: Record<string, unknown>;
}

export interface RecordStepRunInput {
    stepRunId?: string;
    workflowRunId: string;
    nodeId: string;
    status: string;
    expectedItems?: number;
}

export interface RecordSubjectExecutionInput {
    subjectExecutionId?: string;
    workflowRunId: string;
    stepRunId: string;
    subjectType: string;
    subjectId: string;
    status: string;
}

export interface WorkflowRunSummary {
    runId: string;
    workflowId: string;
    status: string;
    totalItems: number;
    completedItems: number;
    failedItems: number;
}

export interface WorkflowStepRunDetail {
    stepRunId: string;
    nodeId: string;
    status: string;
    totalItems: number;
    completedItems: number;
    failedItems: number;
}

export interface WorkflowMilestoneState {
    milestoneId: string;
    label: string;
    status: string;
}

export interface WorkflowRunDetail {
    summary: WorkflowRunSummary;
    parameters: Record<string, unknown>;
    milestones: WorkflowMilestoneState[];
    steps: WorkflowStepRunDetail[];
}

function toIsoNow(): string {
    return new Date().toISOString();
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
    if (!value) {
        return {};
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
    } catch {
        return {};
    }

    return {};
}

export class ExecutionStore {
    constructor(private readonly dbManager: DatabaseManager) {}

    public createWorkflowRun(input: CreateWorkflowRunInput): string {
        const runId = randomUUID();
        this.dbManager.getDb().prepare(`
            INSERT INTO workflow_runs (
                id,
                workflow_id,
                trigger_type,
                status,
                input_subjects_json,
                parameters_json,
                started_at,
                created_at
            ) VALUES (?, ?, ?, 'running', ?, ?, ?, ?)
        `).run(
            runId,
            input.workflowId,
            input.triggerType,
            JSON.stringify(input.inputSubjects),
            JSON.stringify(input.parameters ?? {}),
            toIsoNow(),
            toIsoNow(),
        );
        return runId;
    }

    public updateMilestoneState(runId: string, milestone: WorkflowMilestoneState): void {
        this.dbManager.getDb().prepare(`
            INSERT INTO workflow_run_milestones (
                workflow_run_id,
                milestone_id,
                label,
                status,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(workflow_run_id, milestone_id) DO UPDATE SET
                label = excluded.label,
                status = excluded.status,
                updated_at = excluded.updated_at
        `).run(
            runId,
            milestone.milestoneId,
            milestone.label,
            milestone.status,
            toIsoNow(),
            toIsoNow(),
        );
    }

    public recordStepRun(input: RecordStepRunInput): string {
        const stepRunId = input.stepRunId ?? randomUUID();
        this.dbManager.getDb().prepare(`
            INSERT INTO step_runs (
                id,
                workflow_run_id,
                node_id,
                status,
                expected_items,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                expected_items = COALESCE(excluded.expected_items, step_runs.expected_items),
                updated_at = excluded.updated_at
        `).run(
            stepRunId,
            input.workflowRunId,
            input.nodeId,
            input.status,
            input.expectedItems ?? null,
            toIsoNow(),
            toIsoNow(),
        );
        return stepRunId;
    }

    public recordSubjectExecution(input: RecordSubjectExecutionInput): string {
        const subjectExecutionId = input.subjectExecutionId ?? randomUUID();
        this.dbManager.getDb().prepare(`
            INSERT INTO subject_executions (
                id,
                workflow_run_id,
                step_run_id,
                subject_type,
                subject_id,
                status,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status = excluded.status,
                updated_at = excluded.updated_at
        `).run(
            subjectExecutionId,
            input.workflowRunId,
            input.stepRunId,
            input.subjectType,
            input.subjectId,
            input.status,
            toIsoNow(),
            toIsoNow(),
        );
        return subjectExecutionId;
    }

    public getRunSummary(runId: string): WorkflowRunSummary {
        const db = this.dbManager.getDb();
        const run = db.prepare(`
            SELECT id, workflow_id, status
            FROM workflow_runs
            WHERE id = ?
        `).get(runId) as { id: string; workflow_id: string; status: string } | undefined;

        if (!run) {
            throw new Error(`Unknown workflow run '${runId}'`);
        }

        const counts = db.prepare(`
            SELECT
                COUNT(*) AS total_items,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_items,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_items
            FROM subject_executions
            WHERE workflow_run_id = ?
        `).get(runId) as {
            total_items: number;
            completed_items: number | null;
            failed_items: number | null;
        };

        return {
            runId: run.id,
            workflowId: run.workflow_id,
            status: run.status,
            totalItems: counts.total_items,
            completedItems: counts.completed_items ?? 0,
            failedItems: counts.failed_items ?? 0,
        };
    }

    public updateWorkflowRunStatus(runId: string, status: string): void {
        this.dbManager.getDb().prepare(`
            UPDATE workflow_runs
            SET status = ?,
                finished_at = CASE
                    WHEN ? IN ('completed', 'failed') THEN ?
                    ELSE finished_at
                END
            WHERE id = ?
        `).run(status, status, toIsoNow(), runId);
    }

    public getRunDetail(runId: string): WorkflowRunDetail {
        const db = this.dbManager.getDb();
        const run = db.prepare(`
            SELECT parameters_json
            FROM workflow_runs
            WHERE id = ?
        `).get(runId) as { parameters_json: string } | undefined;

        if (!run) {
            throw new Error(`Unknown workflow run '${runId}'`);
        }

        const milestones = db.prepare(`
            SELECT milestone_id, label, status
            FROM workflow_run_milestones
            WHERE workflow_run_id = ?
            ORDER BY created_at ASC, milestone_id ASC
        `).all(runId) as Array<{
            milestone_id: string;
            label: string;
            status: string;
        }>;

        const steps = db.prepare(`
            SELECT
                sr.id AS step_run_id,
                sr.node_id,
                sr.status,
                COALESCE(MAX(sr.expected_items), COUNT(se.id)) AS total_items,
                SUM(CASE WHEN se.status = 'completed' THEN 1 ELSE 0 END) AS completed_items,
                SUM(CASE WHEN se.status = 'failed' THEN 1 ELSE 0 END) AS failed_items
            FROM step_runs sr
            LEFT JOIN subject_executions se ON se.step_run_id = sr.id
            WHERE sr.workflow_run_id = ?
            GROUP BY sr.id, sr.node_id, sr.status
            ORDER BY sr.created_at ASC, sr.id ASC
        `).all(runId) as Array<{
            step_run_id: string;
            node_id: string;
            status: string;
            total_items: number;
            completed_items: number | null;
            failed_items: number | null;
        }>;

        return {
            summary: this.getRunSummary(runId),
            parameters: parseJsonObject(run.parameters_json),
            milestones: milestones.map((milestone) => ({
                milestoneId: milestone.milestone_id,
                label: milestone.label,
                status: milestone.status,
            })),
            steps: steps.map((step) => ({
                stepRunId: step.step_run_id,
                nodeId: step.node_id,
                status: step.status,
                totalItems: step.total_items,
                completedItems: step.completed_items ?? 0,
                failedItems: step.failed_items ?? 0,
            })),
        };
    }
}
