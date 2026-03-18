import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('group diagnostics report is wired from actions into the app view shell', () => {
    const runtimeActionsSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.actions.ts', 'utf8');
    const actionPanelSource = fs.readFileSync('src/ui/components/ActionPanel.tsx', 'utf8');
    const appUiStateSource = fs.readFileSync('src/ui/hooks/useAppRuntimeUi.ts', 'utf8');
    const appSource = fs.readFileSync('src/ui/App.tsx', 'utf8');
    const mainContentSource = fs.readFileSync('src/ui/components/app/AppMainContent.tsx', 'utf8');

    assert.match(runtimeActionsSource, /getGroupDiagnosticsReport/);
    assert.match(actionPanelSource, /Grouping Diagnostics Report/);
    assert.match(appUiStateSource, /groupDiagnostics/);
    assert.match(appSource, /onOpenGroupDiagnostics/);
    assert.match(mainContentSource, /GroupingDiagnosticsView/);
});
