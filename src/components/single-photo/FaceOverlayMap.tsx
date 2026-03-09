import type React from 'react';
import type { Asset } from '../../../shared/types/core';

interface FaceOverlayMapProps {
    asset: Asset;
    showFaces: boolean;
    alwaysShowForPanel?: boolean;
    hoveredFaceKey?: string | null;
    onHoverFaceKey?: (key: string | null) => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
}

interface SubjectOverlay {
    key: string;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

function getFaceBorderColor(hasEmbedding: boolean): string {
    if (hasEmbedding) {return 'cyan';}
    return 'rgba(0, 255, 0, 0.5)';
}

function getFaceGlowColor(hasEmbedding: boolean): string {
    if (hasEmbedding) {return '0,255,255';}
    return '0,255,0';
}

function getFaceLabelColor(isHovered: boolean, hasEmbedding: boolean): string {
    if (!isHovered) {return 'white';}
    if (hasEmbedding) {return 'cyan';}
    return '#4ade80';
}

function getFaceLabelOpacity(isHovered: boolean, showFaces: boolean): number {
    if (isHovered || showFaces) {return 1;}
    return 0;
}

function handleFaceCardClick(
    event: React.MouseEvent<HTMLDivElement>,
    personId: string | undefined,
    personName: string | undefined,
    onFaceClick?: (id: string, name: string) => void
) {
    event.stopPropagation();
    if (!personId || !onFaceClick) {return;}
    onFaceClick(personId, personName || 'Unknown Person');
}

function normaliseBbox(bb: Record<string, number>): { x: number; y: number; w: number; h: number } {
    const scale = (bb.x > 1 || bb.y > 1 || bb.width > 1 || bb.height > 1) ? 1000 : 1;
    return { x: bb.x / scale, y: bb.y / scale, w: bb.width / scale, h: bb.height / scale };
}

function parseSubjects(asset: Asset): SubjectOverlay[] {
    const ai = asset.ai_metadata;
    const subjects = (ai?.subjects as Array<Record<string, unknown>> | undefined) ?? [];

    return subjects.flatMap((subject, i) => {
        const bb = subject.bounding_box as Record<string, number> | undefined;
        if (!bb) {return [];}

        const { x, y, w, h } = normaliseBbox(bb);
        if (w <= 0 || h <= 0) {return [];}

        const label = (subject.label as string) || `Subject ${i + 1}`;
        return [{ key: `subject-${i}`, label, x, y, w, h }];
    });
}

const FaceBox: React.FC<{
    asset: Asset;
    faceIndex: number;
    hoveredFaceKey?: string | null;
    onHoverFaceKey?: (key: string | null) => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    showFaces: boolean;
}> = ({ asset, faceIndex, hoveredFaceKey, onHoverFaceKey, onFaceClick, onIsolateFace, showFaces }) => {
    const face = asset.faces?.[faceIndex];
    if (!face) {return null;}

    const key = `face-${faceIndex}`;
    const isHovered = hoveredFaceKey === key;
    const hasEmbedding = Boolean(asset.face_embeddings && asset.face_embeddings[faceIndex]);
    const borderColor = getFaceBorderColor(hasEmbedding);
    const glowColor = getFaceGlowColor(hasEmbedding);
    const canClick = Boolean(face.person_id && onFaceClick);
    const labelColor = getFaceLabelColor(isHovered, hasEmbedding);
    const labelOpacity = getFaceLabelOpacity(isHovered, showFaces);

    return (
        <div
            key={key}
            className="group"
            title={face.person_name || 'Unknown Person'}
            onClick={(e) => handleFaceCardClick(e, face.person_id, face.person_name, onFaceClick)}
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
                boxShadow: isHovered ? `0 0 0 2px rgba(${glowColor},0.9), 0 0 18px rgba(${glowColor},0.7)` : '0 0 10px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.5)',
                transition: 'box-shadow 0.15s, border-color 0.15s',
                pointerEvents: 'auto',
                cursor: canClick ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                overflow: 'visible',
                zIndex: isHovered ? 12 : 10,
            }}
        >
            <div
                style={{
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    color: labelColor,
                    fontSize: '10px',
                    padding: '2px 5px',
                    borderRadius: '2px',
                    whiteSpace: 'nowrap',
                    transform: 'translateY(100%)',
                    marginTop: '4px',
                    opacity: labelOpacity,
                    transition: 'opacity 0.2s',
                    pointerEvents: 'none',
                }}
                className="face-label group-hover:opacity-100"
            >
                {face.person_name || 'Unknown'}
            </div>

            <IsolateFaceButton
                faceIndex={faceIndex}
                assetId={asset.id}
                personId={face.person_id}
                onIsolateFace={onIsolateFace}
            />
        </div>
    );
};

const IsolateFaceButton: React.FC<{
    faceIndex: number;
    assetId: string;
    personId?: string;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
}> = ({ faceIndex, assetId, personId, onIsolateFace }) => {
    if (!personId || !onIsolateFace) {return null;}

    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onIsolateFace(assetId, faceIndex);
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
        >
            Not this Person
        </button>
    );
};

const SubjectBox: React.FC<{
    subject: SubjectOverlay;
    hoveredFaceKey?: string | null;
    onHoverFaceKey?: (key: string | null) => void;
}> = ({ subject, hoveredFaceKey, onHoverFaceKey }) => {
    const isHovered = hoveredFaceKey === subject.key;

    return (
        <div
            key={subject.key}
            onMouseEnter={() => onHoverFaceKey?.(subject.key)}
            onMouseLeave={() => onHoverFaceKey?.(null)}
            title={subject.label}
            style={{
                position: 'absolute',
                left: `${subject.x * 100}%`,
                top: `${subject.y * 100}%`,
                width: `${subject.w * 100}%`,
                height: `${subject.h * 100}%`,
                border: `2px dashed ${isHovered ? 'white' : 'rgba(168,85,247,0.8)'}`,
                borderRadius: '3px',
                boxShadow: isHovered ? '0 0 0 2px rgba(168,85,247,0.9), 0 0 18px rgba(168,85,247,0.7)' : '0 0 8px rgba(0,0,0,0.4)',
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
            <div
                style={{
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
                }}
                className="face-label group-hover:opacity-100"
            >
                🤖 {subject.label}
            </div>
        </div>
    );
};

export const FaceOverlayMap: React.FC<FaceOverlayMapProps> = ({
    asset,
    showFaces,
    alwaysShowForPanel = false,
    hoveredFaceKey,
    onHoverFaceKey,
    onFaceClick,
    onIsolateFace,
}) => {
    const visible = showFaces || alwaysShowForPanel;
    if (!visible) {return null;}

    const faceIndices = asset.faces ? asset.faces.map((_, i) => i) : [];
    const subjects = parseSubjects(asset);

    return (
        <>
            {faceIndices.map((faceIndex) => (
                <FaceBox
                    key={`face-${faceIndex}`}
                    asset={asset}
                    faceIndex={faceIndex}
                    hoveredFaceKey={hoveredFaceKey}
                    onHoverFaceKey={onHoverFaceKey}
                    onFaceClick={onFaceClick}
                    onIsolateFace={onIsolateFace}
                    showFaces={showFaces}
                />
            ))}
            {subjects.map((subject) => (
                <SubjectBox
                    key={subject.key}
                    subject={subject}
                    hoveredFaceKey={hoveredFaceKey}
                    onHoverFaceKey={onHoverFaceKey}
                />
            ))}
            <style>{`
                .group:hover .isolate-btn { opacity: 1 !important; }
                .group:hover .face-label { opacity: 1 !important; }
            `}</style>
        </>
    );
};
