import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('justified timeline jumps are consumed once per nonce instead of re-scrolling on later updates', () => {
    const groupedTimelineLayoutSource = fs.readFileSync('src/ui/components/layout/GroupedTimelineLayout.tsx', 'utf8');

    assert.match(groupedTimelineLayoutSource, /function useTimelineJumpScroller/);
    assert.match(groupedTimelineLayoutSource, /lastAppliedTimelineJumpNonceRef/);
    assert.match(groupedTimelineLayoutSource, /timelineJumpRequest.*nonce/s);
    assert.match(groupedTimelineLayoutSource, /lastAppliedTimelineJumpNonceRef\.current === .*timelineJumpRequest.*nonce/s);
    assert.match(groupedTimelineLayoutSource, /lastAppliedTimelineJumpNonceRef\.current = .*timelineJumpRequest.*nonce/s);
    assert.match(groupedTimelineLayoutSource, /const targetHeader = containerRef\.current\?\.querySelector<HTMLElement>\(/);
    assert.match(groupedTimelineLayoutSource, /if \(customScrollParent\) \{/);
    assert.match(groupedTimelineLayoutSource, /customScrollParent\.scrollTo\(\{ top: nextTop, behavior: 'auto' \}\)/);
    assert.match(groupedTimelineLayoutSource, /targetHeader\.scrollIntoView\(\{ block: 'start', behavior: 'auto' \}\)/);
});
