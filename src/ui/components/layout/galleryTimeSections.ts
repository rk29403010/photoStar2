import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';

export type GalleryTimeSectionMode = 'none' | 'decade';

export type GalleryTimeSection = {
    id: string;
    label: string | null;
    items: LibrarySelectableItem[];
}

function parseAssetYear(item: LibrarySelectableItem) {
    const timestamp = item.asset.photo_created_at ?? null;
    if (!timestamp) {return null;}

    const year = new Date(timestamp).getUTCFullYear();
    return Number.isNaN(year) ? null : year;
}

function getDecadeStart(year: number) {
    return Math.floor(year / 10) * 10;
}

function getDecadeLabel(decadeStart: number) {
    return `${decadeStart}s`;
}

export function buildGalleryTimeSections(
    items: LibrarySelectableItem[],
    mode: GalleryTimeSectionMode,
): GalleryTimeSection[] {
    if (mode === 'none' || items.length === 0) {
        return [{ id: 'all-items', label: null, items }];
    }

    const sections: GalleryTimeSection[] = [];
    const sectionsById = new Map<string, GalleryTimeSection>();

    for (const item of items) {
        const year = parseAssetYear(item);
        const decadeStart = year == null ? null : getDecadeStart(year);
        const sectionId = decadeStart == null ? 'unknown-date' : `decade-${decadeStart}`;
        let section = sectionsById.get(sectionId);

        if (!section) {
            section = {
                id: sectionId,
                label: decadeStart == null ? null : getDecadeLabel(decadeStart),
                items: [],
            };
            sectionsById.set(sectionId, section);
            sections.push(section);
        }

        section.items.push(item);
    }

    return sections;
}
