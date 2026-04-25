import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('gallery exposes persisted show-group-ids state and wires it through to library tiles', () => {
    const uiStateSource = fs.readFileSync('src/ui/hooks/useAppRuntimeUi.ts', 'utf8');
    const loadedAppShellSource = fs.readFileSync('src/ui/components/app/LoadedAppShell.tsx', 'utf8');
    const mainContentSource = fs.readFileSync('src/ui/components/app/AppMainContent.tsx', 'utf8');
    const toolbarSource = fs.readFileSync('src/ui/components/library/LibraryToolbar.tsx', 'utf8');
    const layoutEngineSource = fs.readFileSync('src/ui/components/layout/LayoutEngine.tsx', 'utf8');

    assert.match(uiStateSource, /ps_show_group_ids/);
    assert.match(loadedAppShellSource, /showGroupIds=\{props\.uiState\.showGroupIds\}/);
    assert.match(mainContentSource, /onShowGroupIdsChange=\{props\.onShowGroupIdsChange\}/);
    assert.match(toolbarSource, /Show group IDs/);
    assert.match(layoutEngineSource, /showGroupIds=\{Boolean\(showGroupIds\)\}/);
    assert.match(layoutEngineSource, /showGroupIds=\{params\.showGroupIds\}/);
});
