import { useMemo } from 'react';
import type { GalleryTimelineSeek, LibraryTimelineSummary } from '@contracts/core';
import { findTimelineBucketIndex, getTimelineSeekForBucket } from './libraryTimelineModel';
import { getTimelineRailDisplayedIndex, getTimelineRailOrderedIndexes } from './libraryTimelineRailModel';

interface LibraryTimelineRailProps {
    timeline: LibraryTimelineSummary;
    sortMode: 'date' | 'reverse-date';
    activeSeek: GalleryTimelineSeek | null;
    viewportBucketIndex: number | null;
    onSeekChange: (seek: GalleryTimelineSeek | null) => void;
    onBucketJump?: (bucket: LibraryTimelineSummary['buckets'][number]) => void;
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
    return <span style={{ color: '#9ca3af', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Timeline</span>;
}

function TimelineRailBucketButton(props: {
    bucket: LibraryTimelineSummary['buckets'][number];
    isDisplayed: boolean;
    maxBucketCount: number;
    onClick: () => void;
}) {
    return (
        <button
            className="timeline-rail-button"
            type="button"
            title={`${props.bucket.label}: ${props.bucket.count} photo${props.bucket.count === 1 ? '' : 's'}`}
            onClick={props.onClick}
            onMouseUp={(event) => {
                event.currentTarget.blur();
            }}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                minHeight: 0,
                borderRadius: 999,
                border: props.isDisplayed ? '1px solid rgba(255,255,255,0.98)' : '1px solid rgba(148,163,184,0.16)',
                background: props.isDisplayed
                    ? 'rgba(241,245,249,0.98)'
                    : `rgba(96,165,250,${getDensityOpacity(props.bucket.count, props.maxBucketCount)})`,
                boxShadow: 'none',
                color: props.isDisplayed ? '#0f172a' : '#e5e7eb',
                fontSize: '0.72rem',
                fontWeight: props.isDisplayed ? 700 : 500,
                cursor: 'pointer',
                padding: '0 6px',
                outline: 'none',
                transform: 'scale(1)',
                transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease',
            }}
        >
            {props.bucket.label}
        </button>
    );
}

function TimelineRailTrack(props: {
    timeline: LibraryTimelineSummary;
    displayedIndex: number;
    sortMode: 'date' | 'reverse-date';
    onSeekChange: (seek: GalleryTimelineSeek | null) => void;
    onBucketJump?: (bucket: LibraryTimelineSummary['buckets'][number]) => void;
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
    unknownDateCount: number;
    activeSeek: GalleryTimelineSeek | null;
    onClick: () => void;
}) {
    if (props.unknownDateCount <= 0) {
        return null;
    }

    return (
        <button
            type="button"
            onClick={props.onClick}
            style={{ background: props.activeSeek?.kind === 'unknown' ? 'rgba(30,41,59,0.95)' : 'rgba(148,163,184,0.08)', color: '#e5e7eb', border: '1px solid rgba(148,163,184,0.24)', borderRadius: 999, padding: '5px 10px', fontSize: '0.78rem', whiteSpace: 'nowrap', cursor: 'pointer' }}
        >
            Unknown date ({props.unknownDateCount})
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
        <div style={{ width: 92, minWidth: 92, display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 8px 14px 10px', borderRight: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(180deg, rgba(10,10,10,0.98), rgba(15,23,42,0.92))' }}>
            <TimelineRailHeader />
            <TimelineRailTrack
                timeline={props.timeline}
                displayedIndex={displayedIndex}
                sortMode={props.sortMode}
                onSeekChange={props.onSeekChange}
                onBucketJump={props.onBucketJump}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
