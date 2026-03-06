import React from 'react';
import type { Asset } from '../../shared/types/core';

interface DebugAssetPanelProps {
    asset: Asset;
    onUpdate: (id: string, updates: Partial<Asset>) => void;
    onClose: () => void;
}

export const DebugAssetPanel: React.FC<DebugAssetPanelProps> = ({ asset, onUpdate, onClose }) => {
    const manualState = asset.manualState || {};

    const toggle = (key: keyof typeof manualState) => {
        const newState = { ...manualState, [key]: !manualState[key] };
        onUpdate(asset.id, { manualState: newState });
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            width: 300,
            background: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: 8,
            padding: 16,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            color: '#eee'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Debug Asset</h3>
                <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: '#999', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: 12 }}>
                ID: {asset.id.slice(0, 8)}...<br />
                Ratio: {asset.width && asset.height ? (asset.height / asset.width).toFixed(2) : 'N/A'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={!!manualState.forceDocument}
                        onChange={() => toggle('forceDocument')}
                    />
                    Force Document (Mount)
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={!!manualState.forceHero}
                        onChange={() => toggle('forceHero')}
                    />
                    Force Hero
                </label>
            </div>
        </div>
    );
};
