import type { TimelineGroupId } from '@contracts/core';

export function isTimelineGroupId(value: unknown): value is TimelineGroupId {
    return value === 'unknown-date'
        || (typeof value === 'string' && /^decade-\d+$/.test(value));
}
