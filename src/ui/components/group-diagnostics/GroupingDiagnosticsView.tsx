import { useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { GroupDiagnosticsReport } from '@contracts/groupDiagnostics';
import { filterDiagnosticsGroups, type GroupDiagnosticsFilterMode } from './groupDiagnosticsViewModel';
import {
    type CopyTarget,
    GroupDiagnosticsRow,
} from './groupDiagnosticsView.parts';
import { DiagnosticsSummaryCards, DiagnosticsToolbar, EmptyDiagnosticsState } from './groupDiagnosticsView.chrome';
import { useCopyReset } from './groupDiagnosticsView.hooks';

interface GroupingDiagnosticsViewProps {
    report: GroupDiagnosticsReport | null;
    loading: boolean;
    onRefresh: () => void;
    onAssetClick?: (id: string) => void;
}

function useCopyState() {
    const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
    const [copyingTarget, setCopyingTarget] = useState<CopyTarget | null>(null);

    useCopyReset(copiedTarget, setCopiedTarget);

    const copyValue = async (target: CopyTarget, value: string) => {
        try {
            setCopyingTarget(target);
            await navigator.clipboard.writeText(value);
            setCopiedTarget(target);
        } catch (error) {
            console.warn('Failed to copy diagnostics value', error);
        } finally {
            setCopyingTarget(null);
        }
    };

    return { copiedTarget, copyingTarget, copyValue };
}

function useGroupNavigation(
    setFilterMode: (mode: GroupDiagnosticsFilterMode) => void,
    setExpandedGroupIds: Dispatch<SetStateAction<Set<string>>>,
) {
    const groupElementsRef = useRef(new Map<string, HTMLDivElement | null>());

    const jumpToGroup = (groupId: string) => {
        setFilterMode('all');
        setExpandedGroupIds((current) => new Set(current).add(groupId));
        window.setTimeout(() => {
            groupElementsRef.current.get(groupId)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }, 0);
    };

    const registerGroupElement = (groupId: string, element: HTMLDivElement | null) => {
        groupElementsRef.current.set(groupId, element);
    };

    return { jumpToGroup, registerGroupElement };
}

export function GroupingDiagnosticsView(props: GroupingDiagnosticsViewProps) {
    const [filterMode, setFilterMode] = useState<GroupDiagnosticsFilterMode>('suspicious');
    const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
    const visibleGroups = useMemo(() => (
        props.report ? filterDiagnosticsGroups(props.report.groups, filterMode) : []
    ), [filterMode, props.report]);
    const { copiedTarget, copyingTarget, copyValue } = useCopyState();
    const { jumpToGroup, registerGroupElement } = useGroupNavigation(setFilterMode, setExpandedGroupIds);

    if (props.loading) {
        return <div style={{ flex: 1, padding: 24, color: '#cbd5e1' }}>Loading grouping diagnostics...</div>;
    }

    if (!props.report) {
        return <EmptyDiagnosticsState onRefresh={props.onRefresh} />;
    }

    return (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#020617', color: '#e2e8f0', padding: 20 }}>
            <DiagnosticsToolbar filterMode={filterMode} onRefresh={props.onRefresh} setFilterMode={setFilterMode} />
            <DiagnosticsSummaryCards report={props.report} />

            <div style={{ display: 'grid', gap: 10 }}>
                {visibleGroups.map((group) => (
                    <GroupDiagnosticsRow
                        key={group.groupId}
                        copiedTarget={copiedTarget}
                        copyingTarget={copyingTarget}
                        expanded={expandedGroupIds.has(group.groupId)}
                        group={group}
                        onAssetClick={props.onAssetClick}
                        onCopy={copyValue}
                        onJumpToGroup={jumpToGroup}
                        onToggle={() => {
                            setExpandedGroupIds((current) => {
                                const next = new Set(current);
                                if (next.has(group.groupId)) {
                                    next.delete(group.groupId);
                                } else {
                                    next.add(group.groupId);
                                }
                                return next;
                            });
                        }}
                        registerGroupElement={registerGroupElement}
                    />
                ))}
            </div>
        </div>
    );
}
