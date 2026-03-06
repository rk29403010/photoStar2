import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Asset } from '../../shared/types/core';
import type { BackgroundJob } from '../../shared/types/jobs';
import { resolveImageUrl } from '../config/backend';
import { usePanZoom } from '../hooks/usePanZoom';
import { FaceOverlayMap } from './single-photo/FaceOverlayMap';
import { ActionOverlays } from './single-photo/ActionOverlays';
import { InfoPanel } from './single-photo/InfoPanel';
import { VariantFilmstrip } from './single-photo/VariantFilmstrip';

interface SinglePhotoViewProps {
    assets: Asset[];
    initialIndex: number;
    onClose: () => void;
    onPrioritize: (mediaId: string) => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    onGetGroupOrbit?: (groupId: string) => Promise<unknown[]>;
    onSetCanonical?: (groupId: string, assetId: string) => Promise<void>;
    onExplodeGroup?: (groupId: string) => Promise<void>;
    onOpenSettings?: () => void;
    jobs?: BackgroundJob[];
    /** Controlled: persisted in App so panel survives navigating away + back */
    showInfoPanel?: boolean;
    onShowInfoPanelChange?: (v: boolean) => void;
    activeInfoTab?: 'file' | 'analysis' | 'people' | 'json';
    onActiveInfoTabChange?: (t: 'file' | 'analysis' | 'people' | 'json') => void;
}

const INFO_PANEL_WIDTH = 360;

