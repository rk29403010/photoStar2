import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ai mode selector wiring defaults to live and flows through settings', () => {
    const appUiStateSource = fs.readFileSync('src/ui/hooks/useAppRuntimeUi.ts', 'utf8');
    const appSource = fs.readFileSync('src/ui/App.tsx', 'utf8');
    const overlaysSource = fs.readFileSync('src/ui/components/app/AppOverlays.tsx', 'utf8');
    const settingsModalSource = fs.readFileSync('src/ui/components/SettingsModal.tsx', 'utf8');

    assert.match(appUiStateSource, /usePersistedState<[^>]+>\('ps_ai_mode', 'live'\)/);
    assert.match(appSource, /aiMode=\{uiState\.aiMode\}/);
    assert.match(appSource, /setAiMode=\{uiState\.setAiMode\}/);
    assert.match(overlaysSource, /aiMode=\{props\.aiMode\}/);
    assert.match(overlaysSource, /setAiMode=\{props\.setAiMode\}/);
    assert.match(settingsModalSource, /AI Mode/);
    assert.match(settingsModalSource, /value=\{aiMode\}/);
    assert.match(settingsModalSource, /onChange=\{\(event\) => setAiMode\(event\.target\.value as AiMode\)\}/);
});
