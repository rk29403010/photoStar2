import type { ReactNode } from 'react';
import type { PhotoEditOperation } from '@contracts/core';
import { Button } from '../Primitives';
import {
    CROP_ASPECT_HEIGHT_KEY,
    CROP_ASPECT_WIDTH_KEY,
    CROP_GUIDE_KEY,
    cropGuide,
    cropOptionNumber,
} from './cropOptions';
import type { CropGuide } from './cropOptions';

type AspectOption = {
    height: number;
    id: string;
    label: string;
    width: number;
};

const ASPECT_OPTIONS: AspectOption[] = [
    { id: 'free', label: 'Free', width: 0, height: 0 },
    { id: 'square', label: 'Square', width: 1, height: 1 },
    { id: '16-9', label: '16:9', width: 16, height: 9 },
    { id: '19-6', label: '19:6', width: 19, height: 6 },
    { id: '5-4', label: '5:4', width: 5, height: 4 },
    { id: '4-3', label: '4:3', width: 4, height: 3 },
    { id: '3-2', label: '3:2', width: 3, height: 2 },
];

const GUIDE_OPTIONS: Array<{ guide: CropGuide; label: string }> = [
    { guide: 0, label: 'None' },
    { guide: 1, label: '50:50' },
    { guide: 2, label: 'Thirds' },
    { guide: 3, label: 'Golden' },
    { guide: 4, label: 'Diagonals' },
    { guide: 5, label: 'Golden triangles' },
    { guide: 6, label: 'Harmonious' },
    { guide: 7, label: 'Golden spiral' },
    { guide: 8, label: 'Cross' },
    { guide: 9, label: 'V layout' },
    { guide: 10, label: 'Radial' },
    { guide: 11, label: 'L layout' },
    { guide: 12, label: 'Compound curve' },
    { guide: 13, label: 'Pyramid' },
    { guide: 14, label: 'Circular' },
];

type GuideLine = { id: string; x1: number; x2: number; y1: number; y2: number };

function selectedAspect(operation: PhotoEditOperation): AspectOption {
    const width = cropOptionNumber(operation, CROP_ASPECT_WIDTH_KEY);
    const height = cropOptionNumber(operation, CROP_ASPECT_HEIGHT_KEY);
    if (width <= 0 || height <= 0) {return ASPECT_OPTIONS[0];}
    const ratio = Math.max(width, height) / Math.min(width, height);
    return ASPECT_OPTIONS.find((option) => option.width > 0
        && Math.abs(option.width / option.height - ratio) < 0.0001) ?? ASPECT_OPTIONS[0];
}

function updateValues(operation: PhotoEditOperation, values: Record<string, number>): PhotoEditOperation {
    return { ...operation, values: { ...operation.values, ...values } };
}

function withAspect(operation: PhotoEditOperation, option: AspectOption): PhotoEditOperation {
    if (option.width === 0) {
        return updateValues(operation, { [CROP_ASPECT_WIDTH_KEY]: 0, [CROP_ASPECT_HEIGHT_KEY]: 0 });
    }
    const portrait = cropOptionNumber(operation, CROP_ASPECT_WIDTH_KEY) < cropOptionNumber(operation, CROP_ASPECT_HEIGHT_KEY);
    return updateValues(operation, {
        [CROP_ASPECT_WIDTH_KEY]: portrait ? option.height : option.width,
        [CROP_ASPECT_HEIGHT_KEY]: portrait ? option.width : option.height,
    });
}

function withOrientation(operation: PhotoEditOperation, portrait: boolean): PhotoEditOperation {
    const option = selectedAspect(operation);
    return updateValues(operation, {
        [CROP_ASPECT_WIDTH_KEY]: portrait ? option.height : option.width,
        [CROP_ASPECT_HEIGHT_KEY]: portrait ? option.width : option.height,
    });
}

function AspectGraphic(props: { readonly free?: boolean; readonly height: number; readonly width: number }) {
    if (props.free) {
        return <svg aria-hidden="true" className="h-7 w-8" viewBox="0 0 32 28" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 12V5h7M20 5h7v7M27 16v7h-7M12 23H5v-7" />
        </svg>;
    }
    const landscape = props.width >= props.height;
    const ratio = landscape ? props.width / props.height : props.height / props.width;
    const longEdge = 25;
    const shortEdge = Math.max(7, longEdge / ratio);
    const width = landscape ? longEdge : shortEdge;
    const height = landscape ? shortEdge : longEdge;
    return <svg aria-hidden="true" className="h-7 w-8" viewBox="0 0 32 28" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x={(32 - width) / 2} y={(28 - height) / 2} width={width} height={height} rx="1" />
    </svg>;
}

