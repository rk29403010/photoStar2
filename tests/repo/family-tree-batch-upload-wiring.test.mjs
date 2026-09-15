import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('GEDCOM import accepts batches while preserving single-file versioning', () => {
    const dialogSource = fs.readFileSync('src/ui/components/family-tree/FamilyTreeDialogs.tsx', 'utf8');
    const hookSource = fs.readFileSync('src/ui/components/family-tree/familyTreeHooks.ts', 'utf8');
    const viewSource = fs.readFileSync('src/ui/components/family-tree/FamilyTreeView.tsx', 'utf8');

    assert.match(dialogSource, /type="file" accept="\.ged,\.gedcom" multiple/);
    assert.match(dialogSource, /onSelectFiles\(event\.target\.files\)/);
    assert.match(dialogSource, /Multiple files are imported as separate family trees/);
    assert.match(dialogSource, /disabled=\{!canVersion\}/);

    assert.match(hookSource, /Promise\.all\(Array\.from\(files\)/);
    assert.match(hookSource, /const treeGroupId = total === 1 && selectedGroup \? selectedGroup : undefined/);
    assert.match(hookSource, /for \(const pendingUpload of uploadFiles\)/);
    assert.match(hookSource, /setUploadFiles\(failures\.map\(\(failure\) => failure\.upload\)\)/);

    assert.match(viewSource, /filenames=\{upload\.uploadFilenames\}/);
    assert.match(viewSource, /onSelectFiles=\{upload\.selectFiles\}/);
});
