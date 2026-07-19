const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

test('Tune Image uses a complete zero-centred recipe and guided ranges', async () => {
  const controls = await import('../../src/ui/components/photo-editor/tuneImageControls.ts');
  assert.deepEqual(controls.TUNE_IMAGE_DEFAULTS, { brightness: 0, contrast: 0, shadows: 0, midtones: 0, highlights: 0, blackPoint: 0, whitePoint: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0, hue: 0 });
  assert.deepEqual(controls.TUNE_GUIDED_CONTROLS, ['brightness', 'shadows', 'highlights', 'contrast', 'temperature', 'vibrance']);
  assert.equal(controls.isOutsideGuidedRange('brightness', 70), true);
  assert.equal(controls.isOutsideGuidedRange('brightness', 40), false);
  assert.equal(controls.formatTuneValue('hue', -45), '-45°');
});

test('Tune Image presents Guided and Advanced without auto tuning or hue-coloured thumb', () => {
  const component = readFileSync('src/ui/components/photo-editor/PhotoTuneOptions.tsx', 'utf8');
  const styles = readFileSync('src/ui/components/photo-editor/PhotoTuneOptions.css', 'utf8');
  assert.match(component, /Guided/);
  assert.match(component, /Advanced/);
  assert.match(component, /Advanced value:/);
  assert.match(component, /Reset Light/);
  assert.match(component, /Reset Colour/);
  assert.doesNotMatch(component, /Auto tune|Auto light|Auto colour/);
  assert.match(styles, /\.photo-tune-hue/);
  assert.match(styles, /background: var\(--surface\)/);
});
