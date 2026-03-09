import { useCallback, useState } from 'react';
import type { Asset, TileIntent } from '../../../shared/types/core';
import { PERSON_COLORS } from '../../../shared/types/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';
import { resolveImageUrl } from '../../config/backend';

interface TileProps {
    asset: Asset;
    intent?: TileIntent;
    debug?: boolean;
    selected?: boolean;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    imageLoading?: 'eager' | 'lazy';
    imageFetchPriority?: 'high' | 'auto';
}

type HoverZone = 'info' | 'caption' | null;

type SensitivityBadge = {
    label: string;
    color: string;
    bg: string;
};

type SensitivityStatus = 'safe' | 'review' | 'unsafe';

interface SensitivityAction {
    key: SensitivityStatus;
    title: string;
    label: string;
    activeBg: string;
    inactiveBg: string;
    activeColor: string;
    inactiveColor: string;
    border: string;
}

interface FaceOverlayVisuals {
    highlightColor: string;
    opacity: number;
    isFilteredPerson: boolean;
}

interface TileMediaProps {
    imgSrc: string | null;
    loadingMode: 'eager' | 'lazy';
    fetchPriority: 'high' | 'auto';
}

const SENSITIVITY_ACTIONS: SensitivityAction[] = [
    {
        key: 'safe',
        title: 'Mark Safe',
        label: '✓ Safe',
        activeBg: 'rgba(34,197,94,0.9)',
        inactiveBg: 'rgba(0,0,0,0.7)',
        activeColor: '#fff',
        inactiveColor: '#4ade80',
        border: '#16a34a55'
    },
    {
        key: 'review',
        title: 'Mark Requires Review',
        label: '⚠ Review',
        activeBg: 'rgba(245,158,11,0.9)',
        inactiveBg: 'rgba(0,0,0,0.7)',
        activeColor: '#fff',
        inactiveColor: '#fbbf24',
        border: '#d9770655'
    },
    {
        key: 'unsafe',
        title: 'Mark Unsafe',
        label: '🔞 Unsafe',
        activeBg: 'rgba(239,68,68,0.9)',
        inactiveBg: 'rgba(0,0,0,0.7)',
        activeColor: '#fff',
        inactiveColor: '#f87171',
        border: '#ef444455'
    }
];

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

function getFilename(asset: Asset): string {
    if (!asset.original_path) {return '';}
    return asset.original_path.replace(/\\/g, '/').split('/').pop() ?? asset.original_path;
}

function getDims(asset: Asset): string | null {
    if (!asset.width || !asset.height) {return null;}
    return `${asset.width} × ${asset.height}`;
}

function getBorder(selected: boolean): string {
    return selected ? '3px solid gold' : '0px solid transparent';
}

function getFaceVisuals(facePersonId: string | undefined, activeFilter: LibraryFilter | undefined, showFaces: boolean): FaceOverlayVisuals {
    let highlightColor = facePersonId ? 'cyan' : 'rgba(0, 255, 0, 0.5)';
    let opacity = showFaces ? 0.4 : 0;
    let isFilteredPerson = false;

    if (activeFilter && facePersonId) {
        const personIndex = activeFilter.personIds.indexOf(facePersonId);
        if (personIndex !== -1) {
            highlightColor = PERSON_COLORS[personIndex % PERSON_COLORS.length];
            opacity = 1;
            isFilteredPerson = true;
        }
    }

    return { highlightColor, opacity, isFilteredPerson };
}

const LoadedTileImage: React.FC<{ imgSrc: string; loadingMode: 'eager' | 'lazy'; fetchPriority: 'high' | 'auto' }> = ({ imgSrc, loadingMode, fetchPriority }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const handleImageRef = useCallback((image: HTMLImageElement | null) => {
        if (image && image.complete && image.naturalWidth > 0) {
            setIsLoaded(true);
        }
    }, []);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: '#050505' }}>
            {!isLoaded && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(30, 30, 30, 0.95), rgba(12, 12, 12, 0.85))', color: '#6b7280', fontSize: '0.7rem', letterSpacing: '0.04em' }}>
                    Loading preview...
                </div>
            )}
            <img
                ref={handleImageRef}
                src={imgSrc}
                loading={loadingMode}
                fetchPriority={fetchPriority}
                decoding="async"
                onLoad={() => setIsLoaded(true)}
                onError={() => setIsLoaded(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: isLoaded ? 1 : 0, transition: 'opacity 0.2s ease-out', display: 'block' }}
            />
        </div>
    );
};

