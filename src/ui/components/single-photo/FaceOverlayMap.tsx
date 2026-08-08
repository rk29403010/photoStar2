import type React from 'react';
import type { Asset, FaceBox } from '@contracts/core';
import {
    getVisibleSinglePhotoOverlayItems,
    getSinglePhotoPeopleColor,
    type SinglePhotoOverlayMode,
    type SinglePhotoPeopleItem,
} from './singlePhotoPeopleModel';
import { getFrameInteriorBox } from '../../../services/photoMetadata/frameUtils';

type FaceOverlayMapProps = {
    readonly asset: Asset;
    readonly overlayMode: SinglePhotoOverlayMode;
    readonly hoveredFaceKey?: string | null;
    readonly onHoverFaceKey?: (key: string | null) => void;
    readonly selectedOverlayKey?: string | null;
    readonly onSelectOverlayKey?: (key: string | null) => void;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly showWithFrame?: boolean;
}

function getFaceIndex(item: SinglePhotoPeopleItem): number | null {
    if (!item.key.startsWith('face-')) {
        return null;
    }

    const faceIndex = Number(item.key.slice('face-'.length));
    return Number.isInteger(faceIndex) ? faceIndex : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: Record<string, unknown>, key: string): number | null {
    const field = value[key];
    return typeof field === 'number' ? field : null;
}

function readFaceBox(value: unknown): FaceBox['box'] | null {
    if (!isRecord(value)) {
        return null;
    }

    const x = readNumber(value, 'x');
    const y = readNumber(value, 'y');
    const width = readNumber(value, 'width');
    const height = readNumber(value, 'height');
    if (x === null || y === null || width === null || height === null) {
        return null;
    }

    return { x, y, width, height };
}

function getFaceRecord(item: SinglePhotoPeopleItem): FaceBox | null {
    if (!isRecord(item.raw)) {
        return null;
    }

    const box = readFaceBox(item.raw.box);
    if (!box) {
        return null;
    }

    return {
        box,
        ...(typeof item.raw.person_id === 'string' ? { person_id: item.raw.person_id } : {}),
        ...(typeof item.raw.person_name === 'string' ? { person_name: item.raw.person_name } : {}),
    };
}

