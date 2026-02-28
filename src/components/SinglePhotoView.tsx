import React, { useState, useEffect, useRef, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Asset } from '../types/core';

interface SinglePhotoViewProps {
    assets: Asset[];
    initialIndex: number;
    onClose: () => void;
}

export const SinglePhotoView: React.FC<SinglePhotoViewProps> = ({ assets, initialIndex, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const asset = assets[currentIndex];
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    const getSafeImgSrc = (path: string | undefined): string | null => {
        if (!path) return null;
        if (isTauri) {
            try {
                return convertFileSrc(path);
            } catch {
                return null;
            }
        } else {
            return `http://localhost:5174/image?path=${encodeURIComponent(path)}`;
        }
    };

    const imgSrc = getSafeImgSrc(asset?.original_path || asset?.preview_path);

    // Keyboard handlers
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            } else if (e.key === 'ArrowRight') {
                setCurrentIndex(prev => (prev < assets.length - 1 ? prev + 1 : prev));
                setScale(1);
                setPan({ x: 0, y: 0 });
            } else if (e.key === 'ArrowLeft') {
                setCurrentIndex(prev => (prev > 0 ? prev - 1 : prev));
                setScale(1);
                setPan({ x: 0, y: 0 });
            } else if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault(); // Prevent page scroll
                setScale(1);
                setPan({ x: 0, y: 0 });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [assets.length, onClose]);

    // Pan/Drag handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (scale > 1) {
            setIsDragging(true);
            dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging && scale > 1) {
            setPan({
                x: e.clientX - dragStartRef.current.x,
                y: e.clientY - dragStartRef.current.y
            });
        }
    }, [isDragging, scale]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);


    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const zoomSensitivity = 0.05;
        const newScale = scale - e.deltaY * zoomSensitivity;
        setScale(Math.max(1, Math.min(newScale, 10))); // Max 10x zoom

        // Reset pan if scaled back to 1
        if (newScale <= 1) {
            setPan({ x: 0, y: 0 });
        }
    };

    if (!asset) return null;

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                backgroundColor: '#050505',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                userSelect: 'none',
                opacity: 0,
                animation: 'fadeInOverlay 0.2s ease-out forwards'
            }}
            onWheel={handleWheel}
            onClick={() => setShowControls(!showControls)}
        >
            {imgSrc ? (
                <img
                    src={imgSrc}
                    alt="Original"
                    onMouseDown={handleMouseDown}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain', // Prevents cropping and maintains aspect ratio
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                        willChange: 'transform'
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        // Double click equivalent or click to toggle controls and slight zoom zoom?
                        // Let's stick with user request: display zoom control on click.
                        setShowControls(!showControls);
                    }}
                    draggable={false}
                />
            ) : (
                <div style={{ color: '#666' }}>Image not found</div>
            )}

            {/* Navigation Overlays (always visible when mouse near edges or when controls shown, but user asked for initially hidden. We'll show on click) */}
            {showControls && (
                <>
                    {/* Top Bar / Close */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        padding: '20px', display: 'flex', justifyContent: 'space-between',
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
                        color: 'white', zIndex: 1001
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: '14px', opacity: 0.7 }}>
                            {currentIndex + 1} of {assets.length}
                        </div>
                        <button onClick={onClose} style={{
                            background: 'none', border: 'none', color: 'white',
                            fontSize: '24px', cursor: 'pointer', opacity: 0.8
                        }}>✕</button>
                    </div>

                    {/* Left/Right Nav */}
                    <div style={{
                        position: 'absolute', top: '50%', left: '20px', transform: 'translateY(-50%)',
                        zIndex: 1001, opacity: currentIndex > 0 ? 0.8 : 0.2, cursor: currentIndex > 0 ? 'pointer' : 'default',
                        padding: '20px'
                    }} onClick={(e) => {
                        e.stopPropagation();
                        if (currentIndex > 0) { setCurrentIndex(currentIndex - 1); setScale(1); setPan({ x: 0, y: 0 }); }
                    }}>
                        <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20 }}>◀</div>
                    </div>

                    <div style={{
                        position: 'absolute', top: '50%', right: '20px', transform: 'translateY(-50%)',
                        zIndex: 1001, opacity: currentIndex < assets.length - 1 ? 0.8 : 0.2, cursor: currentIndex < assets.length - 1 ? 'pointer' : 'default',
                        padding: '20px'
                    }} onClick={(e) => {
                        e.stopPropagation();
                        if (currentIndex < assets.length - 1) { setCurrentIndex(currentIndex + 1); setScale(1); setPan({ x: 0, y: 0 }); }
                    }}>
                        <div style={{ background: 'rgba(0,0,0,0.5)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 20 }}>▶</div>
                    </div>

                    {/* Bottom Zoom Controls */}
                    <div style={{
                        position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)',
                        display: 'flex', gap: '15px', background: 'rgba(30,30,30,0.8)',
                        padding: '10px 20px', borderRadius: '30px', zIndex: 1001,
                        backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)'
                    }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => { setScale(Math.max(1, scale - 0.5)); if (scale - 0.5 <= 1) setPan({ x: 0, y: 0 }); }}
                            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 18, width: 30 }}
                        >-</button>

                        <div style={{ display: 'flex', alignItems: 'center', color: '#ccc', fontSize: 14, minWidth: 60, justifyContent: 'center' }}>
                            {Math.round(scale * 100)}%
                        </div>

                        <button
                            onClick={() => setScale(scale + 0.5)}
                            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 18, width: 30 }}
                        >+</button>

                        <div style={{ width: 1, background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />

                        <button
                            onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }}
                            style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 5 }}
                        >
                            <span style={{ fontSize: 16 }}>⟲</span> Reset
                        </button>
                    </div>
                </>
            )}

            <style>{`
                @keyframes fadeInOverlay {
                    from { opacity: 0; transform: scale(0.98); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};
