import type { GalleryTimelineSeek } from '../../boundary/contracts/core';
import type { LibraryPresentationItem } from '../../boundary/contracts/libraryPresentation';
import type { DatabaseManager } from '../../data/db';
import {
    getAllCaptureSequencePresentationItems,
    type CaptureSequencePresentationItem,
} from '../relationships/libraryCaptureSequencePresentationProjection';
import { applyLibraryPresentationPreferences } from '../relationships/libraryPresentationPreferenceRepository';
import type { AssetGalleryOrder } from './assetGalleryOrder';
import { buildAssetTimelineSeekClause, getAssetTimelineSeek } from './assetTimelineSeek';
import { buildFilterSubquery } from './assetQueryFilters';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type RelationshipGalleryFilter = {
    personIds?: string[];
    type?: string;
    albumId?: string;
    value?: string;
    tag?: string;
};

export type RelationshipGalleryPresentationPage = {
    items: LibraryPresentationItem[];
    representativeAssetIds: string[];
    hasMore: boolean;
    total: number;
};

function loadFilterEligibleAssetIds(
    db: DbHandle,
    filter: RelationshipGalleryFilter | undefined,
): Set<string> | null {
    if (!filter) {
        return null;
    }
    const params: (string | number)[] = [];
    const filterSql = buildFilterSubquery(filter, params);
    const rows = db.prepare(`
        SELECT a.id
        FROM assets a
        WHERE 1=1 ${filterSql}
    `).all(...params) as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
}

function loadSeekEligibleRepresentativeIds(
    db: DbHandle,
    galleryOrder: AssetGalleryOrder,
    gallerySeek: GalleryTimelineSeek | null | undefined,
): Set<string> | null {
    const seek = getAssetTimelineSeek({ gallerySeek });
    if (!seek) {
        return null;
    }
    const clause = buildAssetTimelineSeekClause('a', galleryOrder, seek);
    const rows = db.prepare(`
        SELECT a.id
        FROM assets a
        WHERE a.binned_at IS NULL
          AND ${clause.sql}
    `).all(...clause.params) as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
}

function matchesEligibleMembers(
    item: LibraryPresentationItem,
    eligibleAssetIds: ReadonlySet<string> | null,
): boolean {
    return !eligibleAssetIds || item.assetIds.some((assetId) => eligibleAssetIds.has(assetId));
}

function matchesSeek(
    item: LibraryPresentationItem,
    eligibleRepresentativeIds: ReadonlySet<string> | null,
): boolean {
    return !eligibleRepresentativeIds || eligibleRepresentativeIds.has(item.representativeAssetId);
}

function toResponseItem(item: CaptureSequencePresentationItem): LibraryPresentationItem {
    return {
        presentationKey: item.presentationKey,
        representativeAssetId: item.representativeAssetId,
        relationshipKind: item.relationshipKind,
        stackCount: item.stackCount,
        assetIds: [...item.assetIds],
        momentCount: item.momentCount,
    };
}

export function getRelationshipGalleryPresentationPage(
    db: DbHandle,
    options: {
        limit: number;
        offset: number;
        galleryOrder: AssetGalleryOrder;
        gallerySeek?: GalleryTimelineSeek | null;
        filter?: RelationshipGalleryFilter;
    },
): RelationshipGalleryPresentationPage {
    const limit = Math.max(0, Math.trunc(options.limit));
    const offset = Math.max(0, Math.trunc(options.offset));
    const eligibleAssetIds = loadFilterEligibleAssetIds(db, options.filter);
    const eligibleRepresentativeIds = loadSeekEligibleRepresentativeIds(
        db,
        options.galleryOrder,
        options.gallerySeek,
    );
    const projectedItems = getAllCaptureSequencePresentationItems(db, options.galleryOrder).map(toResponseItem);
    const preferredItems = applyLibraryPresentationPreferences(db, projectedItems, eligibleAssetIds);
    const eligibleItems = preferredItems
        .filter((item) => matchesEligibleMembers(item, eligibleAssetIds))
        .filter((item) => matchesSeek(item, eligibleRepresentativeIds));
    const pageItems = eligibleItems.slice(offset, offset + limit);

    return {
        items: pageItems,
        representativeAssetIds: pageItems.map((item) => item.representativeAssetId),
        hasMore: offset + pageItems.length < eligibleItems.length,
        total: eligibleItems.length,
    };
}
