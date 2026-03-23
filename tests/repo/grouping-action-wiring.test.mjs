import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('grouping action wiring uses the runtime regroup command path and exposes reset grouping action', () => {
    const buildActionsSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.actions.ts', 'utf8');
    const hookSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.ts', 'utf8');
    const appSource = fs.readFileSync('src/ui/App.tsx', 'utf8');
    const actionPanelSource = fs.readFileSync('src/ui/components/ActionPanel.tsx', 'utf8');

    assert.match(buildActionsSource, /command:\s*'start_library_grouping'/);
    assert.match(buildActionsSource, /command:\s*'get_workflow_run_detail'/);
    assert.match(buildActionsSource, /refreshLibrary\(\{\s*preservePagingState:\s*true\s*\}\)/);
    assert.match(buildActionsSource, /updateJobState\(localJobId,\s*'running'\)/);
    assert.match(buildActionsSource, /writeCommand\(transport,\s*jobId,\s*'reset_grouping_data'/);
    assert.match(buildActionsSource, /Runtime Grouping \(Duplicates, Variants & Bursts\)/);
    assert.match(hookSource, /createBuildActions\(\{\s*transport:\s*state\.transport,\s*request,\s*addJob,\s*updateJobState,\s*refreshLibrary:\s*refreshActions\.refreshLibrary,\s*refreshSystemJobs:\s*refreshActions\.refreshSystemJobs/s);
    assert.match(appSource, /onResetGroupingData=\{actions\.resetGroupingData\}/);
    assert.match(actionPanelSource, /Reset All Grouping Data/);
});
