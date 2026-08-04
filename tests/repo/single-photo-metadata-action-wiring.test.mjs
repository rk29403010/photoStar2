import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('single-photo metadata action exposes tiled analysis and selected-subject workflow wiring', () => {
    const actionMenuSource = fs.readFileSync('src/ui/components/single-photo/ActionOverlayControls.tsx', 'utf8');
    const singlePhotoViewSource = fs.readFileSync('src/ui/components/SinglePhotoView.tsx', 'utf8');
    const appOverlaysSource = fs.readFileSync('src/ui/components/app/AppOverlays.tsx', 'utf8');
    const appSource = fs.readFileSync('src/ui/App.tsx', 'utf8');
    const commandsSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.commands.ts', 'utf8');
    const handlerSource = fs.readFileSync('src/services/handlers/systemWorkflowRuntimeCommands.ts', 'utf8');

    assert.match(actionMenuSource, /Quick Analysis/);
    assert.match(actionMenuSource, /Detailed Analysis/);
    assert.match(actionMenuSource, /metadataPass/);
    assert.match(singlePhotoViewSource, /useAnalysisWorkflowFailureTracking/);
    assert.match(singlePhotoViewSource, /onGetWorkflowRunDetail/);
    assert.match(appOverlaysSource, /onGetWorkflowRunDetail/);
    assert.match(commandsSource, /start_selected_subject_metadata_workflow/);
    assert.match(commandsSource, /metadataPass: options\.metadataPass \?\? 'scout'/);
    assert.match(handlerSource, /selected_subject_metadata_v1/);
    assert.match(handlerSource, /metadataPass: payload\?\.metadataPass \?\? 'scout'/);
    assert.match(actionMenuSource, /library_editor_masks_v1/);
    assert.match(actionMenuSource, /Fast - Find objects/);
    assert.match(actionMenuSource, /Compare object masks/);
    assert.match(commandsSource, /workflowParameters/);
    assert.match(appSource, /actions\.runWorkflowOnAssets\(workflowId, assetIds, parameters\)/);
});
