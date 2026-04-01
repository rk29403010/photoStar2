import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '..', '..');

test('photo date review action is wired from App through the single-photo file tab', () => {
    const appSource = readFileSync(path.join(workspaceRoot, 'src/ui/App.tsx'), 'utf8');
    const loadedShellSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/app/LoadedAppShell.tsx'), 'utf8');
    const overlaysSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/app/AppOverlays.tsx'), 'utf8');
    const singlePhotoSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/SinglePhotoView.tsx'), 'utf8');
    const overlaySource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/SinglePhotoOverlay.tsx'), 'utf8');
    const infoPanelSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/InfoPanel.tsx'), 'utf8');
    const fileTabSource = readFileSync(path.join(workspaceRoot, 'src/ui/components/single-photo/info-panel/FileTab.tsx'), 'utf8');

    assert.match(appSource, /handleFlagPhotoDateCorrection/);
    assert.match(loadedShellSource, /onFlagPhotoDateCorrection=\{props\.handleFlagPhotoDateCorrection\}/);
    assert.match(overlaysSource, /onFlagPhotoDateCorrection=\{props\.onFlagPhotoDateCorrection\}/);
    assert.match(singlePhotoSource, /onFlagPhotoDateCorrection\?: \(input: PhotoDateCorrectionInput\) => Promise<void>;/);
    assert.match(singlePhotoSource, /onFlagPhotoDateCorrection=\{onFlagPhotoDateCorrection\}/);
    assert.match(overlaySource, /onFlagPhotoDateCorrection=\{onFlagPhotoDateCorrection\}/);
    assert.match(infoPanelSource, /onFlagPhotoDateCorrection=\{onFlagPhotoDateCorrection\}/);
    assert.match(fileTabSource, /onFlagPhotoDateCorrection\?: \(input: PhotoDateCorrectionInput\) => Promise<void>/);
});
