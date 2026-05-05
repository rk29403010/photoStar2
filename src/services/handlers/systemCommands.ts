import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runScanJob } from '../jobs/scan';
import { applyManualAssertionToResponseBundle, createPhotoMetadataManualAssertionsService } from '../photoMetadata/manualAssertions';
import { buildPhotoMetadataBundle } from '../photoMetadata/bundle';
import { createPhotoMetadataRepository } from '../photoMetadata/repository';
import type { CommandContext, CommandHandlerMap } from './types';
import { getDevRuntimeImpact } from './systemDevRuntimeImpact';
import { buildLibraryTimelineStats } from './libraryTimelineStats';

function respondError(ctx: CommandContext, error: unknown) {
    ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
}

function toResetUserFacingError(error: unknown, mode: ResetMode): unknown {
    if (mode !== 'factory' || !(error instanceof Error)) {
        return error;
    }

    const message = error.message.toLowerCase();
    const isDbBusyError = message.includes('ebusy') || message.includes('resource busy') || message.includes('library.db');
    if (!isDbBusyError) {
        return error;
    }

    return new Error('Factory reset failed because another PhotoStar backend process is using library.db. Stop other running backend/dev sessions, then retry Factory Reset.');
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

async function resetLibrary(ctx: CommandContext, mode: ResetMode) {
    if (mode === 'factory') {
        ctx.workflowRuntime?.orchestrator.invalidateRunningRuns('Factory reset requested');
        await ctx.workflowRuntime?.orchestrator.waitForIdle(5000);
    }

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

function resetFaceData(ctx: CommandContext, mediaId?: string) {
    const db = ctx.dbManager.getDb();
    db.transaction(() => {
        if (!mediaId) {
            db.prepare("DELETE FROM derived_results WHERE task IN ('face_detection', 'face_recognition')").run();
            db.prepare('DELETE FROM face_assignments').run();
            db.prepare('DELETE FROM people').run();
            db.prepare('DELETE FROM manual_face_names').run();
            db.prepare('DELETE FROM manual_face_isolations').run();
            return;
        }

        const asset = db.prepare('SELECT original_path FROM assets WHERE id = ?').get(mediaId) as { original_path?: string } | undefined;
        db.prepare("DELETE FROM derived_results WHERE asset_id = ? AND task IN ('face_detection', 'face_recognition')").run(mediaId);
        db.prepare('DELETE FROM face_assignments WHERE asset_id = ?').run(mediaId);

        if (asset?.original_path) {
            db.prepare('DELETE FROM manual_face_names WHERE original_path = ?').run(asset.original_path);
            db.prepare('DELETE FROM manual_face_isolations WHERE original_path = ?').run(asset.original_path);
        }

        db.prepare(`
            DELETE FROM people
            WHERE id NOT IN (
                SELECT DISTINCT person_id
                FROM face_assignments
                WHERE person_id IS NOT NULL
            )
        `).run();
    })();
    ctx.respond(ctx.id, 'ok', { message: mediaId ? 'Face data reset for asset.' : 'Face data reset.' }, null, ctx.originWs);
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
            const timelineStats = buildLibraryTimelineStats(db);
            ctx.respond(ctx.id, 'ok', { count: count?.count || 0, folderHistory: history, ...timelineStats }, null, ctx.originWs);
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

    reset_library: async (ctx) => {
        const payload = (ctx.payload || {}) as { mode?: ResetMode };
        const mode: ResetMode = payload.mode === 'factory' ? 'factory' : 'soft';
        try {
            await resetLibrary(ctx, mode);
        } catch (error) {
            respondError(ctx, toResetUserFacingError(error, mode));
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
            const payload = ctx.payload as { mediaId?: string } | undefined;
            resetFaceData(ctx, payload?.mediaId);
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
