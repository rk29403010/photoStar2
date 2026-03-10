import type { CommandHandlerMap } from './types';
import { getRecentEventsSnapshot } from './systemEventLogCommands';
import { MODEL_PRO } from '../jobs/ai_metadata_shared';
import { getDataStats } from './systemJobsDataStats';
import {
    getDashboardModuleErrorCounts,
    getJobErrorsSnapshot,
    getPausedDashboardModuleIds,
} from './systemDashboardModules';

type CountRow = { count: number };
type KindStatsRow = { kind: string; active_count: number; avg_sec: number | null };
type ActiveJobRow = { current_item_path: string; throughput_ips: number; kind: string };
type QueueRow = {
    pipeline_stage: string;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
    oldest_pending_at: string | null;
    oldest_processing_at: string | null;
};
type ProcessingRow = { pipeline_stage: string; media_id: string };
type DbLike = {
    prepare: (sql: string) => {
        get: (...args: unknown[]) => unknown;
        all: (...args: unknown[]) => unknown[];
    };
};

type SystemJobBuildData = {
    totalExpected: number;
    totalAssets: number;
    doneScored: number;
    donePreviews: number;
    doneDetection: number;
    doneRecognition: number;
    doneAiMetadata: number;
    doneAiMetadata31P: number;
    moduleErrorCounts: Record<string, number>;
    pausedModuleIds: Set<string>;
    classStats: ReturnType<typeof getClassStats>;
};

function asDbLike(db: unknown): DbLike {
    return db as DbLike;
}

function getCount(db: unknown, sql: string): number {
    const typedDb = asDbLike(db);
    return (typedDb.prepare(sql).get() as CountRow).count;
}

function getClassStats(db: unknown) {
    const typedDb = asDbLike(db);
    const jobStatsRows = typedDb.prepare(`
        SELECT
            CASE
                WHEN id LIKE 'scan-%' THEN 'scan'
                WHEN id LIKE 'previews-%' THEN 'previews'
                WHEN id LIKE 'detect-%' THEN 'detect'
                WHEN id LIKE 'recog-%' THEN 'recog'
                WHEN id LIKE 'cluster-%' THEN 'cluster'
                WHEN id LIKE 'sensitive-%' THEN 'sensitive'
                WHEN id LIKE 'ai_meta_v2_31p-%' THEN 'ai_meta_31p'
                WHEN id LIKE 'ai_meta_v2_3f-%' THEN 'ai_meta_3f'
                WHEN id LIKE 'ai_meta_31p-%' THEN 'ai_meta_31p'
                WHEN id LIKE 'ai_meta_3f-%' THEN 'ai_meta_3f'
                WHEN id LIKE 'ai_meta-%' THEN 'ai_meta'
                ELSE 'other'
            END as kind,
            SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as active_count,
            AVG(CASE WHEN status = 'completed' AND finished_at IS NOT NULL THEN strftime('%s', finished_at) - strftime('%s', started_at) ELSE NULL END) as avg_sec
        FROM jobs
        WHERE status IN ('running', 'completed')
        GROUP BY kind
    `).all() as KindStatsRow[];

    const activeJobsRows = typedDb.prepare(`
        SELECT current_item_path, throughput_ips,
            CASE
                WHEN id LIKE 'scan-%' THEN 'scan'
                WHEN id LIKE 'previews-%' THEN 'previews'
                WHEN id LIKE 'detect-%' THEN 'detect'
                WHEN id LIKE 'recog-%' THEN 'recog'
                WHEN id LIKE 'cluster-%' THEN 'cluster'
                WHEN id LIKE 'sensitive-%' THEN 'sensitive'
                WHEN id LIKE 'ai_meta_v2_31p-%' THEN 'ai_meta_31p'
                WHEN id LIKE 'ai_meta_v2_3f-%' THEN 'ai_meta_3f'
                WHEN id LIKE 'ai_meta_31p-%' THEN 'ai_meta_31p'
                WHEN id LIKE 'ai_meta_3f-%' THEN 'ai_meta_3f'
                WHEN id LIKE 'ai_meta-%' THEN 'ai_meta'
                ELSE 'other'
            END as kind
        FROM jobs
        WHERE status = 'running'
        ORDER BY started_at DESC
    `).all() as ActiveJobRow[];

    const statsByKind = Object.fromEntries(jobStatsRows.map((row) => [row.kind, { activeCount: row.active_count, avgSec: row.avg_sec || 0 }]));
    const detailsByKind: Record<string, { current: string; throughput: number }> = {};

    for (const row of activeJobsRows) {
        if (detailsByKind[row.kind]) {continue;}
        detailsByKind[row.kind] = { current: row.current_item_path, throughput: row.throughput_ips };
    }

    const getFast = (kind: string) => {
        const stats = statsByKind[kind] || { activeCount: 0, avgSec: 0 };
        return {
            activeCount: stats.activeCount,
            avgSec: stats.avgSec,
            current: detailsByKind[kind]?.current,
            throughput: detailsByKind[kind]?.throughput,
        };
    };

    return {
        scanStats: getFast('scan'),
        previewStats: getFast('previews'),
        detectStats: getFast('detect'),
        recogStats: getFast('recog'),
        clusterStats: getFast('cluster'),
        aiMeta3FStats: getFast('ai_meta_3f'),
        aiMeta31PStats: getFast('ai_meta_31p'),
        sensitiveStats: getFast('sensitive'),
    };
}

