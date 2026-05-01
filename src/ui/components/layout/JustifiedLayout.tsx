import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import type { TimelineJumpRequest } from '../library/libraryTimelineJump';
import { buildJustifiedLayoutRows } from '@shared/utils/libraryJustifiedLayout';

interface JustifiedLayoutProps {
    items?: Array<{ id: string; width?: number; height?: number }>;
    sections?: Array<{
        id: string;
        label: string | null;
        items: Array<{ id: string; index: number; width?: number; height?: number }>;
    }>;
    scrollContainerRef?: RefObject<HTMLDivElement | null>;
    gap?: number;
    rowGap?: number;
    targetRowHeight?: number;
    maxRowHeight?: number;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    onTopVisibleSectionIdChange?: (sectionId: string | null) => void;
    timelineJumpRequest?: TimelineJumpRequest | null;
    restoreSelectionKey?: string | null;
    renderTile: (index: number, size: { width: number; height: number }) => ReactNode;
}

type LayoutEntry =
    | { kind: 'header'; key: string; label: string; selectionKey: string | null }
    | { kind: 'row'; key: string; row: ReturnType<typeof buildJustifiedLayoutRows>[number]; selectionKey: string | null };

function getSectionIdFromEntryKey(entryKey: string) {
    return entryKey.endsWith('-header') ? entryKey.slice(0, -'-header'.length) : entryKey;
}

function getNormalizedSections(props: Pick<JustifiedLayoutProps, 'items' | 'sections'>) {
    return props.sections ?? [{
        id: 'all-items',
        label: null,
        items: (props.items ?? []).map((item, index) => ({ ...item, index })),
    }];
}

function buildLayoutEntries(
    sections: ReturnType<typeof getNormalizedSections>,
    options: Pick<JustifiedLayoutProps, 'gap' | 'maxRowHeight' | 'targetRowHeight'> & { containerWidth: number },
) {
    return sections.flatMap((section) => {
        const rows = buildJustifiedLayoutRows(section.items, options);
        const nextEntries: LayoutEntry[] = [];
        const firstSelectionKey = section.items[0]?.id ?? null;
        if (section.label && rows.length > 0) {
            nextEntries.push({
                kind: 'header',
                key: `${section.id}-header`,
                label: section.label,
                selectionKey: firstSelectionKey,
            });
        }

        rows.forEach((row, rowIndex) => {
            nextEntries.push({
                kind: 'row',
                key: `${section.id}-row-${rowIndex}`,
                row,
                selectionKey: row.items[0]?.id ?? firstSelectionKey,
            });
        });

        return nextEntries;
    });
}

