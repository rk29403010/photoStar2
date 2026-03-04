import React, { useState, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Asset, TileIntent } from '../../types/core';
import { PERSON_COLORS } from '../../types/core';
import type { LibraryFilter } from '../../hooks/usePhotoLibrary';

interface TileProps {
    asset: Asset;
    intent?: TileIntent;
    debug?: boolean;
    selected?: boolean;
    activeFilter?: LibraryFilter;
    showFaces?: boolean;
    onUntagAsset?: (assetId: string, personId: string) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
}

// Derive effective sensitivity status: manual override wins over AI score
function getSensitivityDisplay(asset: Asset): { label: string; color: string; bg: string } | null {
    const manualStatus = asset.sensitivity_status;
    if (manualStatus === 'unsafe') return { label: '🔞 Unsafe', color: '#ef4444', bg: 'rgba(127,29,29,0.9)' };
    if (manualStatus === 'review') return { label: '⚠ Review', color: '#f59e0b', bg: 'rgba(120,53,15,0.9)' };
    if (manualStatus === 'safe') return null; // manual safe — no badge
    // Fall back to AI score if no manual override
    const score = asset.sensitivity_score;
    if (score == null) return null;
    if (score >= 75) return { label: `🔞 ${score}%`, color: '#ef4444', bg: 'rgba(127,29,29,0.85)' };
    if (score >= 25) return { label: `⚠ ${score}%`, color: '#f59e0b', bg: 'rgba(120,53,15,0.85)' };
    return null; // safe
}

