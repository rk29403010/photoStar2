const test = require('node:test');
const assert = require('node:assert/strict');

function operation(tool, values, maskId = null) {
    return { id: 'operation-1', tool, name: tool, enabled: true, maskId, values };
}

test('dehaze slider drafts produce an immediate browser-side approximation', async () => {
    const { getLivePreviewStyle } = await import('../../src/ui/components/photo-editor/photoEditLivePreview.ts');
    const baseline = operation('dehaze', { strength: 0.2, radiusPercent: 1.5 });
    const current = operation('dehaze', { strength: 0.8, radiusPercent: 1.5 });

    assert.match(getLivePreviewStyle(current, baseline).filter, /contrast\(1\.420\)/);
    assert.match(getLivePreviewStyle(current, baseline).filter, /saturate\(1\.210\)/);
});

test('tune image drafts combine brightness, contrast, saturation, and hue feedback', async () => {
    const { getLivePreviewStyle } = await import('../../src/ui/components/photo-editor/photoEditLivePreview.ts');
    const baseline = operation('adjust', { brightness: 1, contrast: 0, saturation: 1, hue: 0 });
    const current = operation('adjust', { brightness: 1.2, contrast: 0.1, saturation: 1.3, hue: 20 });

    assert.equal(
        getLivePreviewStyle(current, baseline).filter,
        'brightness(1.200) contrast(1.100) saturate(1.300) hue-rotate(20.000deg)',
    );
});

test('rotate drafts provide an immediate transform before the exact preview arrives', async () => {
    const { getLivePreviewStyle } = await import('../../src/ui/components/photo-editor/photoEditLivePreview.ts');

    assert.deepEqual(
        getLivePreviewStyle(operation('rotate', { angle: 35 }), operation('rotate', { angle: 10 })),
        { transform: 'rotate(25.000deg)' },
    );
});

test('masked operations avoid misleading whole-photo approximations', async () => {
    const { getLivePreviewStyle } = await import('../../src/ui/components/photo-editor/photoEditLivePreview.ts');

    assert.equal(
        getLivePreviewStyle(operation('dehaze', { strength: 0.8 }, 'mask-1'), operation('dehaze', { strength: 0.2 }, 'mask-1')),
        undefined,
    );
});
