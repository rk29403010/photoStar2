import type { TimelineGroupId, TimelineGroupSummary } from '@contracts/core';
import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';
import { buildGalleryTimeSections, type GalleryTimeSection } from '../layout/galleryTimeSections.ts';

function getTimelineGroupIdForItem(item: LibrarySelectableItem): TimelineGroupId {
    const timestamp = item.asset.photo_created_at ?? item.asset.created_at ?? null;
    if (!timestamp) {
        return 'unknown-date';
    }

    const year = new Date(timestamp).getUTCFullYear();
    if (Number.isNaN(year)) {
        return 'unknown-date';
    }

    return `decade-${Math.floor(year / 10) * 10}`;
}

function buildTimelineGroupSectionOrder(groupSummaries: TimelineGroupSummary[]) {
    return new Map(groupSummaries.map((groupSummary, groupIndex) => [groupSummary.id, groupIndex] as const));
}

function createTimelineSectionFromSummary(groupSummary: TimelineGroupSummary, items: LibrarySelectableItem[]): GalleryTimeSection {
    return {
        id: groupSummary.id,
        label: groupSummary.label,
        items,
    };
}

function collectItemsByTimelineGroup(displayItems: LibrarySelectableItem[]) {
    const itemsByGroupId = new Map<TimelineGroupId, LibrarySelectableItem[]>();

    for (const item of displayItems) {
        const groupId = getTimelineGroupIdForItem(item);
        const groupItems = itemsByGroupId.get(groupId);
        if (groupItems == null) {
            itemsByGroupId.set(groupId, [item]);
            continue;
        }
        groupItems.push(item);
    }

    return itemsByGroupId;
}

function buildSummaryTimelineSections(
    groupSummaries: TimelineGroupSummary[],
    itemsByGroupId: Map<TimelineGroupId, LibrarySelectableItem[]>,
) {
    return groupSummaries.flatMap((groupSummary) => {
        const items = itemsByGroupId.get(groupSummary.id);
        if (!items || items.length === 0) {
            return [];
        }
        itemsByGroupId.delete(groupSummary.id);
        return [createTimelineSectionFromSummary(groupSummary, items)];
    });
}

function buildRemainingTimelineSectionLabel(
    groupId: TimelineGroupId,
    groupSummaries: TimelineGroupSummary[],
) {
    const matchingSummary = groupSummaries.find((groupSummary) => groupSummary.id === groupId);
    if (matchingSummary?.label != null) {
        return matchingSummary.label;
    }
    return groupId === 'unknown-date' ? null : `${groupId.replace('decade-', '')}s`;
}

function buildRemainingTimelineSections(
    itemsByGroupId: Map<TimelineGroupId, LibrarySelectableItem[]>,
    groupSummaries: TimelineGroupSummary[],
    sectionOrderById: Map<TimelineGroupId, number>,
) {
    return Array.from(itemsByGroupId.entries())
        .map(([groupId, items], encounterIndex) => ({
            groupId,
            items,
            encounterIndex,
            orderIndex: sectionOrderById.get(groupId) ?? Number.MAX_SAFE_INTEGER,
        }))
        .sort((left, right) => (
            left.orderIndex - right.orderIndex
            || left.encounterIndex - right.encounterIndex
        ))
        .map(({ groupId, items }) => ({
            id: groupId,
            label: buildRemainingTimelineSectionLabel(groupId, groupSummaries),
            items,
        }));
}

export function buildDateTimelineJustifiedSections(
    displayItems: LibrarySelectableItem[],
    groupSummaries: TimelineGroupSummary[],
): GalleryTimeSection[] {
    if (displayItems.length === 0) {
        return [];
    }

    if (groupSummaries.length === 0) {
        return buildGalleryTimeSections(displayItems, 'decade');
    }

    const sectionOrderById = buildTimelineGroupSectionOrder(groupSummaries);
    const itemsByGroupId = collectItemsByTimelineGroup(displayItems);
    const summarySections = buildSummaryTimelineSections(groupSummaries, itemsByGroupId);

    if (itemsByGroupId.size === 0) {
        return summarySections;
    }

    const remainingSections = buildRemainingTimelineSections(itemsByGroupId, groupSummaries, sectionOrderById);

    return [...summarySections, ...remainingSections];
}
