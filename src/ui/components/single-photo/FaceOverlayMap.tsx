import type React from 'react';
import type { Asset, FaceBox } from '@contracts/core';
import {
    buildSinglePhotoPeopleModel,
    getSinglePhotoPeopleColor,
    type SinglePhotoPeopleItem,
} from './singlePhotoPeopleModel';

interface FaceOverlayMapProps {
    asset: Asset;
    showFaces: boolean;
    alwaysShowForPanel?: boolean;
    hoveredFaceKey?: string | null;
    onHoverFaceKey?: (key: string | null) => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
}

function getItemLabelOpacity(isHovered: boolean, showFaces: boolean): number {
    if (isHovered || showFaces) {
        return 1;
    }

    return 0;
}

function getFaceIndex(item: SinglePhotoPeopleItem): number | null {
    if (!item.key.startsWith('face-')) {
        return null;
    }

    const faceIndex = Number(item.key.slice('face-'.length));
    return Number.isInteger(faceIndex) ? faceIndex : null;
}

function getFaceRecord(item: SinglePhotoPeopleItem): FaceBox | null {
    return typeof item.raw === 'object' && item.raw !== null
        ? item.raw as FaceBox
        : null;
}

function handleResolvedFaceClick(
    event: React.MouseEvent<HTMLDivElement>,
    item: SinglePhotoPeopleItem,
    onFaceClick?: (id: string, name: string) => void,
) {
    const face = getFaceRecord(item);
    if (!face?.person_id || !onFaceClick) {
        return;
    }

    event.stopPropagation();
    onFaceClick(face.person_id, face.person_name || 'Unknown Person');
}

const IsolateFaceButton: React.FC<{
    assetId: string;
    item: SinglePhotoPeopleItem;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
}> = ({ assetId, item, onIsolateFace }) => {
    const faceIndex = getFaceIndex(item);
    const face = getFaceRecord(item);
    if (faceIndex === null || !face?.person_id || !onIsolateFace) {
        return null;
    }

    return (
        <button
            onClick={(event) => {
                event.stopPropagation();
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

const OverlayBox: React.FC<{
    asset: Asset;
    item: SinglePhotoPeopleItem;
    hoveredFaceKey?: string | null;
    onHoverFaceKey?: (key: string | null) => void;
    onFaceClick?: (personId: string, personName: string) => void;
    onIsolateFace?: (assetId: string, faceIndex: number) => void;
    showFaces: boolean;
}> = ({ asset, item, hoveredFaceKey, onHoverFaceKey, onFaceClick, onIsolateFace, showFaces }) => {
    const isHovered = hoveredFaceKey === item.key;
    const colors = getSinglePhotoPeopleColor(item.kind);
    const face = getFaceRecord(item);
    const canClick = Boolean(face?.person_id && onFaceClick);
    const borderStyle = item.kind === 'remote-subject' || item.kind === 'region-of-interest' ? 'dashed' : 'solid';

    return (
        <div
            key={item.key}
            className="group"
            title={item.label}
            onClick={(event) => handleResolvedFaceClick(event, item, onFaceClick)}
            onMouseEnter={() => onHoverFaceKey?.(item.key)}
            onMouseLeave={() => onHoverFaceKey?.(null)}
            style={{
                position: 'absolute',
                left: `${item.box.x * 100}%`,
                top: `${item.box.y * 100}%`,
                width: `${item.box.w * 100}%`,
                height: `${item.box.h * 100}%`,
                border: `2px ${borderStyle} ${isHovered ? colors.borderHover : colors.border}`,
                borderRadius: '3px',
                boxShadow: isHovered
                    ? `0 0 0 2px rgba(${colors.glowRgb},0.9), 0 0 18px rgba(${colors.glowRgb},0.7)`
                    : '0 0 10px rgba(0,0,0,0.45), inset 0 0 10px rgba(0,0,0,0.25)',
                transition: 'box-shadow 0.15s, border-color 0.15s',
                pointerEvents: 'auto',
                cursor: canClick ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                overflow: 'visible',
                zIndex: isHovered ? 12 : 9,
            }}
        >
            <div
                style={{
                    backgroundColor: colors.labelBackground,
                    color: colors.labelText,
                    fontSize: '10px',
                    padding: '2px 5px',
                    borderRadius: '2px',
                    whiteSpace: 'nowrap',
                    transform: 'translateY(100%)',
                    marginTop: '4px',
                    opacity: getItemLabelOpacity(isHovered, showFaces),
                    transition: 'opacity 0.2s',
                    pointerEvents: 'none',
                }}
                className="face-label group-hover:opacity-100"
            >
                {item.icon} {item.label}
            </div>

            <IsolateFaceButton assetId={asset.id} item={item} onIsolateFace={onIsolateFace} />
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
    if (!visible) {
        return null;
    }

    const model = buildSinglePhotoPeopleModel(asset);
    const items = [...model.peopleItems, ...model.regionsOfInterest];

    return (
        <>
            {items.map((item) => (
                <OverlayBox
                    key={item.key}
                    asset={asset}
                    item={item}
                    hoveredFaceKey={hoveredFaceKey}
                    onHoverFaceKey={onHoverFaceKey}
                    onFaceClick={onFaceClick}
                    onIsolateFace={onIsolateFace}
                    showFaces={showFaces}
                />
            ))}
            <style>{`
                .group:hover .isolate-btn { opacity: 1 !important; }
                .group:hover .face-label { opacity: 1 !important; }
            `}</style>
        </>
    );
};
