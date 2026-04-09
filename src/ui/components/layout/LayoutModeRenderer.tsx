import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { JustifiedLayout } from './JustifiedLayout';

interface LayoutModeRendererProps {
    layoutMode: GalleryLayoutMode;
    justifiedItems: Array<{ id: string; width?: number; height?: number }>;
    scrollContainerRef?: RefObject<HTMLDivElement | null>;
    itemCount: number;
    targetRowHeight?: number;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    renderTile: (index: number, shellStyleOverride?: CSSProperties) => ReactNode;
}

export function LayoutModeRenderer(props: LayoutModeRendererProps) {
    if (props.layoutMode === 'justified') {
        return (
            <JustifiedLayout
                items={props.justifiedItems}
                scrollContainerRef={props.scrollContainerRef}
                targetRowHeight={props.targetRowHeight}
                onTopVisibleSelectionKeyChange={props.onTopVisibleSelectionKeyChange}
                renderTile={(index, size) => props.renderTile(index, {
                    width: size.width,
                    height: size.height,
                    flex: '0 0 auto',
                })}
            />
        );
    }

    return (
        <div
            className="layout-grid"
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(24, 1fr)',
                gridAutoFlow: 'dense',
                gridAutoRows: 'min(75px, 4.1vw)',
                gap: '2px',
                padding: '2px',
                width: '100%',
                maxWidth: '1800px',
                margin: '0 auto',
            }}
        >
            {Array.from({ length: props.itemCount }, (_, index) => props.renderTile(index))}
        </div>
    );
}
