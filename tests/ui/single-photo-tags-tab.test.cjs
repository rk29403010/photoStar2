const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('single-photo info panel exposes tagging in an icon-only Tags tab', () => {
    const panelSource = readFileSync('src/ui/components/single-photo/InfoPanel.tsx', 'utf8');
    const profileSource = readFileSync('src/ui/components/single-photo/info-panel/ProfileTab.tsx', 'utf8');
    const tagsSource = readFileSync('src/ui/components/single-photo/info-panel/TagsTab.tsx', 'utf8');

    assert.match(panelSource, /\{ id: 'tags', emoji: '🏷️', label: 'Tags' \}/);
    assert.match(panelSource, /title=\{tab\.label\}/);
    assert.match(panelSource, /aria-label=\{tab\.label\}/);
    assert.doesNotMatch(panelSource, /\{tab\.label\}<\/span>/);
    assert.doesNotMatch(profileSource, /TagManagementSection/);
    assert.match(tagsSource, /<TagManagementSection \{\.\.\.props\} \/>/);
});
