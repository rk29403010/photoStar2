import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildJustifiedLayoutRows } from '@shared/utils/libraryJustifiedLayout';

interface JustifiedLayoutProps {
    items: Array<{ id: string; width?: number; height?: number }>;
    gap?: number;
    targetRowHeight?: number;
    maxRowHeight?: number;
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

    return (
        <div ref={containerRef} style={{ width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: props.gap ?? 2, padding: 2, width: '100%', maxWidth: '1800px', margin: '0 auto' }}>
                {rows.map((row) => (
                    <div key={row.items[0]?.id ?? `row-${row.height}`} style={{ display: 'flex', gap: props.gap ?? 2, height: row.height }}>
                        {row.items.map((item) => props.renderTile(item.index, { width: item.width, height: item.height }))}
                    </div>
                ))}
            </div>
        </div>
    );
}
