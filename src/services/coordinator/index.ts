import type { EventBus } from '../events/bus';
import type { DomainEvent } from '../events/types';
import type { DatabaseManager } from '../../data/db';
import { SystemState } from '../state';
import { getPausedDashboardModuleIds } from '../handlers/systemDashboardModules';
import { v4 as uuidv4 } from 'uuid';
import type {
    QueueStage,
    StageDispatch,
    StagePolicy,
    QueueTransitionRule,
    QueueTransitionAction,
    QueueTransitionCondition} from './workflows';
import {
    STAGE_POLICIES,
    QUEUE_TRANSITION_RULES,
    WORKFLOW_MODULES_SETTING,
    WORKFLOW_STAGE_OVERRIDES_SETTING,
    getQueueTransitionMediaId,
    resolveWorkflowDefinitionFromSettings
} from './workflows';

type QueueTaskRow = { media_id: string; pipeline_stage: string };
type DispatchPlan = {
    rowsByStage: Map<QueueStage, QueueTaskRow[]>;
};
type AiMetadataQueueMode = Extract<DomainEvent, { type: 'AiMetadataRequested' }>['queueMode'];
type AiMetadataV2WorkerMode = Extract<DomainEvent, { type: 'AiMetadataV2Requested' }>['workerMode'];
type AiMetadataV2Stage = Extract<DomainEvent, { type: 'AiMetadataV2Requested' }>['pipelineStage'];

export class Coordinator {
    private readonly eventBus: EventBus;
    private readonly db: DatabaseManager;

    private evaluateQueueTimeout: NodeJS.Timeout | null = null;
    private isEvaluating = false;
    private aiJobSightingTimes: Partial<Record<QueueStage, number>> = {};
    private stagePolicies: StagePolicy[] = STAGE_POLICIES.map(policy => ({ ...policy, dispatch: { ...policy.dispatch } }));
    private stagePolicyByName = new Map<QueueStage, StagePolicy>(
        this.stagePolicies.map(policy => [policy.stage, policy] as [QueueStage, StagePolicy])
    );
    private queueTransitionRules: QueueTransitionRule[] = QUEUE_TRANSITION_RULES.map(rule => ({
        ...rule,
        actions: rule.actions.map(action => ({ ...action }))
    }));
    private pausedDashboardModuleIds = new Set<string>();
    private lastStageOverrideRaw = '';
    private lastModuleSettingRaw = '';
    private lastPausedModulesRaw = '';

    constructor(eventBus: EventBus, db: DatabaseManager) {
        this.eventBus = eventBus;
        this.db = db;
        this.registerReactors();

        // Kick off evaluation on boot to resume interrupted tasks
        this.triggerEvaluateQueue();
    }

    // Public method to manually trigger evaluation when resumed
    public forceEvaluate() {
        this.triggerEvaluateQueue(true);
    }

    private registerReactors() {
        // Event->queue progression handled by declarative transition rules.
        // subscribeAll keeps transitions dynamic when workflow modules/settings change at runtime.
        this.eventBus.subscribeAll(this.onQueueTransitionEvent.bind(this));

        // Worker completion unblocks the queue
        this.eventBus.subscribe('JobCompleted', this.onJobCompleted.bind(this));
        this.eventBus.subscribe('JobFailed', this.onJobCompleted.bind(this));
    }

    private triggerEvaluateQueue(immediate: boolean = false) {
        if (this.evaluateQueueTimeout) {
            clearTimeout(this.evaluateQueueTimeout);
            this.evaluateQueueTimeout = null;
        }
        if (immediate) {
            this.evaluateQueue();
            return;
        }
        this.evaluateQueueTimeout = setTimeout(() => {
            this.evaluateQueueTimeout = null;
            this.evaluateQueue();
        }, 500); // Debounce to prevent hammering DB on burst events
    }

    // --- Enqueueing Workflows ---

    private onQueueTransitionEvent(event: DomainEvent) {
        const matchingRules = this.queueTransitionRules.filter(rule => rule.eventType === event.type);
        if (matchingRules.length === 0) {return;}

        let shouldEvaluate = false;
        this.db.getDb().transaction(() => {
            for (const rule of matchingRules) {
                const mediaId = getQueueTransitionMediaId(event, rule);
                if (!mediaId) {continue;}
                if (!this.matchesTransitionCondition(rule.condition || 'always', event)) {continue;}
                for (const action of rule.actions) {
                    this.applyQueueTransitionAction(mediaId, action);
                }
                if (rule.triggerEvaluate) {shouldEvaluate = true;}
            }
        })();

        if (shouldEvaluate) {
            this.triggerEvaluateQueue();
        }
    }

