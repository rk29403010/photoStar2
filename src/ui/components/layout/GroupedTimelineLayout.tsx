import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { buildJustifiedLayoutRows } from '@shared/utils/libraryJustifiedLayout';
import type { TimelineJumpRequest } from '../library/libraryTimelineJump';
import {
    getTopVisibleSelectionKeyFromScrollContainer,
    getTopVisibleTimelineGroupIdFromScrollContainer,
} from '../library/libraryVisibleSelectionKey';

const GROUP_HEADER_HEIGHT_PX = 46;

type GroupedTimelineLayoutProps = {
    readonly sections: Array<{
        id: string;
        label: string | null;
        items: Array<{ id: string; index: number; width?: number; height?: number }>;
    }>;
    readonly scrollContainerRef?: RefObject<HTMLDivElement | null>;
    readonly gap?: number;
    readonly rowGap?: number;
    readonly targetRowHeight?: number;
    readonly maxRowHeight?: number;
    readonly onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    readonly onVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
    readonly timelineJumpRequest?: TimelineJumpRequest | null;
    readonly renderTile: (index: number, size: { width: number; height: number }) => ReactNode;
}

type TimelineLayoutGroup = {
    id: string;
    label: string | null;
    firstSelectionKey: string | null;
    rows: ReturnType<typeof buildJustifiedLayoutRows>;
}

type TimelineLayoutRow = {
    firstSelectionKey: string | null;
    groupIndex: number;
    row: TimelineLayoutGroup['rows'][number];
    rowKey: string;
}

function useContainerWidth() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        const element = containerRef.current;
        if (!element) {return;}

        const updateWidth = () => {
            setContainerWidth(Math.max(0, Math.floor(element.clientWidth)));
        };

        updateWidth();
        const observer = new ResizeObserver(() => updateWidth());
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return { containerRef, containerWidth };
}

function useCustomScrollParent(scrollContainerRef?: RefObject<HTMLDivElement | null>) {
    const [customScrollParent, setCustomScrollParent] = useState<HTMLDivElement | undefined>();

    useEffect(() => {
        let animationFrameId: number | null = null;

        const syncScrollParent = () => {
            const nextScrollParent = scrollContainerRef?.current ?? undefined;
            setCustomScrollParent((currentScrollParent) => (
                currentScrollParent === nextScrollParent ? currentScrollParent : nextScrollParent
            ));
            if (scrollContainerRef && !nextScrollParent) {
                animationFrameId = globalThis.requestAnimationFrame(syncScrollParent);
            }
        };

        syncScrollParent();

        return () => {
            if (animationFrameId != null) {
                globalThis.cancelAnimationFrame(animationFrameId);
            }
        };
    }, [scrollContainerRef]);

    return customScrollParent;
}

function buildTimelineLayoutGroups(
    sections: GroupedTimelineLayoutProps['sections'],
    options: Pick<GroupedTimelineLayoutProps, 'gap' | 'maxRowHeight' | 'targetRowHeight'> & { containerWidth: number },
) {
    return sections.map((section) => ({
        id: section.id,
        label: section.label,
        firstSelectionKey: section.items[0]?.id ?? null,
        rows: buildJustifiedLayoutRows(section.items, options),
    }));
}

function buildTimelineLayoutRows(groups: TimelineLayoutGroup[]) {
    return groups.flatMap((group, groupIndex) => (
        group.rows.map((row, rowIndex) => ({
            firstSelectionKey: row.items[0]?.id ?? group.firstSelectionKey ?? null,
            groupIndex,
            row,
            rowKey: `${group.id}-row-${rowIndex}`,
        }))
    ));
}

function renderGroupHeader(group: TimelineLayoutGroup | undefined) {
    if (!group?.label) {
        return <div style={{ width: '100%', minHeight: GROUP_HEADER_HEIGHT_PX }} />;
    }

    return (
        <div
            data-time-section-id={group.id}
            style={{
                width: '100%',
                maxWidth: '1800px',
                minHeight: GROUP_HEADER_HEIGHT_PX,
                margin: '0 auto',
                padding: '18px 0 8px',
                boxSizing: 'border-box',
                background: '#0a0a0a',
            }}
        >
            <div style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
                <span>{group.label.slice(0, -1)}</span>
                <span style={{ fontSize: '0.72em', letterSpacing: '0.02em' }}>{group.label.slice(-1)}</span>
            </div>
        </div>
    );
}

function renderTimelineRow(
    row: TimelineLayoutRow,
    props: Pick<GroupedTimelineLayoutProps, 'gap' | 'rowGap' | 'renderTile'>,
) {
    return (
        <div
            key={row.rowKey}
            style={{
                display: 'flex',
                justifyContent: 'flex-start',
                gap: row.row.gap ?? props.gap ?? 2,
                height: row.row.height,
                width: row.row.width,
                maxWidth: '1800px',
                margin: '0 auto 0 0',
                marginBottom: props.rowGap ?? 0,
                boxSizing: 'border-box',
            }}
        >
            {row.row.items.map((item) => props.renderTile(item.index, { width: item.width, height: item.height }))}
        </div>
    );
}

