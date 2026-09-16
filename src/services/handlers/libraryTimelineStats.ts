import type Database from 'better-sqlite3';
import type { LibraryTimelineBucket, LibraryTimelineSummary, LibraryStats } from '../../boundary/contracts/core';
import { getAllCaptureSequencePresentationItems } from '../relationships/libraryCaptureSequencePresentationProjection';

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

function loadAssetTimelineOverview(db: Database.Database): TimelineOverviewRow {
    return db.prepare(`
        SELECT
            MIN(a.photo_created_at) AS firstPhotoDate,
            MAX(a.photo_created_at) AS lastPhotoDate,
            COUNT(a.photo_created_at) AS datedPhotoCount,
            COALESCE(SUM(CASE WHEN a.photo_created_at IS NULL THEN 1 ELSE 0 END), 0) AS unknownDateCount
        FROM assets a
        WHERE a.binned_at IS NULL
    `).get() as TimelineOverviewRow;
}

function loadAssetTimelineBucketRows(db: Database.Database): TimelineBucketRow[] {
    return db.prepare(`
        SELECT
            CAST(CAST(substr(a.photo_created_at, 1, 4) AS INTEGER) / 10 AS INTEGER) * 10 AS decadeStart,
            COUNT(*) AS count
        FROM assets a
        WHERE a.binned_at IS NULL
          AND a.photo_created_at IS NOT NULL
        GROUP BY decadeStart
        ORDER BY decadeStart ASC
    `).all() as TimelineBucketRow[];
}

function buildAssetTimelineSummary(db: Database.Database): LibraryTimelineSummary {
    const overview = loadAssetTimelineOverview(db);
    return {
        firstPhotoDate: overview.firstPhotoDate ?? null,
        lastPhotoDate: overview.lastPhotoDate ?? null,
        datedPhotoCount: overview.datedPhotoCount ?? 0,
        unknownDateCount: overview.unknownDateCount ?? 0,
        buckets: loadAssetTimelineBucketRows(db).map(toTimelineBucket),
    };
}

function buildPresentationTimelineSummary(db: Database.Database): LibraryTimelineSummary {
    const activeAssetIds = new Set(
        (db.prepare('SELECT id FROM assets WHERE binned_at IS NULL').all() as Array<{ id: string }>).map((row) => row.id),
    );
    const items = getAllCaptureSequencePresentationItems(db)
        .filter((item) => activeAssetIds.has(item.representativeAssetId));
    const dates = items
        .map((item) => item.photoCreatedAt)
        .filter((date): date is string => Boolean(date));
    const decadeCounts = new Map<number, number>();
    for (const date of dates) {
        const year = Number(date.slice(0, 4));
        if (!Number.isFinite(year)) {continue;}
        const decadeStart = Math.trunc(year / 10) * 10;
        decadeCounts.set(decadeStart, (decadeCounts.get(decadeStart) ?? 0) + 1);
    }
    const sortedDates = [...dates].sort((left, right) => left.localeCompare(right));
    const buckets = [...decadeCounts.entries()]
        .sort(([left], [right]) => left - right)
        .map(([decadeStart, count]) => toTimelineBucket({ decadeStart, count }));

    return {
        firstPhotoDate: sortedDates[0] ?? null,
        lastPhotoDate: sortedDates.at(-1) ?? null,
        datedPhotoCount: dates.length,
        unknownDateCount: items.length - dates.length,
        buckets,
    };
}

export function buildLibraryTimelineSummary(db: Database.Database): LibraryTimelineSummary {
    return buildAssetTimelineSummary(db);
}

export function buildLibraryTimelineStats(db: Database.Database): Pick<LibraryStats, 'timeline' | 'groupedTimeline' | 'ungroupedTimeline'> {
    const ungroupedTimeline = buildAssetTimelineSummary(db);
    const groupedTimeline = buildPresentationTimelineSummary(db);

    return {
        timeline: groupedTimeline,
        groupedTimeline,
        ungroupedTimeline,
    };
}
