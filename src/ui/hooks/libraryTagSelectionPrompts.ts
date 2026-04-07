import type { TagDefinitionSummary } from '@contracts/core';

type TagActionApi = {
    bulkAssignAssetTag: (payload: {
        assetIds: string[];
        tagDefinitionId?: string;
        tagLabel?: string;
        userId?: string | null;
    }) => Promise<void>;
    bulkRemoveAssetTag: (payload: {
        assetIds: string[];
        tagDefinitionId: string;
    }) => Promise<void>;
    listAvailableTags: () => Promise<TagDefinitionSummary[]>;
};

function promptForTagLabel(message: string) {
    return window.prompt(message, '')?.trim() ?? '';
}

export async function promptBulkTagSelection(actions: TagActionApi, assetIds: string[]) {
    if (assetIds.length === 0) {
        return;
    }

    const normalizedLabel = promptForTagLabel('Add canonical tag to selected photos:');
    if (!normalizedLabel) {
        return;
    }

    await actions.bulkAssignAssetTag({
        assetIds,
        tagLabel: normalizedLabel,
        userId: 'local-user',
    });
}

export async function promptBulkUntagSelection(actions: TagActionApi, assetIds: string[]) {
    if (assetIds.length === 0) {
        return;
    }

    const normalizedLabel = promptForTagLabel('Remove which canonical tag from the selected photos?');
    if (!normalizedLabel) {
        return;
    }

    const availableTags = await actions.listAvailableTags();
    const matchedTag = availableTags.find((tag) => tag.canonicalLabel.localeCompare(normalizedLabel, undefined, { sensitivity: 'base' }) === 0);
    if (!matchedTag) {
        window.alert(`No canonical tag named "${normalizedLabel}" exists yet.`);
        return;
    }

    await actions.bulkRemoveAssetTag({
        assetIds,
        tagDefinitionId: matchedTag.id,
    });
}
