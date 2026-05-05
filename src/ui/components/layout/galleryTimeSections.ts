import type { LibrarySelectableItem } from '@shared/utils/librarySelectionState';

export type GalleryTimeSectionMode = 'none' | 'decade';

export type GalleryTimeSection = {
    id: string;
    label: string | null;
    items: LibrarySelectableItem[];
}

function parseAssetYear(item: LibrarySelectableItem) {
    const timestamp = item.asset.photo_created_at ?? item.asset.created_at ?? null;
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
    let currentSection: GalleryTimeSection | null = null;
    let currentDecadeStart: number | null = null;

    for (const item of items) {
        const year = parseAssetYear(item);
        const decadeStart = year == null ? null : getDecadeStart(year);
        const isNewSection = currentSection === null || decadeStart !== currentDecadeStart;

        if (isNewSection) {
            currentDecadeStart = decadeStart;
            currentSection = {
                id: decadeStart == null ? `unknown-${sections.length}` : `decade-${decadeStart}`,
                label: decadeStart == null ? null : getDecadeLabel(decadeStart),
                items: [],
            };
            sections.push(currentSection);
        }

        const activeSection = currentSection;
        if (!activeSection) {continue;}
        activeSection.items.push(item);
    }

    return sections;
}
