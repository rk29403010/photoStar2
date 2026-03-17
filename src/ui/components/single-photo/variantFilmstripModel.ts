import type { Asset } from '@contracts/core';

export interface VariantMemberActions {
    selectMember: () => void;
}

export const FILLED_STAR_SYMBOL = '⭐';

interface BuildVariantMemberActionsParams {
    memberId: string;
    onSelectAsset: (assetId: string) => void;
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

export function normalizeOrbitMembers(groupId: string, members: Asset[]): Asset[] {
    return members.map((member) => {
        const memberWithRole = member as Asset & { role?: string | null };
        return {
            ...member,
            group_id: member.group_id ?? groupId,
            group_role: member.group_role ?? memberWithRole.role ?? null,
        };
    });
}

export function shouldShowVariantFilmstrip(params: {
    groupId: string | null | undefined;
    hasOrbitLoader: boolean;
}): boolean {
    return Boolean(params.groupId && params.hasOrbitLoader);
}

export function buildVariantMemberActions({
    memberId,
    onSelectAsset,
}: BuildVariantMemberActionsParams): VariantMemberActions {
    return {
        selectMember: () => {
            onSelectAsset(memberId);
        }
    };
}
