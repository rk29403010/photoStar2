import React from 'react';
import type { Asset } from '../../../shared/types/core';

interface FaceOverlayMapProps {
    asset: Asset;
    showFaces: boolean;
    /** When true, overlays are always visible (People tab open) */
    alwaysShowForPanel?: boolean;
    /** Currently hovered face key — 'face-{i}' or 'subject-{i}' */
    hoveredFaceKey?: string | null;
    onHoverFaceKey?: (key: string | null) => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
}

/** Normalise an AI bounding_box {x,y,width,height} that may be 0–1 or 0–1000 */
function normaliseBbox(bb: Record<string, number>): { x: number; y: number; w: number; h: number } {
    const scale = (bb.x > 1 || bb.y > 1 || bb.width > 1 || bb.height > 1) ? 1000 : 1;
    return {
        x: bb.x / scale,
        y: bb.y / scale,
        w: bb.width / scale,
        h: bb.height / scale,
    };
}

export const FaceOverlayMap: React.FC<FaceOverlayMapProps> = ({
    asset, showFaces, alwaysShowForPanel = false,
    hoveredFaceKey, onHoverFaceKey,
    onFaceClick, onIsolateFace,
}) => {
    const visible = showFaces || alwaysShowForPanel;
    if (!visible) return null;

    const faces = asset.faces ?? [];
    const ai = asset.ai_metadata as Record<string, unknown> | undefined;
    const subjects = (ai?.subjects as Array<Record<string, unknown>> | undefined) ?? [];

    return (
        <>
            {/* ── Detected / recognised face boxes ── */}
            {faces.map((face, i) => {
                const key = `face-${i}`;
                const isHovered = hoveredFaceKey === key;
                const hasEmbedding = asset.face_embeddings && asset.face_embeddings[i];
                const borderColor = hasEmbedding ? 'cyan' : 'rgba(0, 255, 0, 0.5)';
                const glowColor = hasEmbedding ? '0,255,255' : '0,255,0';

                return (
                    <div
                        key={key}
                        className="group"
                        title={face.person_name || 'Unknown Person'}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (face.person_id && onFaceClick) {
                                onFaceClick(face.person_id, face.person_name || 'Unknown Person');
                            }
                        }}
                        onMouseEnter={() => onHoverFaceKey?.(key)}
                        onMouseLeave={() => onHoverFaceKey?.(null)}
                        style={{
                            position: 'absolute',
                            left: `${face.box[0] * 100}%`,
                            top: `${face.box[1] * 100}%`,
                            width: `${(face.box[2] - face.box[0]) * 100}%`,
                            height: `${(face.box[3] - face.box[1]) * 100}%`,
                            border: `2px solid ${isHovered ? 'white' : borderColor}`,
                            borderRadius: '2px',
                            boxShadow: isHovered
                                ? `0 0 0 2px rgba(${glowColor},0.9), 0 0 18px rgba(${glowColor},0.7)`
                                : '0 0 10px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.5)',
                            transition: 'box-shadow 0.15s, border-color 0.15s',
                            pointerEvents: 'auto',
                            cursor: face.person_id && onFaceClick ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            overflow: 'visible',
                            zIndex: isHovered ? 12 : 10,
                        }}
                    >
                        {/* Name label */}
                        <div style={{
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            color: isHovered ? (hasEmbedding ? 'cyan' : '#4ade80') : 'white',
                            fontSize: '10px',
                            padding: '2px 5px',
                            borderRadius: '2px',
                            whiteSpace: 'nowrap',
                            transform: 'translateY(100%)',
                            marginTop: '4px',
                            opacity: isHovered || showFaces ? 1 : 0,
                            transition: 'opacity 0.2s',
                            pointerEvents: 'none',
                        }} className="face-label group-hover:opacity-100">
                            {face.person_name || 'Unknown'}
                        </div>

                        {/* Isolate button */}
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

            {/* ── AI subject bounding boxes ── */}
            {subjects.map((s, i) => {
                const bb = s.bounding_box as Record<string, number> | undefined;
                if (!bb) return null;
                const { x, y, w, h } = normaliseBbox(bb);
                if (w <= 0 || h <= 0) return null;

                const key = `subject-${i}`;
                const isHovered = hoveredFaceKey === key;
                const label = (s.label as string) || `Subject ${i + 1}`;

                return (
                    <div
                        key={key}
                        onMouseEnter={() => onHoverFaceKey?.(key)}
                        onMouseLeave={() => onHoverFaceKey?.(null)}
                        title={label}
                        style={{
                            position: 'absolute',
                            left: `${x * 100}%`,
                            top: `${y * 100}%`,
                            width: `${w * 100}%`,
                            height: `${h * 100}%`,
                            border: `2px dashed ${isHovered ? 'white' : 'rgba(168,85,247,0.8)'}`,
                            borderRadius: '3px',
                            boxShadow: isHovered
                                ? '0 0 0 2px rgba(168,85,247,0.9), 0 0 18px rgba(168,85,247,0.7)'
                                : '0 0 8px rgba(0,0,0,0.4)',
                            transition: 'box-shadow 0.15s, border-color 0.15s',
                            pointerEvents: 'auto',
                            cursor: 'default',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            overflow: 'visible',
                            zIndex: isHovered ? 12 : 9,
                        }}
                    >
                        <div style={{
                            backgroundColor: 'rgba(88,28,135,0.8)',
                            color: isHovered ? '#e9d5ff' : '#c084fc',
                            fontSize: '10px',
                            padding: '2px 5px',
                            borderRadius: '2px',
                            whiteSpace: 'nowrap',
                            transform: 'translateY(100%)',
                            marginTop: '4px',
                            opacity: isHovered ? 1 : 0,
                            transition: 'opacity 0.2s',
                            pointerEvents: 'none',
                        }} className="face-label group-hover:opacity-100">
                            🤖 {label}
                        </div>
                    </div>
                );
            })}

            <style>{`
                .group:hover .isolate-btn { opacity: 1 !important; }
                .group:hover .face-label { opacity: 1 !important; }
            `}</style>
        </>
    );
};
