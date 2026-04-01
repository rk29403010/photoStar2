import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('photo date recalculation action is wired through build actions and the action panel', () => {
    const buildActionsSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.actions.ts', 'utf8');
    const hookSource = fs.readFileSync('src/ui/hooks/usePhotoLibrary.ts', 'utf8');
    const overlaysSource = fs.readFileSync('src/ui/components/app/AppOverlays.tsx', 'utf8');
    const shellSource = fs.readFileSync('src/ui/components/app/LoadedAppShell.tsx', 'utf8');
    const actionPanelSource = fs.readFileSync('src/ui/components/ActionPanel.tsx', 'utf8');

    assert.match(buildActionsSource, /command:\s*'start_library_photo_date_workflow'/);
    assert.match(buildActionsSource, /Recalculating Photo Dates/);
    assert.match(buildActionsSource, /updateJobState\(localJobId,\s*'running'\)/);
    assert.match(buildActionsSource, /refreshLibrary\(\{\s*preservePagingState:\s*true\s*\}\)/);
    assert.match(hookSource, /createBuildActions\(\{\s*transport:\s*state\.transport,\s*request,\s*addJob,\s*updateJobState,\s*refreshLibrary:\s*refreshActions\.refreshLibrary,\s*refreshSystemJobs:\s*refreshActions\.refreshSystemJobs/s);
    assert.match(overlaysSource, /onRecalculatePhotoDates:\s*\(\)\s*=>\s*Promise<string>/);
    assert.match(overlaysSource, /onRecalculatePhotoDates=\{props\.onRecalculatePhotoDates\}/);
    assert.match(shellSource, /onRecalculatePhotoDates=\{actions\.recalculatePhotoDates\}/);
    assert.match(actionPanelSource, /Recalculate Photo Dates/);
});