function handleResolvedFaceClick(
    event: React.MouseEvent,
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

function handleOverlayClick(params: {
    event: React.MouseEvent<SVGPolygonElement | HTMLDivElement>;
    item: SinglePhotoPeopleItem;
    onFaceClick?: (id: string, name: string) => void;
    onSelectOverlayKey?: (key: string | null) => void;
}) {
    params.event.stopPropagation();
    params.onSelectOverlayKey?.(params.item.key);
    handleResolvedFaceClick(params.event, params.item, params.onFaceClick);
}

function isOverlaySelectionKey(event: React.KeyboardEvent<HTMLElement | SVGPolygonElement>): boolean {
    return event.key === 'Enter' || event.key === ' ';
}

function handleOverlayKeyDown(params: {
    event: React.KeyboardEvent<HTMLElement | SVGPolygonElement>;
    itemKey: string;
    onSelectOverlayKey?: (key: string | null) => void;
}) {
    if (!isOverlaySelectionKey(params.event)) {
        return;
    }
    params.event.preventDefault();
    params.onSelectOverlayKey?.(params.itemKey);
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

function getOverlayBorderStyle(kind: SinglePhotoPeopleItem['kind']): 'dashed' | 'solid' {
    return kind === 'remote-subject' || kind === 'region-of-interest' ? 'dashed' : 'solid';
}

const OverlayBox: React.FC<{
    readonly asset: Asset;
    readonly item: SinglePhotoPeopleItem;
    readonly hoveredFaceKey?: string | null;
    readonly onHoverFaceKey?: (key: string | null) => void;
    readonly selectedOverlayKey?: string | null;
    readonly onSelectOverlayKey?: (key: string | null) => void;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly onIsolateFace?: (assetId: string, faceIndex: number) => void;
    readonly showWithFrame?: boolean;
}> = ({ asset, item, hoveredFaceKey, onHoverFaceKey, selectedOverlayKey, onSelectOverlayKey, onFaceClick, onIsolateFace, showWithFrame }) => {
    const isHovered = hoveredFaceKey === item.key;
    const isSelected = selectedOverlayKey === item.key;
    const isHighlighted = isHovered || isSelected;
    const colors = getSinglePhotoPeopleColor(item.kind);
    const borderStyle = getOverlayBorderStyle(item.kind);

    const shouldCrop = Boolean(asset.frame_detection) && !showWithFrame;
    const interiorBox = shouldCrop ? getFrameInteriorBox(asset.frame_detection) : null;
    const coords = getFaceBoxCoordinates(item.box, interiorBox, shouldCrop);

    return (
        <div
            key={item.key}
            className="group"
            title={item.label}
            role="button"
            tabIndex={0}
            onClick={(event) => handleOverlayClick({ event, item, onFaceClick, onSelectOverlayKey })}
            onKeyDown={(event) => handleOverlayKeyDown({ event, itemKey: item.key, onSelectOverlayKey })}
            onMouseEnter={() => onHoverFaceKey?.(item.key)}
            onMouseLeave={() => onHoverFaceKey?.(null)}
            style={{
                position: 'absolute',
                left: `${coords.left * 100}%`,
                top: `${coords.top * 100}%`,
                width: `${coords.width * 100}%`,
                height: `${coords.height * 100}%`,
                border: `2px ${borderStyle} ${isHighlighted ? colors.borderHover : colors.border}`,
                borderRadius: '3px',
                backgroundColor: isSelected ? `rgba(${colors.glowRgb},0.24)` : 'transparent',
                boxShadow: isHighlighted
                    ? `0 0 0 2px rgba(${colors.glowRgb},0.9), 0 0 18px rgba(${colors.glowRgb},0.7)`
                    : '0 0 4px rgba(0,0,0,0.45)',
                transition: 'background-color 0.15s, box-shadow 0.15s, border-color 0.15s',
                pointerEvents: 'auto',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                overflow: 'visible',
                zIndex: isHighlighted ? 12 : 9,
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
                    opacity: 1,
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

function getPolygonPoints(params: {
    points: NonNullable<SinglePhotoPeopleItem['points']>;
    interiorBox: { x: number; y: number; width: number; height: number } | null;
    shouldCrop: boolean;
}): string {
    return params.points.map((point) => {
        const x = params.shouldCrop && params.interiorBox
            ? (point.x - params.interiorBox.x) / params.interiorBox.width
            : point.x;
        const y = params.shouldCrop && params.interiorBox
            ? (point.y - params.interiorBox.y) / params.interiorBox.height
            : point.y;
        return `${x * 100},${y * 100}`;
    }).join(' ');
}

function getPolygonLabelPoint(params: {
    points: NonNullable<SinglePhotoPeopleItem['points']>;
    interiorBox: { x: number; y: number; width: number; height: number } | null;
    shouldCrop: boolean;
}) {
    const point = params.points[0];
    if (!point) {
        return null;
    }

    return {
        x: (params.shouldCrop && params.interiorBox ? (point.x - params.interiorBox.x) / params.interiorBox.width : point.x) * 100,
        y: (params.shouldCrop && params.interiorBox ? (point.y - params.interiorBox.y) / params.interiorBox.height : point.y) * 100,
    };
}

const PolygonLabel: React.FC<{
    readonly item: SinglePhotoPeopleItem;
    readonly colors: ReturnType<typeof getSinglePhotoPeopleColor>;
    readonly labelPoint: { x: number; y: number } | null;
}> = ({ item, colors, labelPoint }) => {
    if (!labelPoint) {
        return null;
    }

    return (
        <text x={labelPoint.x} y={labelPoint.y} dx="1" dy="-1" fill={colors.labelText} stroke={colors.labelBackground} strokeWidth="0.7" paintOrder="stroke" style={{ fontSize: '3px', fontWeight: 'bold', pointerEvents: 'none' }}>
            {item.icon} {item.label}
        </text>
    );
};

const PolygonOverlay: React.FC<{
    readonly asset: Asset;
    readonly item: SinglePhotoPeopleItem;
    readonly hoveredFaceKey?: string | null;
    readonly onHoverFaceKey?: (key: string | null) => void;
    readonly selectedOverlayKey?: string | null;
    readonly onSelectOverlayKey?: (key: string | null) => void;
    readonly onFaceClick?: (personId: string, personName: string) => void;
    readonly showWithFrame?: boolean;
}> = ({ asset, item, hoveredFaceKey, onHoverFaceKey, selectedOverlayKey, onSelectOverlayKey, onFaceClick, showWithFrame }) => {
    const isHovered = hoveredFaceKey === item.key;
    const isSelected = selectedOverlayKey === item.key;
    const isHighlighted = isHovered || isSelected;
    const colors = getSinglePhotoPeopleColor(item.kind);
    const shouldCrop = Boolean(asset.frame_detection) && !showWithFrame;
    const interiorBox = shouldCrop ? getFrameInteriorBox(asset.frame_detection) : null;
    const points = item.points ?? [];
    const labelPoint = getPolygonLabelPoint({ points, interiorBox, shouldCrop });

    return (
        <svg
            aria-label={item.label}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{ position: 'absolute', inset: 0, overflow: 'visible', zIndex: isHighlighted ? 12 : 9, pointerEvents: 'none' }}
        >
            <polygon
                points={getPolygonPoints({ points, interiorBox, shouldCrop })}
                role="button"
                tabIndex={0}
                onClick={(event) => handleOverlayClick({ event, item, onFaceClick, onSelectOverlayKey })}
                onKeyDown={(event) => handleOverlayKeyDown({ event, itemKey: item.key, onSelectOverlayKey })}
                onMouseEnter={() => onHoverFaceKey?.(item.key)}
                onMouseLeave={() => onHoverFaceKey?.(null)}
                style={{
                    fill: isSelected ? `rgba(${colors.glowRgb},0.24)` : 'transparent',
                    stroke: isHighlighted ? colors.borderHover : colors.border,
                    strokeWidth: isHighlighted ? 0.7 : 0.45,
                    vectorEffect: 'non-scaling-stroke',
                    filter: isHighlighted ? `drop-shadow(0 0 7px rgba(${colors.glowRgb},0.8))` : 'drop-shadow(0 0 4px rgba(0,0,0,0.45))',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                }}
            ><title>{item.label}</title></polygon>
            <PolygonLabel item={item} colors={colors} labelPoint={labelPoint} />
        </svg>
    );
};

export const FaceOverlayMap: React.FC<FaceOverlayMapProps> = ({
    asset,
    overlayMode,
    hoveredFaceKey,
    onHoverFaceKey,
    selectedOverlayKey,
    onSelectOverlayKey,
    onFaceClick,
    onIsolateFace,
    showWithFrame,
}) => {
    if (!overlayMode) {
        return null;
    }

    const items = getVisibleSinglePhotoOverlayItems(asset, overlayMode);

    return (
        <>
            {items.map((item) => item.points && item.points.length >= 3 ? (
                <PolygonOverlay key={item.key} asset={asset} item={item} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} selectedOverlayKey={selectedOverlayKey} onSelectOverlayKey={onSelectOverlayKey} onFaceClick={onFaceClick} showWithFrame={showWithFrame} />
            ) : (
                <OverlayBox key={item.key} asset={asset} item={item} hoveredFaceKey={hoveredFaceKey} onHoverFaceKey={onHoverFaceKey} selectedOverlayKey={selectedOverlayKey} onSelectOverlayKey={onSelectOverlayKey} onFaceClick={onFaceClick} onIsolateFace={onIsolateFace} showWithFrame={showWithFrame} />
            ))}
            <style>{`
                .group:hover .isolate-btn { opacity: 1 !important; }
                .group:hover .face-label { opacity: 1 !important; }
            `}</style>
        </>
    );
};
