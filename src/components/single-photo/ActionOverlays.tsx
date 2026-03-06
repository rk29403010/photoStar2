import React from 'react';
import type { Asset } from '../../../shared/types/core';

interface ActionOverlaysProps {
    asset: Asset;
    assetsLength: number;
    currentIndex: number;
    showControls: boolean;
    showActionMenu: boolean;
    setShowActionMenu: (show: boolean) => void;
    showFaces: boolean;
    setShowFaces: (show: boolean) => void;
    scale: number;
    setScale: (s: number) => void;
    setPan: (pan: { x: number, y: number }) => void;
    resetPanZoom: () => void;
    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;
    onSetSensitivity?: (assetId: string, status: string | null) => void;
    onExtractAiMetadata?: (assetId: string) => Promise<string | undefined>;
    onOpenSettings?: () => void;

    // Analysis state
    analysisState: 'idle' | 'analyzing' | 'cancelling' | 'error';
    setAnalysisState: (state: 'idle' | 'analyzing' | 'cancelling' | 'error') => void;
    analysisError: string | null;
    setAnalysisError: (err: string | null) => void;
    analyzingAssetId: string | null;
    setAnalyzingAssetId: (id: string | null) => void;
    setAnalyzingJobId: (id: string | null) => void;

    // Info Panel toggle (replaces showAiMetadata)
    showInfoPanel: boolean;
    setShowInfoPanel: (show: boolean) => void;
}

