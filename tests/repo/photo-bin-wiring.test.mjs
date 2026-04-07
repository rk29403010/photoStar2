import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

function readWorkspaceFile(relativePath) {
    return readFileSync(path.join(workspaceRoot, relativePath), 'utf8');
}

test('photo bin wiring adds schema, backend commands, query exclusions, and runtime actions', () => {
    const schemaSource = readWorkspaceFile('src/data/dbSchema.ts');
    const contractSource = readWorkspaceFile('src/boundary/contracts/core.ts');
    const collectionCommandsSource = readWorkspaceFile('src/services/handlers/collectionCommands.ts');
    const assetQueryFilterSource = readWorkspaceFile('src/services/handlers/assetQueryFilters.ts');
    const assetCommandsSource = readWorkspaceFile('src/services/handlers/assetCommands.ts');
    const runtimeActionsSource = readWorkspaceFile('src/boundary/runtime/usePhotoLibrary.actions.ts');

    assert.match(schemaSource, /binned_at\s+TEXT/);
    assert.match(contractSource, /binned_at\?: string \| null/);
    assert.match(contractSource, /is_system\?: boolean/);
    assert.match(contractSource, /system_kind\?: 'bin' \| null/);

    assert.match(collectionCommandsSource, /move_to_bin:/);
    assert.match(collectionCommandsSource, /restore_from_bin:/);
    assert.match(collectionCommandsSource, /ensureBinAlbumExists/);
    assert.match(collectionCommandsSource, /Cannot delete the system Bin album/);

    assert.match(assetQueryFilterSource, /a\.binned_at IS NULL/);
    assert.match(assetQueryFilterSource, /isBinAlbumId/);
    assert.match(assetCommandsSource, /a\.binned_at IS NULL/);
    assert.match(collectionCommandsSource, /AND a\.binned_at IS NULL/);

    assert.match(runtimeActionsSource, /moveToBin:/);
    assert.match(runtimeActionsSource, /restoreFromBin:/);
    assert.match(runtimeActionsSource, /command:\s*'move_to_bin'/);
    assert.match(runtimeActionsSource, /command:\s*'restore_from_bin'/);
});
