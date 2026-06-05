import { useMemo } from 'react';
import type { GalleryTimelineSeek, LibraryTimelineSummary } from '@contracts/core';
import { findTimelineBucketIndex, getTimelineSeekForBucket } from './libraryTimelineModel';
import { getTimelineRailDisplayedIndex, getTimelineRailOrderedIndexes } from './libraryTimelineRailModel';

type LibraryTimelineRailProps = {
    readonly timeline: LibraryTimelineSummary;
    readonly sortMode: 'date' | 'reverse-date';
    readonly activeSeek: GalleryTimelineSeek | null;
    readonly viewportBucketIndex: number | null;
    readonly onSeekChange: (seek: GalleryTimelineSeek | null) => void;
    readonly onBucketJump?: (bucket: LibraryTimelineSummary['buckets'][number]) => void;
}

function getDensityOpacity(count: number, maxCount: number) {
    if (maxCount <= 0) {
        return 0.18;
    }
    return 0.18 + (count / maxCount) * 0.72;
}

function shouldHideTimelineRail(timeline: LibraryTimelineSummary) {
    return timeline.buckets.length === 0 && timeline.unknownDateCount <= 0;
}

function seekTimelineBucket(params: {
    buckets: LibraryTimelineSummary['buckets'];
    targetIndex: number;
    sortMode: 'date' | 'reverse-date';
    onSeekChange: (seek: GalleryTimelineSeek | null) => void;
    onBucketJump?: (bucket: LibraryTimelineSummary['buckets'][number]) => void;
}) {
    const bucket = params.targetIndex < 0 ? null : params.buckets[params.targetIndex];
    if (!bucket) {
        return;
    }
    if (params.onBucketJump) {
        params.onBucketJump(bucket);
        return;
    }
    params.onSeekChange(getTimelineSeekForBucket(bucket, params.sortMode));
}

function TimelineRailHeader() {
    return <span className="text-content-secondary text-[11px] font-semibold tracking-wider uppercase">Timeline</span>;
}

function TimelineRailBucketButton(props: {
    readonly bucket: LibraryTimelineSummary['buckets'][number];
    readonly isDisplayed: boolean;
    readonly maxBucketCount: number;
    readonly onClick: () => void;
}) {
    const activeClass = props.isDisplayed
        ? 'bg-brand-accent border-brand-accent text-white font-bold'
        : 'border-content/10 text-content-secondary hover:text-content hover:border-content/30';

    return (
        <button
            className={`timeline-rail-button flex items-center justify-center w-full min-h-0 rounded-full border text-[11px] cursor-pointer px-1.5 motion-safe:transition-all outline-none scale-100 shadow-none ${activeClass}`}
            type="button"
            title={`${props.bucket.label}: ${props.bucket.count} photo${props.bucket.count === 1 ? '' : 's'}`}
            onClick={props.onClick}
            onMouseUp={(event) => {
                event.currentTarget.blur();
            }}
            style={props.isDisplayed ? undefined : {
                background: `rgba(99,102,241,${getDensityOpacity(props.bucket.count, props.maxBucketCount)})`,
            }}
        >
            {props.bucket.label}
        </button>
    );
}

function TimelineRailTrack(props: {
    readonly timeline: LibraryTimelineSummary;
    readonly displayedIndex: number;
    readonly sortMode: 'date' | 'reverse-date';
    readonly onSeekChange: (seek: GalleryTimelineSeek | null) => void;
    readonly onBucketJump?: (bucket: LibraryTimelineSummary['buckets'][number]) => void;
}) {
    const maxBucketCount = useMemo(() => props.timeline.buckets.reduce((maxCount, bucket) => Math.max(maxCount, bucket.count), 0), [props.timeline.buckets]);
    const orderedIndexes = useMemo(() => getTimelineRailOrderedIndexes(props.timeline.buckets.length), [props.timeline.buckets.length]);

    return (
        <div style={{ display: 'grid', flex: 1, minHeight: 0, gridTemplateRows: `repeat(${Math.max(props.timeline.buckets.length, 1)}, minmax(0, 1fr))`, gap: 4, alignItems: 'stretch' }}>
            {orderedIndexes.map((bucketIndex) => {
                const bucket = props.timeline.buckets[bucketIndex];
                if (!bucket) {
                    return null;
                }

                return (
                    <TimelineRailBucketButton
                        key={bucket.label}
                        bucket={bucket}
                        isDisplayed={props.displayedIndex === bucketIndex}
                        maxBucketCount={maxBucketCount}
                        onClick={() => {
                            seekTimelineBucket({
                                buckets: props.timeline.buckets,
                                targetIndex: bucketIndex,
                                sortMode: props.sortMode,
                                onSeekChange: props.onSeekChange,
                                onBucketJump: props.onBucketJump,
                            });
                        }}
                    />
                );
            })}
        </div>
    );
}

function UnknownDateButton(props: {
    readonly unknownDateCount: number;
    readonly activeSeek: GalleryTimelineSeek | null;
    readonly onClick: () => void;
}) {
    if (props.unknownDateCount <= 0) {
        return null;
    }

    const activeClass = props.activeSeek?.kind === 'unknown'
        ? 'bg-brand-accent text-white border-brand-accent'
        : 'bg-content/5 text-content-secondary border-content/10 hover:bg-content/10';

    return (
        <button
            type="button"
            onClick={props.onClick}
            className={`border rounded-full py-1 px-2.5 text-xs whitespace-nowrap cursor-pointer transition-colors ${activeClass}`}
        >
            Unknown ({props.unknownDateCount})
        </button>
    );
}

export function LibraryTimelineRail(props: LibraryTimelineRailProps) {
    const activeIndex = findTimelineBucketIndex(props.timeline.buckets, props.activeSeek);
    const displayedIndex = getTimelineRailDisplayedIndex({
        viewportBucketIndex: props.viewportBucketIndex,
        activeIndex,
    });

    if (shouldHideTimelineRail(props.timeline)) {
        return null;
    }

    return (
        <div
            data-timeline-active-index={String(activeIndex)}
            data-timeline-displayed-index={String(displayedIndex)}
            data-timeline-viewport-index={props.viewportBucketIndex == null ? 'null' : String(props.viewportBucketIndex)}
            className="w-24 min-w-[92px] flex flex-col gap-2.5 pt-3.5 pb-3.5 pl-2.5 pr-2 bg-surface-secondary border-r border-content/10"
        >
            <TimelineRailHeader />
            <TimelineRailTrack
                timeline={props.timeline}
                displayedIndex={displayedIndex}
                sortMode={props.sortMode}
                onSeekChange={props.onSeekChange}
                onBucketJump={props.onBucketJump}
            />
            <div className="flex flex-col gap-1.5">
                <UnknownDateButton
                    unknownDateCount={props.timeline.unknownDateCount}
                    activeSeek={props.activeSeek}
                    onClick={() => {
                        props.onSeekChange({ kind: 'unknown' });
                    }}
                />
            </div>
        </div>
    );
}