export const Tile: React.FC<TileProps> = ({
    asset, intent = 'normal', debug = false, selected = false,
    activeFilter, showFaces = false, onUntagAsset, onSetSensitivity
}) => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    const [hoverZone, setHoverZone] = useState<'info' | 'caption' | null>(null);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const inTopRight = x > rect.width * 0.65 && y < rect.height * 0.35;
        setHoverZone(inTopRight ? 'info' : 'caption');
    }, []);

    const handleMouseLeave = useCallback(() => {
        setHoverZone(null);
    }, []);

    const getSafeImgSrc = (path: string | undefined): string | null => {
        if (!path) return null;
        if (isTauri) {
            try {
                return convertFileSrc(path);
            } catch (e) {
                console.warn('Tauri convertFileSrc failed', e);
                return null;
            }
        } else {
            return `http://localhost:5174/image?path=${encodeURIComponent(path)}`;
        }
    };

    const imgSrc = getSafeImgSrc(asset.preview_path);

    const borderColor = selected ? 'gold' : 'none';
    const borderWidth = selected ? '3px' : '0px';

    const filename = asset.original_path
        ? asset.original_path.replace(/\\/g, '/').split('/').pop() ?? asset.original_path
        : '';

    const dims = asset.width && asset.height ? `${asset.width} × ${asset.height}` : null;

    const showInfoPanel = hoverZone === 'info';
    const showCaption = hoverZone === 'caption' && !!asset.caption;

    const sensitivityDisplay = getSensitivityDisplay(asset);

    return (
        <div
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{
                width: '100%',
                height: '100%',
                background: '#1a1a1a',
                overflow: 'hidden',
                position: 'relative',
                borderRadius: 4,
                border: `${borderWidth} solid ${borderColor || 'transparent'}`,
                boxSizing: 'border-box',
                cursor: 'pointer',
                transition: 'all 0.2s ease-out'
            }}
        >
            {imgSrc ? (
                <img
                    src={imgSrc}
                    loading="lazy"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        opacity: 0,
                        animation: 'fadeIn 0.3s ease-in forwards'
                    }}
                />
            ) : (
                <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#444',
                    fontSize: '0.8rem',
                    flexDirection: 'column'
                }}>
                    <span>🖼️</span>
                    <span style={{ fontSize: '0.6rem', marginTop: 4 }}>Processing...</span>
                </div>
            )}

            {/* Sensitivity badge — top-left corner (always visible when relevant) */}
            {sensitivityDisplay && (
                <div style={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    background: sensitivityDisplay.bg,
                    color: sensitivityDisplay.color,
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    zIndex: 15,
                    backdropFilter: 'blur(4px)',
                    border: `1px solid ${sensitivityDisplay.color}44`,
                    userSelect: 'none',
                    pointerEvents: 'none',
                }}>
                    {sensitivityDisplay.label}
                </div>
            )}

            {/* Sensitivity quick-action buttons on hover (bottom-left) */}
            {hoverZone !== null && onSetSensitivity && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 6,
                        left: 6,
                        display: 'flex',
                        gap: 3,
                        zIndex: 20,
                        animation: 'fadeIn 0.15s ease-in forwards',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <button
                        title="Mark Safe"
                        onClick={(e) => { e.stopPropagation(); onSetSensitivity(asset.id, asset.sensitivity_status === 'safe' ? null : 'safe'); }}
                        style={{
                            background: asset.sensitivity_status === 'safe' ? 'rgba(34,197,94,0.9)' : 'rgba(0,0,0,0.7)',
                            color: asset.sensitivity_status === 'safe' ? '#fff' : '#4ade80',
                            border: '1px solid #16a34a55',
                            borderRadius: 3, padding: '2px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        }}
                    >✓ Safe</button>
                    <button
                        title="Mark Requires Review"
                        onClick={(e) => { e.stopPropagation(); onSetSensitivity(asset.id, asset.sensitivity_status === 'review' ? null : 'review'); }}
                        style={{
                            background: asset.sensitivity_status === 'review' ? 'rgba(245,158,11,0.9)' : 'rgba(0,0,0,0.7)',
                            color: asset.sensitivity_status === 'review' ? '#fff' : '#fbbf24',
                            border: '1px solid #d9770655', borderRadius: 3, padding: '2px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        }}
                    >⚠ Review</button>
                    <button
                        title="Mark Unsafe"
                        onClick={(e) => { e.stopPropagation(); onSetSensitivity(asset.id, asset.sensitivity_status === 'unsafe' ? null : 'unsafe'); }}
                        style={{
                            background: asset.sensitivity_status === 'unsafe' ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.7)',
                            color: asset.sensitivity_status === 'unsafe' ? '#fff' : '#f87171',
                            border: '1px solid #ef444455', borderRadius: 3, padding: '2px 6px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                        }}
                    >🔞 Unsafe</button>
                </div>
            )}

            {/* Top-right corner: Technical Info overlay */}
            {showInfoPanel && (
                <div style={{
                    position: 'absolute',
                    top: 0, right: 0, left: 0, bottom: 0,
                    background: 'linear-gradient(225deg, rgba(0,0,0,0.85) 45%, transparent 45%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    justifyContent: 'flex-start',
                    padding: '6px 8px',
                    gap: 2,
                    pointerEvents: 'none',
                    animation: 'fadeIn 0.15s ease-in forwards',
                }}>
                    <span style={{ fontSize: '0.65rem', color: '#e2e8f0', fontWeight: 600, fontFamily: 'monospace', textAlign: 'right', lineHeight: 1.4 }}>
                        {filename}
                    </span>
                    {dims && (
                        <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                            {dims}px
                        </span>
                    )}
                </div>
            )}

            {/* Caption overlay — shown anywhere except top-right */}
            {showCaption && (
                <div style={{
                    position: 'absolute',
                    bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.6) 70%, transparent 100%)',
                    padding: '20px 8px 8px',
                    pointerEvents: 'none',
                    animation: 'fadeIn 0.15s ease-in forwards',
                }}>
                    <p style={{
                        margin: 0,
                        fontSize: '0.7rem',
                        color: '#e2e8f0',
                        lineHeight: 1.4,
                        fontStyle: 'italic',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                    }}>
                        {asset.caption}
                    </p>
                </div>
            )}

            {/* Decluster button for person filter */}
            {hoverZone !== null && activeFilter?.type === 'person_any' && activeFilter.personIds.length === 1 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onUntagAsset?.(asset.id, activeFilter.personIds[0]);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        top: 8, right: 8,
                        background: 'rgba(239, 68, 68, 0.9)',
                        color: 'white', border: 'none',
                        borderRadius: 4, padding: '4px 10px',
                        fontSize: 11, fontWeight: 'bold',
                        cursor: 'pointer', zIndex: 20,
                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                    }}
                >
                    Decluster
                </button>
            )}

            {/* Face Overlays */}
            {(showFaces || activeFilter) && asset.faces && asset.faces.map((face, i) => {
                let highlightColor = face.embedding ? 'cyan' : 'rgba(0, 255, 0, 0.5)';
                let opacity = showFaces ? 0.4 : 0;
                let isFilteredPerson = false;

                if (activeFilter && face.person_id) {
                    const personIndex = activeFilter.personIds.indexOf(face.person_id);
                    if (personIndex !== -1) {
                        highlightColor = PERSON_COLORS[personIndex % PERSON_COLORS.length];
                        opacity = 1;
                        isFilteredPerson = true;
                    }
                }

                if (!showFaces && !isFilteredPerson) return null;

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
                            border: `2px solid ${highlightColor}`,
                            borderRadius: '2px',
                            boxShadow: isFilteredPerson ? `0 0 10px rgba(0,0,0,0.5), inset 0 0 5px rgba(0,0,0,0.3)` : 'none',
                            pointerEvents: 'none',
                            zIndex: 10,
                            opacity
                        }}
                    />
                );
            })}

            {debug && (
                <div style={{ position: 'absolute', bottom: 2, left: 2, fontSize: 10, color: 'white', background: 'rgba(0,0,0,0.5)', padding: '1px 4px', borderRadius: 2 }}>
                    {intent}
                </div>
            )}

            <style>{`
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
};
