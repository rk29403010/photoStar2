import type React from 'react';
import type { Asset, FaceBox } from '@contracts/core';
import {
    buildSinglePhotoPeopleModel,
    getSinglePhotoPeopleColor,
    type SinglePhotoPeopleItem,
} from './singlePhotoPeopleModel';
import { getFrameInteriorBox } from '../../../services/photoMetadata/frameUtils';

type FaceOverlayMapProps = {
    readonly asset: Asset;
    readonly showFaces: boolean;
    readonly alwaysShowForPanel?: boolean;
    readonly hoveredFaceKey?: string | null;
    readonly onHoverFaceKey?: (key: string | null) => void;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly showWithFrame?: boolean;
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
    readonly assetId: string;
    readonly item: SinglePhotoPeopleItem;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
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

function getFaceBoxCoordinates(
    box: { x: number; y: number; w: number; h: number },
    interiorBox: { x: number; y: number; width: number; height: number } | null,
    shouldCrop: boolean,
) {
    if (shouldCrop && interiorBox) {
        return {
            left: (box.x - interiorBox.x) / interiorBox.width,
            top: (box.y - interiorBox.y) / interiorBox.height,
            width: box.w / interiorBox.width,
            height: box.h / interiorBox.height,
        };
    }
    return {
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
    };
}

const OverlayBox: React.FC<{
    readonly asset: Asset;
    readonly item: SinglePhotoPeopleItem;
    readonly hoveredFaceKey?: string | null;
    readonly onHoverFaceKey?: (key: string | null) => void;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly showFaces: boolean;
    readonly showWithFrame?: boolean;
}> = ({ asset, item, hoveredFaceKey, onHoverFaceKey, onFaceClick, onIsolateFace, showFaces, showWithFrame }) => {
    const isHovered = hoveredFaceKey === item.key;
    const colors = getSinglePhotoPeopleColor(item.kind);
    const face = getFaceRecord(item);
    const canClick = Boolean(face?.person_id && onFaceClick);
    const borderStyle = item.kind === 'remote-subject' || item.kind === 'region-of-interest' ? 'dashed' : 'solid';

    const shouldCrop = Boolean(asset.frame_detection) && !showWithFrame;
    const interiorBox = shouldCrop ? getFrameInteriorBox(asset.frame_detection) : null;
    const coords = getFaceBoxCoordinates(item.box, interiorBox, shouldCrop);

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
                left: `${coords.left * 100}%`,
                top: `${coords.top * 100}%`,
                width: `${coords.width * 100}%`,
                height: `${coords.height * 100}%`,
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
    showWithFrame,
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
                    showWithFrame={showWithFrame}
                />
            ))}
            <style>{`
                .group:hover .isolate-btn { opacity: 1 !important; }
                .group:hover .face-label { opacity: 1 !important; }
            `}</style>
        </>
    );
};
