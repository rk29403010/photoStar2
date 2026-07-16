import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { buildJustifiedLayoutRows } from '@shared/utils/libraryJustifiedLayout';
import type { TimelineJumpRequest } from '../library/libraryTimelineJump';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { isItemSelected, type LibrarySelectableItem, type LibrarySelectionState } from '@shared/utils/librarySelectionState';

type GroupedTimelineLayoutProps = {
    readonly sections: Array<{
        id: string;
        label: string | null;
        items: Array<{
            id: string;
            index: number;
            width?: number;
            height?: number;
            selectableItem?: LibrarySelectableItem;
        }>;
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
    readonly librarySelection?: LibrarySelectionState;
    readonly onLibrarySelectionChange?: (selection: LibrarySelectionState) => void;
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
            setContainerWidth(element.getBoundingClientRect().width);
        };

        const observer = new ResizeObserver(updateWidth);
        observer.observe(element);
        updateWidth();

        return () => observer.disconnect();
    }, []);

    return { containerRef, containerWidth };
}

function useCustomScrollParent(scrollContainerRef?: RefObject<HTMLDivElement | null>) {
    const [customScrollParent, setCustomScrollParent] = useState<HTMLDivElement | undefined>();

    useEffect(() => {
        if (scrollContainerRef) {
            setCustomScrollParent(scrollContainerRef.current ?? undefined);
        }
    }, [scrollContainerRef]);

    return customScrollParent;
}

function buildTimelineLayoutGroups(
    sections: GroupedTimelineLayoutProps['sections'],
    options: Parameters<typeof buildJustifiedLayoutRows>[1],
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

function calculateSectionSelectionState(
    validItems: Array<{ selectableItem?: LibrarySelectableItem }>,
    librarySelection: LibrarySelectionState | undefined
) {
    if (!librarySelection || validItems.length === 0) {
        return { allSelected: false, someSelected: false };
    }
    const selectedCount = validItems.filter(item => item.selectableItem && isItemSelected(librarySelection, item.selectableItem)).length;
    return {
        allSelected: selectedCount === validItems.length,
        someSelected: selectedCount > 0 && selectedCount < validItems.length
    };
}

function toggleSectionSelection(
    validItems: Array<{ selectableItem?: LibrarySelectableItem }>,
    librarySelection: LibrarySelectionState,
    onLibrarySelectionChange: (selection: LibrarySelectionState) => void,
    allSelected: boolean
) {
    const nextSelection = {
        photoIds: new Set(librarySelection.photoIds),
        groupIds: new Set(librarySelection.groupIds),
        anchorKey: librarySelection.anchorKey,
        mostRecentSelectionKey: librarySelection.mostRecentSelectionKey,
    };

    validItems.forEach(item => {
        if (!item.selectableItem) {return;}
        const key = item.selectableItem.entityType === 'group' && item.selectableItem.groupId ? 'groupIds' : 'photoIds';
        const val = item.selectableItem.entityType === 'group' && item.selectableItem.groupId ? item.selectableItem.groupId : item.selectableItem.photoId;
        if (allSelected) {
            nextSelection[key].delete(val);
        } else {
            nextSelection[key].add(val);
        }
    });

    onLibrarySelectionChange(nextSelection);
}

const DecadeHeaderLabel: React.FC<{ label: string }> = ({ label }) => (
    <div className="text-sm font-bold tracking-wider uppercase text-content-secondary flex items-baseline gap-0.5">
        <span>{label.slice(0, -1)}</span>
        <span className="text-xs tracking-normal">{label.slice(-1)}</span>
    </div>
);

const DecadeHeaderCheckbox: React.FC<{
    hasSelection: boolean;
    allSelected: boolean;
    someSelected: boolean;
    onClick: () => void;
}> = ({ hasSelection, allSelected, someSelected, onClick }) => {
    let checkboxClass = 'bg-black/20 hover:bg-black/40 text-transparent border-content/25 hover:border-content/50 scale-95 hover:scale-100';
    if (allSelected) {
        checkboxClass = 'bg-brand-accent text-white border-brand-accent scale-100';
    } else if (someSelected) {
        checkboxClass = 'bg-brand-accent/25 text-brand-accent border-brand-accent scale-100';
    }

    return (
        <div
            onClick={onClick}
            className={`w-5 h-5 rounded flex items-center justify-center cursor-pointer border motion-safe:transition-all motion-safe:duration-150 ${
                hasSelection ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100'
            } ${checkboxClass}`}
        >
            {allSelected && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            )}
            {someSelected && (
                <div className="w-2.5 h-0.5 bg-brand-accent rounded-sm" />
            )}
        </div>
    );
};

