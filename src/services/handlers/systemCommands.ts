import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { SystemState } from '../state';
import { runScanJob } from '../jobs/scan';
import { runFaceDetectionJob } from '../jobs/detect_faces';
import { runFaceClusteringJob } from '../jobs/cluster_faces';
import { runSensitiveScanJob } from '../jobs/scan_sensitive';
import { runDuplicateGroupingJob } from '../jobs/build_duplicate_groups';
import { runComputeHashesJob } from '../jobs/compute_hashes';
import { runVariantGroupingJob } from '../jobs/build_variant_groups';
import type { DomainEvent } from '../events/types';
import type { CommandContext, CommandHandlerMap } from './types';
import {
    getDashboardModuleById,
    getPausedDashboardModuleIds,
    setPausedDashboardModuleIds,
} from './systemDashboardModules';
import { getDevRuntimeImpact } from './systemDevRuntimeImpact';

function respondError(ctx: CommandContext, error: unknown) {
    ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
}

function launchTrackedJob(ctx: CommandContext, work: (controller: AbortController) => Promise<void>) {
    const controller = new AbortController();
    ctx.activeJobs.set(ctx.id, controller);
    void work(controller).finally(() => {
        ctx.activeJobs.delete(ctx.id);
    });
}

type QueueCleanupTarget = {
    jobPrefixes: string[];
    pipelineStages: string[];
    issueTasks: string[];
};

function isAiMetadataV2CleanupJobId(jobId: string): boolean {
    return jobId === 'class-aimetadata-3f'
        || jobId === 'class-aimetadata-31p'
        || jobId.startsWith('ai_meta_v2_3f-')
        || jobId.startsWith('ai_meta_v2_31p-');
}

function clearQueuedWorkflowRuntimeData(ctx: CommandContext, target: QueueCleanupTarget) {
    const db = ctx.dbManager.getDb();
    const stagePlaceholders = target.pipelineStages.map(() => '?').join(',');
    const prefixPatterns = target.jobPrefixes.map((prefix) => `${prefix}%`);
    const issueTaskPlaceholders = target.issueTasks.map(() => '?').join(',');

    const removedQueueRows = db.prepare(`
        DELETE FROM task_queue
        WHERE pipeline_stage IN (${stagePlaceholders})
    `).run(...target.pipelineStages).changes;

    const removedJobs = prefixPatterns.length > 0
        ? db.prepare(`
            DELETE FROM jobs
            WHERE ${prefixPatterns.map(() => 'id LIKE ?').join(' OR ')}
        `).run(...prefixPatterns).changes
        : 0;

    const removedIssues = db.prepare(`
        DELETE FROM processing_issues
        WHERE task IN (${issueTaskPlaceholders})
           OR ${prefixPatterns.map(() => 'job_id LIKE ?').join(' OR ')}
    `).run(...target.issueTasks, ...prefixPatterns).changes;

    const removedEvents = db.prepare(`
        DELETE FROM events
        WHERE type IN ('AiMetadataV2Requested', 'AiMetadataV2FreshCompleted', 'AiMetadataV2ProCompleted', 'AiMetadataV2UpgradeQueued', 'QuotaWarning', 'ProAnalysisPending')
           OR payload LIKE '%"pipelineStage":"ai_metadata_v2_3f"%'
           OR payload LIKE '%"pipelineStage":"ai_metadata_v2_31p"%'
           OR ${prefixPatterns.map(() => 'payload LIKE ?').join(' OR ')}
    `).run(...prefixPatterns.map((prefix) => `%${prefix.replace('%', '')}%`)).changes;

    return {
        removedQueueRows,
        removedJobs,
        removedIssues,
        removedEvents,
    };
}

