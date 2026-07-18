const test = require('node:test');
const assert = require('node:assert/strict');

test('focus presets expose tilt-shift, group focus, tunnel, and orbit recipes', async () => {
    const focus = await import('../../src/shared/photoEditing/focus.ts');
    const tiltShift = focus.focusPresetValues('tiltShift', focus.FOCUS_DEFAULTS);
    const group = focus.focusPresetValues('group', focus.FOCUS_DEFAULTS);
    const tunnel = focus.focusPresetValues('tunnel', focus.FOCUS_DEFAULTS);
    const orbit = focus.focusPresetValues('orbit', focus.FOCUS_DEFAULTS);
    assert.equal(tiltShift.shape, focus.FOCUS_SHAPE.straight);
    assert.equal(tiltShift.angle, 0);
    assert.equal(group.pointCount, 3);
    assert.equal(tunnel.style, focus.FOCUS_STYLE.radialZoom);
    assert.equal(orbit.style, focus.FOCUS_STYLE.orbitalBlur);
});

test('focus geometry supports centre, size, falloff, and angle dragging', async () => {
    const focus = await import('../../src/shared/photoEditing/focus.ts');
    const geometry = await import('../../src/ui/components/photo-editor/photoFocusGeometry.ts');
    const stage = { width: 800, height: 600 };
    const values = { ...focus.FOCUS_DEFAULTS, shape: focus.FOCUS_SHAPE.straight };
    const handles = geometry.focusHandlePositions(values, stage);
    const moved = geometry.dragFocusTarget(values, stage, { kind: 'centre', pointIndex: 0 }, { x: 160, y: 180 });
    const resized = geometry.dragFocusTarget(values, stage, { kind: 'size', pointIndex: 0 }, { x: handles.centre.x, y: handles.centre.y + 180 });
    const softened = geometry.dragFocusTarget(values, stage, { kind: 'falloff', pointIndex: 0 }, { x: handles.centre.x, y: handles.centre.y + 270 });
    const angled = geometry.dragFocusTarget(values, stage, { kind: 'angle', pointIndex: 0 }, { x: handles.centre.x, y: handles.centre.y + 100 });
    assert.deepEqual(focus.readFocusPoints(moved)[0], { x: 0.2, y: 0.3 });
    assert.equal(resized.size, 0.3);
    assert.equal(softened.falloff, 0.25);
    assert.equal(Math.round(angled.angle), 90);
});

test('focus point recipes cap portable numeric slots at five points', async () => {
    const focus = await import('../../src/shared/photoEditing/focus.ts');
    const points = Array.from({ length: 8 }, (_, index) => ({ x: index / 10, y: 0.5 }));
    const values = focus.writeFocusPoints(focus.FOCUS_DEFAULTS, points, 7);
    assert.equal(values.pointCount, focus.MAX_FOCUS_POINTS);
    assert.equal(values.selectedPoint, 4);
    assert.equal(focus.readFocusPoints(values).length, 5);
});

test('zero-strength focus is an exact alpha-preserving no-op', async () => {
    const focus = await import('../../src/shared/photoEditing/focus.ts');
    const source = Uint8Array.from([
        255, 0, 0, 80, 0, 255, 0, 120,
        0, 0, 255, 160, 255, 255, 255, 200,
    ]);
    const output = focus.applyFocusPixels(source, 2, 2, { ...focus.FOCUS_DEFAULTS, strength: 0 });
    assert.deepEqual([...output], [...source]);
});
