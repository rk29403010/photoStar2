import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { buildJustifiedLayoutRows } from '@shared/utils/libraryJustifiedLayout';

interface JustifiedLayoutProps {
    items: Array<{ id: string; width?: number; height?: number }>;
    scrollContainerRef?: RefObject<HTMLDivElement | null>;
    gap?: number;
    targetRowHeight?: number;
    maxRowHeight?: number;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    renderTile: (index: number, size: { width: number; height: number }) => ReactNode;
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
    const rows = useMemo(() => {
        if (containerWidth <= 0) {return [];}

        return buildJustifiedLayoutRows(props.items, {
            containerWidth: Math.max(1, containerWidth - 4),
            gap: props.gap,
            targetRowHeight: props.targetRowHeight,
            maxRowHeight: props.maxRowHeight,
        });
    }, [containerWidth, props.gap, props.items, props.maxRowHeight, props.targetRowHeight]);
    const handleRangeChanged = useCallback((range: { startIndex: number }) => {
        props.onTopVisibleSelectionKeyChange?.(rows[range.startIndex]?.items[0]?.id ?? null);
    }, [props, rows]);

    useEffect(() => {
        props.onTopVisibleSelectionKeyChange?.(rows[0]?.items[0]?.id ?? null);
    }, [props, rows]);

    return (
        <div ref={containerRef} style={{ width: '100%' }}>
            <Virtuoso
                customScrollParent={props.scrollContainerRef?.current ?? undefined}
                data={rows}
                increaseViewportBy={{ top: 400, bottom: 600 }}
                rangeChanged={handleRangeChanged}
                itemContent={(_, row) => (
                    <div
                        key={row.items[0]?.id ?? `row-${row.height}`}
                        style={{ display: 'flex', gap: props.gap ?? 2, height: row.height, paddingInline: 2, width: '100%', maxWidth: '1800px', margin: '0 auto' }}
                    >
                        {row.items.map((item) => props.renderTile(item.index, { width: item.width, height: item.height }))}
                    </div>
                )}
            />
        </div>
    );
}
