import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { buildJustifiedLayoutRows } from '@shared/utils/libraryJustifiedLayout';

interface JustifiedLayoutProps {
    items: Array<{ id: string; index: number; width?: number; height?: number }>;
    scrollContainerRef?: RefObject<HTMLDivElement | null>;
    gap?: number;
    rowGap?: number;
    targetRowHeight?: number;
    maxRowHeight?: number;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    renderTile: (index: number, size: { width: number; height: number }) => ReactNode;
}

function renderLayoutRow(
    row: ReturnType<typeof buildJustifiedLayoutRows>[number],
    props: Pick<JustifiedLayoutProps, 'gap' | 'rowGap' | 'renderTile'>,
) {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'flex-start',
                gap: row.gap ?? props.gap ?? 2,
                height: row.height,
                width: row.width,
                maxWidth: '1800px',
                margin: '0 auto 0 0',
                marginBottom: props.rowGap ?? 0,
                boxSizing: 'border-box',
            }}
        >
            {row.items.map((item) => props.renderTile(item.index, { width: item.width, height: item.height }))}
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
                animationFrameId = window.requestAnimationFrame(syncScrollParent);
            }
        };

        syncScrollParent();

        return () => {
            if (animationFrameId != null) {
                window.cancelAnimationFrame(animationFrameId);
            }
        };
    }, [scrollContainerRef]);

    return customScrollParent;
}

export function JustifiedLayout(props: JustifiedLayoutProps) {
    const { containerRef, containerWidth } = useContainerWidth();
    const customScrollParent = useCustomScrollParent(props.scrollContainerRef);
    const rows = useMemo(() => {
        if (containerWidth <= 0) {return [];}
        return buildJustifiedLayoutRows(props.items, {
            containerWidth: Math.max(1, containerWidth),
            gap: props.gap,
            targetRowHeight: props.targetRowHeight,
            maxRowHeight: props.maxRowHeight,
        });
    }, [containerWidth, props.gap, props.items, props.maxRowHeight, props.targetRowHeight]);
    const virtuosoKey = useMemo(() => {
        const firstRowItemId = rows[0]?.items[0]?.id ?? 'none';
        return `w:${Math.round(containerWidth)}|rows:${rows.length}|first:${firstRowItemId}`;
    }, [containerWidth, rows]);

    if (props.scrollContainerRef && !customScrollParent) {
        return <div ref={containerRef} style={{ width: '100%' }} />;
    }

    return (
        <div ref={containerRef} style={{ width: '100%' }}>
            <Virtuoso
                key={virtuosoKey}
                customScrollParent={customScrollParent}
                data={rows}
                increaseViewportBy={{ top: 160, bottom: 220 }}
                rangeChanged={(range) => {
                    props.onTopVisibleSelectionKeyChange?.(rows[range.startIndex]?.items[0]?.id ?? null);
                }}
                itemContent={(_, row) => renderLayoutRow(row, props)}
            />
        </div>
    );
}
