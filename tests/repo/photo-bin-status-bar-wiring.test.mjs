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

test('status bar wiring supports action banners for undo', () => {
    const statusBannerModelSource = readWorkspaceFile('src/ui/components/app/statusBannerModel.ts');
    const statusBarSource = readWorkspaceFile('src/ui/components/app/AppStatusBar.tsx');
    const uiStateSource = readWorkspaceFile('src/ui/hooks/useAppRuntimeUi.ts');
    const loadedShellSource = readWorkspaceFile('src/ui/components/app/LoadedAppShell.tsx');

    assert.match(statusBannerModelSource, /export (interface|type) StatusBanner/);
    assert.match(statusBannerModelSource, /actionLabel\?: string/);
    assert.match(statusBannerModelSource, /onAction\?: \(\) => void/);
    assert.match(statusBannerModelSource, /export function createStatusMessageBanner/);

    assert.match(uiStateSource, /const \[statusBanner, setStatusBanner\] = useState<StatusBanner \| null>/);
    assert.match(uiStateSource, /const setStatusMessage = useCallback/);

    assert.match(statusBarSource, /statusBanner: StatusBanner \| null/);
    assert.match(statusBarSource, /statusBanner\?\.actionLabel/);
    assert.match(statusBarSource, /onClick=\{statusBanner\.onAction\}/);

    assert.match(loadedShellSource, /statusBanner=\{props\.uiState\.statusBanner\}/);
});
