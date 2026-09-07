import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Asset } from '@contracts/core';
import type { LibraryPresentationExpansion, LibraryPresentationRelationshipKind } from '@contracts/libraryPresentation';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { FILLED_STAR_SYMBOL } from './variantFilmstripModel';

type PresentationFilmstripProps = {
    readonly presentationKey: string;
    readonly selectedAsset: Asset;
    readonly onGetPresentationExpansion: (presentationKey: string) => Promise<LibraryPresentationExpansion>;
    readonly onExpansionLoaded: (assets: Asset[]) => void;
    readonly onSelectAsset: (assetId: string) => void;
};

type PresentationFilmstripItemProps = {
    readonly asset: Asset;
    readonly selectedAssetId: string;
    readonly isRepresentative: boolean;
    readonly ordinal: number;
    readonly onSelectAsset: (assetId: string) => void;
};

function relationshipLabel(kind: LibraryPresentationRelationshipKind) {
    return kind?.replaceAll('_', ' ') ?? 'related photos';
}

function getTileStyle(isSelected: boolean) {
    return {
        width: 72,
        height: 78,
        flexShrink: 0,
        borderRadius: 8,
        overflow: 'hidden',
        cursor: 'pointer',
        border: isSelected ? '2px solid rgba(255, 248, 220, 0.96)' : '2px solid rgba(255, 255, 255, 0.08)',
        opacity: isSelected ? 1 : 0.6,
        transition: 'all 0.2s',
        position: 'relative',
        background: '#17110f',
        boxShadow: isSelected ? '0 0 0 1px rgba(0, 0, 0, 0.65)' : 'inset 0 0 0 1px rgba(0, 0, 0, 0.38)',
        display: 'flex',
        flexDirection: 'column',
    } as const;
}

function updateTileOpacity(target: HTMLDivElement, isSelected: boolean, opacity: string) {
    if (!isSelected) {
        target.style.opacity = opacity;
    }
}

function PresentationTile({
    asset,
    selectedAssetId,
    isRepresentative,
    ordinal,
    onSelectAsset,
}: PresentationFilmstripItemProps) {
    const isSelected = asset.id === selectedAssetId;
    const imgSrc = resolveImageUrl(asset.preview_path ?? asset.original_path) || '';

    return (
        <div
            onClick={(event) => {
                event.stopPropagation();
                onSelectAsset(asset.id);
            }}
            style={getTileStyle(isSelected)}
            onMouseEnter={(event) => updateTileOpacity(event.currentTarget, isSelected, '1')}
            onMouseLeave={(event) => updateTileOpacity(event.currentTarget, isSelected, '0.6')}
            title={isRepresentative ? 'Current star image' : 'View this related photo'}
        >
            <div style={{ position: 'relative', width: '100%', height: 52 }}>
                <img loading="lazy" src={imgSrc} alt="Related preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {isRepresentative ? (
                    <div
                        aria-hidden
                        style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            zIndex: 2,
                            width: 22,
                            height: 22,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '999px',
                            background: 'rgba(0, 0, 0, 0.82)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.58)',
                            color: '#facc15',
                            fontSize: 15,
                            lineHeight: 1,
                        }}
                    >
                        {FILLED_STAR_SYMBOL}
                    </div>
                ) : null}
            </div>
            <div style={{
                padding: '4px 6px 5px',
                background: 'rgba(11, 8, 7, 0.92)',
                color: '#d6d3d1',
                fontSize: 10,
                lineHeight: 1.1,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 6,
            }}>
                <span>Photo</span>
                <span>{ordinal + 1}</span>
            </div>
        </div>
    );
}

function FilmStripSprockets() {
    return (
        <>
            <div style={{ position: 'absolute', top: 8, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
                {Array.from({ length: 10 }).map((_, index) => (
                    <span key={`top-${index}`} style={{ width: 10, height: 6, borderRadius: 999, background: 'rgba(245, 222, 179, 0.22)' }} />
                ))}
            </div>
            <div style={{ position: 'absolute', bottom: 8, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
                {Array.from({ length: 10 }).map((_, index) => (
                    <span key={`bottom-${index}`} style={{ width: 10, height: 6, borderRadius: 999, background: 'rgba(245, 222, 179, 0.22)' }} />
                ))}
            </div>
        </>
    );
}

function usePresentationExpansion(
    presentationKey: string,
    onGetPresentationExpansion: PresentationFilmstripProps['onGetPresentationExpansion'],
    onExpansionLoaded: PresentationFilmstripProps['onExpansionLoaded'],
) {
    const [expansion, setExpansion] = useState<LibraryPresentationExpansion | null>(null);
    const getExpansionRef = useRef(onGetPresentationExpansion);
    const onExpansionLoadedRef = useRef(onExpansionLoaded);

    useEffect(() => {
        getExpansionRef.current = onGetPresentationExpansion;
    }, [onGetPresentationExpansion]);
    useEffect(() => {
        onExpansionLoadedRef.current = onExpansionLoaded;
    }, [onExpansionLoaded]);

    useEffect(() => {
        let mounted = true;
        void getExpansionRef.current(presentationKey)
            .then((nextExpansion) => {
                if (!mounted) {
                    return;
                }
                setExpansion(nextExpansion);
                onExpansionLoadedRef.current(nextExpansion.items.map((item) => item.asset));
            })
            .catch((error: unknown) => console.error('Failed to load presentation filmstrip:', error));
        return () => {
            mounted = false;
        };
    }, [presentationKey]);

    return expansion;
}

export const PresentationFilmstrip: React.FC<PresentationFilmstripProps> = ({
    presentationKey,
    selectedAsset,
    onGetPresentationExpansion,
    onExpansionLoaded,
    onSelectAsset,
}) => {
    const expansion = usePresentationExpansion(presentationKey, onGetPresentationExpansion, onExpansionLoaded);
    if (!expansion || expansion.items.length <= 1) {
        return null;
    }

    return (
        <div style={{
            position: 'absolute',
            bottom: 92,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(180deg, rgba(55, 41, 34, 0.94) 0%, rgba(20, 15, 13, 0.96) 100%)',
            backdropFilter: 'blur(10px)',
            borderRadius: 12,
            padding: '18px 18px',
            zIndex: 100,
            border: '1px solid rgba(255, 240, 220, 0.12)',
            boxShadow: '0 16px 32px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)',
            maxWidth: '90vw',
            overflow: 'hidden',
        }}>
            <FilmStripSprockets />
            <div style={{
                marginBottom: 10,
                color: '#e7e5e4',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
            }}>
                {relationshipLabel(expansion.relationshipKind)} · {expansion.items.length} photos
            </div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '6px 0', scrollbarWidth: 'thin' }}>
                {expansion.items.map((item) => (
                    <PresentationTile
                        key={item.asset.id}
                        asset={item.asset}
                        selectedAssetId={selectedAsset.id}
                        isRepresentative={item.isRepresentative}
                        ordinal={item.ordinal}
                        onSelectAsset={onSelectAsset}
                    />
                ))}
            </div>
        </div>
    );
};
