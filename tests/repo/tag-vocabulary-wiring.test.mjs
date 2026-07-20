import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('app runtime ui exposes a vocabulary view', () => {
    const runtimeUiSource = readFileSync(new URL('../../src/ui/hooks/useAppRuntimeUi.ts', import.meta.url), 'utf8');
    assert.match(runtimeUiSource, /export type AppView = 'library' \| 'people' \| 'familyTree' \| 'dashboard' \| 'albums' \| 'reviews' \| 'vocabulary' \| 'workflows' \| 'groupDiagnostics';/);
});

test('Actions menu includes navigation for the vocabulary view', () => {
    const topBarSource = readFileSync(new URL('../../src/ui/components/TopBar.tsx', import.meta.url), 'utf8');
    const actionPanelSource = readFileSync(new URL('../../src/ui/components/ActionPanel.tsx', import.meta.url), 'utf8');

    assert.doesNotMatch(topBarSource, /<ViewButton view="vocabulary" current=\{view\} setView=\{setView\} \/>/);
    assert.match(actionPanelSource, /\{ label: 'Vocabulary', onClick: navigateTo\('vocabulary'\) \}/);
});

test('app main content renders the vocabulary view and shell passes the required actions', () => {
    const appMainContentSource = readFileSync(new URL('../../src/ui/components/app/AppMainContent.tsx', import.meta.url), 'utf8');
    const shellSource = readFileSync(new URL('../../src/ui/components/app/LoadedAppShell.tsx', import.meta.url), 'utf8');

    assert.match(appMainContentSource, /import \{ TagVocabularyView \} from '\.\.\/TagVocabularyView';/);
    assert.match(appMainContentSource, /props\.view === 'vocabulary'/);
    assert.match(shellSource, /onGetTagDefinitionDetail=\{actions\.getTagDefinitionDetail\}/);
    assert.match(shellSource, /onRenameTagDefinition=\{actions\.renameTagDefinition\}/);
    assert.match(shellSource, /onCreateTagAlias=\{actions\.createTagAlias\}/);
    assert.match(shellSource, /onDeleteTagAlias=\{actions\.deleteTagAlias\}/);
    assert.match(shellSource, /onMergeTagDefinitions=\{actions\.mergeTagDefinitions\}/);
});
