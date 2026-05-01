export function getTimelineRailDisplayedIndex(params: {
    viewportBucketIndex: number | null;
    activeIndex: number;
}) {
    if (params.viewportBucketIndex != null && params.viewportBucketIndex >= 0) {
        return params.viewportBucketIndex;
    }
    return -1;
}

export function getTimelineRailOrderedIndexes(bucketCount: number) {
    return Array.from({ length: bucketCount }, (_, index) => bucketCount - 1 - index);
}