function resolveTimelineJumpGroup(
    timelineJumpRequest: TimelineJumpRequest,
    groupIndexById: Map<string, number>,
    groups: TimelineLayoutGroup[],
) {
    const groupIndex = timelineJumpRequest.groupIndex ?? groupIndexById.get(timelineJumpRequest.groupId);
    if (groupIndex == null) {
        return null;
    }
    const group = groups[groupIndex] ?? null;
    if (!group || group.rows.length <= 0) {
        return null;
    }
    return { group, groupIndex };
}

function scrollTimelineHeaderIntoView(params: {
    containerRef: RefObject<HTMLDivElement | null>;
    customScrollParent?: HTMLDivElement;
    groupId: string;
}) {
    const targetHeader = params.containerRef.current?.querySelector<HTMLElement>(`[data-time-section-id="${params.groupId}"]`);
    if (!targetHeader) {
        return false;
    }

    if (params.customScrollParent) {
        const nextTop = params.customScrollParent.scrollTop
            + targetHeader.getBoundingClientRect().top
            - params.customScrollParent.getBoundingClientRect().top;
        params.customScrollParent.scrollTo({ top: nextTop, behavior: 'auto' });
        return true;
    }

    targetHeader.scrollIntoView({ block: 'start', behavior: 'auto' });
    return true;
}

function useTimelineJumpScroller(params: {
    containerRef: RefObject<HTMLDivElement | null>;
    customScrollParent?: HTMLDivElement;
    groups: TimelineLayoutGroup[];
    groupIndexById: Map<string, number>;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    onVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
    timelineJumpRequest?: TimelineJumpRequest | null;
}) {
    const {
        containerRef,
        customScrollParent,
        groupIndexById,
        groups,
        onTopVisibleSelectionKeyChange,
        onVisibleGroupChange,
        timelineJumpRequest,
    } = params;
    const lastAppliedTimelineJumpNonceRef = useRef<number | null>(null);

    useEffect(() => {
        if (!timelineJumpRequest) {return;}
        if (lastAppliedTimelineJumpNonceRef.current === timelineJumpRequest.nonce) {return;}

        const resolvedGroup = resolveTimelineJumpGroup(timelineJumpRequest, groupIndexById, groups);
        if (!resolvedGroup) {return;}
        if (!scrollTimelineHeaderIntoView({
            containerRef,
            customScrollParent,
            groupId: timelineJumpRequest.groupId,
        })) {return;}

        lastAppliedTimelineJumpNonceRef.current = timelineJumpRequest.nonce;
        onVisibleGroupChange?.(resolvedGroup.group.id, resolvedGroup.groupIndex);
        onTopVisibleSelectionKeyChange?.(resolvedGroup.group.firstSelectionKey ?? null);
    }, [
        containerRef,
        customScrollParent,
        groupIndexById,
        groups,
        onTopVisibleSelectionKeyChange,
        onVisibleGroupChange,
        timelineJumpRequest,
    ]);
}

function syncVisibleStateFromDom(params: {
    customScrollParent?: HTMLDivElement;
    groupIndexById: Map<string, number>;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    onVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
}) {
    if (!params.customScrollParent) {
        return false;
    }

    const visibleGroupId = getTopVisibleTimelineGroupIdFromScrollContainer(params.customScrollParent);
    const visibleSelectionKey = getTopVisibleSelectionKeyFromScrollContainer(params.customScrollParent);
    if (!visibleGroupId && !visibleSelectionKey) {
        return false;
    }

    const groupIndex = visibleGroupId == null ? null : (params.groupIndexById.get(visibleGroupId) ?? null);
    params.onVisibleGroupChange?.(visibleGroupId, groupIndex);
    params.onTopVisibleSelectionKeyChange?.(visibleSelectionKey);
    return true;
}

function shouldSkipInitialTimelineVisibleState(params: {
    customScrollParent?: HTMLDivElement;
    groupIndexById: Map<string, number>;
    groups: TimelineLayoutGroup[];
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    onVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
}) {
    if (params.groups.length === 0) {
        return true;
    }
    if (syncVisibleStateFromDom(params)) {
        return true;
    }
    return (params.customScrollParent?.scrollTop ?? 0) > 1;
}

function applyFirstTimelineGroupVisibleState(params: {
    groups: TimelineLayoutGroup[];
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    onVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
}) {
    const firstGroup = params.groups[0] ?? null;
    const firstGroupIndex = firstGroup ? 0 : null;
    params.onVisibleGroupChange?.(firstGroup?.id ?? null, firstGroupIndex);
    params.onTopVisibleSelectionKeyChange?.(firstGroup?.firstSelectionKey ?? null);
}

function syncInitialTimelineVisibleState(params: {
    customScrollParent?: HTMLDivElement;
    groupIndexById: Map<string, number>;
    groups: TimelineLayoutGroup[];
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    onVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
}) {
    if (shouldSkipInitialTimelineVisibleState(params)) {
        return;
    }
    applyFirstTimelineGroupVisibleState(params);
}