function getQueueStatus(db: unknown) {
    const typedDb = asDbLike(db);
    const queueRows = typedDb.prepare(`
        SELECT
            pipeline_stage,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
            COUNT(*) AS total,
            MIN(CASE WHEN status = 'pending' THEN created_at END) AS oldest_pending_at,
            MIN(CASE WHEN status = 'processing' THEN created_at END) AS oldest_processing_at
        FROM task_queue
        GROUP BY pipeline_stage
    `).all() as QueueRow[];

    const processingRows = typedDb.prepare(`
        SELECT pipeline_stage, media_id
        FROM task_queue
        WHERE status = 'processing'
        ORDER BY created_at ASC
    `).all() as ProcessingRow[];

    const processingMediaByStage: Record<string, string[]> = {};
    for (const row of processingRows) {
        if (!processingMediaByStage[row.pipeline_stage]) {processingMediaByStage[row.pipeline_stage] = [];}
        if (processingMediaByStage[row.pipeline_stage].length < 5) {processingMediaByStage[row.pipeline_stage].push(row.media_id);}
    }

    const runningByStage = {
        previews: getCount(typedDb, "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND id LIKE 'previews-%'"),
        detection: getCount(typedDb, "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND id LIKE 'detect-%'"),
        recognition: getCount(typedDb, "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND id LIKE 'recog-%'"),
        clustering: getCount(typedDb, "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND id LIKE 'cluster-%'"),
        sensitive_scan: getCount(typedDb, "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND id LIKE 'sensitive-%'"),
        ai_metadata_3f: getCount(typedDb, "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND (id LIKE 'ai_meta_v2_3f-%' OR id LIKE 'ai_meta_3f-%')"),
        ai_metadata_31p: getCount(typedDb, "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND (id LIKE 'ai_meta_v2_31p-%' OR id LIKE 'ai_meta_31p-%')"),
        ai_metadata_v2_3f: getCount(typedDb, "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND id LIKE 'ai_meta_v2_3f-%'"),
        ai_metadata_v2_31p: getCount(typedDb, "SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND id LIKE 'ai_meta_v2_31p-%'"),
    };

    const stageOrder = ['previews', 'detection', 'recognition', 'clustering', 'sensitive_scan', 'ai_metadata_v2_3f', 'ai_metadata_v2_31p', 'ai_metadata_3f', 'ai_metadata_31p'];
    const queueByStage = new Map(queueRows.map((row) => [row.pipeline_stage, row]));
    const allQueueStages = Array.from(new Set([...stageOrder, ...queueRows.map((row) => row.pipeline_stage)]));

    const createStage = (stage: string) => {
        const row = queueByStage.get(stage);
        const counts = row
            ? { pending: row.pending, processing: row.processing, completed: row.completed, failed: row.failed, total: row.total }
            : { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 };

        return {
            stage,
            ...counts,
            oldestPendingAt: row?.oldest_pending_at ?? null,
            oldestProcessingAt: row?.oldest_processing_at ?? null,
            processingMediaIds: processingMediaByStage[stage] ?? [],
            runningJobs: runningByStage[stage as keyof typeof runningByStage] ?? 0,
        };
    };

    const stages = allQueueStages.map(createStage);
    const totals = stages.reduce(
        (acc, stage) => ({
            pending: acc.pending + stage.pending,
            processing: acc.processing + stage.processing,
            completed: acc.completed + stage.completed,
            failed: acc.failed + stage.failed,
            total: acc.total + stage.total,
        }),
        { pending: 0, processing: 0, completed: 0, failed: 0, total: 0 },
    );

    return { generatedAt: new Date().toISOString(), totals, stages };
}