    private matchesTransitionCondition(condition: QueueTransitionCondition, event: DomainEvent): boolean {
        switch (condition) {
            case 'always':
                return true;
            case 'auto_preview_on':
                return this.db.getSetting('workflow_generate_previews_on_ingest') !== 'false';
            case 'auto_preview_off':
                return this.db.getSetting('workflow_generate_previews_on_ingest') === 'false';
            case 'face_count_positive':
                return event.type === 'FacesDetected'
                    && event.faceCount > 0
                    && event.source !== 'workflow_runtime';
            default:
                return false;
        }
    }

    private applyQueueTransitionAction(mediaId: string, action: QueueTransitionAction) {
        switch (action.kind) {
            case 'queue_upsert':
                if (!this.stagePolicyByName.has(action.stage)) {return;}
                if (typeof action.priority === 'number') {
                    this.db.getDb().prepare(
                        `INSERT OR IGNORE INTO task_queue (media_id, pipeline_stage, priority) VALUES (?, ?, ?)`
                    ).run(mediaId, action.stage, action.priority);
                } else {
                    this.db.getDb().prepare(
                        `INSERT OR IGNORE INTO task_queue (media_id, pipeline_stage) VALUES (?, ?)`
                    ).run(mediaId, action.stage);
                }
                return;
            case 'queue_complete':
                this.db.getDb().prepare(
                    `UPDATE task_queue
                     SET status = 'completed',
                         claimed_by = NULL,
                         claimed_at = NULL,
                         last_error = NULL
                     WHERE media_id = ? AND pipeline_stage = ?`
                ).run(mediaId, action.stage);
                return;
        }
    }

    private shouldImmediatelyEvaluateOnCompletion(event: DomainEvent): boolean {
        return event.type === 'JobCompleted' && event.pipelineStage === 'previews';
    }

    private finalizeOwnedBatchFailure(event: DomainEvent): boolean {
        if (event.type !== 'JobFailed' || !event.pipelineStage || !event.jobId) {
            return false;
        }

        const policy = this.stagePolicyByName.get(event.pipelineStage);
        if (policy?.batchOwnership !== 'job_id') {
            return false;
        }

        const failed = this.db.getDb().prepare(`
            UPDATE task_queue
            SET status = 'failed',
                last_error = ?,
                claimed_at = COALESCE(claimed_at, ?)
            WHERE pipeline_stage = ? AND status = 'processing' AND claimed_by = ?
        `).run(event.reason, new Date().toISOString(), event.pipelineStage, event.jobId);

        if (failed.changes > 0) {
            console.warn(`[Coordinator] Marked ${failed.changes} ${event.pipelineStage} task(s) as failed for ${event.jobId}.`);
        }

        return failed.changes > 0;
    }

    private finalizeLegacyAiMetadataTasks(event: DomainEvent) {
        if (event.type !== 'JobCompleted' && event.type !== 'JobFailed') {
            return;
        }

        const stage = event.pipelineStage;
        if (stage !== 'ai_metadata' && stage !== 'ai_metadata_3f' && stage !== 'ai_metadata_31p') {
            return;
        }

        if (event.type === 'JobCompleted') {
            const completed = this.db.getDb().prepare(
                `UPDATE task_queue SET status = 'completed' WHERE pipeline_stage = ? AND status = 'processing'`
            ).run(stage);
            if (completed.changes > 0) {
                console.log(`[Coordinator] Finalized ${completed.changes} ${stage} task(s).`);
            }
            return;
        }

        if (event.type === 'JobFailed') {
            const failed = this.db.getDb().prepare(
                `UPDATE task_queue SET status = 'failed' WHERE pipeline_stage = ? AND status = 'processing'`
            ).run(stage);
            if (failed.changes > 0) {
                console.warn(`[Coordinator] Marked ${failed.changes} ${stage} task(s) as failed.`);
            }
        }
    }

    private onJobCompleted(event: DomainEvent) {
        if (this.shouldImmediatelyEvaluateOnCompletion(event)) {
            this.triggerEvaluateQueue(true);
            return;
        }

        if (!this.finalizeOwnedBatchFailure(event)) {
            this.finalizeLegacyAiMetadataTasks(event);
        }

        this.triggerEvaluateQueue();
    }