export const SinglePhotoView: React.FC<SinglePhotoViewProps> = ({
    assets, initialIndex, onClose, onPrioritize, onFaceClick, onIsolateFace,
    onSetSensitivity, onExtractAiMetadata, onGetGroupOrbit, onSetCanonical, onExplodeGroup, onOpenSettings, jobs,
    showInfoPanel: showInfoPanelProp,
    onShowInfoPanelChange,
    activeInfoTab: activeInfoTabProp,
    onActiveInfoTabChange,
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [showControls, setShowControls] = useState(false);
    const [showFaces, setShowFaces] = useState(false);
    const [showActionMenu, setShowActionMenu] = useState(false);

    // Info panel state — controlled from outside (persisted) when props provided,
    // otherwise falls back to internal (transient) state.
    const [showInfoPanelInternal, setShowInfoPanelInternal] = useState(false);
    const showInfoPanel = showInfoPanelProp ?? showInfoPanelInternal;
    const setShowInfoPanel = useCallback((v: boolean) => {
        setShowInfoPanelInternal(v);
        onShowInfoPanelChange?.(v);
    }, [onShowInfoPanelChange]);

    const [activeInfoTabInternal, setActiveInfoTabInternal] = useState<'file' | 'analysis' | 'people' | 'json'>('file');
    const activeInfoTab = activeInfoTabProp ?? activeInfoTabInternal;
    const setActiveInfoTab = useCallback((t: 'file' | 'analysis' | 'people' | 'json') => {
        setActiveInfoTabInternal(t);
        onActiveInfoTabChange?.(t);
    }, [onActiveInfoTabChange]);

    const [hoveredFaceKey, setHoveredFaceKey] = useState<string | null>(null);

    // Analysis State
    const [analyzingAssetId, setAnalyzingAssetId] = useState<string | null>(null);
    const [analyzingJobId, setAnalyzingJobId] = useState<string | null>(null);
    const [analysisState, setAnalysisState] = useState<'idle' | 'analyzing' | 'cancelling' | 'error'>('idle');
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const { scale, setScale, pan, setPan, isDragging, handleMouseDown, resetPanZoom } = usePanZoom(containerRef);

    const asset = assets[currentIndex];

    const imgSrc = resolveImageUrl(asset?.original_path || asset?.preview_path);

    useEffect(() => {
        if (asset?.id) onPrioritize(asset.id);
    }, [asset?.id, onPrioritize]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); }
            else if (e.key === 'ArrowRight') { setCurrentIndex(prev => prev < assets.length - 1 ? prev + 1 : prev); resetPanZoom(); }
            else if (e.key === 'ArrowLeft') { setCurrentIndex(prev => prev > 0 ? prev - 1 : prev); resetPanZoom(); }
            else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); resetPanZoom(); }
            else if (e.key === 'i' || e.key === 'I') { setShowInfoPanel(!showInfoPanel); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [assets.length, onClose, resetPanZoom, showInfoPanel, setShowInfoPanel]);

    // Track job completion
    useEffect(() => {
        if (analyzingJobId && jobs) {
            const job = jobs.find(j => j.id === analyzingJobId);
            if (job) {
                if (job.state === 'failed') {
                    setTimeout(() => {
                        const rawMsg = job.issues && job.issues.length > 0 ? job.issues[0].message : 'Analysis failed';
                        setAnalysisError(rawMsg);
                        setAnalysisState('error');
                        setAnalyzingJobId(null);
                    }, 0);
                } else if (job.state === 'completed' && asset?.ai_metadata) {
                    setTimeout(() => {
                        setAnalysisState('idle');
                        setAnalyzingAssetId(null);
                        setAnalyzingJobId(null);
                        setShowInfoPanel(true); // Auto-open info panel on completion
                    }, 0);
                }
            }
        }
    }, [jobs, analyzingJobId, asset?.ai_metadata, setShowInfoPanel]);

    const handleSetCanonical = useCallback(async (groupId: string, newCanonicalId: string) => {
        try {
            if (onSetCanonical) await onSetCanonical(groupId, newCanonicalId);
            onClose();
        } catch (e) {
            console.error('Failed to set canonical:', e);
        }
    }, [onSetCanonical, onClose]);

    const handleExplodeGroup = useCallback(async (groupId: string) => {
        try {
            if (onExplodeGroup) await onExplodeGroup(groupId);
            onClose();
        } catch (e) {
            console.error('Failed to explode group:', e);
        }
    }, [onExplodeGroup, onClose]);

    if (!asset) return null;

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                backgroundColor: '#050505', zIndex: 1000, display: 'flex',
                flexDirection: 'row', overflow: 'hidden', userSelect: 'none',
                opacity: 0, animation: 'fadeInOverlay 0.2s ease-out forwards'
            }}
        >
            {/* ── Left: Info Panel (modeless, toggled) ── */}
            {showInfoPanel && (
                <div style={{
                    width: INFO_PANEL_WIDTH, height: '100vh',
                    flexShrink: 0, zIndex: 1002,
                    animation: 'slideInFromLeft 0.22s ease-out'
                }}>
                    <InfoPanel
                        asset={asset}
                        width={INFO_PANEL_WIDTH}
                        activeTab={activeInfoTab}
                        onTabChange={setActiveInfoTab}
                        hoveredFaceKey={hoveredFaceKey}
                        onHoverFaceKey={setHoveredFaceKey}
                    />
                </div>
            )}

            {/* ── Right: Photo + controls ── */}
            <div
                ref={containerRef}
                style={{
                    flex: 1, height: '100vh', position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden'
                }}
                onClick={() => { setShowControls(!showControls); setShowActionMenu(false); }}
            >
                {imgSrc ? (
                    <div
                        onMouseDown={handleMouseDown}
                        onClick={e => { e.stopPropagation(); setShowControls(!showControls); setShowActionMenu(false); }}
                        style={{
                            position: 'relative', display: 'flex',
                            justifyContent: 'center', alignItems: 'center',
                            maxWidth: '100%', maxHeight: '100vh',
                            aspectRatio: (asset?.width && asset?.height) ? `${asset.width} / ${asset.height}` : 'auto',
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                            willChange: 'transform'
                        }}
                    >
                        <img
                            src={imgSrc} alt="Original"
                            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                            draggable={false}
                        />
                        <FaceOverlayMap
                            asset={asset}
                            showFaces={showFaces}
                            alwaysShowForPanel={showInfoPanel && activeInfoTab === 'people'}
                            hoveredFaceKey={hoveredFaceKey}
                            onHoverFaceKey={setHoveredFaceKey}
                            onFaceClick={onFaceClick}
                            onIsolateFace={onIsolateFace}
                        />
                    </div>
                ) : (
                    <div style={{ color: '#666' }}>Image not found</div>
                )}

                <ActionOverlays
                    asset={asset}
                    assetsLength={assets.length}
                    currentIndex={currentIndex}
                    showControls={showControls}
                    showActionMenu={showActionMenu}
                    setShowActionMenu={setShowActionMenu}
                    showFaces={showFaces}
                    setShowFaces={setShowFaces}
                    showInfoPanel={showInfoPanel}
                    setShowInfoPanel={setShowInfoPanel}
                    scale={scale}
                    setScale={setScale}
                    setPan={setPan}
                    resetPanZoom={resetPanZoom}
                    onClose={onClose}
                    onPrevious={() => { if (currentIndex > 0) { setCurrentIndex(currentIndex - 1); resetPanZoom(); } }}
                    onNext={() => { if (currentIndex < assets.length - 1) { setCurrentIndex(currentIndex + 1); resetPanZoom(); } }}
                    onSetSensitivity={onSetSensitivity}
                    onExtractAiMetadata={onExtractAiMetadata}
                    onOpenSettings={onOpenSettings}
                    analysisState={analysisState}
                    setAnalysisState={setAnalysisState}
                    analysisError={analysisError}
                    setAnalysisError={setAnalysisError}
                    analyzingAssetId={analyzingAssetId}
                    setAnalyzingAssetId={setAnalyzingAssetId}
                    setAnalyzingJobId={setAnalyzingJobId}
                />

                {asset.group_id && asset.stack_count && asset.stack_count > 1 && onGetGroupOrbit && (
                    <VariantFilmstrip
                        groupId={asset.group_id}
                        canonicalAssetId={asset.id}
                        onGetGroupOrbit={onGetGroupOrbit}
                        onSetCanonical={handleSetCanonical}
                        onExplodeGroup={handleExplodeGroup}
                    />
                )}
            </div>
        </div>
    );
};
