import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('gallery exposes persisted show-group-ids state and wires it through to library tiles', () => {
    const uiStateSource = fs.readFileSync('src/ui/hooks/useAppRuntimeUi.ts', 'utf8');
    const appSource = fs.readFileSync('src/ui/App.tsx', 'utf8');
    const mainContentSource = fs.readFileSync('src/ui/components/app/AppMainContent.tsx', 'utf8');
    const libraryViewSource = fs.readFileSync('src/ui/components/LibraryView.tsx', 'utf8');
    const layoutEngineSource = fs.readFileSync('src/ui/components/layout/LayoutEngine.tsx', 'utf8');

    assert.match(uiStateSource, /ps_show_group_ids/);
    assert.match(appSource, /showGroupIds=\{uiState\.showGroupIds\}/);
    assert.match(mainContentSource, /onShowGroupIdsChange=\{props\.onShowGroupIdsChange\}/);
    assert.match(libraryViewSource, /Show group IDs/);
    assert.match(layoutEngineSource, /showGroupIds=\{showGroupIds\}/);
});
