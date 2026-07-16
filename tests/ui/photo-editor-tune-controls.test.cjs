const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('tune controls map existing recipe values to integer percentages', async () => {
    const controls = await import('../../src/ui/components/photo-editor/tuneImageControls.ts');
    assert.equal(controls.tunePercentFromRecipeValue('brightness', 1.234), 23);
    assert.equal(controls.tunePercentFromRecipeValue('contrast', -0.456), -46);
    assert.equal(controls.tunePercentFromRecipeValue('saturation', 2), 100);
    assert.equal(controls.formatTunePercent(20), '+20%');
    assert.equal(controls.formatTunePercent(0), '0%');
});

test('tune percentage changes retain the persisted recipe scale', async () => {
    const controls = await import('../../src/ui/components/photo-editor/tuneImageControls.ts');
    assert.equal(controls.recipeValueFromTunePercent('brightness', -100), 0);
    assert.equal(controls.recipeValueFromTunePercent('contrast', 75), 0.75);
    assert.equal(controls.recipeValueFromTunePercent('saturation', 50), 1.5);
    assert.equal(controls.recipeValueFromTunePercent('brightness', 130), 2);
});

test('tune controls expose compact reset actions and a visible value for every setting', () => {
    const component = readFileSync('src/ui/components/photo-editor/PhotoTuneOptions.tsx', 'utf8');
    const sidebar = readFileSync('src/ui/components/photo-editor/PhotoEditorSidebar.tsx', 'utf8');
    const styles = readFileSync('src/ui/components/photo-editor/PhotoTuneOptions.css', 'utf8');
    assert.match(sidebar, /<PhotoTuneOptions\s+operation=\{props\.operation\}/);
    assert.match(component, /className="photo-tune-range photo-tune-hue w-full"/);
    assert.match(component, /ResetTuneButton/);
    assert.match(component, /aria-label={`Reset \$\{props\.label\}`}/);
    assert.match(component, /<RotateCcw aria-hidden="true" size=\{13\}/);
    assert.match(component, />\{hue\}°<\/output>/);
    assert.match(styles, /\.photo-tune-hue::-webkit-slider-runnable-track/);
    assert.match(styles, /background: var\(--tune-hue\)/);
});