function abortByClassOrId(ctx: CommandContext, jobId: string) {
    if (jobId?.startsWith('class-')) {
        const classMap: Record<string, string[]> = {
            'class-onboarding': ['scan-'],
            'class-previews': ['previews-'],
            'class-detection': ['detect-'],
            'class-clustering': ['cluster-'],
            'class-aimetadata-3f': ['ai_meta_v2_3f-', 'ai_meta_3f-'],
            'class-aimetadata-31p': ['ai_meta_v2_31p-', 'ai_meta_31p-'],
            'class-aimetadata': ['ai_meta_v2_', 'ai_meta_'],
            'class-sensitive': ['sensitive-'],
        };
        const prefixes = classMap[jobId];
        if (!prefixes) {return false;}

        let count = 0;
        for (const [id, controller] of ctx.activeJobs.entries()) {
            if (!prefixes.some((prefix) => id.startsWith(prefix))) {continue;}
            controller.abort();
            ctx.activeJobs.delete(id);
            count += 1;
        }

        if (count === 0 && isAiMetadataV2CleanupJobId(jobId)) {
            const removed = clearQueuedWorkflowRuntimeData(ctx, {
                jobPrefixes: ['ai_meta_v2_3f-', 'ai_meta_v2_31p-'],
                pipelineStages: ['ai_metadata_v2_3f', 'ai_metadata_v2_31p'],
                issueTasks: ['ai_metadata'],
            });
            ctx.respond(
                ctx.id,
                'ok',
                { message: `Removed queued AI metadata tasks (${removed.removedQueueRows} queue rows, ${removed.removedJobs} jobs, ${removed.removedEvents} events).` },
                null,
                ctx.originWs
            );
            return true;
        }

        ctx.respond(ctx.id, 'ok', { message: `Aborted ${count} sub-jobs for ${jobId}` }, null, ctx.originWs);
        return true;
    }

    if (jobId && ctx.activeJobs.has(jobId)) {
        ctx.activeJobs.get(jobId)?.abort();
        ctx.activeJobs.delete(jobId);
        ctx.respond(ctx.id, 'ok', { message: 'Stop signal sent' }, null, ctx.originWs);
    } else if (isAiMetadataV2CleanupJobId(jobId)) {
        const removed = clearQueuedWorkflowRuntimeData(ctx, {
            jobPrefixes: ['ai_meta_v2_3f-', 'ai_meta_v2_31p-'],
            pipelineStages: ['ai_metadata_v2_3f', 'ai_metadata_v2_31p'],
            issueTasks: ['ai_metadata'],
        });
        ctx.respond(
            ctx.id,
            'ok',
            { message: `Removed queued AI metadata tasks (${removed.removedQueueRows} queue rows, ${removed.removedJobs} jobs, ${removed.removedEvents} events).` },
            null,
            ctx.originWs
        );
    } else {
        ctx.respond(ctx.id, 'error', null, `Job not found or not active: ${jobId}`, ctx.originWs);
    }
    return true;
}

function clearJobErrors(ctx: CommandContext, task: string) {
    const taskMap: Record<string, string[]> = {
        onboarding: ['scan', 'ingest'],
        previews: ['preview'],
        analysis: ['detection', 'clustering', 'ai_metadata'],
        safety: ['sensitive_scan'],
        ai_metadata: ['ai_metadata'],
        ai_metadata_3f: ['ai_metadata'],
        ai_metadata_31p: ['ai_metadata'],
        ai_metadata_v2_3f: ['ai_metadata'],
        ai_metadata_v2_31p: ['ai_metadata'],
        'class-onboarding': ['scan', 'ingest'],
        'class-previews': ['preview'],
        'class-detection': ['detection'],
        'class-clustering': ['clustering'],
        'class-aimetadata-3f': ['ai_metadata'],
        'class-aimetadata-31p': ['ai_metadata'],
        'class-aimetadata': ['ai_metadata'],
        'class-sensitive': ['sensitive_scan'],
    };

    const tasksToClear = taskMap[task] || [task];
    const placeholders = tasksToClear.map(() => '?').join(',');
    const stmt = ctx.dbManager.getDb().prepare(`DELETE FROM processing_issues WHERE task IN (${placeholders})`);
    const result = stmt.run(...tasksToClear);
    ctx.respond(ctx.id, 'ok', { message: `Cleared ${result.changes} errors for ${task}` }, null, ctx.originWs);
}

