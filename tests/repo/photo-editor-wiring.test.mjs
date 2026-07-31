import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

test('photo editor resolves tool UI contributions through the generated client registry', () => {
  const tools = readFileSync('src/ui/components/photo-editor/photoEditorTools.ts', 'utf8');
  const preview = readFileSync('src/ui/components/photo-editor/PhotoEditorPreview.tsx', 'utf8');
  const generatedUi = readFileSync('src/ui/components/photo-editor/generatedPhotoEditToolUiRegistry.ts', 'utf8');
  const generatedSuggestions = readFileSync('src/ui/components/photo-editor/generatedPhotoEditToolSuggestionRegistry.ts', 'utf8');
  const generatedBrowserManifests = readFileSync('src/ui/components/photo-editor/generatedPhotoEditToolBrowserManifestRegistry.ts', 'utf8');
  assert.equal(existsSync('src/ui/components/photo-editor/photoEditToolUi.tsx'), false);
  assert.match(tools, /generatedPhotoEditToolUiPlugins/);
  assert.match(tools, /generatedPhotoEditToolBrowserManifests/);
  assert.doesNotMatch(tools, /generatedPhotoEditToolPlugins|PhotoEditToolRegistry/);
  assert.match(preview, /getPhotoEditToolUiPlugin/);
  assert.match(generatedUi, /plugins\/adjust\/ui/);
  assert.match(generatedUi, /plugins\/red-eye\/ui/);
  assert.match(generatedSuggestions, /plugins\/crop\/automatic/);
  assert.match(generatedSuggestions, /plugins\/focus\/automatic/);
  assert.match(generatedBrowserManifests, /PhotoEditToolBrowserManifest/);
  assert.match(generatedBrowserManifests, /"colour_pop"/);
  assert.doesNotMatch(generatedBrowserManifests, /tools\/plugins/);
});
