import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ai mode selector wiring defaults to live and flows through the action panel', () => {
    const appUiStateSource = fs.readFileSync('src/ui/hooks/useAppRuntimeUi.ts', 'utf8');
    const appSource = fs.readFileSync('src/ui/App.tsx', 'utf8');
    const overlaysSource = fs.readFileSync('src/ui/components/app/AppOverlays.tsx', 'utf8');
    const actionPanelSource = fs.readFileSync('src/ui/components/ActionPanel.tsx', 'utf8');

    assert.match(appUiStateSource, /usePersistedState<[^>]+>\('ps_ai_mode', 'live'\)/);
    assert.match(appSource, /aiMode=\{uiState\.aiMode\}/);
    assert.match(appSource, /setAiMode=\{uiState\.setAiMode\}/);
    assert.match(overlaysSource, /aiMode:\s*AiMode/);
    assert.match(actionPanelSource, /AI Mode/);
    assert.match(actionPanelSource, /value=\{props\.aiMode\}/);
    assert.match(actionPanelSource, /onChange=\{\(event\) => props\.setAiMode\(event\.target\.value as 'mock' \| 'live' \| 'off'\)\}/);
});
