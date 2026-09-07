import type { LibraryPresentationItem, LibraryPresentationRelationshipKind } from '@contracts/libraryPresentation';

export type GroupIdPillModel = {
    key: string;
    label: string;
    title: string;
    symbol: string;
    background: string;
    borderColor: string;
    textColor: string;
};

function formatPresentationKeySuffix(presentationKey: string) {
    return presentationKey.length <= 4 ? presentationKey : presentationKey.slice(-4);
}

function getRelationshipSymbol(kind: LibraryPresentationRelationshipKind) {
    switch (kind) {
        case 'exact_copy':
            return '≡';
        case 'near_duplicate':
            return '≈';
        case 'variant':
            return '~';
        case 'capture_sequence':
            return '*';
        case 'edit_lineage':
            return '↗';
        case null:
            return '#';
    }
}

function hashPresentationKey(presentationKey: string) {
    let hash = 0;
    for (let index = 0; index < presentationKey.length; index += 1) {
        hash = ((hash << 5) - hash + presentationKey.charCodeAt(index)) | 0;
    }

    return Math.abs(hash);
}

function getPresentationColorVisuals(presentationKey: string) {
    const hash = hashPresentationKey(presentationKey);
    const hue = hash % 360;
    const borderHue = (hue + 8) % 360;
    return {
        background: `hsla(${hue}, 72%, 32%, 0.9)`,
        borderColor: `hsla(${borderHue}, 84%, 72%, 0.7)`,
        textColor: 'hsl(210, 40%, 96%)',
    };
}

export function buildGroupIdPills(items: Array<Pick<LibraryPresentationItem, 'presentationKey'> | null | undefined>) {
    const seen = new Set<string>();
    const pills: string[] = [];

    for (const item of items) {
        const presentationKey = item?.presentationKey;
        if (!presentationKey || seen.has(presentationKey)) {continue;}
        seen.add(presentationKey);
        pills.push(formatPresentationKeySuffix(presentationKey));
    }

    return pills;
}

export function buildGroupIdPillModels(items: Array<LibraryPresentationItem | null | undefined>): GroupIdPillModel[] {
    const seen = new Set<string>();
    const pills: GroupIdPillModel[] = [];

    for (const item of items) {
        const presentationKey = item?.presentationKey;
        if (!presentationKey || seen.has(presentationKey)) {continue;}
        seen.add(presentationKey);

        const visuals = getPresentationColorVisuals(presentationKey);
        const kindLabel = item.relationshipKind?.replaceAll('_', ' ');
        pills.push({
            key: presentationKey,
            label: formatPresentationKeySuffix(presentationKey),
            title: kindLabel ? `${kindLabel}: ${presentationKey}` : presentationKey,
            symbol: getRelationshipSymbol(item.relationshipKind),
            ...visuals,
        });
    }

    return pills;
}