    private refreshWorkflowDefinitionFromSettings() {
        const rawOverrides = this.db.getSetting(WORKFLOW_STAGE_OVERRIDES_SETTING) || '';
        const rawModules = this.db.getSetting(WORKFLOW_MODULES_SETTING) || '';
        const rawPausedModules = this.db.getSetting('dashboard_paused_modules_json') || '';
        if (
            rawOverrides === this.lastStageOverrideRaw &&
            rawModules === this.lastModuleSettingRaw &&
            rawPausedModules === this.lastPausedModulesRaw
        ) {return;}

        this.lastStageOverrideRaw = rawOverrides;
        this.lastModuleSettingRaw = rawModules;
        this.lastPausedModulesRaw = rawPausedModules;
        this.pausedDashboardModuleIds = getPausedDashboardModuleIds(this.db);

        const { policies, transitionRules, errors } = resolveWorkflowDefinitionFromSettings(rawOverrides, rawModules);
        this.stagePolicies = policies;
        this.queueTransitionRules = transitionRules;
        this.stagePolicyByName = new Map<QueueStage, StagePolicy>(
            this.stagePolicies.map(policy => [policy.stage, policy] as [QueueStage, StagePolicy])
        );

        if (errors.length > 0) {
            console.warn(`[Coordinator] Workflow settings warnings:\n- ${errors.join('\n- ')}`);
        } else {
            console.log(`[Coordinator] Loaded workflow configuration. Active policies: ${this.stagePolicies.length}, transitions: ${this.queueTransitionRules.length}`);
        }
    }

    // --- Smart Evaluation Loop ---

    private evaluateQueue() {
        if (this.isEvaluating || SystemState.isPaused) {return;}
        this.isEvaluating = true;
        try {
            this.refreshWorkflowDefinitionFromSettings();

            const highPriorityRows = this.getPendingHighPriorityRows(50);
            if (highPriorityRows.length > 0) {
                this.dispatchTasks(highPriorityRows);
                return;
            }

            for (const policy of this.stagePolicies) {
                if (this.evaluatePolicy(policy)) {
                    return;
                }
            }
        } finally {
            this.isEvaluating = false;
        }
    }

    private evaluatePolicy(policy: StagePolicy): boolean {
        if (this.isPolicyPaused(policy.stage)) {
            return false;
        }

        const activeCount = this.getActiveCount(policy);
        const pendingCount = this.getPendingCount(policy.stage);

        this.resetHeavyBatchSightingIfIdle(policy, pendingCount, activeCount);
        this.dispatchMediaBatchIfNeeded(policy, pendingCount);
        this.dispatchSignalIfNeeded(policy, pendingCount, activeCount);

        return this.shouldBlockOnPolicy(policy, activeCount);
    }

    private isPolicyPaused(stage: QueueStage): boolean {
        const pausedStageMap: Partial<Record<QueueStage, string>> = {
            previews: 'class-previews',
            detection: 'class-detection',
            clustering: 'class-clustering',
            sensitive_scan: 'class-sensitive',
            ai_metadata_3f: 'class-aimetadata-3f',
            ai_metadata_31p: 'class-aimetadata-31p',
            ai_metadata_v2_3f: 'class-aimetadata-3f',
            ai_metadata_v2_31p: 'class-aimetadata-31p',
        };

        const moduleId = pausedStageMap[stage];
        return moduleId ? this.pausedDashboardModuleIds.has(moduleId) : false;
    }

    private resetHeavyBatchSightingIfIdle(policy: StagePolicy, pendingCount: number, activeCount: number) {
        if (!policy.useHeavyBatching) {return;}
        if (pendingCount !== 0 || activeCount !== 0) {return;}
        delete this.aiJobSightingTimes[policy.stage];
    }

    private dispatchMediaBatchIfNeeded(policy: StagePolicy, pendingCount: number) {
        if (policy.dispatch.kind !== 'media_batch') {return;}
        if (pendingCount <= 0) {return;}
        if (!this.shouldDispatchMediaBatch(policy, pendingCount)) {return;}

        const batchRows = this.getPendingRows(policy.stage, policy.batchLimit || 100);
        this.dispatchTasks(batchRows);
    }

