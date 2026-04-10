import { useCallback, useEffect, useState } from 'react';
import type { Asset, TileIntent } from '@contracts/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { LIBRARY_SELECTION_FRAME_COLOR } from '@shared/utils/librarySelectionVisuals';
import { TileOverlays, type SensitivityBadge } from './TileOverlays';

interface TileProps {
    asset: Asset;
    intent?: TileIntent;
    debug?: boolean;
    selected?: boolean;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    onHoverAssetChange?: (asset: Asset | null) => void;
    imageLoading?: 'eager' | 'lazy';
    imageFetchPriority?: 'high' | 'auto';
    isGroupRepresentative?: boolean;
    showGroupIds?: boolean;
    hoveredGroupId?: string | null;
    onHoveredGroupIdChange?: (groupId: string | null) => void;
    isScrollSettled?: boolean;
}

interface TileMediaProps {
    imgSrc: string | null;
    loadingMode: 'eager' | 'lazy';
    fetchPriority: 'high' | 'auto';
    onImageVisibleChange: (visible: boolean) => void;
}

const TILE_FADE_IN_KEYFRAMES = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(5px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
const DEFAULT_TILE_PROPS = {
    intent: 'normal' as TileIntent,
    debug: false,
    selected: false,
    showFaces: false,
    imageLoading: 'lazy' as const,
    imageFetchPriority: 'auto' as const,
    isGroupRepresentative: false,
    showGroupIds: false,
    isScrollSettled: true,
};

function getSensitivityDisplay(asset: Asset): SensitivityBadge | null {
    const manualStatus = asset.sensitivity_status;
    if (manualStatus === 'unsafe') {return { label: '🔞 Unsafe', color: '#ef4444', bg: 'rgba(127,29,29,0.9)' };}
    if (manualStatus === 'review') {return { label: '⚠ Review', color: '#f59e0b', bg: 'rgba(120,53,15,0.9)' };}
    if (manualStatus === 'safe') {return null;}

    const score = asset.sensitivity_score;
    if (score == null) {return null;}
    if (score >= 75) {return { label: `🔞 ${score}%`, color: '#ef4444', bg: 'rgba(127,29,29,0.85)' };}
    if (score >= 25) {return { label: `⚠ ${score}%`, color: '#f59e0b', bg: 'rgba(120,53,15,0.85)' };}
    return null;
}

function getBorder(selected: boolean): string {
    return selected ? `2px solid ${LIBRARY_SELECTION_FRAME_COLOR}` : '0px solid transparent';
}

function getTileContainerStyle(selected: boolean) {
    return {
        width: '100%',
        height: '100%',
        background: '#1a1a1a',
        overflow: 'hidden',
        position: 'relative' as const,
        borderRadius: 4,
        border: getBorder(selected),
        boxSizing: 'border-box' as const,
        cursor: 'pointer',
        transition: 'all 0.2s ease-out',
    };
}

function useTileHoverState(asset: Asset, onHoverAssetChange?: (asset: Asset | null) => void) {
    const [isHovered, setIsHovered] = useState(false);
    const handleMouseEnter = useCallback(() => {
        setIsHovered(true);
        onHoverAssetChange?.(asset);
    }, [asset, onHoverAssetChange]);
    const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
        onHoverAssetChange?.(null);
    }, [onHoverAssetChange]);

    return { isHovered, handleMouseEnter, handleMouseLeave };
}

function getTileProps(props: TileProps) {
    return {
        ...DEFAULT_TILE_PROPS,
        ...props,
        hoveredGroupId: props.hoveredGroupId ?? null,
    };
}

const LoadedTileImage: React.FC<{
    imgSrc: string;
    loadingMode: 'eager' | 'lazy';
    fetchPriority: 'high' | 'auto';
    onImageVisibleChange: (visible: boolean) => void;
}> = ({ imgSrc, loadingMode, fetchPriority, onImageVisibleChange }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const markLoaded = useCallback(() => {
        setIsLoaded(true);
        onImageVisibleChange(true);
    }, [onImageVisibleChange]);
    const handleImageRef = useCallback((image: HTMLImageElement | null) => {
        if (image && image.complete && image.naturalWidth > 0) {
            markLoaded();
        }
    }, [markLoaded]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: '#050505' }}>
            {!isLoaded && (
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(30, 30, 30, 0.95), rgba(12, 12, 12, 0.85))' }} />
            )}
            <img
                ref={handleImageRef}
                src={imgSrc}
                loading={loadingMode}
                fetchPriority={fetchPriority}
                decoding="async"
                onLoad={markLoaded}
                onError={() => {
                    setIsLoaded(true);
                    onImageVisibleChange(false);
                }}
                style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: isLoaded ? 1 : 0, transition: 'opacity 0.2s ease-out', display: 'block' }}
            />
        </div>
    );
};

const TileMedia: React.FC<TileMediaProps> = ({ imgSrc, loadingMode, fetchPriority, onImageVisibleChange }) => {
    if (!imgSrc) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: '0.8rem', flexDirection: 'column' }}>
                <span>🖼️</span>
                <span style={{ fontSize: '0.6rem', marginTop: 4 }}>Processing...</span>
            </div>
        );
    }

    return <LoadedTileImage key={imgSrc} imgSrc={imgSrc} loadingMode={loadingMode} fetchPriority={fetchPriority} onImageVisibleChange={onImageVisibleChange} />;
};

export const Tile: React.FC<TileProps> = (props) => {
    const {
        asset,
        intent,
        debug,
        selected,
        activeFilter,
        showFaces,
        onUntagAsset,
        onHoverAssetChange,
        imageLoading,
        imageFetchPriority,
        isGroupRepresentative,
        showGroupIds,
        hoveredGroupId,
        onHoveredGroupIdChange,
        isScrollSettled,
    } = getTileProps(props);
    const imgSrc = asset.preview_data_url ?? resolveImageUrl(asset.preview_path);
    const sensitivityBadge = getSensitivityDisplay(asset);
    const { isHovered, handleMouseEnter, handleMouseLeave } = useTileHoverState(asset, onHoverAssetChange);
    const [isImageVisible, setIsImageVisible] = useState(false);

    useEffect(() => {
        setIsImageVisible(false);
    }, [imgSrc]);

    return (
        <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={getTileContainerStyle(selected)}>
            <TileMedia imgSrc={imgSrc} loadingMode={imageLoading} fetchPriority={imageFetchPriority} onImageVisibleChange={setIsImageVisible} />
            <TileOverlays
                selected={selected}
                sensitivityBadge={sensitivityBadge}
                stackCount={asset.stack_count}
                isGroupRepresentative={isGroupRepresentative}
                groupMemberships={asset.group_memberships}
                showGroupIds={showGroupIds}
                hoveredGroupId={hoveredGroupId}
                onHoveredGroupIdChange={onHoveredGroupIdChange}
                isHovered={isHovered}
                caption={asset.caption}
                activeFilter={activeFilter}
                assetId={asset.id}
                onUntagAsset={onUntagAsset}
                asset={asset}
                showFaces={showFaces}
                debug={debug}
                intent={intent}
                isImageVisible={isImageVisible}
                isScrollSettled={isScrollSettled}
            />
            <style>{TILE_FADE_IN_KEYFRAMES}</style>
        </div>
    );
};
