import type { AssetGroupMembership } from '@contracts/core';

export type GroupIdPillModel = {
    key: string;
    label: string;
    title: string;
    symbol: string;
    background: string;
    borderColor: string;
    textColor: string;
};

function formatGroupIdSuffix(groupId: string) {
    return groupId.length <= 4 ? groupId : groupId.slice(-4);
}

function getGroupSymbol(groupType: string | null | undefined) {
    if (groupType == null) {return '#';}
    switch (groupType) {
        case 'duplicate':
            return '≡';
        case 'near_duplicate':
            return '≈';
        case 'variant_set':
            return '~';
        case 'burst':
            return '*';
        case 'people':
            return 'P';
    }

    return '#';
}

function hashGroupId(groupId: string) {
    let hash = 0;
    for (let index = 0; index < groupId.length; index += 1) {
        hash = ((hash << 5) - hash + groupId.charCodeAt(index)) | 0;
    }

    return Math.abs(hash);
}

function getGroupColorVisuals(groupId: string) {
    const hash = hashGroupId(groupId);
    const hue = hash % 360;
    const borderHue = (hue + 8) % 360;
    return {
        background: `hsla(${hue}, 72%, 32%, 0.9)`,
        borderColor: `hsla(${borderHue}, 84%, 72%, 0.7)`,
        textColor: 'hsl(210, 40%, 96%)',
    };
}

export function buildGroupIdPills(memberships: Array<Pick<AssetGroupMembership, 'group_id'> | null | undefined>) {
    const seen = new Set<string>();
    const pills: string[] = [];

    for (const membership of memberships) {
        const groupId = membership?.group_id;
        if (!groupId || seen.has(groupId)) {continue;}
        seen.add(groupId);
        pills.push(formatGroupIdSuffix(groupId));
    }

    return pills;
}

export function buildGroupIdPillModels(memberships: Array<AssetGroupMembership | null | undefined>): GroupIdPillModel[] {
    const seen = new Set<string>();
    const pills: GroupIdPillModel[] = [];

    for (const membership of memberships) {
        const groupId = membership?.group_id;
        if (!groupId || seen.has(groupId)) {continue;}
        seen.add(groupId);

        const visuals = getGroupColorVisuals(groupId);
        pills.push({
            key: groupId,
            label: formatGroupIdSuffix(groupId),
            title: membership?.group_type ? `${membership.group_type}: ${groupId}` : groupId,
            symbol: getGroupSymbol(membership?.group_type),
            ...visuals,
        });
    }

    return pills;
}
