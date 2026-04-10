import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Virtuoso } from 'react-virtuoso';
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
    renderTile: (index: number, size: { width: number; height: number }) => ReactNode;
}

type LayoutEntry =
    | { kind: 'header'; key: string; label: string; selectionKey: string | null }
    | { kind: 'row'; key: string; row: ReturnType<typeof buildJustifiedLayoutRows>[number]; selectionKey: string | null };

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
        return (
            <div
                key={entry.key}
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

export function JustifiedLayout(props: JustifiedLayoutProps) {
    const { containerRef, containerWidth } = useContainerWidth();
    const normalizedSections = useMemo(() => getNormalizedSections({ items: props.items, sections: props.sections }), [props.items, props.sections]);
    const entries = useMemo<LayoutEntry[]>(() => {
        if (containerWidth <= 0) {return [];}
        return buildLayoutEntries(normalizedSections, {
            containerWidth: Math.max(1, containerWidth),
            gap: props.gap,
            targetRowHeight: props.targetRowHeight,
            maxRowHeight: props.maxRowHeight,
        });
    }, [containerWidth, normalizedSections, props.gap, props.maxRowHeight, props.targetRowHeight]);
    const handleRangeChanged = useCallback((range: { startIndex: number }) => {
        props.onTopVisibleSelectionKeyChange?.(entries[range.startIndex]?.selectionKey ?? null);
    }, [entries, props]);

    useEffect(() => {
        props.onTopVisibleSelectionKeyChange?.(entries[0]?.selectionKey ?? null);
    }, [entries, props]);

    return (
        <div ref={containerRef} style={{ width: '100%' }}>
            <Virtuoso
                customScrollParent={props.scrollContainerRef?.current ?? undefined}
                data={entries}
                increaseViewportBy={{ top: 160, bottom: 220 }}
                rangeChanged={handleRangeChanged}
                itemContent={(_, entry) => renderLayoutEntry(entry, props)}
            />
        </div>
    );
}
