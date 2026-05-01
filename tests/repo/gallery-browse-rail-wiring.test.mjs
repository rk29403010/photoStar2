import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('justified gallery rail uses virtualized rows and visible-selection callbacks', () => {
    const justifiedLayoutSource = fs.readFileSync('src/ui/components/layout/JustifiedLayout.tsx', 'utf8');
    const layoutModeRendererSource = fs.readFileSync('src/ui/components/layout/LayoutModeRenderer.tsx', 'utf8');
    const layoutEngineSource = fs.readFileSync('src/ui/components/layout/LayoutEngine.tsx', 'utf8');

    assert.match(justifiedLayoutSource, /from 'react-virtuoso'/);
    assert.match(justifiedLayoutSource, /<Virtuoso/);
    assert.match(justifiedLayoutSource, /rangeChanged=\{\(range\) => \{/);
    assert.match(justifiedLayoutSource, /props\.onTopVisibleSelectionKeyChange\?\.\(rows\[range\.startIndex\]\?\.items\[0\]\?\.id \?\? null\)/);
    assert.match(justifiedLayoutSource, /itemContent=\{\(_, row\) => renderLayoutRow\(row, props\)\}/);
    assert.doesNotMatch(justifiedLayoutSource, /setTopVisibleSelectionKeyFromRange/);
    assert.match(justifiedLayoutSource, /customScrollParent=/);
    assert.match(justifiedLayoutSource, /const \[customScrollParent, setCustomScrollParent\] = useState<HTMLDivElement \| undefined>\(\)/);
    assert.match(justifiedLayoutSource, /const nextScrollParent = scrollContainerRef\?\.current \?\? undefined/);
    assert.match(justifiedLayoutSource, /const customScrollParent = useCustomScrollParent\(props\.scrollContainerRef\)/);
    assert.match(justifiedLayoutSource, /if \(props\.scrollContainerRef && !customScrollParent\)/);
    assert.match(layoutModeRendererSource, /scrollContainerRef/);
    assert.match(layoutModeRendererSource, /onTopVisibleSelectionKeyChange/);
    assert.match(layoutModeRendererSource, /targetRowHeight/);
    assert.match(layoutEngineSource, /targetRowHeight\?: number;/);
    assert.match(layoutEngineSource, /onTopVisibleSelectionKeyChange\?: \(selectionKey: string \| null\) => void;/);
});