const TileMedia: React.FC<TileMediaProps> = ({ imgSrc, loadingMode, fetchPriority }) => {
    if (!imgSrc) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: '0.8rem', flexDirection: 'column' }}>
                <span>🖼️</span>
                <span style={{ fontSize: '0.6rem', marginTop: 4 }}>Processing...</span>
            </div>
        );
    }

    return <LoadedTileImage key={imgSrc} imgSrc={imgSrc} loadingMode={loadingMode} fetchPriority={fetchPriority} />;
};

const SensitivityBadgeView: React.FC<{ badge: SensitivityBadge | null }> = ({ badge }) => {
    if (!badge) {return null;}

    return (
        <div
            style={{
                position: 'absolute',
                top: 6,
                left: 6,
                background: badge.bg,
                color: badge.color,
                borderRadius: 4,
                padding: '2px 6px',
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
                zIndex: 15,
                backdropFilter: 'blur(4px)',
                border: `1px solid ${badge.color}44`,
                userSelect: 'none',
                pointerEvents: 'none',
            }}
        >
            {badge.label}
        </div>
    );
};

const SensitivityButton: React.FC<{
    action: SensitivityAction;
    isActive: boolean;
    onClick: () => void;
}> = ({ action, isActive, onClick }) => (
    <button
        title={action.title}
        onClick={(e) => {
            e.stopPropagation();
            onClick();
        }}
        style={{
            background: isActive ? action.activeBg : action.inactiveBg,
            color: isActive ? action.activeColor : action.inactiveColor,
            border: `1px solid ${action.border}`,
            borderRadius: 3,
            padding: '2px 6px',
            fontSize: 10,
            fontWeight: 700,
            cursor: 'pointer',
        }}
    >
        {action.label}
    </button>
);

const SensitivityControls: React.FC<{
    visible: boolean;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    asset: Asset;
}> = ({ visible, onSetSensitivity, asset }) => {
    if (!visible || !onSetSensitivity) {return null;}

    return (
        <div
            style={{ position: 'absolute', bottom: 6, left: 6, display: 'flex', gap: 3, zIndex: 20, animation: 'fadeIn 0.15s ease-in forwards' }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {SENSITIVITY_ACTIONS.map((action) => {
                const isActive = asset.sensitivity_status === action.key;
                return (
                    <SensitivityButton
                        key={action.key}
                        action={action}
                        isActive={isActive}
                        onClick={() => onSetSensitivity(asset.id, isActive ? null : action.key)}
                    />
                );
            })}
        </div>
    );
};

const StackBadge: React.FC<{ count: number | null | undefined }> = ({ count }) => {
    if (count == null || count <= 1) {return null;}

    return (
        <div style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(59, 130, 246, 0.85)', color: 'white', borderRadius: '12px', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 700, zIndex: 15, border: '1px solid rgba(255,255,255,0.2)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 3, boxShadow: '0 2px 4px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {count}
        </div>
    );
};

const TechnicalOverlay: React.FC<{ show: boolean; filename: string; dims: string | null }> = ({ show, filename, dims }) => {
    if (!show) {return null;}

    return (
        <div style={{ position: 'absolute', top: 0, right: 0, left: 0, bottom: 0, background: 'linear-gradient(225deg, rgba(0,0,0,0.85) 45%, transparent 45%)', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-start', padding: '6px 8px', gap: 2, pointerEvents: 'none', animation: 'fadeIn 0.15s ease-in forwards' }}>
            <span style={{ fontSize: '0.65rem', color: '#e2e8f0', fontWeight: 600, fontFamily: 'monospace', textAlign: 'right', lineHeight: 1.4 }}>{filename}</span>
            {dims && <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontFamily: 'monospace' }}>{dims}px</span>}
        </div>
    );
};

const CaptionOverlay: React.FC<{ show: boolean; caption?: string }> = ({ show, caption }) => {
    if (!show || !caption) {return null;}

    return (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 70%, transparent 100%)', padding: '20px 8px 8px', pointerEvents: 'none', animation: 'fadeIn 0.15s ease-in forwards' }}>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#e2e8f0', lineHeight: 1.4, fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {caption}
            </p>
        </div>
    );
};