const GUIDE_LINES: Partial<Record<CropGuide, GuideLine[]>> = {
    1: [
        { id: 'centre-v', x1: 50, x2: 50, y1: 0, y2: 100 },
        { id: 'centre-h', x1: 0, x2: 100, y1: 50, y2: 50 },
    ],
    2: [
        { id: 'third-v1', x1: 33.333, x2: 33.333, y1: 0, y2: 100 },
        { id: 'third-v2', x1: 66.667, x2: 66.667, y1: 0, y2: 100 },
        { id: 'third-h1', x1: 0, x2: 100, y1: 33.333, y2: 33.333 },
        { id: 'third-h2', x1: 0, x2: 100, y1: 66.667, y2: 66.667 },
    ],
    3: [
        { id: 'gold-v1', x1: 38.2, x2: 38.2, y1: 0, y2: 100 },
        { id: 'gold-v2', x1: 61.8, x2: 61.8, y1: 0, y2: 100 },
        { id: 'gold-h1', x1: 0, x2: 100, y1: 38.2, y2: 38.2 },
        { id: 'gold-h2', x1: 0, x2: 100, y1: 61.8, y2: 61.8 },
    ],
    4: [
        { id: 'diagonal-1', x1: 0, x2: 100, y1: 0, y2: 100 },
        { id: 'diagonal-2', x1: 100, x2: 0, y1: 0, y2: 100 },
    ],
    5: [
        { id: 'golden-base', x1: 0, x2: 100, y1: 100, y2: 0 },
        { id: 'golden-left', x1: 0, x2: 38.2, y1: 0, y2: 61.8 },
        { id: 'golden-right', x1: 100, x2: 61.8, y1: 100, y2: 38.2 },
    ],
    6: [
        { id: 'harmonious-base', x1: 0, x2: 100, y1: 0, y2: 100 },
        { id: 'harmonious-left', x1: 0, x2: 61.8, y1: 100, y2: 38.2 },
        { id: 'harmonious-right', x1: 100, x2: 38.2, y1: 0, y2: 61.8 },
    ],
    8: [
        { id: 'cross-v', x1: 50, x2: 50, y1: 14, y2: 86 },
        { id: 'cross-h', x1: 22, x2: 78, y1: 50, y2: 50 },
    ],
    9: [
        { id: 'v-left', x1: 8, x2: 50, y1: 0, y2: 100 },
        { id: 'v-right', x1: 92, x2: 50, y1: 0, y2: 100 },
    ],
    10: [
        { id: 'radial-n', x1: 50, x2: 50, y1: 50, y2: 0 },
        { id: 'radial-ne', x1: 50, x2: 100, y1: 50, y2: 0 },
        { id: 'radial-e', x1: 50, x2: 100, y1: 50, y2: 50 },
        { id: 'radial-se', x1: 50, x2: 100, y1: 50, y2: 100 },
        { id: 'radial-s', x1: 50, x2: 50, y1: 50, y2: 100 },
        { id: 'radial-sw', x1: 50, x2: 0, y1: 50, y2: 100 },
        { id: 'radial-w', x1: 50, x2: 0, y1: 50, y2: 50 },
        { id: 'radial-nw', x1: 50, x2: 0, y1: 50, y2: 0 },
    ],
    11: [
        { id: 'l-v', x1: 34, x2: 34, y1: 18, y2: 78 },
        { id: 'l-h', x1: 34, x2: 82, y1: 78, y2: 78 },
    ],
    13: [
        { id: 'pyramid-left', x1: 12, x2: 50, y1: 100, y2: 10 },
        { id: 'pyramid-right', x1: 88, x2: 50, y1: 100, y2: 10 },
        { id: 'pyramid-base', x1: 12, x2: 88, y1: 100, y2: 100 },
    ],
};

