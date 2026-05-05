import type { Asset, SimilarityOrbitItem } from '@contracts/core';

export type VariantMemberActions = {
    selectMember: () => void;
    openGroup?: () => void;
}

export const FILLED_STAR_SYMBOL = '⭐';

type BuildVariantMemberActionsParams = {
    item: SimilarityOrbitItem;
    onSelectAsset: (assetId: string) => void;
    onOpenGroup: (groupId: string) => void;
}

export function getVariantTileTitle(isStarImage: boolean): string {
    return isStarImage ? 'Current star image' : 'View this similar photo';
}

export function getStarActionTitle(): string {
    return 'Make this the star image';
}

export function getVariantStarDisplayState(params: {
    isStarred: boolean;
    isHovered: boolean;
}): 'filled' | 'hidden' {
    if (params.isStarred) {
        return 'filled';
    }

    return 'hidden';
}

export function isVariantStarred(member: Asset): boolean {
    const memberWithRole = member as Asset & { role?: string | null };
    return member.group_role === 'canonical' || memberWithRole.role === 'canonical';
}

export function shouldShowVariantFilmstrip(params: {
    groupId: string | null | undefined;
    hasOrbitLoader: boolean;
}): boolean {
    return Boolean(params.groupId && params.hasOrbitLoader);
}

export function buildVariantMemberActions({
    item,
    onSelectAsset,
    onOpenGroup,
}: BuildVariantMemberActionsParams): VariantMemberActions {
    return {
        selectMember: () => {
            onSelectAsset(item.asset.id);
        },
        openGroup: item.kind === 'group'
            ? () => {
                onSelectAsset(item.asset.id);
                onOpenGroup(item.group_id);
            }
            : undefined,
    };
}

export function isOrbitItemSelected(item: SimilarityOrbitItem, selectedAsset: Asset): boolean {
    if (item.asset.id === selectedAsset.id) {
        return true;
    }

    if (item.kind === 'asset') {
        return false;
    }

    return Boolean(
        selectedAsset.group_id === item.group_id
        || selectedAsset.group_memberships?.some((membership) => membership.group_id === item.group_id),
    );
}