const DeclusterButton: React.FC<{
    visible: boolean;
    activeFilter?: LibraryFilter;
    assetId: string;
    onUntagAsset?: (assetId: string, personId: string) => void;
}> = ({ visible, activeFilter, assetId, onUntagAsset }) => {
    if (!visible || !activeFilter || activeFilter.type !== 'person_any' || activeFilter.personIds.length !== 1) {return null;}

    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onUntagAsset?.(assetId, activeFilter.personIds[0]);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer', zIndex: 20, boxShadow: '0 2px 5px rgba(0,0,0,0.3)' }}
        >
            Decluster
        </button>
    );
};

const FaceBoxes: React.FC<{ asset: Asset; showFaces: boolean; activeFilter?: LibraryFilter }> = ({ asset, showFaces, activeFilter }) => {
    if ((!showFaces && !activeFilter) || !asset.faces) {return null;}

    return (
        <>
            {asset.faces.map((face, i) => {
                const visuals = getFaceVisuals(face.person_id, activeFilter, showFaces);
                if (!showFaces && !visuals.isFilteredPerson) {return null;}

                return (
                    <div
                        key={i}
                        title={face.person_name || 'Unknown Person'}
                        style={{
                            position: 'absolute',
                            left: `${face.box[0] * 100}%`,
                            top: `${face.box[1] * 100}%`,
                            width: `${(face.box[2] - face.box[0]) * 100}%`,
                            height: `${(face.box[3] - face.box[1]) * 100}%`,
                            border: `2px solid ${visuals.highlightColor}`,
                            borderRadius: '2px',
                            boxShadow: visuals.isFilteredPerson ? '0 0 10px rgba(0,0,0,0.5), inset 0 0 5px rgba(0,0,0,0.3)' : 'none',
                            pointerEvents: 'none',
                            zIndex: 10,
                            opacity: visuals.opacity,
                        }}
                    />
                );
            })}
        </>
    );
};

const DebugIntent: React.FC<{ debug: boolean; intent: TileIntent }> = ({ debug, intent }) => {
    if (!debug) {return null;}

    return (
        <div style={{ position: 'absolute', bottom: 2, left: 2, fontSize: 10, color: 'white', background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 2 }}>
            {intent}
        </div>
    );
};

export const Tile: React.FC<TileProps> = ({
    asset,
    intent = 'normal',
    debug = false,
    selected = false,
    activeFilter,
    showFaces = false,
    onUntagAsset,
    onSetSensitivity,
    imageLoading = 'lazy',
    imageFetchPriority = 'auto'
}) => {
    const [hoverZone, setHoverZone] = useState<HoverZone>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const inTopRight = x > rect.width * 0.65 && y < rect.height * 0.35;
        setHoverZone(inTopRight ? 'info' : 'caption');
    }, []);

    const imgSrc = resolveImageUrl(asset.preview_path);
    const filename = getFilename(asset);
    const dims = getDims(asset);
    const sensitivityBadge = getSensitivityDisplay(asset);

    return (
        <div
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverZone(null)}
            style={{
                width: '100%',
                height: '100%',
                background: '#1a1a1a',
                overflow: 'hidden',
                position: 'relative',
                borderRadius: 4,
                border: getBorder(selected),
                boxSizing: 'border-box',
                cursor: 'pointer',
                transition: 'all 0.2s ease-out'
            }}
        >
            <TileMedia imgSrc={imgSrc} loadingMode={imageLoading} fetchPriority={imageFetchPriority} />
            <SensitivityBadgeView badge={sensitivityBadge} />
            <SensitivityControls visible={hoverZone !== null} onSetSensitivity={onSetSensitivity} asset={asset} />
            <StackBadge count={asset.stack_count} />
            <TechnicalOverlay show={hoverZone === 'info'} filename={filename} dims={dims} />
            <CaptionOverlay show={hoverZone === 'caption'} caption={asset.caption} />
            <DeclusterButton visible={hoverZone !== null} activeFilter={activeFilter} assetId={asset.id} onUntagAsset={onUntagAsset} />
            <FaceBoxes asset={asset} showFaces={showFaces} activeFilter={activeFilter} />
            <DebugIntent debug={debug} intent={intent} />
            <style>{`
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
};

