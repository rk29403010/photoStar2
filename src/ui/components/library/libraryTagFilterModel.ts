import type { Asset } from '@contracts/core';

function getAssetTags(asset: Asset) {
    return asset.photo_metadata?.projection.keywords ?? [];
}

function getTagKey(tag: string) {
    return tag.trim().toLocaleLowerCase();
}

export function getAvailableTags(assets: Asset[], selectedTag: string) {
    const tagsByKey = new Map<string, string>();
    for (const asset of assets) {
        for (const tag of getAssetTags(asset)) {
            const trimmedTag = tag.trim();
            if (trimmedTag) {
                const key = getTagKey(trimmedTag);
                if (!tagsByKey.has(key)) {
                    tagsByKey.set(key, trimmedTag);
                }
            }
        }
    }

    const trimmedSelectedTag = selectedTag.trim();
    if (trimmedSelectedTag) {
        const key = getTagKey(trimmedSelectedTag);
        if (!tagsByKey.has(key)) {
            tagsByKey.set(key, trimmedSelectedTag);
        }
    }

    return Array.from(tagsByKey.values()).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

export function getSelectedTag(availableTags: string[], rawSelectedTag: string) {
    if (!rawSelectedTag) {
        return '';
    }
    return availableTags.find((tag) => getTagKey(tag) === getTagKey(rawSelectedTag)) ?? rawSelectedTag;
}
