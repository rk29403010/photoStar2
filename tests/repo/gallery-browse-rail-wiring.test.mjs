import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('justified gallery rail uses virtualized rows and visible-selection callbacks', () => {
    const justifiedLayoutSource = fs.readFileSync('src/ui/components/layout/JustifiedLayout.tsx', 'utf8');
    const layoutModeRendererSource = fs.readFileSync('src/ui/components/layout/LayoutModeRenderer.tsx', 'utf8');
    const layoutEngineSource = fs.readFileSync('src/ui/components/layout/LayoutEngine.tsx', 'utf8');

    assert.match(justifiedLayoutSource, /from 'react-virtuoso'/);
    assert.match(justifiedLayoutSource, /<Virtuoso/);
    assert.match(justifiedLayoutSource, /rangeChanged=/);
    assert.doesNotMatch(justifiedLayoutSource, /setTopVisibleSelectionKeyFromRange/);
    assert.match(justifiedLayoutSource, /customScrollParent=/);
    assert.match(justifiedLayoutSource, /const customScrollParent = props\.scrollContainerRef\?\.current \?\? undefined;/);
    assert.doesNotMatch(justifiedLayoutSource, /setCustomScrollParent/);
    assert.match(layoutModeRendererSource, /scrollContainerRef/);
    assert.match(layoutModeRendererSource, /onTopVisibleSelectionKeyChange/);
    assert.match(layoutModeRendererSource, /targetRowHeight/);
    assert.match(layoutEngineSource, /targetRowHeight\?: number;/);
    assert.match(layoutEngineSource, /onTopVisibleSelectionKeyChange\?: \(selectionKey: string \| null\) => void;/);
});