function createSystemJobCard(
    config: {
        id: string;
        stage: string;
        title: string;
        active: { activeCount: number; avgSec: number; current?: string; throughput?: number };
        done: number;
        total: number;
        isPaused: boolean;
        errorCount: number;
        canPause?: boolean;
    },
) {
    const isComplete = config.total === 0 || config.done >= config.total;
    const state = config.isPaused
        ? 'paused'
        : config.active.activeCount > 0
            ? 'running'
            : (isComplete ? 'completed' : 'idle');

    return {
        id: config.id,
        stage: config.stage,
        title: config.title,
        state,
        activeCount: config.active.activeCount,
        avgDurationSec: config.active.avgSec,
        canPause: config.canPause ?? false,
        progress: {
            overallTotal: config.total,
            overallDone: config.done,
            overallPercent: config.total > 0 ? (config.done / config.total) * 100 : 100,
            errors: config.errorCount,
            current: config.active.current,
            throughputIps: config.active.throughput,
            stages: [],
        },
        issues: [],
        createdAt: new Date().toISOString(),
        trigger: 'system',
    };
}

function buildOnboardingCard(data: SystemJobBuildData) {
    return createSystemJobCard({
        id: 'class-onboarding',
        stage: 'onboarding',
        title: 'Photo Onboarding',
        active: data.classStats.scanStats,
        done: data.totalAssets,
        total: data.totalExpected,
        isPaused: false,
        errorCount: data.moduleErrorCounts['class-onboarding'] || 0,
    });
}

function buildPreviewCard(data: SystemJobBuildData) {
    return createSystemJobCard({
        id: 'class-previews',
        stage: 'previews',
        title: 'Thumbnail Generation',
        active: data.classStats.previewStats,
        done: data.donePreviews,
        total: data.totalExpected,
        isPaused: data.pausedModuleIds.has('class-previews'),
        errorCount: data.moduleErrorCounts['class-previews'] || 0,
        canPause: true,
    });
}

function buildDetectionCard(data: SystemJobBuildData) {
    return createSystemJobCard({
        id: 'class-detection',
        stage: 'analysis',
        title: 'Face Detection',
        active: data.classStats.detectStats,
        done: data.doneDetection,
        total: data.totalExpected,
        isPaused: data.pausedModuleIds.has('class-detection'),
        errorCount: data.moduleErrorCounts['class-detection'] || 0,
        canPause: true,
    });
}

function buildRecognitionCard(data: SystemJobBuildData) {
    return createSystemJobCard({
        id: 'class-mapping',
        stage: 'analysis',
        title: 'Face Recognition',
        active: data.classStats.recogStats,
        done: data.doneRecognition,
        total: data.doneDetection,
        isPaused: data.pausedModuleIds.has('class-mapping'),
        errorCount: data.moduleErrorCounts['class-mapping'] || 0,
        canPause: true,
    });
}

function buildClusteringCard(data: SystemJobBuildData) {
    return createSystemJobCard({
        id: 'class-clustering',
        stage: 'analysis',
        title: 'Face Clustering',
        active: data.classStats.clusterStats,
        done: 0,
        total: data.doneRecognition,
        isPaused: data.pausedModuleIds.has('class-clustering'),
        errorCount: data.moduleErrorCounts['class-clustering'] || 0,
        canPause: true,
    });
}

function buildSensitiveCard(data: SystemJobBuildData) {
    return createSystemJobCard({
        id: 'class-sensitive',
        stage: 'safety',
        title: 'Sensitive Content Scan',
        active: data.classStats.sensitiveStats,
        done: data.doneScored,
        total: data.totalExpected,
        isPaused: data.pausedModuleIds.has('class-sensitive'),
        errorCount: data.moduleErrorCounts['class-sensitive'] || 0,
        canPause: true,
    });
}

