import type { GroupDiagnosticsGroupRow } from '@contracts/groupDiagnostics';

export type GroupDiagnosticsFilterMode = 'suspicious' | 'all';

export function filterDiagnosticsGroups<T extends Pick<GroupDiagnosticsGroupRow, 'groupId' | 'flags'>>(
    groups: T[],
    mode: GroupDiagnosticsFilterMode,
) {
    if (mode === 'all') {return groups;}
    return groups.filter((group) => group.flags.length > 0);
}
