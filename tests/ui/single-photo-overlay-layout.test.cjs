const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('single photo overlay layout reserves right-side clearance for the info panel and keeps loading status left aligned', async () => {
    const {
        CONTROLS_IDLE_MS,
        getTopBarRightClearance,
        getLoadingBadgeStyle,
    } = await import('../../src/ui/components/single-photo/singlePhotoOverlayLayout.ts');

    assert.equal(CONTROLS_IDLE_MS, 10_000);
    assert.equal(getTopBarRightClearance({ showInfoPanel: false, infoPanelWidth: 360 }), 20);
    assert.equal(getTopBarRightClearance({ showInfoPanel: true, infoPanelWidth: 360 }), 392);

    assert.deepEqual(getLoadingBadgeStyle(), {
        position: 'absolute',
        left: 24,
        bottom: 28,
        padding: '8px 14px',
        borderRadius: 999,
        background: 'rgba(8, 12, 24, 0.82)',
        border: '1px solid rgba(148, 163, 184, 0.28)',
        color: '#e2e8f0',
        fontSize: 12,
        backdropFilter: 'blur(8px)',
        zIndex: 11,
    });
});

test('single photo overlay wires the info panel close button back to the shared panel state', () => {
    const overlaySource = fs.readFileSync('src/ui/components/single-photo/SinglePhotoOverlay.tsx', 'utf8');
    const infoPanelSource = fs.readFileSync('src/ui/components/single-photo/InfoPanel.tsx', 'utf8');

    assert.match(overlaySource, /onClose=\{\(\) => props\.panelState\.setShowInfoPanel\(false\)\}/);
    assert.match(infoPanelSource, /onClose\?: \(\) => void/);
    assert.match(infoPanelSource, /title="Hide info panel"/);
});

test('single photo overlay keeps info panel values selectable', () => {
    const overlaySource = fs.readFileSync('src/ui/components/single-photo/SinglePhotoOverlay.tsx', 'utf8');
    const sharedInfoPanelSource = fs.readFileSync('src/ui/components/single-photo/info-panel/shared.tsx', 'utf8');

    assert.doesNotMatch(overlaySource, /userSelect:\s*'none'/);
    assert.match(sharedInfoPanelSource, /userSelect:\s*'text'/);
});