function buildAiMetadata3FCard(data: SystemJobBuildData) {
    return createSystemJobCard({
        id: 'class-aimetadata-3f',
        stage: 'ai_metadata_v2_3f',
        title: 'AI Metadata V2 (Gemini 3F)',
        active: data.classStats.aiMeta3FStats,
        done: data.doneAiMetadata,
        total: data.totalExpected,
        isPaused: data.pausedModuleIds.has('class-aimetadata-3f'),
        errorCount: data.moduleErrorCounts['class-aimetadata-3f'] || 0,
        canPause: true,
    });
}

function buildAiMetadata31PCard(data: SystemJobBuildData) {
    return createSystemJobCard({
        id: 'class-aimetadata-31p',
        stage: 'ai_metadata_v2_31p',
        title: 'AI Metadata V2 Upgrade (Gemini 31P)',
        active: data.classStats.aiMeta31PStats,
        done: data.doneAiMetadata31P,
        total: data.doneAiMetadata,
        isPaused: data.pausedModuleIds.has('class-aimetadata-31p'),
        errorCount: data.moduleErrorCounts['class-aimetadata-31p'] || 0,
        canPause: true,
    });
}

function buildSystemJobs(data: SystemJobBuildData) {
    return [
        buildOnboardingCard(data),
        buildPreviewCard(data),
        buildDetectionCard(data),
        buildRecognitionCard(data),
        buildClusteringCard(data),
        buildSensitiveCard(data),
        buildAiMetadata3FCard(data),
        buildAiMetadata31PCard(data),
    ];
}

export const systemJobsCommandHandlers: CommandHandlerMap = {
    get_system_jobs: (ctx) => {
        const { id, originWs, dbManager, respond } = ctx;
        try {
            const db = dbManager.getDb();
            const totalAssets = getCount(db, 'SELECT COUNT(*) as count FROM assets');
            const doneScored = getCount(db, 'SELECT COUNT(*) as count FROM assets WHERE sensitivity_score IS NOT NULL');
            const donePreviews = getCount(db, "SELECT COUNT(DISTINCT asset_id) as count FROM previews WHERE size = 'thumbnail'");
            const incoming = (asDbLike(db).prepare("SELECT COALESCE(SUM(total_items), 0) as incoming FROM jobs WHERE status = 'running' AND id LIKE 'scan-%'").get() as { incoming: number }).incoming;
            const totalExpected = totalAssets + incoming;

            const derivedCountsRows = asDbLike(db).prepare('SELECT task, COUNT(DISTINCT asset_id) as count FROM derived_results GROUP BY task').all() as { task: string; count: number }[];
            const derivedCounts = Object.fromEntries(derivedCountsRows.map((row) => [row.task, row.count]));
            const doneAiMetadata31P = getCount(
                db,
                `SELECT COUNT(DISTINCT asset_id) as count FROM derived_results WHERE task = 'ai_metadata' AND model_version = '${MODEL_PRO}'`
            );

            const jobs = buildSystemJobs({
                totalExpected,
                totalAssets,
                doneScored,
                donePreviews,
                doneDetection: derivedCounts.face_detection || 0,
                doneRecognition: derivedCounts.face_recognition || 0,
                doneAiMetadata: derivedCounts.ai_metadata || 0,
                doneAiMetadata31P,
                moduleErrorCounts: getDashboardModuleErrorCounts(db),
                pausedModuleIds: getPausedDashboardModuleIds(dbManager),
                classStats: getClassStats(db),
            });

            respond(id, 'ok', {
                jobs,
                queueStatus: getQueueStatus(db),
                dataStats: getDataStats(db),
                recentEvents: getRecentEventsSnapshot(db),
            }, null, originWs);
        } catch (error) {
            respond(id, 'error', null, error instanceof Error ? error.message : String(error), originWs);
        }
    },

    get_job_errors: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as { moduleId?: string; page?: number; pageSize?: number };
            ctx.respond(
                ctx.id,
                'ok',
                getJobErrorsSnapshot(ctx.dbManager.getDb(), {
                    moduleId: payload.moduleId,
                    page: payload.page,
                    pageSize: payload.pageSize,
                }),
                null,
                ctx.originWs
            );
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },
};
