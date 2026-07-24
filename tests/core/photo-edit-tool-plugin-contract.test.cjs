const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('photo edit registry validates generated plug-ins and gives them legacy precedence', async () => {
    const { PhotoEditToolRegistry } = await import('../../dist/core/src/services/photoEditing/photoEditToolRegistry.js');
    const { generatedPhotoEditToolPlugins } = await import('../../dist/core/src/services/photoEditing/generatedPhotoEditToolPluginRegistry.js');
    const registry = new PhotoEditToolRegistry();
    for (const plugin of generatedPhotoEditToolPlugins) { registry.registerPlugin(plugin); }
    assert.equal(registry.get('grayscale').label, 'Black & white');
    assert.equal(registry.registerLegacy({ id: 'grayscale', recipeVersion: 1, label: 'Old', icon: 'Contrast', group: 'legacy', defaults: {} }), false);
    assert.throws(() => registry.registerPlugin({ id: '', recipeVersion: 0, label: '', icon: '', group: '', defaults: {} }), /photoEditToolPlugin.id/);
    assert.throws(() => registry.registerPlugin(generatedPhotoEditToolPlugins[0]), /duplicate photo edit tool/);
});

test('generated photo tool registry is current and the host has no grayscale import', () => {
    assert.equal(fs.existsSync('src/services/photoEditing/generatedPhotoEditToolPluginRegistry.ts'), true);
    const host = fs.readFileSync('src/ui/components/photo-editor/photoEditorTools.ts', 'utf8');
    assert.equal(host.includes("tools/plugins/grayscale"), false);
});
