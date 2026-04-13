import type Database from 'better-sqlite3';
import type { LibraryTimelineBucket, LibraryTimelineSummary, LibraryStats } from '../../boundary/contracts/core';
import { GROUP_HIERARCHY_CTE, buildPrimaryGroupVisibilityPredicate } from './assetGroupingQueryFragments';

type TimelineOverviewRow = {
    firstPhotoDate: string | null;
    lastPhotoDate: string | null;
    datedPhotoCount: number;
    unknownDateCount: number;
};

type TimelineBucketRow = {
    decadeStart: number;
    count: number;
};

type TimelineScope = 'grouped' | 'ungrouped';

function toDecadeIsoDate(year: number, monthIndex: number, day: number, hour: number, minute: number, second: number, millisecond: number) {
    return new Date(Date.UTC(year, monthIndex, day, hour, minute, second, millisecond)).toISOString();
}

function toTimelineBucket(row: TimelineBucketRow): LibraryTimelineBucket {
    const startYear = row.decadeStart;
    const endYear = startYear + 9;

    return {
        label: `${startYear}s`,
        startYear,
        endYear,
        startDate: toDecadeIsoDate(startYear, 0, 1, 0, 0, 0, 0),
        endDate: toDecadeIsoDate(endYear, 11, 31, 23, 59, 59, 999),
        count: row.count,
    };
}

function getTimelineScopeSql(scope: TimelineScope) {
    if (scope === 'grouped') {
        return {
            cte: GROUP_HIERARCHY_CTE,
            whereClause: `WHERE ${buildPrimaryGroupVisibilityPredicate('a')}`,
        };
    }

    return {
        cte: '',
        whereClause: '',
    };
}

function loadTimelineOverview(db: Database.Database, scope: TimelineScope): TimelineOverviewRow {
    const scopeSql = getTimelineScopeSql(scope);
    const whereClause = scopeSql.whereClause
        ? `${scopeSql.whereClause} AND a.binned_at IS NULL`
        : 'WHERE a.binned_at IS NULL';

    return db.prepare(`
        ${scopeSql.cte}
        SELECT
            MIN(a.photo_created_at) AS firstPhotoDate,
            MAX(a.photo_created_at) AS lastPhotoDate,
            COUNT(a.photo_created_at) AS datedPhotoCount,
            COALESCE(SUM(CASE WHEN a.photo_created_at IS NULL THEN 1 ELSE 0 END), 0) AS unknownDateCount
        FROM assets a
        ${whereClause}
    `).get() as TimelineOverviewRow;
}

function loadTimelineBucketRows(db: Database.Database, scope: TimelineScope): TimelineBucketRow[] {
    const scopeSql = getTimelineScopeSql(scope);
    const whereClause = scopeSql.whereClause
        ? `${scopeSql.whereClause} AND a.binned_at IS NULL`
        : 'WHERE a.binned_at IS NULL';

    return db.prepare(`
        ${scopeSql.cte}
        SELECT
            CAST(CAST(substr(a.photo_created_at, 1, 4) AS INTEGER) / 10 AS INTEGER) * 10 AS decadeStart,
            COUNT(*) AS count
        FROM assets a
        ${whereClause}
        AND a.photo_created_at IS NOT NULL
        GROUP BY decadeStart
        ORDER BY decadeStart ASC
    `).all() as TimelineBucketRow[];
}

function buildTimelineSummary(db: Database.Database, scope: TimelineScope): LibraryTimelineSummary {
    const overview = loadTimelineOverview(db, scope);
    const buckets = loadTimelineBucketRows(db, scope).map(toTimelineBucket);

    return {
        firstPhotoDate: overview.firstPhotoDate ?? null,
        lastPhotoDate: overview.lastPhotoDate ?? null,
        datedPhotoCount: overview.datedPhotoCount ?? 0,
        unknownDateCount: overview.unknownDateCount ?? 0,
        buckets,
    };
}

export function buildLibraryTimelineSummary(db: Database.Database): LibraryTimelineSummary {
    return buildTimelineSummary(db, 'ungrouped');
}

export function buildLibraryTimelineStats(db: Database.Database): Pick<LibraryStats, 'timeline' | 'groupedTimeline' | 'ungroupedTimeline'> {
    const ungroupedTimeline = buildTimelineSummary(db, 'ungrouped');
    const groupedTimeline = buildTimelineSummary(db, 'grouped');

    return {
        timeline: groupedTimeline,
        groupedTimeline,
        ungroupedTimeline,
    };
}
