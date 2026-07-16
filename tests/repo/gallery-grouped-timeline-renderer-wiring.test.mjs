import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('date-mode renderer routes to deterministic grouped timeline layout', () => {
    const groupedTimelineLayoutSource = fs.readFileSync('src/ui/components/layout/GroupedTimelineLayout.tsx', 'utf8');
    const layoutModeRendererSource = fs.readFileSync('src/ui/components/layout/LayoutModeRenderer.tsx', 'utf8');
    const justifiedLayoutSource = fs.readFileSync('src/ui/components/layout/JustifiedLayout.tsx', 'utf8');
    const layoutEngineSource = fs.readFileSync('src/ui/components/layout/LayoutEngine.tsx', 'utf8');

    assert.match(groupedTimelineLayoutSource, /buildJustifiedLayoutRows/);
    assert.match(groupedTimelineLayoutSource, /renderGroupHeader/);
    assert.match(groupedTimelineLayoutSource, /renderTimelineRow/);
    assert.match(groupedTimelineLayoutSource, /timelineJumpRequest/);
    assert.match(groupedTimelineLayoutSource, /virtuosoRef\.current\?\.scrollToIndex\(\{/);
    assert.match(groupedTimelineLayoutSource, /<Virtuoso/);
    assert.match(groupedTimelineLayoutSource, /rangeChanged=\{handleRangeChanged\}/);

    assert.match(layoutModeRendererSource, /import \{ GroupedTimelineLayout \} from '\.\/GroupedTimelineLayout';/);
    assert.match(layoutModeRendererSource, /props\.layoutMode === 'justified'/);
    assert.match(layoutModeRendererSource, /props\.timeSectionMode === 'decade'/);
    assert.match(layoutModeRendererSource, /<GroupedTimelineLayout/);
    assert.match(layoutModeRendererSource, /<JustifiedLayout/);

    assert.match(justifiedLayoutSource, /import \{ Virtuoso/);
    assert.doesNotMatch(justifiedLayoutSource, /data-time-section-id=/);
    assert.doesNotMatch(justifiedLayoutSource, /timelineJumpRequest/);
    assert.doesNotMatch(justifiedLayoutSource, /GroupedVirtuoso/);

    assert.match(layoutEngineSource, /timeSectionMode={timeSectionMode}/);
});
