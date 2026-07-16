const test = require('node:test');
const assert = require('node:assert/strict');

test('straighten correction chooses the nearest horizontal or vertical axis', async () => {
    const { straightenCorrection } = await import('../../src/ui/components/photo-editor/rotationGeometry.ts');
    assert.ok(Math.abs(straightenCorrection({ x: 0, y: 0 }, { x: 1, y: 0.2 }) + 11.3099) < 0.001);
    assert.ok(Math.abs(straightenCorrection({ x: 0, y: 0 }, { x: 0.1, y: 1 }) - 5.7106) < 0.001);
});

test('fixed rotation preserves dimensions and expanded rotation keeps the original canvas anchor', async () => {
    const { rotationLayout } = await import('../../src/ui/components/photo-editor/rotationGeometry.ts');
    const fixed = rotationLayout({ angle: 45, expandCanvas: false, height: 80, pivot: { x: 0.2, y: 0.5 }, width: 100 });
    const expanded = rotationLayout({ angle: 45, expandCanvas: true, height: 80, pivot: { x: 0.2, y: 0.5 }, width: 100 });
    assert.deepEqual(fixed, { height: 80, minX: 0, minY: 0, pivotX: 20, pivotY: 40, width: 100 });
    assert.ok(expanded.width > 100);
    assert.ok(expanded.height > 80);
    assert.ok(expanded.pivotX !== expanded.width / 2);
});

test('rotation angle snapping uses whole degrees and Shift-modified five-degree steps', async () => {
    const { normalizeRotationAngle, snapRotationAngle } = await import('../../src/ui/components/photo-editor/rotationGeometry.ts');
    assert.equal(snapRotationAngle(12.6, false), 13);
    assert.equal(snapRotationAngle(12.6, true), 15);
    assert.equal(snapRotationAngle(-12.6, true), -15);
    assert.equal(normalizeRotationAngle(270), -90);
    assert.equal(normalizeRotationAngle(-270), 90);
});