    private shouldDispatchMediaBatch(policy: StagePolicy, pendingCount: number): boolean {
        if (!policy.useHeavyBatching) {return true;}
        return this.shouldTriggerHeavyTask(policy.stage, pendingCount);
    }

    private dispatchSignalIfNeeded(policy: StagePolicy, pendingCount: number, activeCount: number) {
        if (policy.dispatch.kind !== 'signal') {return;}
        if (pendingCount <= 0 || activeCount !== 0) {return;}

        if (policy.dispatch.completePendingRowsBeforeEmit) {
            this.markPendingRowsCompleted(policy.stage);
        }
        this.emitDispatchEvent(policy.dispatch);
    }

    private shouldBlockOnPolicy(policy: StagePolicy, activeCount: number): boolean {
        return policy.gate === 'strict' && activeCount > 0;
    }

    private shouldTriggerHeavyTask(stage: QueueStage, count: number): boolean {
        const BATCH_THRESHOLD = 3;  // Spin up model when >=3 items queued
        const MAX_WAIT_MS = 2000;   // Or if 2s have passed since first sighting

        if (count >= BATCH_THRESHOLD) {return true;}

        const now = Date.now();
        if (!this.aiJobSightingTimes[stage]) {
            this.aiJobSightingTimes[stage] = now;
            return false;
        }

        if (now - (this.aiJobSightingTimes[stage] || 0) >= MAX_WAIT_MS) {
            return true;
        }

        return false;
    }

    private getPendingHighPriorityRows(limit: number): QueueTaskRow[] {
        return this.db.getDb().prepare(`
            SELECT media_id, pipeline_stage
            FROM task_queue
            WHERE status = 'pending' AND priority > 0
            ORDER BY priority DESC, created_at ASC
            LIMIT ?
        `).all(limit) as QueueTaskRow[];
    }

    private getPendingRows(stage: QueueStage, limit: number): QueueTaskRow[] {
        return this.db.getDb().prepare(`
            SELECT media_id, pipeline_stage
            FROM task_queue
            WHERE status = 'pending' AND pipeline_stage = ?
            ORDER BY created_at ASC
            LIMIT ?
        `).all(stage, limit) as QueueTaskRow[];
    }

    private getPendingCount(stage: QueueStage): number {
        const row = this.db.getDb().prepare(`
            SELECT count(*) as count
            FROM task_queue
            WHERE status = 'pending' AND pipeline_stage = ?
        `).get(stage) as { count: number };
        return row.count;
    }

    private getQueueActiveCount(stage: QueueStage): number {
        const row = this.db.getDb().prepare(`
            SELECT count(*) as count
            FROM task_queue
            WHERE status IN ('pending', 'processing') AND pipeline_stage = ?
        `).get(stage) as { count: number };
        return row.count;
    }

    private getRunningJobCount(jobLike: string): number {
        const row = this.db.getDb().prepare(`
            SELECT count(*) as count
            FROM jobs
            WHERE id LIKE ? AND status = 'running'
        `).get(jobLike) as { count: number };
        return row.count;
    }

    private getActiveCount(policy: StagePolicy): number {
        if (policy.activeCounter === 'task_queue') {
            return this.getQueueActiveCount(policy.stage);
        }
        if (!policy.jobsRunningLike) {return 0;}
        return this.getRunningJobCount(policy.jobsRunningLike);
    }

    private markPendingRowsCompleted(stage: QueueStage) {
        this.db.getDb().prepare(`
            UPDATE task_queue
            SET status = 'completed',
                claimed_by = NULL,
                claimed_at = NULL,
                last_error = NULL
            WHERE pipeline_stage = ? AND status = 'pending'
        `).run(stage);
    }

    private emitAiMetadataRequested(mediaIds: string[], workerMode?: string, jobId?: string) {
        this.eventBus.emit({ type: 'AiMetadataRequested', mediaIds, jobId, queueMode: workerMode as AiMetadataQueueMode });
    }

    private resolveAiMetadataV2WorkerMode(workerMode?: string): AiMetadataV2WorkerMode { return workerMode === 'pro_pending' ? 'pro_pending' : 'fresh'; }

    private resolveAiMetadataV2Stage(pipelineStage?: QueueStage): AiMetadataV2Stage { return pipelineStage === 'ai_metadata_v2_31p' ? 'ai_metadata_v2_31p' : 'ai_metadata_v2_3f'; }