function GuideCurves(props: { readonly guide: CropGuide }) {
    if (props.guide === 7) {
        return <path vectorEffect="non-scaling-stroke" d="M4 96C4 42 43 4 96 4V62H62C41 62 38 42 50 37C61 33 69 43 64 52C61 58 54 57 52 52" />;
    }
    if (props.guide === 12) {
        return <path vectorEffect="non-scaling-stroke" d="M78 4C28 4 25 39 51 50C77 61 72 96 22 96" />;
    }
    if (props.guide === 14) {
        return <ellipse vectorEffect="non-scaling-stroke" cx="50" cy="50" rx="34" ry="34" />;
    }
    return null;
}

export function CropGuideGraphic(props: { readonly guide: CropGuide; readonly icon?: boolean }) {
    return <svg
        aria-hidden="true"
        className={props.icon ? 'h-7 w-8' : 'h-full w-full text-white drop-shadow-sm'}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
        strokeWidth={props.icon ? 5 : 0.65}
    >
        {props.icon && <rect x="3" y="8" width="94" height="84" rx="4" />}
        {(GUIDE_LINES[props.guide] ?? []).map((line) => <line key={line.id} vectorEffect="non-scaling-stroke" {...line} />)}
        <GuideCurves guide={props.guide} />
    </svg>;
}

function OptionTile(props: {
    readonly active: boolean;
    readonly children: ReactNode;
    readonly label: string;
    readonly onClick: () => void;
}) {
    const tone = props.active
        ? 'border-brand-accent bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30'
        : 'border-content/10 bg-surface-secondary text-content-secondary hover:bg-surface hover:text-content';
    return <button
        type="button"
        aria-pressed={props.active}
        className={`flex min-h-16 touch-manipulation flex-col items-center justify-center gap-1 rounded-md border p-2 motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-brand-accent ${tone}`}
        onClick={props.onClick}
    >
        {props.children}
        <span className="text-xs leading-none">{props.label}</span>
    </button>;
}

export function PhotoCropOptions(props: {
    readonly operation: PhotoEditOperation;
    readonly onChange: (operation: PhotoEditOperation) => void;
}) {
    const aspect = selectedAspect(props.operation);
    const aspectWidth = cropOptionNumber(props.operation, CROP_ASPECT_WIDTH_KEY);
    const aspectHeight = cropOptionNumber(props.operation, CROP_ASPECT_HEIGHT_KEY);
    const guide = cropGuide(props.operation);
    const showOrientation = aspect.width > 0 && aspect.width !== aspect.height;
    const reset = () => props.onChange({
        ...props.operation,
        values: { x: 0, y: 0, width: 1, height: 1 },
    });
    return <div className="flex flex-col gap-4">
        <p className="text-sm text-content-secondary">Drag a corner or edge to resize. Drag inside the frame to move the photo.</p>
        <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-semibold text-content">Aspect ratio</legend>
            <div className="grid grid-cols-3 gap-2">
                {ASPECT_OPTIONS.map((option) => <OptionTile
                    key={option.id}
                    active={aspect.id === option.id}
                    label={option.label}
                    onClick={() => props.onChange(withAspect(props.operation, option))}
                >
                    <AspectGraphic free={option.width === 0} width={option.width} height={option.height} />
                </OptionTile>)}
            </div>
            {showOrientation && <div className="grid grid-cols-2 gap-2">
                <OptionTile active={aspectWidth >= aspectHeight} label="Horizontal" onClick={() => props.onChange(withOrientation(props.operation, false))}>
                    <AspectGraphic width={3} height={2} />
                </OptionTile>
                <OptionTile active={aspectHeight > aspectWidth} label="Vertical" onClick={() => props.onChange(withOrientation(props.operation, true))}>
                    <AspectGraphic width={2} height={3} />
                </OptionTile>
            </div>}
        </fieldset>
        <fieldset>
            <legend className="mb-2 text-xs font-semibold text-content">Composition guide</legend>
            <div className="grid grid-cols-3 gap-2">
                {GUIDE_OPTIONS.map((option) => <OptionTile
                    key={option.guide}
                    active={guide === option.guide}
                    label={option.label}
                    onClick={() => props.onChange(updateValues(props.operation, { [CROP_GUIDE_KEY]: option.guide }))}
                >
                    <CropGuideGraphic guide={option.guide} icon />
                </OptionTile>)}
            </div>
        </fieldset>
        <Button className="focus-visible:ring-2 focus-visible:ring-brand-accent" variant="secondary" onClick={reset}>Reset crop</Button>
    </div>;
}
