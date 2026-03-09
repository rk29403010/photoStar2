import type { DatabaseManager } from '../db';
import type { JobErrorListItem, JobErrorModuleSummary, JobErrorSnapshot } from '../../../shared/types/jobs';

export const DASHBOARD_PAUSED_MODULES_SETTING = 'dashboard_paused_modules_json';

export type DashboardModuleId =
    | 'class-onboarding'
    | 'class-previews'
    | 'class-detection'
    | 'class-mapping'
    | 'class-clustering'
    | 'class-sensitive'
    | 'class-aimetadata-3f'
    | 'class-aimetadata-31p';

type DashboardModuleDefinition = {
    id: DashboardModuleId;
    label: string;
    pauseStage?: string;
    canPause: boolean;
};

type DbLike = {
    prepare: (sql: string) => {
        get: (...args: unknown[]) => unknown;
        all: (...args: unknown[]) => unknown[];
    };
};

type CountRow = { count: number };

type ErrorSourceRow = {
    id: string;
    source: 'processing_issue' | 'failed_job';
    moduleId: DashboardModuleId | null;
    severity: string;
    message: string;
    createdAt: string;
    jobId: string | null;
    task: string | null;
    stage: string | null;
};

const DASHBOARD_MODULES: DashboardModuleDefinition[] = [
    { id: 'class-onboarding', label: 'Photo Onboarding', canPause: false },
    { id: 'class-previews', label: 'Thumbnail Generation', pauseStage: 'previews', canPause: true },
    { id: 'class-detection', label: 'Face Detection', pauseStage: 'detection', canPause: true },
    { id: 'class-mapping', label: 'Face Recognition', pauseStage: 'recognition', canPause: true },
    { id: 'class-clustering', label: 'Face Clustering', pauseStage: 'clustering', canPause: true },
    { id: 'class-sensitive', label: 'Sensitive Content Scan', pauseStage: 'sensitive_scan', canPause: true },
    { id: 'class-aimetadata-3f', label: 'Extract AI Metadata (3F)', pauseStage: 'ai_metadata_3f', canPause: true },
    { id: 'class-aimetadata-31p', label: 'Upgrade AI Metadata (31P)', pauseStage: 'ai_metadata_31p', canPause: true },
];

const PROCESSING_ISSUE_MODULE_CASE = `
    CASE
        WHEN task IN ('scan', 'ingest') THEN 'class-onboarding'
        WHEN task = 'preview' THEN 'class-previews'
        WHEN task = 'detection' THEN 'class-detection'
        WHEN task = 'recognition' THEN 'class-mapping'
        WHEN task = 'clustering' THEN 'class-clustering'
        WHEN task = 'sensitive_scan' THEN 'class-sensitive'
        WHEN task = 'ai_metadata' AND job_id LIKE 'ai_meta_31p-%' THEN 'class-aimetadata-31p'
        WHEN task = 'ai_metadata' THEN 'class-aimetadata-3f'
        ELSE NULL
    END
`;

const FAILED_JOB_MODULE_CASE = `
    CASE
        WHEN id LIKE 'scan-%' THEN 'class-onboarding'
        WHEN id LIKE 'previews-%' THEN 'class-previews'
        WHEN id LIKE 'detect-%' THEN 'class-detection'
        WHEN id LIKE 'recog-%' THEN 'class-mapping'
        WHEN id LIKE 'cluster-%' THEN 'class-clustering'
        WHEN id LIKE 'sensitive-%' THEN 'class-sensitive'
        WHEN id LIKE 'ai_meta_31p-%' THEN 'class-aimetadata-31p'
        WHEN id LIKE 'ai_meta_3f-%' THEN 'class-aimetadata-3f'
        ELSE NULL
    END
`;

function asDbLike(db: unknown): DbLike {
    return db as DbLike;
}

function buildErrorUnionSql(): string {
    return `
        SELECT
            id,
            'processing_issue' AS source,
            ${PROCESSING_ISSUE_MODULE_CASE} AS moduleId,
            severity,
            message,
            created_at AS createdAt,
            job_id AS jobId,
            task,
            NULL AS stage
        FROM processing_issues

        UNION ALL

        SELECT
            id,
            'failed_job' AS source,
            ${FAILED_JOB_MODULE_CASE} AS moduleId,
            'error' AS severity,
            COALESCE(last_error, 'Job failed') AS message,
            COALESCE(finished_at, created_at) AS createdAt,
            id AS jobId,
            NULL AS task,
            stage
        FROM jobs
        WHERE status = 'failed'
    `;
}

function createModuleFilterWhere(moduleId?: string | null): { whereSql: string; params: unknown[] } {
    if (!moduleId) {
        return { whereSql: 'WHERE moduleId IS NOT NULL', params: [] };
    }

    return { whereSql: 'WHERE moduleId = ?', params: [moduleId] };
}