function renderLayoutEntry(
    entry: LayoutEntry,
    props: Pick<JustifiedLayoutProps, 'gap' | 'rowGap' | 'renderTile'>,
) {
    if (entry.kind === 'header') {
        const sectionId = getSectionIdFromEntryKey(entry.key);
        return (
            <div
                key={entry.key}
                data-time-section-id={sectionId}
                style={{
                    width: '100%',
                    maxWidth: '1800px',
                    margin: '0 auto',
                    padding: '18px 0 8px',
                    boxSizing: 'border-box',
                }}
            >
                <div style={{ fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8' }}>
                    <span>{entry.label.slice(0, -1)}</span>
                    <span style={{ fontSize: '0.72em', letterSpacing: '0.02em' }}>{entry.label.slice(-1)}</span>
                </div>
            </div>
        );
    }

    return (
        <div
            key={entry.key}
            style={{
                display: 'flex',
                justifyContent: 'flex-start',
                gap: entry.row.gap ?? props.gap ?? 2,
                height: entry.row.height,
                width: entry.row.width,
                maxWidth: '1800px',
                margin: '0 auto 0 0',
                marginBottom: props.rowGap ?? 0,
                boxSizing: 'border-box',
            }}
        >
            {entry.row.items.map((item) => props.renderTile(item.index, { width: item.width, height: item.height }))}
        </div>
    );
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

function getEntrySectionIds(entries: LayoutEntry[], sections: ReturnType<typeof getNormalizedSections>) {
    const sectionIds: Array<string | null> = [];
    let currentSectionId = sections[0]?.id ?? null;

    entries.forEach((entry) => {
        if (entry.kind === 'header') {
            currentSectionId = getSectionIdFromEntryKey(entry.key);
        }
        sectionIds.push(currentSectionId);
    });

    return sectionIds;
}

function useVisibleStateSeed(params: {
    entries: LayoutEntry[];
    entrySectionIds: Array<string | null>;
    onTopVisibleSectionIdChange?: (sectionId: string | null) => void;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
}) {
    const hasSeededVisibleStateRef = useRef(false);
    const { entries, entrySectionIds, onTopVisibleSectionIdChange, onTopVisibleSelectionKeyChange } = params;

    useEffect(() => {
        if (hasSeededVisibleStateRef.current || entries.length === 0) {
            return;
        }

        hasSeededVisibleStateRef.current = true;
        onTopVisibleSelectionKeyChange?.(entries[0]?.selectionKey ?? null);
        onTopVisibleSectionIdChange?.(entrySectionIds[0] ?? null);
    }, [entries, entrySectionIds, onTopVisibleSectionIdChange, onTopVisibleSelectionKeyChange]);
}

function useRestoreSelection(params: {
    customScrollParent?: HTMLDivElement;
    entries: LayoutEntry[];
    restoreSelectionKey?: string | null;
    virtuosoRef: RefObject<VirtuosoHandle | null>;
}) {
    const hasRestoredSelectionRef = useRef(false);
    const { customScrollParent, entries, restoreSelectionKey, virtuosoRef } = params;

    useEffect(() => {
        if (hasRestoredSelectionRef.current) {
            return;
        }
        if (!restoreSelectionKey || entries.length === 0) {
            return;
        }
        if (customScrollParent && customScrollParent.scrollTop > 0) {
            hasRestoredSelectionRef.current = true;
            return;
        }

        const restoreIndex = entries.findIndex((entry) => entry.selectionKey === restoreSelectionKey);
        if (restoreIndex < 0) {
            return;
        }

        hasRestoredSelectionRef.current = true;
        virtuosoRef.current?.scrollToIndex({
            index: restoreIndex,
            align: 'start',
            behavior: 'auto',
        });
    }, [customScrollParent, entries, restoreSelectionKey, virtuosoRef]);
}

function useTimelineJumpScroll(params: {
    sectionEntryIndexes: Map<string, number>;
    timelineJumpRequest?: TimelineJumpRequest | null;
    virtuosoRef: RefObject<VirtuosoHandle | null>;
}) {
    const lastAppliedTimelineJumpNonceRef = useRef<number | null>(null);
    const { sectionEntryIndexes, timelineJumpRequest, virtuosoRef } = params;

    useEffect(() => {
        const sectionId = timelineJumpRequest?.sectionId;
        if (!sectionId || !timelineJumpRequest) {
            return;
        }
        if (lastAppliedTimelineJumpNonceRef.current === timelineJumpRequest.nonce) {
            return;
        }

        const entryIndex = sectionEntryIndexes.get(sectionId);
        if (entryIndex == null) {
            return;
        }

        lastAppliedTimelineJumpNonceRef.current = timelineJumpRequest.nonce;
        virtuosoRef.current?.scrollToIndex({
            index: entryIndex,
            align: 'start',
            behavior: 'auto',
        });
    }, [sectionEntryIndexes, timelineJumpRequest, virtuosoRef]);
}

export function JustifiedLayout(props: JustifiedLayoutProps) {
    const {
        gap,
        maxRowHeight,
        onTopVisibleSectionIdChange,
        onTopVisibleSelectionKeyChange,
        restoreSelectionKey,
        targetRowHeight,
        timelineJumpRequest,
    } = props;
    const { containerRef, containerWidth } = useContainerWidth();
    const virtuosoRef = useRef<VirtuosoHandle | null>(null);
    const customScrollParent = props.scrollContainerRef?.current ?? undefined;
    const normalizedSections = useMemo(() => getNormalizedSections({ items: props.items, sections: props.sections }), [props.items, props.sections]);
    const entries = useMemo<LayoutEntry[]>(() => {
        if (containerWidth <= 0) {return [];}
        return buildLayoutEntries(normalizedSections, {
            containerWidth: Math.max(1, containerWidth),
            gap,
            targetRowHeight,
            maxRowHeight,
        });
    }, [containerWidth, gap, maxRowHeight, normalizedSections, targetRowHeight]);
    const sectionEntryIndexes = useMemo(() => new Map(
        entries.flatMap((entry, index) => (
            entry.kind === 'header'
                ? [[getSectionIdFromEntryKey(entry.key), index] as const]
                : []
        )),
    ), [entries]);
    const entrySectionIds = useMemo(() => getEntrySectionIds(entries, normalizedSections), [entries, normalizedSections]);
    const handleRangeChanged = useCallback((range: { startIndex: number }) => {
        onTopVisibleSelectionKeyChange?.(entries[range.startIndex]?.selectionKey ?? null);
        onTopVisibleSectionIdChange?.(entrySectionIds[range.startIndex] ?? null);
    }, [entries, entrySectionIds, onTopVisibleSectionIdChange, onTopVisibleSelectionKeyChange]);

    useVisibleStateSeed({ entries, entrySectionIds, onTopVisibleSectionIdChange, onTopVisibleSelectionKeyChange });
    useRestoreSelection({ customScrollParent, entries, restoreSelectionKey, virtuosoRef });
    useTimelineJumpScroll({ sectionEntryIndexes, timelineJumpRequest, virtuosoRef });

    return (
        <div ref={containerRef} style={{ width: '100%' }}>
            <Virtuoso
                ref={virtuosoRef}
                customScrollParent={customScrollParent}
                data={entries}
                increaseViewportBy={{ top: 160, bottom: 220 }}
                rangeChanged={handleRangeChanged}
                itemContent={(_, entry) => renderLayoutEntry(entry, props)}
            />
        </div>
    );
}
