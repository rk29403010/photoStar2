import type { DatabaseManager } from '../../data/db';
import {
    countRelationshipPresentationItems,
    getRelationshipPresentationPage,
    type LibraryPresentationItem,
    type LibraryPresentationOrder,
} from './libraryPresentationProjection';

type DbHandle = ReturnType<DatabaseManager['getDb']>;

export type CaptureSequencePresentationRelationshipKind =
    | LibraryPresentationItem['relationshipKind']
    | 'capture_sequence';

export type CaptureSequencePresentationItem = Omit<LibraryPresentationItem, 'relationshipKind'> & {
    relationshipKind: CaptureSequencePresentationRelationshipKind;
    momentCount: number;
};

type SequenceMemberRow = {
    sequence_id: string;
    ordinal: number;
    current_asset_id: string | null;
};

type SequenceCandidate = {
    sequenceId: string;
    momentKeys: string[];
    representativeMomentKey: string;
};

function loadBaseItems(
    db: DbHandle,
    order: LibraryPresentationOrder,
): LibraryPresentationItem[] {
    const count = countRelationshipPresentationItems(db);
    return getRelationshipPresentationPage(db, {
        limit: count,
        offset: 0,
        order,
    });
}

function loadSequenceMembers(db: DbHandle): SequenceMemberRow[] {
    return db.prepare(`
        SELECT
            sequence.id AS sequence_id,
            member.ordinal,
            (
                SELECT current_asset.id
                FROM assets current_asset
                WHERE current_asset.original_path = identity.original_path
                ORDER BY current_asset.created_at DESC, current_asset.id DESC
                LIMIT 1
            ) AS current_asset_id
        FROM capture_sequences sequence
        JOIN capture_sequence_members member ON member.sequence_id = sequence.id
        JOIN asset_identities identity ON identity.guid = member.asset_identity_guid
        WHERE sequence.status != 'rejected'
          AND member.status != 'rejected'
        ORDER BY sequence.id ASC, member.ordinal ASC, identity.original_path ASC
    `).all() as SequenceMemberRow[];
}

function indexBaseItems(baseItems: readonly LibraryPresentationItem[]): {
    byAssetId: Map<string, LibraryPresentationItem>;
    byKey: Map<string, LibraryPresentationItem>;
} {
    const byAssetId = new Map<string, LibraryPresentationItem>();
    const byKey = new Map<string, LibraryPresentationItem>();
    for (const item of baseItems) {
        byKey.set(item.presentationKey, item);
        for (const assetId of item.assetIds) {
            byAssetId.set(assetId, item);
        }
    }
    return { byAssetId, byKey };
}

function groupRowsBySequence(rows: readonly SequenceMemberRow[]): Map<string, SequenceMemberRow[]> {
    const grouped = new Map<string, SequenceMemberRow[]>();
    for (const row of rows) {
        const existing = grouped.get(row.sequence_id) ?? [];
        existing.push(row);
        grouped.set(row.sequence_id, existing);
    }
    return grouped;
}

function buildSequenceCandidate(
    sequenceId: string,
    rows: readonly SequenceMemberRow[],
    baseByAssetId: ReadonlyMap<string, LibraryPresentationItem>,
): SequenceCandidate | null {
    const firstOrdinalByMoment = new Map<string, number>();
    for (const row of rows) {
        if (!row.current_asset_id) {
            continue;
        }
        const baseItem = baseByAssetId.get(row.current_asset_id);
        if (!baseItem) {
            continue;
        }
        const existingOrdinal = firstOrdinalByMoment.get(baseItem.presentationKey);
        if (existingOrdinal === undefined || row.ordinal < existingOrdinal) {
            firstOrdinalByMoment.set(baseItem.presentationKey, row.ordinal);
        }
    }
    if (firstOrdinalByMoment.size < 2) {
        return null;
    }

    const orderedMoments = [...firstOrdinalByMoment.entries()]
        .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
    const representative = orderedMoments.at(-1);
    if (!representative) {
        return null;
    }
    return {
        sequenceId,
        momentKeys: orderedMoments.map(([key]) => key),
        representativeMomentKey: representative[0],
    };
}

