import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { GalleryLayoutMode } from '@shared/utils/libraryLayout';
import { JustifiedLayout } from './JustifiedLayout';
import type { GalleryTimeSection, GalleryTimeSectionMode } from './galleryTimeSections';
import type { TimelineJumpRequest } from '../library/libraryTimelineJump';
import { GroupedTimelineLayout } from './GroupedTimelineLayout';

type LayoutModeRendererProps = {
    readonly layoutMode: GalleryLayoutMode;
    readonly justifiedItems: Array<{ id: string; width?: number; height?: number }>;
    readonly justifiedSections?: GalleryTimeSection[];
    readonly timeSectionMode?: GalleryTimeSectionMode;
    readonly scrollContainerRef?: RefObject<HTMLDivElement | null>;
    readonly itemCount: number;
    readonly tileGap?: number;
    readonly rowGap?: number;
    readonly targetRowHeight?: number;
    readonly onTopVisibleSelectionKeyChange?: (selectionKey: string | null) => void;
    readonly onVisibleTimelineGroupChange?: (groupId: string | null, groupIndex: number | null) => void;
    readonly timelineJumpRequest?: TimelineJumpRequest | null;
    readonly renderTile: (index: number, shellStyleOverride?: CSSProperties) => ReactNode;
}

export function LayoutModeRenderer(props: LayoutModeRendererProps) {
    if (props.layoutMode === 'justified') {
        const indexById = new Map(props.justifiedItems.map((item, index) => [item.id, index]));
        const justifiedSectionEntries = props.justifiedSections?.map((section) => ({
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
        }));

        if (props.timeSectionMode === 'decade' && justifiedSectionEntries) {
            return (
                <GroupedTimelineLayout
                    sections={justifiedSectionEntries}
                    scrollContainerRef={props.scrollContainerRef}
                    gap={props.tileGap}
                    rowGap={props.rowGap}
                    targetRowHeight={props.targetRowHeight}
                    onTopVisibleSelectionKeyChange={props.onTopVisibleSelectionKeyChange}
                    onVisibleGroupChange={props.onVisibleTimelineGroupChange}
                    timelineJumpRequest={props.timelineJumpRequest}
                    renderTile={(index, size) => props.renderTile(index, {
                        width: size.width,
                        height: size.height,
                        flex: '0 0 auto',
                    })}
                />
            );
        }

        return (
            <JustifiedLayout
                items={props.justifiedItems.map((item, index) => ({
                    id: item.id,
                    index,
                    width: item.width,
                    height: item.height,
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
