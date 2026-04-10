import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { JustifiedLayout } from './JustifiedLayout';
import type { GalleryTimeSection } from './galleryTimeSections';

interface LayoutModeRendererProps {
    layoutMode: GalleryLayoutMode;
    justifiedItems: Array<{ id: string; width?: number; height?: number }>;
    justifiedSections?: GalleryTimeSection[];
    scrollContainerRef?: RefObject<HTMLDivElement | null>;
    itemCount: number;
    tileGap?: number;
    rowGap?: number;
    targetRowHeight?: number;
    onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    renderTile: (index: number, shellStyleOverride?: CSSProperties) => ReactNode;
}

export function LayoutModeRenderer(props: LayoutModeRendererProps) {
    if (props.layoutMode === 'justified') {
        const indexById = new Map(props.justifiedItems.map((item, index) => [item.id, index]));
        return (
            <JustifiedLayout
                items={props.justifiedItems}
                sections={props.justifiedSections?.map((section) => ({
                    id: section.id,
                    label: section.label,
                    items: section.items.flatMap((item) => {
                        const index = indexById.get(item.selectionKey);
                        if (index == null) {return [];}
                        return [{
                        id: item.selectionKey,
                        index,
                        width: item.asset.width,
                        height: item.asset.height,
                        }];
                    }),
                }))}
                scrollContainerRef={props.scrollContainerRef}
                gap={props.tileGap}
                rowGap={props.rowGap}
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
                gap: `${props.tileGap ?? 2}px`,
                padding: `${props.tileGap ?? 2}px`,
                width: '100%',
                maxWidth: '1800px',
                margin: '0 auto',
            }}
        >
            {Array.from({ length: props.itemCount }, (_, index) => props.renderTile(index))}
        </div>
    );
}
