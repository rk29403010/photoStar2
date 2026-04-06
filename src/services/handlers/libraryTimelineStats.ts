import type Database from 'better-sqlite3';
import type { LibraryTimelineBucket, LibraryTimelineSummary } from '../../boundary/contracts/core';

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

function loadTimelineOverview(db: Database.Database): TimelineOverviewRow {
    return db.prepare(`
        SELECT
            MIN(photo_created_at) AS firstPhotoDate,
            MAX(photo_created_at) AS lastPhotoDate,
            COUNT(photo_created_at) AS datedPhotoCount,
            COALESCE(SUM(CASE WHEN photo_created_at IS NULL THEN 1 ELSE 0 END), 0) AS unknownDateCount
        FROM assets
    `).get() as TimelineOverviewRow;
}

function loadTimelineBucketRows(db: Database.Database): TimelineBucketRow[] {
    return db.prepare(`
        SELECT
            CAST(CAST(substr(photo_created_at, 1, 4) AS INTEGER) / 10 AS INTEGER) * 10 AS decadeStart,
            COUNT(*) AS count
        FROM assets
        WHERE photo_created_at IS NOT NULL
        GROUP BY decadeStart
        ORDER BY decadeStart ASC
    `).all() as TimelineBucketRow[];
}

export function buildLibraryTimelineSummary(db: Database.Database): LibraryTimelineSummary {
    const overview = loadTimelineOverview(db);
    const buckets = loadTimelineBucketRows(db).map(toTimelineBucket);

    return {
        firstPhotoDate: overview.firstPhotoDate ?? null,
        lastPhotoDate: overview.lastPhotoDate ?? null,
        datedPhotoCount: overview.datedPhotoCount ?? 0,
        unknownDateCount: overview.unknownDateCount ?? 0,
        buckets,
    };
}
