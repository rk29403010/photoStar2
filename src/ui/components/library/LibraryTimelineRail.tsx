import { useEffect, useMemo, useState } from 'react';
import type { GalleryTimelineSeek, LibraryTimelineSummary } from '@contracts/core';
import { findTimelineBucketIndex, getTimelineSeekForBucket } from './libraryTimelineModel';

interface LibraryTimelineRailProps {
    timeline: LibraryTimelineSummary;
    sortMode: 'date' | 'reverse-date';
    activeSeek: GalleryTimelineSeek | null;
    viewportBucketIndex: number | null;
    onSeekChange: (seek: GalleryTimelineSeek | null) => void;
}

function getDensityOpacity(count: number, maxCount: number) {
    if (maxCount <= 0) {
        return 0.18;
    }
    return 0.18 + (count / maxCount) * 0.72;
}

function getDisplayedSeekLabel(params: {
    buckets: LibraryTimelineSummary['buckets'];
    activeSeek: GalleryTimelineSeek | null;
    viewportBucketIndex: number | null;
    draftIndex: number | null;
}) {
    if (params.activeSeek?.kind === 'unknown') {
        return 'Unknown date';
    }
    const index = params.draftIndex ?? params.viewportBucketIndex ?? findTimelineBucketIndex(params.buckets, params.activeSeek);
    return index >= 0 ? params.buckets[index]?.label ?? 'Timeline' : 'Timeline';
}

function getNewestFirstBuckets(timeline: LibraryTimelineSummary) {
    return timeline.buckets.reduceRight<LibraryTimelineSummary['buckets']>((reversedBuckets, bucket) => {
        reversedBuckets.push(bucket);
        return reversedBuckets;
    }, []);
}

function shouldHideTimelineRail(timeline: LibraryTimelineSummary) {
    return timeline.buckets.length === 0 && timeline.unknownDateCount <= 0;
}

function getTimelineRangeValue(draftIndex: number | null, activeIndex: number) {
    return draftIndex ?? Math.max(activeIndex, 0);
}

function getViewportRangeValue(draftIndex: number | null, viewportBucketIndex: number | null, activeIndex: number) {
    if (draftIndex != null) {
        return getTimelineRangeValue(draftIndex, activeIndex);
    }
    if (viewportBucketIndex != null && viewportBucketIndex >= 0) {
        return viewportBucketIndex;
    }
    return Math.max(activeIndex, 0);
}

function commitTimelineDraft(params: {
    buckets: LibraryTimelineSummary['buckets'];
    draftIndex: number | null;
    sortMode: 'date' | 'reverse-date';
    onSeekChange: (seek: GalleryTimelineSeek | null) => void;
    setIsDragging: (dragging: boolean) => void;
}) {
    const bucket = params.draftIndex == null || params.draftIndex < 0 ? null : params.buckets[params.draftIndex];
    params.setIsDragging(false);
    if (!bucket) {
        return;
    }
    params.onSeekChange(getTimelineSeekForBucket(bucket, params.sortMode));
}

function TimelineRangeInput(props: {
    bucketCount: number;
    draftIndex: number | null;
    viewportBucketIndex: number | null;
    activeIndex: number;
    onDraftIndexChange: (index: number) => void;
    onCommit: () => void;
}) {
    if (props.bucketCount <= 0) {
        return null;
    }

    return (
        <input
            type="range"
            min={0}
            max={Math.max(props.bucketCount - 1, 0)}
            step={1}
            value={getViewportRangeValue(props.draftIndex, props.viewportBucketIndex, props.activeIndex)}
            aria-label="Library timeline"
            onChange={(event) => props.onDraftIndexChange(Number(event.target.value))}
            onPointerUp={props.onCommit}
            onMouseUp={props.onCommit}
            onKeyUp={props.onCommit}
            onBlur={props.onCommit}
            style={{ width: 20, height: '100%', writingMode: 'vertical-lr', accentColor: '#60a5fa', cursor: 'pointer', transform: 'rotate(180deg)' }}
        />
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
    const [draftIndex, setDraftIndex] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const bucketCount = props.timeline.buckets.length;
    const activeIndex = findTimelineBucketIndex(props.timeline.buckets, props.activeSeek);
    const maxBucketCount = useMemo(() => props.timeline.buckets.reduce((maxCount, bucket) => Math.max(maxCount, bucket.count), 0), [props.timeline.buckets]);
    const newestFirstBuckets = useMemo(() => getNewestFirstBuckets(props.timeline), [props.timeline]);

    useEffect(() => {
        if (isDragging) {
            return;
        }
        setDraftIndex(activeIndex >= 0 ? activeIndex : null);
    }, [activeIndex, isDragging]);

    if (shouldHideTimelineRail(props.timeline)) {
        return null;
    }

    const commitDraftSeek = () => commitTimelineDraft({
        buckets: props.timeline.buckets,
        draftIndex,
        sortMode: props.sortMode,
        onSeekChange: props.onSeekChange,
        setIsDragging,
    });

    return (
        <div style={{ width: 92, minWidth: 92, display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 8px 14px 10px', borderRight: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(180deg, rgba(10,10,10,0.98), rgba(15,23,42,0.92))' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ color: '#9ca3af', fontSize: '0.72rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Timeline</span>
                <span style={{ color: '#e5e7eb', fontSize: '0.82rem', fontWeight: 600 }}>{getDisplayedSeekLabel({ buckets: props.timeline.buckets, activeSeek: props.activeSeek, viewportBucketIndex: props.viewportBucketIndex, draftIndex: isDragging ? draftIndex : null })}</span>
            </div>
            <div style={{ display: 'flex', flex: 1, minHeight: 0, alignItems: 'stretch', gap: 8 }}>
                <TimelineRangeInput
                    bucketCount={bucketCount}
                    draftIndex={draftIndex}
                    viewportBucketIndex={props.viewportBucketIndex}
                    activeIndex={activeIndex}
                    onDraftIndexChange={(index) => {
                        setIsDragging(true);
                        setDraftIndex(index);
                    }}
                    onCommit={commitDraftSeek}
                />
                <div style={{ display: 'grid', flex: 1, gridTemplateRows: `repeat(${Math.max(bucketCount, 1)}, minmax(0, 1fr))`, gap: 4, alignItems: 'stretch' }}>
                {newestFirstBuckets.map((bucket: LibraryTimelineSummary['buckets'][number]) => (
                    <div
                        key={bucket.label}
                        title={`${bucket.label}: ${bucket.count} photo${bucket.count === 1 ? '' : 's'}`}
                        style={{
                            width: 14,
                            justifySelf: 'center',
                            borderRadius: 999,
                            background: `rgba(96,165,250,${getDensityOpacity(bucket.count, maxBucketCount)})`,
                            outline: props.viewportBucketIndex === props.timeline.buckets.indexOf(bucket) ? '1px solid rgba(191,219,254,0.9)' : 'none',
                            boxShadow: activeIndex === props.timeline.buckets.indexOf(bucket) ? '0 0 0 2px rgba(96,165,250,0.18)' : 'none',
                        }}
                    />
                ))}
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <UnknownDateButton
                    unknownDateCount={props.timeline.unknownDateCount}
                    activeSeek={props.activeSeek}
                    onClick={() => {
                        setIsDragging(false);
                        setDraftIndex(null);
                        props.onSeekChange({ kind: 'unknown' });
                    }}
                />
            </div>
        </div>
    );
}