function renderGroupHeader(
    group: TimelineLayoutGroup | undefined,
    section: GroupedTimelineLayoutProps['sections'][number] | undefined,
    librarySelection: LibrarySelectionState | undefined,
    onLibrarySelectionChange: ((selection: LibrarySelectionState) => void) | undefined,
) {
    if (!group?.label) {
        return <div className="w-full min-h-11" />;
    }

    const hasSelection = librarySelection ? (librarySelection.photoIds.size > 0 || librarySelection.groupIds.size > 0) : false;
    const sectionItems = section?.items ?? [];
    const validItems = sectionItems.filter(item => item.selectableItem);
    const { allSelected, someSelected } = calculateSectionSelectionState(validItems, librarySelection);

    return (
        <div
            data-time-section-id={group.id}
            className="w-full max-w-screen-2xl min-h-11 mx-auto pt-4 pb-2 px-0 box-border bg-surface border-b border-content/5 flex items-center justify-between group/header"
        >
            <DecadeHeaderLabel label={group.label} />
            {validItems.length > 0 && (
                <DecadeHeaderCheckbox
                    hasSelection={hasSelection}
                    allSelected={allSelected}
                    someSelected={someSelected}
                    onClick={() => {
                        if (!librarySelection || !onLibrarySelectionChange) {return;}
                        toggleSectionSelection(validItems, librarySelection, onLibrarySelectionChange, allSelected);
                    }}
                />
            )}
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

type GroupedTimelineItem =
    | { type: 'header'; id: string; group: TimelineLayoutGroup; groupIndex: number }
    | { type: 'row'; id: string; row: TimelineLayoutRow; groupIndex: number };

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

function useTimelineJumpHandler(
    timelineJumpRequest: TimelineJumpRequest | null | undefined,
    virtualItems: GroupedTimelineItem[],
    virtuosoRef: RefObject<VirtuosoHandle | null>,
    onVisibleGroupChangeRef: RefObject<((groupId: string | null, groupIndex: number | null) => void) | undefined>,
    onTopVisibleSelectionKeyChangeRef: RefObject<((selectionKey: string | null) => void) | undefined>
) {
    const lastAppliedTimelineJumpNonceRef = useRef<number | null>(null);

    useEffect(() => {
        if (!timelineJumpRequest) {return;}
        if (lastAppliedTimelineJumpNonceRef.current === timelineJumpRequest.nonce) {return;}

        const req = timelineJumpRequest;
        const targetIndex = virtualItems.findIndex((item) => {
            if (item.type !== 'header') {return false;}
            if (req.groupIndex != null) {
                return item.groupIndex === req.groupIndex;
            }
            return item.group.id === req.groupId;
        });

        if (targetIndex !== -1) {
            lastAppliedTimelineJumpNonceRef.current = req.nonce;
            virtuosoRef.current?.scrollToIndex({
                index: targetIndex,
                align: 'start',
                behavior: 'auto',
            });
            const headerItem = virtualItems[targetIndex];
            if (headerItem && headerItem.type === 'header') {
                onVisibleGroupChangeRef.current?.(headerItem.group.id, headerItem.groupIndex);
                onTopVisibleSelectionKeyChangeRef.current?.(headerItem.group.firstSelectionKey ?? null);
            }
        }
    }, [timelineJumpRequest, virtualItems, virtuosoRef, onVisibleGroupChangeRef, onTopVisibleSelectionKeyChangeRef]);
}

function useTimelineRangeChangedHandler(
    virtualItems: GroupedTimelineItem[],
    groups: TimelineLayoutGroup[],
    onVisibleGroupChangeRef: RefObject<((groupId: string | null, groupIndex: number | null) => void) | undefined>,
    onTopVisibleSelectionKeyChangeRef: RefObject<((selectionKey: string | null) => void) | undefined>
) {
    return useCallback(({ startIndex }: { startIndex: number }) => {
        const item = virtualItems[startIndex];
        if (!item) {return;}

        const groupIndex = item.groupIndex;
        const group = groups[groupIndex];
        if (!group) {return;}

        onVisibleGroupChangeRef.current?.(group.id, groupIndex);

        if (item.type === 'row') {
            onTopVisibleSelectionKeyChangeRef.current?.(item.row.firstSelectionKey ?? group.firstSelectionKey ?? null);
        } else {
            onTopVisibleSelectionKeyChangeRef.current?.(group.firstSelectionKey ?? null);
        }
    }, [virtualItems, groups, onVisibleGroupChangeRef, onTopVisibleSelectionKeyChangeRef]);
}

export function GroupedTimelineLayout(props: GroupedTimelineLayoutProps) {
    const {
        containerRef,
        customScrollParent,
        groups,
        rowsByGroup,
    } = useTimelineLayoutData(props);

    const {
        timelineJumpRequest,
        onVisibleGroupChange,
        onTopVisibleSelectionKeyChange,
        scrollContainerRef,
    } = props;

    const onVisibleGroupChangeRef = useRef(onVisibleGroupChange);
    useEffect(() => {
        onVisibleGroupChangeRef.current = onVisibleGroupChange;
    }, [onVisibleGroupChange]);

    const onTopVisibleSelectionKeyChangeRef = useRef(onTopVisibleSelectionKeyChange);
    useEffect(() => {
        onTopVisibleSelectionKeyChangeRef.current = onTopVisibleSelectionKeyChange;
    }, [onTopVisibleSelectionKeyChange]);

    const virtuosoRef = useRef<VirtuosoHandle | null>(null);

    const virtualItems = useMemo<GroupedTimelineItem[]>(() => {
        const items: GroupedTimelineItem[] = [];
        groups.forEach((group, groupIndex) => {
            items.push({
                type: 'header',
                id: `header-${group.id}`,
                group,
                groupIndex,
            });
            const rows = rowsByGroup[groupIndex] ?? [];
            rows.forEach((row) => {
                items.push({
                    type: 'row',
                    id: row.rowKey,
                    row,
                    groupIndex,
                });
            });
        });
        return items;
    }, [groups, rowsByGroup]);

    useTimelineJumpHandler(
        timelineJumpRequest,
        virtualItems,
        virtuosoRef,
        onVisibleGroupChangeRef,
        onTopVisibleSelectionKeyChangeRef
    );

    const handleRangeChanged = useTimelineRangeChangedHandler(
        virtualItems,
        groups,
        onVisibleGroupChangeRef,
        onTopVisibleSelectionKeyChangeRef
    );

    if (scrollContainerRef && !customScrollParent) {
        return <div ref={containerRef} className="w-full" />;
    }

    return (
        <div ref={containerRef} className="w-full box-border">
            <Virtuoso
                ref={virtuosoRef}
                customScrollParent={customScrollParent}
                data={virtualItems}
                computeItemKey={(_index, item) => item.id}
                rangeChanged={handleRangeChanged}
                useWindowScroll={!customScrollParent}
                itemContent={(_index, item) => {
                    if (item.type === 'header') {
                        return renderGroupHeader(item.group, props.sections[item.groupIndex], props.librarySelection, props.onLibrarySelectionChange);
                    } else {
                        return renderTimelineRow(item.row, props);
                    }
                }}
            />
        </div>
    );
}
