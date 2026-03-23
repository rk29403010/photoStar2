import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('single-photo metadata action exposes tiled analysis and selected-subject workflow wiring', () => {
    const actionMenuSource = fs.readFileSync('src/ui/components/single-photo/ActionOverlayControls.tsx', 'utf8');
    const commandsSource = fs.readFileSync('src/boundary/runtime/usePhotoLibrary.commands.ts', 'utf8');
    const handlerSource = fs.readFileSync('src/services/handlers/systemWorkflowRuntimeCommands.ts', 'utf8');

    assert.match(actionMenuSource, /Analyze Image \(Tiled\)/);
    assert.match(actionMenuSource, /overview_plus_tiles/);
    assert.match(commandsSource, /start_selected_subject_metadata_workflow/);
    assert.match(handlerSource, /selected_subject_metadata_v1/);
});
