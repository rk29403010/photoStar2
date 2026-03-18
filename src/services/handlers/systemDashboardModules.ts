import type { JobErrorListItem, JobErrorModuleSummary, JobErrorSnapshot } from '../../boundary/contracts/jobs';

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
    moduleId: string | null;
    severity: string;
    message: string;
    createdAt: string;
    jobId: string | null;
    task: string | null;
    stage: string | null;
};

const MODULE_LABELS: Record<string, string> = {
    scan: 'Folder ingest',
    ingest: 'Folder ingest',
    preview: 'Preview generation',
    detection: 'Face detection',
    clustering: 'Grouping',
    sensitive_scan: 'Sensitive scan',
    ai_metadata: 'AI metadata',
    face_analysis: 'Face analysis',
    preview_generation: 'Preview generation',
    similarity_cluster: 'Grouping',
};

const PROCESSING_ISSUE_MODULE_CASE = `
    CASE
        WHEN task IN ('scan', 'ingest') THEN 'scan'
        WHEN task = 'preview' THEN 'preview'
        WHEN task = 'detection' THEN 'detection'
        WHEN task = 'clustering' THEN 'clustering'
        WHEN task = 'sensitive_scan' THEN 'sensitive_scan'
        WHEN task = 'ai_metadata' THEN 'ai_metadata'
        ELSE NULL
    END
`;

const FAILED_JOB_MODULE_CASE = `
    CASE
        WHEN stage IN ('bulk_ingest', 'scan', 'onboarding') THEN 'scan'
        WHEN stage IN ('previews', 'preview_generation') THEN 'preview'
        WHEN stage IN ('analysis', 'face_analysis') THEN 'detection'
        WHEN stage = 'similarity_cluster' THEN 'clustering'
        WHEN stage = 'sensitive_scan' THEN 'sensitive_scan'
                WHEN stage = 'ai_metadata' THEN 'ai_metadata'
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

function getModuleLabel(moduleId: string | null) {
    if (!moduleId) {
        return 'Unknown Module';
    }
    return MODULE_LABELS[moduleId] ?? moduleId;
}

function getJobErrorModuleSummaries(db: unknown): JobErrorModuleSummary[] {
    const typedDb = asDbLike(db);
    const unionSql = buildErrorUnionSql();
    const rows = typedDb.prepare(`
        SELECT moduleId, COUNT(*) AS count
        FROM (${unionSql})
        WHERE moduleId IS NOT NULL
        GROUP BY moduleId
        ORDER BY moduleId ASC
    `).all() as Array<{ moduleId: string; count: number }>;

    return rows.map((row) => ({
        id: row.moduleId,
        label: getModuleLabel(row.moduleId),
        errorCount: row.count,
    }));
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
    params: unknown[],
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
    offset: number,
): ErrorSourceRow[] {
    return typedDb.prepare(`
        SELECT id, source, moduleId, severity, message, createdAt, jobId, task, stage
        FROM (${unionSql})
        ${whereSql}
        ORDER BY createdAt DESC, id DESC
        LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as ErrorSourceRow[];
}

function mapJobErrorItem(row: ErrorSourceRow): JobErrorListItem {
    return {
        id: `${row.source}:${row.id}`,
        moduleId: row.moduleId ?? 'unknown',
        moduleLabel: getModuleLabel(row.moduleId),
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
    options: { moduleId?: string | null; page?: number; pageSize?: number } = {},
): JobErrorSnapshot {
    const typedDb = asDbLike(db);
    const { page, pageSize, offset } = normalizeSnapshotPaging(options);
    const unionSql = buildErrorUnionSql();
    const { whereSql, params } = createModuleFilterWhere(options.moduleId);
    const total = countJobErrors(typedDb, unionSql, whereSql, params);
    const rows = loadJobErrorRows(typedDb, unionSql, whereSql, params, pageSize, offset);
    const items = rows.map((row) => mapJobErrorItem(row));

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
