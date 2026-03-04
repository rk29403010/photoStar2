import React from 'react';
import type { Asset } from '../types/core';
import type { LibraryFilter } from '../hooks/usePhotoLibrary';
import { LayoutEngine } from './layout/LayoutEngine';

interface LibraryViewProps {
    assets: Asset[];
    loading: boolean;
    onAssetClick?: (id: string) => void;
    selectedAssetId?: string | null;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    librarySelection?: Set<string>;
    onLibrarySelectionChange?: (selection: Set<string>) => void;
    declusteredAssets?: Set<string>;
    showRejected?: boolean;
    rejectedAssets?: Asset[];
}

export const LibraryView: React.FC<LibraryViewProps> = ({ assets, loading, onAssetClick, selectedAssetId, activeFilter, showFaces, onUntagAsset, onSetSensitivity, librarySelection, onLibrarySelectionChange, declusteredAssets, showRejected, rejectedAssets }) => {
    const displayAssets = React.useMemo(() => {
        if (!declusteredAssets || declusteredAssets.size === 0) return assets;
        const normal = assets.filter(a => !declusteredAssets.has(a.id));
        const trailing = assets.filter(a => declusteredAssets.has(a.id));
        return [...normal, ...trailing];
    }, [assets, declusteredAssets]);

    if (loading && assets.length === 0) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Loading library...</div>;
    }

    if (assets.length === 0 && (!showRejected || !rejectedAssets || rejectedAssets.length === 0)) {
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
                assets={displayAssets}
                debug={false}
                onAssetClick={onAssetClick}
                selectedAssetId={selectedAssetId}
                activeFilter={activeFilter}
                showFaces={showFaces}
                onUntagAsset={onUntagAsset}
                onSetSensitivity={onSetSensitivity}
                librarySelection={librarySelection}
                onLibrarySelectionChange={onLibrarySelectionChange}
                declusteredAssets={declusteredAssets}
            />

            {/* Rejected Assets Section */}
            {showRejected && rejectedAssets && rejectedAssets.length > 0 && (
                <div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 24px',
                        borderTop: '1px solid #1f1f1f',
                        color: '#555',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase'
                    }}>
                        <span style={{ color: '#ef4444', opacity: 0.7 }}>🚫</span>
                        <span>Rejected — {rejectedAssets.length} photo{rejectedAssets.length !== 1 ? 's' : ''} removed from this person</span>
                        <div style={{ flex: 1, height: 1, background: '#1f1f1f' }} />
                    </div>
                    <div style={{ opacity: 0.45, filter: 'grayscale(40%)' }}>
                        <LayoutEngine
                            assets={rejectedAssets}
                            debug={false}
                            onAssetClick={onAssetClick}
                            selectedAssetId={selectedAssetId}
                            activeFilter={undefined}
                            showFaces={false}
                            onUntagAsset={undefined}
                            onSetSensitivity={undefined}
                            librarySelection={undefined}
                            onLibrarySelectionChange={undefined}
                            declusteredAssets={undefined}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