    private emitAiMetadataV2Requested(mediaIds: string[], workerMode?: string, jobId?: string, pipelineStage?: QueueStage) {
        this.eventBus.emit({ type: 'AiMetadataV2Requested', mediaIds, jobId: jobId ?? '', workerMode: this.resolveAiMetadataV2WorkerMode(workerMode), pipelineStage: this.resolveAiMetadataV2Stage(pipelineStage) });
    }

    private emitDispatchEvent(dispatch: StageDispatch, mediaIds: string[] = [], jobId?: string, pipelineStage?: QueueStage) {
        switch (dispatch.event) {
            case 'PreviewRequested':
                this.eventBus.emit({ type: 'PreviewRequested', mediaIds, reason: dispatch.reason });
                return;
            case 'FaceDetectionRequested':
                this.eventBus.emit({ type: 'FaceDetectionRequested', mediaIds });
                return;
            case 'SensitiveScanRequested':
                this.eventBus.emit({ type: 'SensitiveScanRequested', mediaIds });
                return;
            case 'AiMetadataRequested':
                this.emitAiMetadataRequested(mediaIds, dispatch.workerMode, jobId);
                return;
            case 'AiMetadataV2Requested':
                this.emitAiMetadataV2Requested(mediaIds, dispatch.workerMode, jobId, pipelineStage);
                return;
            case 'FaceClusteringRequested':
                this.eventBus.emit({ type: 'FaceClusteringRequested' });
                return;
        }
    }

        private buildDispatchPlan(rows: QueueTaskRow[]): DispatchPlan {
        const plan: DispatchPlan = {
            rowsByStage: new Map<QueueStage, QueueTaskRow[]>(),
        };

        for (const row of rows) {
            this.addRowToDispatchPlan(plan, row);
        }

        return plan;
    }

    private addRowToDispatchPlan(plan: DispatchPlan, row: QueueTaskRow) {
        const stage = row.pipeline_stage as QueueStage;
        const rows = plan.rowsByStage.get(stage) ?? [];
        rows.push(row);
        plan.rowsByStage.set(stage, rows);
    }

    private markRowsProcessing(rows: QueueTaskRow[], claimedBy?: string) {
        if (rows.length === 0) {return;}

        const stmt = claimedBy
            ? this.db.getDb().prepare(`
                UPDATE task_queue
                SET status = 'processing',
                    claimed_by = ?,
                    claimed_at = ?,
                    last_error = NULL
                WHERE media_id = ? AND pipeline_stage = ?
            `)
            : this.db.getDb().prepare(`
                UPDATE task_queue
                SET status = 'processing',
                    claimed_by = NULL,
                    claimed_at = NULL,
                    last_error = NULL
                WHERE media_id = ? AND pipeline_stage = ?
            `);

        const claimedAt = new Date().toISOString();
        this.db.getDb().transaction(() => {
            for (const row of rows) {
                if (claimedBy) {
                    stmt.run(claimedBy, claimedAt, row.media_id, row.pipeline_stage);
                } else {
                    stmt.run(row.media_id, row.pipeline_stage);
                }
            }
        })();
    }

    private createOwnedJobId(policy: StagePolicy): string | undefined {
        if (policy.batchOwnership !== 'job_id' || !policy.jobIdPrefix) {
            return undefined;
        }
        return `${policy.jobIdPrefix}-${uuidv4()}`;
    }

    private dispatchByStage(rowsByStage: Map<QueueStage, QueueTaskRow[]>) {
        for (const [stage, rows] of rowsByStage.entries()) {
            const policy = this.stagePolicyByName.get(stage);
            if (!policy) {
                console.warn(`[Coordinator] No policy for stage '${stage}', skipping dispatch.`);
                continue;
            }

            const mediaIds = rows.map((row) => row.media_id);

            if (policy.dispatch.kind === 'signal') {
                if (policy.dispatch.completePendingRowsBeforeEmit) {
                    this.markPendingRowsCompleted(policy.stage);
                }
                this.emitDispatchEvent(policy.dispatch);
                continue;
            }

            const jobId = this.createOwnedJobId(policy);
            this.markRowsProcessing(rows, jobId);
            this.emitDispatchEvent(policy.dispatch, mediaIds, jobId, stage);
        }
    }

    private dispatchTasks(rows: QueueTaskRow[]) {
        if (rows.length === 0) {return;}

        const plan = this.buildDispatchPlan(rows);
        this.dispatchByStage(plan.rowsByStage);
    }
}





