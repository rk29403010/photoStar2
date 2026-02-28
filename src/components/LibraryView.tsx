import React from 'react';
import type { Asset } from '../types/core';
import { LayoutEngine } from './layout/LayoutEngine';

interface LibraryViewProps {
    assets: Asset[];
    loading: boolean;
    onAssetClick?: (id: string) => void;
    selectedAssetId?: string | null;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ assets, loading, onAssetClick, selectedAssetId }) => {
    if (loading && assets.length === 0) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Loading library...</div>;
    }

    if (assets.length === 0) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                gap: 16
            }}>
                <div style={{ fontSize: '3rem', opacity: 0.3 }}>📂</div>
                <div>No photos found in library.</div>
                <div style={{ fontSize: '0.9rem' }}>Click &quot;Actions &gt; Scan Folder&quot; to import photos.</div>
            </div>
        );
    }

    return (
        <div style={{ height: '100%', overflowY: 'auto', background: '#0a0a0a' }}>
            <LayoutEngine
                assets={assets}
                debug={false}
                onAssetClick={onAssetClick}
                selectedAssetId={selectedAssetId}
            />
        </div>
    );
};