function setModulePausedState(ctx: CommandContext, moduleId: string, paused: boolean) {
    const module = getDashboardModuleById(moduleId);
    if (!module) {
        throw new Error(`Unknown dashboard module: ${moduleId}`);
    }
    if (!module.canPause) {
        throw new Error(`Module cannot be paused: ${moduleId}`);
    }

    const pausedIds = getPausedDashboardModuleIds(ctx.dbManager);
    if (paused) {
        pausedIds.add(module.id);
    } else {
        pausedIds.delete(module.id);
    }

    setPausedDashboardModuleIds(ctx.dbManager, pausedIds);
    if (!paused) {
        ctx.coordinator.forceEvaluate();
    }

    ctx.respond(
        ctx.id,
        'ok',
        { moduleId: module.id, paused, message: paused ? `${module.label} paused` : `${module.label} resumed` },
        null,
        ctx.originWs
    );
}

type ResetMode = 'soft' | 'factory';

function vacuumDatabase(ctx: CommandContext) {
    const db = ctx.dbManager.getDb();
    try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.exec('VACUUM');
    } catch {
        // ignore vacuum failures during reset
    }
}

function resetLibrary(ctx: CommandContext, mode: ResetMode) {
    for (const [jobId, controller] of ctx.activeJobs.entries()) {
        controller.abort();
        ctx.activeJobs.delete(jobId);
    }

    const previewsDir = join(ctx.LIB_DIR, 'previews');
    if (existsSync(previewsDir)) {
        try {
            rmSync(previewsDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }

    if (mode === 'factory') {
        ctx.dbManager.resetToFactorySchema();
    } else {
        ctx.dbManager.resetPreservingManualData();
    }

    vacuumDatabase(ctx);
    const message = mode === 'factory'
        ? 'Factory reset complete. Database recreated from schema.'
        : 'Library reset complete. Manual data, settings, and folder history restored.';
    ctx.respond(ctx.id, 'ok', { message, mode }, null, ctx.originWs);
}

export const systemCommandHandlers: CommandHandlerMap = {
    ping: (ctx) => {
        ctx.respond(ctx.id, 'ok', { message: 'pong', timestamp: Date.now() }, null, ctx.originWs);
    },
    get_dev_runtime_impact: (ctx) => {
        try {
            const impact = getDevRuntimeImpact();
            ctx.respond(ctx.id, 'ok', impact, null, ctx.originWs);
        } catch (error) {
            respondError(ctx, error);
        }
    },

    scan_folder: (ctx) => {
        const payload = ctx.payload as { path?: string };
        const scanPath = typeof payload?.path === 'string' ? payload.path.replace(/^["'](.+)["']$/, '$1').trim() : '';

        ctx.respond(ctx.id, 'ok', { message: 'Scan started', jobId: ctx.id }, null, ctx.originWs);

        try {
            ctx.dbManager.getDb().prepare('INSERT OR REPLACE INTO folder_history (path, last_scanned_at) VALUES (?, ?)').run(scanPath, new Date().toISOString());
        } catch (error) {
            console.error('Failed to update folder history:', error);
        }

        ctx.eventBus.emit({ type: 'FolderScanRequested', folderId: scanPath, scanSessionId: ctx.id });
        launchTrackedJob(ctx, async (controller) => {
            await runScanJob(ctx.id, scanPath, ctx.dbManager, ctx.eventBus, controller.signal);
        });
    },

    generate_previews: (ctx) => {
        ctx.respond(ctx.id, 'ok', { message: 'Preview generation started' }, null, ctx.originWs);
        const mediaIds = ctx.dbManager.getDb().prepare('SELECT id FROM assets').all().map((row: unknown) => (row as { id: string }).id);
        ctx.eventBus.emit({ type: 'PreviewRequested', mediaIds, reason: 'rebuild' });
    },

    detect_faces: (ctx) => {
        ctx.respond(ctx.id, 'ok', { message: 'Face detection started' }, null, ctx.originWs);
        launchTrackedJob(ctx, async (controller) => {
            await runFaceDetectionJob('auto', ctx.dbManager, ctx.eventBus, controller.signal, ctx.id);
        });
    },

    cluster_faces: (ctx) => {
        ctx.respond(ctx.id, 'ok', { message: 'Clustering started' }, null, ctx.originWs);
        void runFaceClusteringJob(ctx.id, ctx.dbManager, ctx.eventBus);
    },

    build_groups: (ctx) => {
        ctx.respond(ctx.id, 'ok', { message: 'Grouping pipelines started', jobId: ctx.id }, null, ctx.originWs);
        launchTrackedJob(ctx, async (controller) => {
            ctx.eventBus.emit({ type: 'JobStarted', jobId: ctx.id, pipelineStage: 'similarity_cluster' } as unknown as DomainEvent);
            await runDuplicateGroupingJob(ctx.id, ctx.dbManager, ctx.eventBus, controller.signal);
            if (controller.signal.aborted) {return;}
            await runComputeHashesJob(ctx.id, ctx.dbManager, ctx.eventBus, controller.signal);
            if (controller.signal.aborted) {return;}
            await runVariantGroupingJob(ctx.id, ctx.dbManager, ctx.eventBus, controller.signal);
            ctx.eventBus.emit({ type: 'JobCompleted', jobId: ctx.id, pipelineStage: 'similarity_cluster' } as unknown as DomainEvent);
        });
    },

    build_bursts: (ctx) => {
        ctx.respond(ctx.id, 'ok', { message: 'Burst grouping started' }, null, ctx.originWs);
        ctx.eventBus.emit({ type: 'BurstGroupingRequested', jobId: ctx.id } as unknown as DomainEvent);
    },

    prioritize_asset_processing: (ctx) => {
        try {
            const { mediaId } = ctx.payload as { mediaId: string };
            ctx.dbManager.getDb().prepare("UPDATE task_queue SET priority = 100 WHERE media_id = ? AND status = 'pending'").run(mediaId);
            ctx.respond(ctx.id, 'ok', { message: 'Priority boosted' }, null, ctx.originWs);
        } catch (error) {
            console.error('Failed to boost priority', error);
            respondError(ctx, error);
        }
    },

    pause_jobs: (ctx) => {
        SystemState.isPaused = true;
        ctx.respond(ctx.id, 'ok', { message: 'System paused' }, null, ctx.originWs);
        ctx.eventBus.emit({ type: 'SystemPausedStateChanged', isPaused: true } as unknown as DomainEvent);
    },

    resume_jobs: (ctx) => {
        SystemState.isPaused = false;
        ctx.respond(ctx.id, 'ok', { message: 'System resumed' }, null, ctx.originWs);
        ctx.eventBus.emit({ type: 'SystemPausedStateChanged', isPaused: false } as unknown as DomainEvent);
        ctx.coordinator.forceEvaluate();
    },

    get_pause_state: (ctx) => {
        ctx.respond(ctx.id, 'ok', { isPaused: SystemState.isPaused }, null, ctx.originWs);
    },

    get_setting: (ctx) => {
        try {
            const { key } = ctx.payload as { key: string };
            const value = ctx.dbManager.getSetting(key);
            ctx.respond(ctx.id, 'ok', { value }, null, ctx.originWs);
        } catch (error) {
            respondError(ctx, error);
        }
    },

    set_setting: (ctx) => {
        try {
            const { key, value } = ctx.payload as { key: string; value: string };
            ctx.dbManager.setSetting(key, value);
            if (key === 'workflow_stage_overrides_json' || key === 'workflow_modules_json') {
                ctx.coordinator.forceEvaluate();
            }
            ctx.respond(ctx.id, 'ok', { message: 'Setting saved' }, null, ctx.originWs);
        } catch (error) {
            respondError(ctx, error);
        }
    },

    extract_ai_metadata: (ctx) => {
        const { mediaId } = (ctx.payload || {}) as { mediaId?: string };
        const db = ctx.dbManager.getDb();
        if (mediaId) {
            db.prepare(`
                INSERT INTO task_queue (media_id, pipeline_stage, priority)
                VALUES (?, 'ai_metadata_v2_3f', 100)
                ON CONFLICT(media_id, pipeline_stage) DO UPDATE SET status = 'pending', priority = 100
            `).run(mediaId);
        } else {
            db.prepare(`
                INSERT INTO task_queue (media_id, pipeline_stage, priority)
                SELECT id, 'ai_metadata_v2_3f', -20
                FROM assets
                ON CONFLICT(media_id, pipeline_stage) DO UPDATE SET status = 'pending'
            `).run();
        }

        ctx.coordinator.forceEvaluate();
        ctx.respond(ctx.id, 'ok', { message: 'AI Metadata extraction queued', stage: 'ai_metadata_v2_3f' }, null, ctx.originWs);
    },

    get_stats: (ctx) => {
        try {
            const db = ctx.dbManager.getDb();
            const count = db.prepare('SELECT COUNT(*) as count FROM assets').get() as { count: number };
            const history = db.prepare('SELECT path, last_scanned_at FROM folder_history ORDER BY last_scanned_at DESC LIMIT 5').all();
            ctx.respond(ctx.id, 'ok', { count: count?.count || 0, folderHistory: history }, null, ctx.originWs);
        } catch (error) {
            respondError(ctx, error);
        }
    },

    stop_job: (ctx) => {
        const { jobId } = ctx.payload as { jobId: string };
        abortByClassOrId(ctx, jobId);
    },

    abort_job: (ctx) => {
        const { jobId } = ctx.payload as { jobId: string };
        abortByClassOrId(ctx, jobId);
    },

    clear_job_errors: (ctx) => {
        try {
            const { task } = ctx.payload as { task: string };
            clearJobErrors(ctx, task);
        } catch (error) {
            respondError(ctx, error);
        }
    },

    set_module_paused: (ctx) => {
        try {
            const { moduleId, paused } = ctx.payload as { moduleId: string; paused: boolean };
            setModulePausedState(ctx, moduleId, Boolean(paused));
        } catch (error) {
            respondError(ctx, error);
        }
    },

    reset_library: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as { mode?: ResetMode };
            const mode: ResetMode = payload.mode === 'factory' ? 'factory' : 'soft';
            resetLibrary(ctx, mode);
        } catch (error) {
            respondError(ctx, error);
        }
    },

    scan_sensitive: (ctx) => {
        ctx.respond(ctx.id, 'ok', { message: 'Sensitive content scan started' }, null, ctx.originWs);
        void runSensitiveScanJob('auto', ctx.dbManager, ctx.eventBus).catch(console.error);
    },

    scan_sensitive_force: (ctx) => {
        ctx.respond(ctx.id, 'ok', { message: 'Force re-scan of all assets started' }, null, ctx.originWs);
        void runSensitiveScanJob('auto', ctx.dbManager, ctx.eventBus, true).catch(console.error);
    },

    reset_faces: (ctx) => {
        try {
            ctx.dbManager.getDb().prepare("DELETE FROM derived_results WHERE task = 'face_detection'").run();
            ctx.respond(ctx.id, 'ok', { message: 'Face detection results cleared' }, null, ctx.originWs);
        } catch (error) {
            respondError(ctx, error);
        }
    },
};