export const ActionOverlays: React.FC<ActionOverlaysProps> = ({
    asset, assetsLength, currentIndex, showControls,
    showActionMenu, setShowActionMenu,
    showFaces, setShowFaces,
    scale, setScale, setPan, resetPanZoom,
    onClose, onPrevious, onNext,
    onSetSensitivity, onExtractAiMetadata, onOpenSettings,
    analysisState, setAnalysisState,
    analysisError, setAnalysisError,
    analyzingAssetId, setAnalyzingAssetId, setAnalyzingJobId,
    showInfoPanel, setShowInfoPanel
}) => {
    return (
        <>
            {showControls && (
                <>
                    {/* ── Top Bar ── */}
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
                        background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)',
                        color: 'white', zIndex: 1001
                    }} onClick={e => { e.stopPropagation(); setShowActionMenu(false); }}>

                        {/* Left: counter */}
                        <div style={{ fontSize: '13px', opacity: 0.6, display: 'flex', alignItems: 'center' }}>
                            {currentIndex + 1} / {assetsLength}
                        </div>

                        {/* Right: status + actions + close */}
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            {/* Analyzing spinner */}
                            {analysisState === 'analyzing' && analyzingAssetId === asset.id && !asset.ai_metadata && (
                                <div className="animate-pulse" style={{
                                    color: '#c084fc', fontSize: '13px', background: 'rgba(192,132,252,0.1)',
                                    padding: '4px 10px', borderRadius: '16px', display: 'flex', alignItems: 'center',
                                    gap: '6px', border: '1px solid rgba(192,132,252,0.3)'
                                }}>
                                    <span style={{ fontSize: '13px' }}>✨</span> Analyzing…
                                </div>
                            )}
                            {analysisState === 'cancelling' && analyzingAssetId === asset.id && !asset.ai_metadata && (
                                <div className="animate-pulse" style={{
                                    color: '#f59e0b', fontSize: '13px', background: 'rgba(245,158,11,0.1)',
                                    padding: '4px 10px', borderRadius: '16px', border: '1px solid rgba(245,158,11,0.3)'
                                }}>Cancelling…</div>
                            )}

                            {/* Actions menu */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={e => { e.stopPropagation(); setShowActionMenu(!showActionMenu); }}
                                    style={{
                                        background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
                                        fontSize: '13px', backdropFilter: 'blur(4px)', transition: 'background 0.2s'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                    onMouseOut={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                >Actions ▾</button>

                                {showActionMenu && (
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: '8px',
                                        background: '#111827', border: '1px solid #1f2937', borderRadius: '10px',
                                        padding: '6px', minWidth: '200px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                                        display: 'flex', flexDirection: 'column', gap: '2px'
                                    }}>
                                        {/* Analyze */}
                                        {onExtractAiMetadata && analysisState === 'idle' && (
                                            <button
                                                onClick={async e => {
                                                    e.stopPropagation();
                                                    setAnalysisState('analyzing');
                                                    setAnalysisError(null);
                                                    setAnalyzingAssetId(asset.id);
                                                    setShowActionMenu(false);
                                                    try {
                                                        const jobId = await onExtractAiMetadata(asset.id);
                                                        if (jobId) setAnalyzingJobId(jobId);
                                                    } catch (err: unknown) {
                                                        const e2 = err as Error;
                                                        setAnalysisError(e2.message);
                                                        setAnalysisState('error');
                                                        setAnalyzingJobId(null);
                                                    }
                                                }}
                                                style={menuItemStyle('#c084fc', false)}
                                                onMouseOver={menuHover()}
                                                onMouseOut={menuOut}
                                            ><span style={{ fontSize: 15 }}>✨</span> Analyze Image</button>
                                        )}
                                        {onExtractAiMetadata && analysisState === 'analyzing' && (
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation(); setAnalysisState('cancelling');
                                                    setShowActionMenu(false);
                                                    setTimeout(() => { setAnalysisState('idle'); setAnalyzingAssetId(null); }, 1500);
                                                }}
                                                style={menuItemStyle('#ef4444', false)}
                                                onMouseOver={menuHover()}
                                                onMouseOut={menuOut}
                                            ><span style={{ fontSize: 15 }}>🚫</span> Cancel Analysis</button>
                                        )}

                                        {/* Sensitivity */}
                                        {onSetSensitivity && (
                                            <>
                                                <hr style={{ borderColor: '#1f2937', margin: '4px 0' }} />
                                                <button
                                                    onClick={e => { e.stopPropagation(); onSetSensitivity(asset.id, asset.sensitivity_status === 'safe' ? null : 'safe'); setShowActionMenu(false); }}
                                                    style={menuItemStyle('#4ade80', asset.sensitivity_status === 'safe')}
                                                    onMouseOver={menuHover()}
                                                    onMouseOut={menuOut}
                                                >😃 Mark as Safe</button>
                                                <button
                                                    onClick={e => { e.stopPropagation(); onSetSensitivity(asset.id, asset.sensitivity_status === 'unsafe' ? null : 'unsafe'); setShowActionMenu(false); }}
                                                    style={menuItemStyle('#ef4444', asset.sensitivity_status === 'unsafe')}
                                                    onMouseOver={menuHover()}
                                                    onMouseOut={menuOut}
                                                >🫣 Mark as Unsafe</button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>


                            {/* Close */}
                            <button onClick={onClose} style={{
                                background: 'none', border: 'none', color: 'white',
                                fontSize: '22px', cursor: 'pointer', opacity: 0.7, lineHeight: 1,
                                padding: '2px 4px'
                            }}>✕</button>
                        </div>
                    </div>

                    {/* ── Left/Right Nav ── */}
                    <div style={{
                        position: 'absolute', top: '50%', left: '12px', transform: 'translateY(-50%)',
                        zIndex: 1001, opacity: currentIndex > 0 ? 0.8 : 0.15,
                        cursor: currentIndex > 0 ? 'pointer' : 'default', padding: '12px'
                    }} onClick={e => { e.stopPropagation(); onPrevious(); }}>
                        <div style={{
                            background: 'rgba(0,0,0,0.5)', borderRadius: '50%',
                            width: 38, height: 38, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: 'white', fontSize: 18
                        }}>◀</div>
                    </div>
                    <div style={{
                        position: 'absolute', top: '50%', right: '12px', transform: 'translateY(-50%)',
                        zIndex: 1001, opacity: currentIndex < assetsLength - 1 ? 0.8 : 0.15,
                        cursor: currentIndex < assetsLength - 1 ? 'pointer' : 'default', padding: '12px'
                    }} onClick={e => { e.stopPropagation(); onNext(); }}>
                        <div style={{
                            background: 'rgba(0,0,0,0.5)', borderRadius: '50%',
                            width: 38, height: 38, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: 'white', fontSize: 18
                        }}>▶</div>
                    </div>

                    {/* ── Bottom Zoom Bar ── */}
                    <div style={{
                        position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                        display: 'flex', gap: '8px', background: 'rgba(15,15,25,0.85)',
                        padding: '6px 14px', borderRadius: '30px', zIndex: 1001,
                        backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)',
                        alignItems: 'center'
                    }} onClick={e => e.stopPropagation()}>

                        <button
                            onClick={() => { setScale(Math.max(1, scale - 0.5)); if (scale - 0.5 <= 1) setPan({ x: 0, y: 0 }); }}
                            style={zoomBtnStyle}
                            title="Zoom out"
                        >−</button>

                        <div style={{ color: '#94a3b8', fontSize: 12, minWidth: 40, textAlign: 'center' }}>
                            {Math.round(scale * 100)}%
                        </div>

                        <button
                            onClick={() => setScale(scale + 0.5)}
                            style={zoomBtnStyle}
                            title="Zoom in"
                        >+</button>

                        <div style={dividerStyle} />

                        <button
                            onClick={resetPanZoom}
                            style={{ ...zoomBtnStyle, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                            title="Reset zoom"
                        ><span style={{ fontSize: 14 }}>⟲</span> Reset</button>

                        <div style={dividerStyle} />

                        {/* Faces icon-only toggle */}
                        <button
                            onClick={() => setShowFaces(!showFaces)}
                            title={showFaces ? 'Hide faces' : 'Show faces'}
                            style={{
                                ...zoomBtnStyle,
                                background: showFaces ? 'rgba(0,255,255,0.15)' : 'none',
                                border: `1px solid ${showFaces ? 'rgba(0,255,255,0.5)' : 'transparent'}`,
                                borderRadius: 6, color: showFaces ? 'cyan' : 'white',
                                width: 30, height: 30, transition: 'all 0.2s'
                            }}
                        ><span style={{ fontSize: 15 }}>👤</span></button>

                        <div style={dividerStyle} />

                        {/* Info panel icon-only toggle */}
                        <button
                            onClick={() => setShowInfoPanel(!showInfoPanel)}
                            title={showInfoPanel ? 'Hide info panel (I)' : 'Show info panel (I)'}
                            style={{
                                ...zoomBtnStyle,
                                background: showInfoPanel ? 'rgba(99,102,241,0.25)' : 'none',
                                border: `1px solid ${showInfoPanel ? 'rgba(99,102,241,0.6)' : 'transparent'}`,
                                borderRadius: 6,
                                color: showInfoPanel ? '#a5b4fc' : 'white',
                                width: 30, height: 30, transition: 'all 0.2s'
                            }}
                        ><span style={{ fontSize: 15 }}>ℹ</span></button>
                    </div>
                </>
            )}

            {/* ── Analysis Error Modal ── */}
            {analysisError && (
                <div style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    background: '#0f172a', border: '1px solid #ef4444', borderRadius: '10px',
                    padding: '22px', zIndex: 3000, color: 'white',
                    width: 'min(480px, calc(100vw - 48px))',
                    maxHeight: '70vh', display: 'flex', flexDirection: 'column',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.7)'
                }} onClick={e => e.stopPropagation()}>
                    <h3 style={{ marginTop: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, fontSize: 16 }}>
                        ⚠️ Analysis Error
                    </h3>
                    <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#ccc', overflowY: 'auto', userSelect: 'text', flex: 1, minHeight: 0 }}>
                        {analysisError === 'MISSING_API_KEY' || analysisError === 'INVALID_API_KEY_FORMAT' ? (
                            <div>
                                {analysisError === 'MISSING_API_KEY'
                                    ? <p style={{ marginTop: 0 }}>No Gemini API key is configured. A key is required to run AI analysis.</p>
                                    : <p style={{ marginTop: 0 }}>The configured API key appears invalid — it should start with <code style={{ background: '#1e293b', padding: '1px 4px', borderRadius: 3 }}>AIza</code> and be ~39 characters long.</p>
                                }
                                <ol style={{ paddingLeft: 18, marginBottom: 0 }}>
                                    <li style={{ marginBottom: 8 }}>
                                        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>
                                            Get your free Gemini API key
                                        </a>{' '}from Google AI Studio.
                                    </li>
                                    <li>Paste your key into <strong>Settings → Get Metadata AI Job</strong>.</li>
                                </ol>
                            </div>
                        ) : (
                            <pre style={{
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0,
                                fontFamily: '"Cascadia Code","Consolas",monospace', fontSize: 11,
                                color: '#fca5a5', background: 'rgba(239,68,68,0.06)',
                                padding: 10, borderRadius: 6, border: '1px solid rgba(239,68,68,0.15)'
                            }}>{analysisError}</pre>
                        )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexShrink: 0 }}>
                        <button onClick={async e => { e.stopPropagation(); try { await navigator.clipboard.writeText(analysisError); } catch { /* */ } }}
                            style={outlineBtn}>📋 Copy</button>
                        <button onClick={e => { e.stopPropagation(); setAnalysisError(null); }}
                            style={outlineBtn}>Close</button>
                        {(analysisError === 'MISSING_API_KEY' || analysisError === 'INVALID_API_KEY_FORMAT') && onOpenSettings && (
                            <button onClick={e => { e.stopPropagation(); setAnalysisError(null); onOpenSettings(); }}
                                style={{ ...outlineBtn, background: '#3b82f6', borderColor: '#3b82f6', color: 'white' }}>
                                ⚙️ Open Settings
                            </button>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

// ── Style helpers ─────────────────────────────────────────────────────────────

const menuItemStyle = (color: string, active: boolean): React.CSSProperties => ({
    background: active ? `rgba(${hexToRgb(color)},0.12)` : 'transparent',
    border: 'none',
    color: active ? color : '#cbd5e1',
    textAlign: 'left', padding: '7px 12px', cursor: 'pointer',
    borderRadius: '6px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
    width: '100%', transition: 'background 0.15s'
});

const menuHover = () => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
};
const menuOut = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent';
};

const zoomBtnStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: 'white', cursor: 'pointer',
    fontSize: 16, width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center'
};

const dividerStyle: React.CSSProperties = {
    width: 1, height: 18, background: 'rgba(255,255,255,0.12)'
};

const outlineBtn: React.CSSProperties = {
    background: 'transparent', color: '#94a3b8', border: '1px solid #334155',
    padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12
};

function hexToRgb(hex: string): string {
    // Accept color names used above like '#4ade80' → '74,222,128'
    const map: Record<string, string> = {
        '#c084fc': '192,132,252', '#ef4444': '239,68,68',
        '#4ade80': '74,222,128', '#f59e0b': '245,158,11',
        '#6366f1': '99,102,241',
    };
    return map[hex] || '255,255,255';
}
