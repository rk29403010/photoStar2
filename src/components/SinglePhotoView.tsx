import React, { useState, useEffect, useRef, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Asset } from '../types/core';
import type { BackgroundJob } from '../types/jobs';

interface SinglePhotoViewProps {
    assets: Asset[];
    initialIndex: number;
    onClose: () => void;
    onPrioritize: (mediaId: string) => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    onOpenSettings?: () => void;
    jobs?: BackgroundJob[];
}

export const SinglePhotoView: React.FC<SinglePhotoViewProps> = ({ assets, initialIndex, onClose, onPrioritize, onFaceClick, onIsolateFace, onSetSensitivity, onExtractAiMetadata, onOpenSettings, jobs }) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [scale, setScale] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [showFaces, setShowFaces] = useState(false);
    const [showAiMetadata, setShowAiMetadata] = useState(false);
    const [showAllInfo, setShowAllInfo] = useState(false);
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [analyzingAssetId, setAnalyzingAssetId] = useState<string | null>(null);
    const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
    const [analysisState, setAnalysisState] = useState<'idle' | 'analyzing' | 'cancelling' | 'error'>('idle');
    const [analysisError, setAnalysisError] = useState<string | null>(null);
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

    // Call prioritize on mount / index change
    useEffect(() => {
        if (asset?.id) {
            onPrioritize(asset.id);
        }
    }, [asset?.id, onPrioritize]);

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


    useEffect(() => {
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const zoomSensitivity = 0.05;
            const newScale = scale - e.deltaY * zoomSensitivity;
            const finalScale = Math.max(1, Math.min(newScale, 10)); // Max 10x zoom
            setScale(finalScale);

            // Reset pan if scaled back to 1
            if (finalScale <= 1) {
                setPan({ x: 0, y: 0 });
            }
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
        }
        return () => {
            if (container) {
                container.removeEventListener('wheel', handleWheel);
            }
        };
    }, [scale]);

    // Track job failure or completion from backend
    useEffect(() => {
        if (analyzingJobId && jobs) {
            const job = jobs.find(j => j.id === analyzingJobId);
            if (job) {
                // Delay state updates out of render phase
                if (job.state === 'failed') {
                    setTimeout(() => {
                        const errorMsg = job.issues && job.issues.length > 0 ? job.issues[0].message : "Analysis failed";
                        setAnalysisError(errorMsg);
                        setAnalysisState('error');
                        setAnalyzingJobId(null);
                    }, 0);
                } else if (job.state === 'completed' && asset?.ai_metadata) {
                    setTimeout(() => {
                        setAnalysisState('idle');
                        setAnalyzingAssetId(null);
                        setAnalyzingJobId(null);
                        setShowAiMetadata(true);
                    }, 0);
                }
            }
        }
    }, [jobs, analyzingJobId, asset?.ai_metadata]);

    // Handle resetting state if photo changes during analysis
    useEffect(() => {
        if (asset && analyzingAssetId && asset.id !== analyzingAssetId && analysisState === 'analyzing') {
            // we moved away from the photo being analyzed. We can either keep it visualizing as analyzing
            // or we could just leave it. The pulse badge is keyed to analyzingAssetId === asset.id anyway.
        }
    }, [asset, analyzingAssetId, analysisState]);

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
            onClick={() => { setShowControls(!showControls); setShowActionMenu(false); }}
        >
            {imgSrc ? (
                <div
                    onMouseDown={handleMouseDown}
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowControls(!showControls);
                        setShowActionMenu(false);
                    }}
                    style={{
                        position: 'relative',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        maxWidth: '100vw',
                        maxHeight: '100vh',
                        aspectRatio: (asset?.width && asset?.height) ? `${asset.width} / ${asset.height}` : 'auto',
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                        transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                        willChange: 'transform'
                    }}
                >
                    <img
                        src={imgSrc}
                        alt="Original"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            pointerEvents: 'none'
                        }}
                        draggable={false}
                    />
                    {/* Face Overlays */}
                    {showFaces && asset?.faces && asset.faces.map((face, i) => {
                        const hasEmbedding = asset?.face_embeddings && asset.face_embeddings[i];
                        const borderColor = hasEmbedding ? 'cyan' : 'rgba(0, 255, 0, 0.5)';

                        return (
                            <div
                                key={i}
                                className="group"
                                title={face.person_name || 'Unknown Person'}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (face.person_id && onFaceClick) {
                                        onFaceClick(face.person_id, face.person_name || 'Unknown Person');
                                    }
                                }}
                                style={{
                                    position: 'absolute',
                                    left: `${face.box[0] * 100}%`,
                                    top: `${face.box[1] * 100}%`,
                                    width: `${(face.box[2] - face.box[0]) * 100}%`,
                                    height: `${(face.box[3] - face.box[1]) * 100}%`,
                                    border: `2px solid ${borderColor}`,
                                    borderRadius: '2px',
                                    boxShadow: '0 0 10px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.5)',
                                    pointerEvents: 'auto', // to catch tooltips
                                    cursor: face.person_id && onFaceClick ? 'pointer' : 'default',
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    justifyContent: 'center',
                                    overflow: 'visible'
                                }}
                            >
                                <div style={{
                                    backgroundColor: 'rgba(0,0,0,0.6)',
                                    color: 'white',
                                    fontSize: '10px',
                                    padding: '2px 4px',
                                    borderRadius: '2px',
                                    whiteSpace: 'nowrap',
                                    transform: 'translateY(100%)',
                                    marginTop: '4px',
                                    opacity: 0,
                                    transition: 'opacity 0.2s',
                                    pointerEvents: 'none'
                                }} className="face-label group-hover:opacity-100">
                                    {face.person_name || 'Unknown Person'}
                                </div>
                                {face.person_id && onIsolateFace && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onIsolateFace(asset.id, i);
                                        }}
                                        className="group-hover:opacity-100 isolate-btn"
                                        title="Not this Person"
                                        style={{
                                            position: 'absolute',
                                            top: -24,
                                            right: 0,
                                            background: '#ef4444',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: 4,
                                            padding: '2px 8px',
                                            fontSize: 11,
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            opacity: 0,
                                            transition: 'opacity 0.2s',
                                        }}
                                    >Not this Person</button>
                                )}
                            </div>
                        );
                    })}
                    <style>{`
                        .group:hover .isolate-btn {
                            opacity: 1 !important;
                        }
                    `}</style>
                </div>
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
                    }} onClick={e => { e.stopPropagation(); setShowActionMenu(false); }}>
                        <div style={{ fontSize: '14px', opacity: 0.7, display: 'flex', alignItems: 'center' }}>
                            {currentIndex + 1} of {assets.length}
                        </div>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                            {analysisState === 'analyzing' && analyzingAssetId === asset.id && !asset.ai_metadata && (
                                <div className="animate-pulse" style={{
                                    color: '#c084fc', fontSize: '14px', background: 'rgba(192,132,252,0.1)',
                                    padding: '4px 10px', borderRadius: '16px', display: 'flex', alignItems: 'center',
                                    gap: '6px', border: '1px solid rgba(192,132,252,0.3)'
                                }}>
                                    <span style={{ fontSize: '14px' }}>✨</span> Analyzing
                                </div>
                            )}
                            {analysisState === 'cancelling' && analyzingAssetId === asset.id && !asset.ai_metadata && (
                                <div className="animate-pulse" style={{
                                    color: '#f59e0b', fontSize: '14px', background: 'rgba(245,158,11,0.1)',
                                    padding: '4px 10px', borderRadius: '16px', display: 'flex', alignItems: 'center',
                                    gap: '6px', border: '1px solid rgba(245,158,11,0.3)'
                                }}>
                                    Cancelling...
                                </div>
                            )}
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowActionMenu(!showActionMenu); }}
                                    style={{
                                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer',
                                        fontSize: '14px', backdropFilter: 'blur(4px)', transition: 'background 0.2s'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                    onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                >
                                    Actions ▾
                                </button>
                                {showActionMenu && (
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                                        background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px',
                                        padding: '8px', minWidth: '200px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                                        display: 'flex', flexDirection: 'column', gap: '4px'
                                    }}>
                                        {onExtractAiMetadata && analysisState === 'idle' && (
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    setAnalysisState('analyzing');
                                                    setAnalysisError(null);
                                                    setAnalyzingAssetId(asset.id);
                                                    setShowActionMenu(false);
                                                    try {
                                                        const jobId = await onExtractAiMetadata(asset.id);
                                                        if (jobId) setAnalyzingJobId(jobId);
                                                    } catch (err: unknown) {
                                                        const e = err as Error;
                                                        setAnalysisError(e.message === "MISSING_API_KEY" ? "MISSING_API_KEY" : "Failed to analyze image");
                                                        setAnalysisState('error');
                                                        setAnalyzingJobId(null);
                                                    }
                                                }}
                                                style={{
                                                    background: 'transparent', border: 'none', color: '#c084fc',
                                                    textAlign: 'left', padding: '8px 12px', cursor: 'pointer',
                                                    borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px',
                                                    fontSize: '14px'
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = 'rgba(192,132,252,0.1)'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <span style={{ fontSize: '16px' }}>✨</span> Analyze Image
                                            </button>
                                        )}
                                        {onExtractAiMetadata && analysisState === 'analyzing' && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAnalysisState('cancelling');
                                                    setShowActionMenu(false);
                                                    // Simulate teardown and reinstate button safely
                                                    setTimeout(() => {
                                                        setAnalysisState('idle');
                                                        setAnalyzingAssetId(null);
                                                    }, 1500);
                                                }}
                                                style={{
                                                    background: 'transparent', border: 'none', color: '#ef4444',
                                                    textAlign: 'left', padding: '8px 12px', cursor: 'pointer',
                                                    borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px',
                                                    fontSize: '14px'
                                                }}
                                                onMouseOver={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <span style={{ fontSize: '16px' }}>🚫</span> Cancel Analysis
                                            </button>
                                        )}

                                        {onSetSensitivity && (
                                            <>
                                                <hr style={{ borderColor: '#333', margin: '4px 0' }} />
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSetSensitivity(asset.id, asset.sensitivity_status === 'safe' ? null : 'safe');
                                                        setShowActionMenu(false);
                                                    }}
                                                    style={{
                                                        background: asset.sensitivity_status === 'safe' ? 'rgba(34,197,94,0.1)' : 'transparent',
                                                        border: 'none', color: asset.sensitivity_status === 'safe' ? '#4ade80' : '#ccc',
                                                        textAlign: 'left', padding: '8px 12px', cursor: 'pointer',
                                                        borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px',
                                                        fontSize: '14px'
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.background = asset.sensitivity_status === 'safe' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}
                                                    onMouseOut={e => e.currentTarget.style.background = asset.sensitivity_status === 'safe' ? 'rgba(34,197,94,0.1)' : 'transparent'}
                                                >😃 Mark as Safe</button>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSetSensitivity(asset.id, asset.sensitivity_status === 'unsafe' ? null : 'unsafe');
                                                        setShowActionMenu(false);
                                                    }}
                                                    style={{
                                                        background: asset.sensitivity_status === 'unsafe' ? 'rgba(239,68,68,0.1)' : 'transparent',
                                                        border: 'none', color: asset.sensitivity_status === 'unsafe' ? '#ef4444' : '#ccc',
                                                        textAlign: 'left', padding: '8px 12px', cursor: 'pointer',
                                                        borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '10px',
                                                        fontSize: '14px'
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.background = asset.sensitivity_status === 'unsafe' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)'}
                                                    onMouseOut={e => e.currentTarget.style.background = asset.sensitivity_status === 'unsafe' ? 'rgba(239,68,68,0.1)' : 'transparent'}
                                                >🫣 Mark as Unsafe</button>
                                            </>
                                        )}
                                        <div className="border-t border-[#333] mt-2 pt-2 gap-1 flex flex-col">
                                            <button
                                                onClick={() => {
                                                    setShowActionMenu(false);
                                                    setShowAllInfo(true);
                                                }}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-[#333] text-gray-400 hover:text-white rounded transition-colors"
                                            >
                                                Display all Info
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={onClose} style={{
                                background: 'none', border: 'none', color: 'white',
                                fontSize: '24px', cursor: 'pointer', opacity: 0.8
                            }}>✕</button>
                        </div>
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

                        <div style={{ width: 1, background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />

                        <button
                            onClick={() => setShowFaces(!showFaces)}
                            style={{
                                background: showFaces ? 'rgba(0, 255, 255, 0.2)' : 'none',
                                border: '1px solid',
                                borderColor: showFaces ? 'cyan' : 'transparent',
                                borderRadius: '4px',
                                color: showFaces ? 'cyan' : 'white',
                                cursor: 'pointer',
                                fontSize: 14,
                                padding: '4px 8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 5,
                                transition: 'all 0.2s'
                            }}
                        >
                            <span style={{ fontSize: 16 }}>👤</span> Faces
                        </button>

                        {onSetSensitivity && (
                            <>
                                <div style={{ width: 1, background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
                                {/* Sensitivity info */}
                                {asset.sensitivity_score != null && (
                                    <div style={{ color: '#94a3b8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span>🔍</span>
                                        <span style={{
                                            color: asset.sensitivity_score >= 75 ? '#ef4444' : asset.sensitivity_score >= 25 ? '#f59e0b' : '#4ade80'
                                        }}>{asset.sensitivity_score}%</span>
                                    </div>
                                )}
                                <div style={{ width: 1, background: 'rgba(255,255,255,0.2)', margin: '0 5px' }} />
                                {/* AI Metadata Button */}
                                {asset.ai_metadata && (
                                    <button
                                        onClick={() => setShowAiMetadata(true)}
                                        title="View AI Metadata"
                                        style={{
                                            background: 'rgba(99,102,241,0.2)',
                                            border: '1px solid #6366f1',
                                            borderRadius: '4px', color: '#818cf8',
                                            cursor: 'pointer', fontSize: 13,
                                            padding: '4px 8px', display: 'flex',
                                            alignItems: 'center', gap: 4, transition: 'all 0.2s'
                                        }}
                                    >🧠 Info</button>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}

            {/* Error Overlay / Modal */}
            {analysisError && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: '#1a1a1a', border: '1px solid #ff4444', borderRadius: '8px',
                    padding: '24px', zIndex: 3000, color: 'white', maxWidth: '400px', width: '100%',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ marginTop: 0, color: '#ff4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>⚠</span> Analysis Error
                    </h3>
                    <div style={{ fontSize: '14px', lineHeight: 1.6, color: '#ccc' }}>
                        {analysisError === 'MISSING_API_KEY' ? (
                            <div>
                                <p style={{ marginTop: 0 }}>To analyze images, a free Google Gemini API Key is required to communicate with the model.</p>
                                <ol style={{ paddingLeft: '20px', marginBottom: 0 }}>
                                    <li style={{ marginBottom: '8px' }}>
                                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>Generate your free API Key</a> from Google AI Studio.
                                    </li>
                                    <li>Enter your key into the application settings.</li>
                                </ol>
                            </div>
                        ) : (
                            <p>{analysisError}</p>
                        )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setAnalysisError(null); }}
                            style={{ background: 'transparent', color: 'white', border: '1px solid #555', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', transition: 'background 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                        >Close</button>
                        {analysisError === 'MISSING_API_KEY' && onOpenSettings && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setAnalysisError(null); onOpenSettings(); }}
                                style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '4px', cursor: 'pointer', transition: 'background 0.2s' }}
                                onMouseOver={e => e.currentTarget.style.background = '#2563eb'}
                                onMouseOut={e => e.currentTarget.style.background = '#3b82f6'}
                            >Open Settings</button>
                        )}
                    </div>
                </div>
            )}

            {/* AI Metadata Modal */}
            {showAiMetadata && asset?.ai_metadata && (
                <div
                    style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 2000,
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        backdropFilter: 'blur(4px)'
                    }}
                    onClick={(e) => { e.stopPropagation(); setShowAiMetadata(false); }}
                >
                    <div
                        style={{
                            background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px',
                            padding: '24px', maxWidth: '600px', width: '90%', maxHeight: '80vh',
                            overflowY: 'auto', color: '#eee', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '12px' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#818cf8', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>🧠</span> AI Analysis
                            </h2>
                            <button onClick={() => setShowAiMetadata(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.5rem' }}>✕</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {typeof asset.ai_metadata.type === 'string' && (
                                <div style={{ marginBottom: 16 }}>
                                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', display: 'block', marginBottom: 4 }}>Type</span>
                                    <span style={{ fontSize: '14px', background: '#333', padding: '2px 8px', borderRadius: 4 }}>{asset.ai_metadata.type as string}</span>
                                </div>
                            )}
                            {asset.caption && (
                                <div style={{ marginBottom: 16 }}>
                                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', display: 'block', marginBottom: 4 }}>Caption</span>
                                    <p style={{ fontSize: '14px', margin: 0, lineHeight: 1.5 }}>{asset.caption}</p>
                                </div>
                            )}
                            {typeof asset.ai_metadata.date === 'string' && (
                                <div style={{ marginBottom: 16 }}>
                                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', display: 'block', marginBottom: 4 }}>Estimated Date</span>
                                    <span style={{ fontSize: '14px' }}>{asset.ai_metadata.date as string}</span>
                                </div>
                            )}
                            {typeof asset.ai_metadata.location === 'string' && (
                                <div style={{ marginBottom: 16 }}>
                                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', display: 'block', marginBottom: 4 }}>Location</span>
                                    <span style={{ fontSize: '14px' }}>{asset.ai_metadata.location as string}</span>
                                </div>
                            )}
                            {Array.isArray(asset.ai_metadata.subjects) && asset.ai_metadata.subjects.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#888', display: 'block', marginBottom: 4 }}>Subjects</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {(asset.ai_metadata.subjects as Record<string, string>[]).map((s, i) => (
                                            <div key={i} style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', padding: '6px 10px', borderRadius: 6, fontSize: '13px' }}>
                                                <div style={{ color: '#a5b4fc', fontWeight: 500 }}>{s.label}</div>
                                                {s.confidence && <div style={{ color: '#6366f1', fontSize: '10px', marginTop: 2 }}>{s.confidence} confidence</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Display All Info Modal */}
            {showAllInfo && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8" onClick={() => setShowAllInfo(false)}>
                    <div className="bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold bg-linear-to-r from-gray-200 to-gray-400 bg-clip-text text-transparent">Asset Information</h3>
                            <button onClick={() => setShowAllInfo(false)} className="text-gray-400 hover:text-white p-2">✕</button>
                        </div>
                        <div className="bg-black/50 p-4 rounded-lg font-mono text-xs text-gray-300 overflow-x-auto">
                            <pre>{JSON.stringify(asset, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};
