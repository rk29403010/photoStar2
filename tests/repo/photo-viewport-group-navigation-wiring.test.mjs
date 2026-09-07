import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('single-photo presentation navigation stays tied to the selected asset during image transitions', () => {
    const overlaySource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/SinglePhotoOverlay.tsx'), 'utf8');
    const filmstripSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/PresentationFilmstrip.tsx'), 'utf8');

    assert.match(overlaySource, /const semanticPresentation = props\.presentation && props\.presentation\.stackCount > 1/);
    assert.match(overlaySource, /presentationKey=\{semanticPresentation\.presentationKey\}/);
    assert.match(overlaySource, /selectedAsset=\{props\.asset\}/);
    assert.match(filmstripSource, /selectedAssetId=\{selectedAsset\.id\}/);
    assert.match(filmstripSource, /onSelectAsset=\{onSelectAsset\}/);
});
