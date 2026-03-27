import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runScanJob } from '../jobs/scan';
import { applyManualAssertionToResponseBundle, createPhotoMetadataManualAssertionsService } from '../photoMetadata/manualAssertions';
import { buildPhotoMetadataBundle } from '../photoMetadata/bundle';
import { createPhotoMetadataRepository } from '../photoMetadata/repository';
import type { CommandContext, CommandHandlerMap } from './types';
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

function abortByClassOrId(ctx: CommandContext, jobId: string) {
    if (jobId && ctx.activeJobs.has(jobId)) {
        ctx.activeJobs.get(jobId)?.abort();
        ctx.activeJobs.delete(jobId);
        ctx.respond(ctx.id, 'ok', { message: 'Stop signal sent' }, null, ctx.originWs);
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
    };

    const tasksToClear = taskMap[task] || [task];
    const placeholders = tasksToClear.map(() => '?').join(',');
    const stmt = ctx.dbManager.getDb().prepare(`DELETE FROM processing_issues WHERE task IN (${placeholders})`);
    const result = stmt.run(...tasksToClear);
    ctx.respond(ctx.id, 'ok', { message: `Cleared ${result.changes} errors for ${task}` }, null, ctx.originWs);
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

function resetGroupingData(ctx: CommandContext) {
    const db = ctx.dbManager.getDb();
    db.transaction(() => {
        db.prepare('DELETE FROM asset_group_members').run();
        db.prepare('DELETE FROM asset_groups').run();
        db.prepare("DELETE FROM asset_similarity_edges WHERE kind IN ('visual', 'time', 'metadata', 'hybrid')").run();
    })();
    ctx.respond(ctx.id, 'ok', { message: 'Grouping data reset.' }, null, ctx.originWs);
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
            ctx.respond(ctx.id, 'ok', { message: 'Setting saved' }, null, ctx.originWs);
        } catch (error) {
            respondError(ctx, error);
        }
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

    reset_library: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as { mode?: ResetMode };
            const mode: ResetMode = payload.mode === 'factory' ? 'factory' : 'soft';
            resetLibrary(ctx, mode);
        } catch (error) {
            respondError(ctx, error);
        }
    },

    reset_grouping_data: (ctx) => {
        try {
            resetGroupingData(ctx);
        } catch (error) {
            respondError(ctx, error);
        }
    },

    reset_faces: (ctx) => {
        try {
            ctx.dbManager.getDb().prepare("DELETE FROM derived_results WHERE task = 'face_detection'").run();
            ctx.respond(ctx.id, 'ok', { message: 'Face detection results cleared' }, null, ctx.originWs);
        } catch (error) {
            respondError(ctx, error);
        }
    },

    record_photo_metadata_assertion: (ctx) => {
        try {
            const payload = ctx.payload as {
                assetId?: string;
                fieldPath?: string;
                value?: unknown;
                userId?: string;
                note?: string | null;
                includeEvidence?: boolean;
            } | undefined;

            if (!payload?.assetId) {
                throw new Error('assetId is required');
            }
            if (!payload.fieldPath) {
                throw new Error('fieldPath is required');
            }
            if (!payload.userId) {
                throw new Error('userId is required');
            }

            const repository = createPhotoMetadataRepository({ dbManager: ctx.dbManager });
            const manualAssertionsService = createPhotoMetadataManualAssertionsService({ dbManager: ctx.dbManager });
            const manualAssertion = manualAssertionsService.recordManualAssertion({
                assetId: payload.assetId,
                fieldPath: payload.fieldPath,
                value: payload.value,
                userId: payload.userId,
                note: payload.note ?? null,
            });

            const photoMetadata = applyManualAssertionToResponseBundle(buildPhotoMetadataBundle({
                repository,
                manualAssertionsService,
                assetId: payload.assetId,
                includeEvidence: payload.includeEvidence === true,
            }), manualAssertion);

            ctx.respond(ctx.id, 'ok', {
                manualAssertion,
                photo_metadata: photoMetadata,
            }, null, ctx.originWs);
        } catch (error) {
            respondError(ctx, error);
        }
    },
};
