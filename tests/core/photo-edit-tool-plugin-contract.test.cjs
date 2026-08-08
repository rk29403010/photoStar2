const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('photo edit registry validates generated plug-ins and rejects duplicates', async () => {
    const { PhotoEditToolRegistry } = await import('../../dist/core/src/services/photoEditing/photoEditToolRegistry.js');
    const { generatedPhotoEditToolPlugins } = await import('../../dist/core/src/services/photoEditing/generatedPhotoEditToolPluginRegistry.js');
    const registry = new PhotoEditToolRegistry();
    for (const plugin of generatedPhotoEditToolPlugins) { registry.registerPlugin(plugin); }
    assert.deepEqual(generatedPhotoEditToolPlugins.map((plugin) => plugin.id).sort(), ['adjust', 'blur', 'colour_pop', 'crop', 'dehaze', 'descreen', 'effects', 'focus', 'grayscale', 'red_eye', 'restore', 'rotate', 'sharpen']);
    assert.equal(registry.get('grayscale').label, 'Black & white');
    assert.equal(registry.get('descreen').label, 'Descreen print texture');
    assert.throws(() => registry.registerPlugin({ id: '', recipeVersion: 0, label: '', icon: '', group: '', defaults: {} }), /photoEditToolPlugin.id/);
    assert.throws(() => registry.registerPlugin(generatedPhotoEditToolPlugins[0]), /duplicate photo edit tool/);
});

test('generated photo tool registry is current and the host has no grayscale import', () => {
    assert.equal(fs.existsSync('src/services/photoEditing/generatedPhotoEditToolPluginRegistry.ts'), true);
    const host = fs.readFileSync('src/ui/components/photo-editor/photoEditorTools.ts', 'utf8');
    assert.equal(host.includes("tools/plugins/grayscale"), false);
});