function toSeverity(value: string): JobErrorListItem['severity'] {
    if (value === 'info' || value === 'warning' || value === 'error' || value === 'fatal') {
        return value;
    }

    return 'error';
}

function getJobErrorModuleSummaries(db: unknown): JobErrorModuleSummary[] {
    const typedDb = asDbLike(db);
    const unionSql = buildErrorUnionSql();
    const rows = typedDb.prepare(`
        SELECT moduleId, COUNT(*) AS count
        FROM (${unionSql})
        WHERE moduleId IS NOT NULL
        GROUP BY moduleId
    `).all() as Array<{ moduleId: DashboardModuleId; count: number }>;

    const countsByModule = new Map(rows.map((row) => [row.moduleId, row.count]));
    return DASHBOARD_MODULES.map((module) => ({
        id: module.id,
        label: module.label,
        errorCount: countsByModule.get(module.id) ?? 0,
    }));
}

export function getDashboardModules() {
    return DASHBOARD_MODULES;
}

export function getDashboardModuleById(moduleId: string) {
    return DASHBOARD_MODULES.find((module) => module.id === moduleId);
}

export function getDashboardModuleErrorCounts(db: unknown): Record<string, number> {
    return Object.fromEntries(getJobErrorModuleSummaries(db).map((module) => [module.id, module.errorCount]));
}

function normalizeSnapshotPaging(options: { page?: number; pageSize?: number }) {
    const pageSize = Math.max(1, Math.min(100, Math.floor(options.pageSize ?? 25)));
    const page = Math.max(1, Math.floor(options.page ?? 1));

    return {
        page,
        pageSize,
        offset: (page - 1) * pageSize,
    };
}

function countJobErrors(
    typedDb: DbLike,
    unionSql: string,
    whereSql: string,
    params: unknown[]
): number {
    return ((typedDb.prepare(`
        SELECT COUNT(*) AS count
        FROM (${unionSql})
        ${whereSql}
    `).get(...params) as CountRow | undefined)?.count) ?? 0;
}

function loadJobErrorRows(
    typedDb: DbLike,
    unionSql: string,
    whereSql: string,
    params: unknown[],
    pageSize: number,
    offset: number
): ErrorSourceRow[] {
    return typedDb.prepare(`
        SELECT id, source, moduleId, severity, message, createdAt, jobId, task, stage
        FROM (${unionSql})
        ${whereSql}
        ORDER BY createdAt DESC, id DESC
        LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as ErrorSourceRow[];
}

function mapJobErrorItem(
    row: ErrorSourceRow,
    moduleMap: Map<DashboardModuleId, DashboardModuleDefinition>
): JobErrorListItem {
    return {
        id: `${row.source}:${row.id}`,
        moduleId: row.moduleId ?? 'class-onboarding',
        moduleLabel: row.moduleId ? (moduleMap.get(row.moduleId)?.label ?? row.moduleId) : 'Unknown Module',
        source: row.source,
        severity: toSeverity(row.severity),
        message: row.message,
        createdAt: row.createdAt,
        jobId: row.jobId ?? undefined,
        task: row.task ?? undefined,
        stage: row.stage ?? undefined,
    };
}

export function getJobErrorsSnapshot(
    db: unknown,
    options: { moduleId?: string | null; page?: number; pageSize?: number } = {}
): JobErrorSnapshot {
    const typedDb = asDbLike(db);
    const { page, pageSize, offset } = normalizeSnapshotPaging(options);
    const unionSql = buildErrorUnionSql();
    const moduleMap = new Map(DASHBOARD_MODULES.map((module) => [module.id, module]));
    const { whereSql, params } = createModuleFilterWhere(options.moduleId);
    const total = countJobErrors(typedDb, unionSql, whereSql, params);
    const rows = loadJobErrorRows(typedDb, unionSql, whereSql, params, pageSize, offset);
    const items = rows.map((row) => mapJobErrorItem(row, moduleMap));

    return {
        generatedAt: new Date().toISOString(),
        page,
        pageSize,
        total,
        moduleFilter: options.moduleId ?? null,
        availableModules: getJobErrorModuleSummaries(db),
        items,
    };
}

export function getPausedDashboardModuleIds(dbManager: DatabaseManager): Set<string> {
    const raw = dbManager.getSetting(DASHBOARD_PAUSED_MODULES_SETTING).trim();
    if (!raw) {
        return new Set();
    }

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return new Set();
        }

        return new Set(parsed.filter((value): value is string => typeof value === 'string'));
    } catch {
        return new Set();
    }
}

export function setPausedDashboardModuleIds(dbManager: DatabaseManager, moduleIds: Iterable<string>): void {
    const nextIds = Array.from(new Set(moduleIds));
    nextIds.sort((left, right) => left.localeCompare(right));
    dbManager.setSetting(DASHBOARD_PAUSED_MODULES_SETTING, JSON.stringify(nextIds));
}