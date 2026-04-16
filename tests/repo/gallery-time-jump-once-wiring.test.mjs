import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('justified timeline jumps are consumed once per nonce instead of re-scrolling on later updates', () => {
    const justifiedLayoutSource = fs.readFileSync('src/ui/components/layout/JustifiedLayout.tsx', 'utf8');

    assert.match(justifiedLayoutSource, /lastAppliedTimelineJumpNonceRef/);
    assert.match(justifiedLayoutSource, /timelineJumpRequest.*nonce/s);
    assert.match(justifiedLayoutSource, /lastAppliedTimelineJumpNonceRef\.current === .*timelineJumpRequest.*nonce/s);
    assert.match(justifiedLayoutSource, /lastAppliedTimelineJumpNonceRef\.current = .*timelineJumpRequest.*nonce/s);
});
