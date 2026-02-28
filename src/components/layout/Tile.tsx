import React, { useState, useEffect, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Asset, TileIntent } from '../../types/core';

interface TileProps {
    asset: Asset;
    intent?: TileIntent;
    debug?: boolean;
    selected?: boolean;
}

export const Tile: React.FC<TileProps> = ({ asset, intent = 'normal', debug = false, selected = false }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [rect, setRect] = useState({ w: 0, h: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            setRect({ w: width, h: height });
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

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
            // Browser Fallback (development mode)
            // The frontend cannot load local file paths due to browser security.
            // We use a local dev endpoint (which we will add to the core backend).
            return `http://localhost:5174/image?path=${encodeURIComponent(path)}`;
        }
    };

    // Use ONLY the preview_path for gallery tiles to ensure performance.
    // NEVER fallback to original_path here; loading 13MB+ images in the grid kills the UI.
    const imgSrc = getSafeImgSrc(asset.preview_path);

    // Simplified Phase 0 Logic
    const objectFit = 'contain';
    const padding = '0px';
    const backgroundColor = '#1a1a1a';

    // Calculate rendered image position for overlay alignment
    let overlayStyle: React.CSSProperties = { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' };

    if (asset.width && asset.height && rect.w > 0 && rect.h > 0) {
        // Since objectFit is fixed to 'contain' (Gallery Stage Phase 1: No Cropping)
        const scale = Math.min(rect.w / asset.width, rect.h / asset.height);
        const renderW = asset.width * scale;
        const renderH = asset.height * scale;
        const offsetX = (rect.w - renderW) / 2;
        const offsetY = (rect.h - renderH) / 2;

        overlayStyle = {
            ...overlayStyle,
            left: offsetX,
            top: offsetY,
            width: renderW,
            height: renderH,
        };
    }

    // Debugging Border based on Selection only
    const borderColor = selected ? 'gold' : 'none';



    const borderWidth = selected ? '3px' : '0px';

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                background: backgroundColor,
                overflow: 'hidden',
                position: 'relative',
                borderRadius: 4,
                border: `${borderWidth} solid ${borderColor || 'transparent'}`,
                boxSizing: 'border-box',
                padding: padding,
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
                        objectFit: objectFit,
                        opacity: 0,
                        // Simple fade-in animation
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

            {/* Face Overlays */}
            <div style={overlayStyle}>
                {asset.faces && asset.faces.map((face, i) => {
                    const hasEmbedding = asset.face_embeddings && asset.face_embeddings[i];
                    const borderColor = hasEmbedding ? 'cyan' : 'rgba(0, 255, 0, 0.5)';

                    return (
                        <div
                            key={i}
                            style={{
                                position: 'absolute',
                                left: `${face.box[0] * 100}%`,
                                top: `${face.box[1] * 100}%`,
                                width: `${(face.box[2] - face.box[0]) * 100}%`,
                                height: `${(face.box[3] - face.box[1]) * 100}%`,
                                border: `1px solid ${borderColor}`,
                                borderRadius: '2px'
                            }}
                        />
                    )
                })}
            </div>

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