function removeAmbiguousSequences(candidates: readonly SequenceCandidate[]): SequenceCandidate[] {
    const useCountByMoment = new Map<string, number>();
    for (const candidate of candidates) {
        for (const momentKey of candidate.momentKeys) {
            useCountByMoment.set(momentKey, (useCountByMoment.get(momentKey) ?? 0) + 1);
        }
    }
    return candidates.filter((candidate) => candidate.momentKeys.every(
        (momentKey) => useCountByMoment.get(momentKey) === 1,
    ));
}

function buildSequenceItem(
    candidate: SequenceCandidate,
    baseByKey: ReadonlyMap<string, LibraryPresentationItem>,
): CaptureSequencePresentationItem | null {
    const moments = candidate.momentKeys
        .map((key) => baseByKey.get(key))
        .filter((item): item is LibraryPresentationItem => Boolean(item));
    const representative = baseByKey.get(candidate.representativeMomentKey);
    if (!representative || moments.length < 2) {
        return null;
    }

    const assetIds = [...new Set(moments.flatMap((moment) => moment.assetIds))]
        .sort((left, right) => left.localeCompare(right));
    return {
        ...representative,
        presentationKey: `sequence:${candidate.sequenceId}`,
        relationshipKind: 'capture_sequence',
        stackCount: assetIds.length,
        assetIds,
        momentCount: moments.length,
    };
}

function collapseSequences(
    baseItems: readonly LibraryPresentationItem[],
    candidates: readonly SequenceCandidate[],
): CaptureSequencePresentationItem[] {
    const { byKey } = indexBaseItems(baseItems);
    const sequenceByRepresentativeKey = new Map<string, CaptureSequencePresentationItem>();
    const consumedMomentKeys = new Set<string>();
    for (const candidate of removeAmbiguousSequences(candidates)) {
        const item = buildSequenceItem(candidate, byKey);
        if (!item) {
            continue;
        }
        sequenceByRepresentativeKey.set(candidate.representativeMomentKey, item);
        for (const momentKey of candidate.momentKeys) {
            consumedMomentKeys.add(momentKey);
        }
    }

    const items: CaptureSequencePresentationItem[] = [];
    for (const baseItem of baseItems) {
        const sequenceItem = sequenceByRepresentativeKey.get(baseItem.presentationKey);
        if (sequenceItem) {
            items.push(sequenceItem);
            continue;
        }
        if (consumedMomentKeys.has(baseItem.presentationKey)) {
            continue;
        }
        items.push({ ...baseItem, momentCount: 1 });
    }
    return items;
}

function buildAllCaptureSequencePresentationItems(
    db: DbHandle,
    order: LibraryPresentationOrder,
): CaptureSequencePresentationItem[] {
    const baseItems = loadBaseItems(db, order);
    const { byAssetId } = indexBaseItems(baseItems);
    const rowsBySequence = groupRowsBySequence(loadSequenceMembers(db));
    const candidates: SequenceCandidate[] = [];
    for (const [sequenceId, rows] of rowsBySequence) {
        const candidate = buildSequenceCandidate(sequenceId, rows, byAssetId);
        if (candidate) {
            candidates.push(candidate);
        }
    }
    return collapseSequences(baseItems, candidates);
}

export function getCaptureSequencePresentationPage(
    db: DbHandle,
    options: { limit: number; offset: number; order?: LibraryPresentationOrder },
): CaptureSequencePresentationItem[] {
    const limit = Math.max(0, Math.trunc(options.limit));
    const offset = Math.max(0, Math.trunc(options.offset));
    const items = buildAllCaptureSequencePresentationItems(db, options.order ?? 'default');
    return items.slice(offset, offset + limit);
}

export function countCaptureSequencePresentationItems(db: DbHandle): number {
    return buildAllCaptureSequencePresentationItems(db, 'default').length;
}