function useTimelineLayoutData(props: GroupedTimelineLayoutProps) {
    const { containerRef, containerWidth } = useContainerWidth();
    const customScrollParent = useCustomScrollParent(props.scrollContainerRef);
    const groups = useMemo<TimelineLayoutGroup[]>(() => {
        if (containerWidth <= 0) {return [];}

        return buildTimelineLayoutGroups(props.sections, {
            containerWidth: Math.max(1, containerWidth),
            gap: props.gap,
            targetRowHeight: props.targetRowHeight,
            maxRowHeight: props.maxRowHeight,
        });
    }, [containerWidth, props.gap, props.maxRowHeight, props.sections, props.targetRowHeight]);
    const rowsByGroup = useMemo(
        () => groups.map((group, groupIndex) => buildTimelineLayoutRows([{ ...group, rows: group.rows }]).map((row) => ({
            ...row,
            groupIndex,
        }))),
        [groups],
    );
    const groupIndexById = useMemo(
        () => new Map(groups.map((group, groupIndex) => [group.id, groupIndex] as const)),
        [groups],
    );

    return {
        containerRef,
        customScrollParent,
        groups,
        rowsByGroup,
        groupIndexById,
    };
}

function useInitialTimelineVisibleState(params: {
    customScrollParent?: HTMLDivElement;
    groupIndexById: Map<string, number>;
    groups: TimelineLayoutGroup[];
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    onVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
}) {
    const {
        customScrollParent,
        groupIndexById,
        groups,
        onTopVisibleSelectionKeyChange,
        onVisibleGroupChange,
    } = params;

    useEffect(() => {
        syncInitialTimelineVisibleState({
            customScrollParent,
            groupIndexById,
            groups,
            onTopVisibleSelectionKeyChange,
            onVisibleGroupChange,
        });
    }, [
        customScrollParent,
        groupIndexById,
        groups,
        onTopVisibleSelectionKeyChange,
        onVisibleGroupChange,
    ]);
}

function useTimelineVisibleStateOnScroll(params: {
    customScrollParent?: HTMLDivElement;
    groupIndexById: Map<string, number>;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    onVisibleGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
}) {
    const {
        customScrollParent,
        groupIndexById,
        onTopVisibleSelectionKeyChange,
        onVisibleGroupChange,
    } = params;

    useEffect(() => {
        if (!customScrollParent) {
            return;
        }

        let animationFrameId: number | null = null;
        const syncVisibleState = () => {
            animationFrameId = null;
            syncVisibleStateFromDom({
                customScrollParent,
                groupIndexById,
                onTopVisibleSelectionKeyChange,
                onVisibleGroupChange,
            });
        };
        const scheduleVisibleStateSync = () => {
            if (animationFrameId != null) {return;}
            animationFrameId = globalThis.requestAnimationFrame(syncVisibleState);
        };

        customScrollParent.addEventListener('scroll', scheduleVisibleStateSync, { passive: true });
        scheduleVisibleStateSync();

        return () => {
            customScrollParent.removeEventListener('scroll', scheduleVisibleStateSync);
            if (animationFrameId != null) {
                globalThis.cancelAnimationFrame(animationFrameId);
            }
        };
    }, [
        customScrollParent,
        groupIndexById,
        onTopVisibleSelectionKeyChange,
        onVisibleGroupChange,
    ]);
}

export function GroupedTimelineLayout(props: GroupedTimelineLayoutProps) {
    const {
        containerRef,
        customScrollParent,
        groups,
        rowsByGroup,
        groupIndexById,
    } = useTimelineLayoutData(props);

    useTimelineJumpScroller({
        containerRef,
        customScrollParent,
        groups,
        groupIndexById,
        onTopVisibleSelectionKeyChange: props.onTopVisibleSelectionKeyChange,
        onVisibleGroupChange: props.onVisibleGroupChange,
        timelineJumpRequest: props.timelineJumpRequest,
    });
    useInitialTimelineVisibleState({
        customScrollParent,
        groupIndexById,
        groups,
        onTopVisibleSelectionKeyChange: props.onTopVisibleSelectionKeyChange,
        onVisibleGroupChange: props.onVisibleGroupChange,
    });
    useTimelineVisibleStateOnScroll({
        customScrollParent,
        groupIndexById,
        onTopVisibleSelectionKeyChange: props.onTopVisibleSelectionKeyChange,
        onVisibleGroupChange: props.onVisibleGroupChange,
    });

    if (props.scrollContainerRef && !customScrollParent) {
        return <div ref={containerRef} style={{ width: '100%' }} />;
    }

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', paddingBottom: '70vh', boxSizing: 'border-box' }}
        >
            {groups.map((group, groupIndex) => (
                <div key={group.id}>
                    {renderGroupHeader(group)}
                    {rowsByGroup[groupIndex]?.map((row) => renderTimelineRow(row, props))}
                </div>
            ))}
        </div>
    );
}
