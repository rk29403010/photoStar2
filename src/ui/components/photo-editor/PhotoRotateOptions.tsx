import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
    FlipHorizontal2, FlipVertical2, Grid2X2, Maximize2, Minimize2,
    RotateCcw, RotateCw, Sparkles, Square,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PHOTO_ROTATION_FILL } from '@contracts/core';
import type { PhotoEditOperation } from '@contracts/core';
import { Button } from '../Primitives';
import { normalizeRotationAngle, snapRotationAngle } from './rotationGeometry';

type OptionTileProps = {
    readonly active: boolean;
    readonly disabled?: boolean;
    readonly icon: LucideIcon;
    readonly iconClassName?: string;
    readonly label: string;
    readonly onClick: () => void;
    readonly title?: string;
};

function OptionTile(props: OptionTileProps) {
    const Icon = props.icon;
    const stateClass = props.active
        ? 'border-brand-accent bg-brand-accent/15 text-brand-accent'
        : 'border-content/10 bg-surface-secondary text-content-secondary hover:text-content';
    return <Button
        type="button"
        variant="secondary"
        aria-pressed={props.active}
        className={`h-20 flex-col p-2 focus-visible:ring-2 focus-visible:ring-brand-accent ${stateClass}`}
        disabled={props.disabled}
        title={props.title}
        onClick={props.onClick}
    >
        <Icon aria-hidden="true" size={22} className={props.iconClassName} />
        <span className="text-center text-xs leading-4">{props.label}</span>
    </Button>;
}

type PhotoRotateOptionsProps = {
    readonly operation: PhotoEditOperation;
    readonly onCommit: (operation: PhotoEditOperation) => void;
    readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

const ANGLE_MARKERS = [-90, -45, -30, 0, 30, 45, 90];

type RangeStyle = CSSProperties & {
    '--range-fill-end': string;
    '--range-fill-start': string;
};

function anglePosition(angle: number): number {
    return (angle + 180) / 360 * 100;
}

function useRotateActions(props: PhotoRotateOptionsProps) {
    const draftRef = useRef(props.operation);
    useEffect(() => {draftRef.current = props.operation;}, [props.operation]);
    const nextOperation = (values: Record<string, number | boolean>) => {
        const next = { ...draftRef.current, values: { ...draftRef.current.values, ...values } };
        draftRef.current = next;
        return next;
    };
    const preview = (values: Record<string, number | boolean>) => props.onPreviewChange(nextOperation(values));
    const commit = (values: Record<string, number | boolean>) => {
        const next = nextOperation(values);
        props.onPreviewChange(next);
        props.onCommit(next);
    };
    const commitDraft = () => props.onCommit(draftRef.current);
    return { commit, commitDraft, preview };
}

function AngleSlider(props: {
    readonly angle: number;
    readonly onCommit: () => void;
    readonly onPreview: (angle: number) => void;
}) {
    const shiftRef = useRef(false);
    const position = anglePosition(props.angle);
    const style: RangeStyle = {
        '--range-fill-end': `${Math.max(50, position)}%`,
        '--range-fill-start': `${Math.min(50, position)}%`,
    };
    const previewValue = (value: string) => props.onPreview(snapRotationAngle(Number(value), shiftRef.current));
    return <fieldset className="space-y-2">
        <legend className="sr-only">Rotation angle</legend>
        <div className="flex items-center justify-between text-xs text-content-secondary">
            <label htmlFor="photo-rotation-angle">Angle</label>
            <span className="font-mono tabular-nums text-content">{props.angle}°</span>
        </div>
        <div className="relative h-7">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-1/2 h-3 -translate-y-1/2">
                {ANGLE_MARKERS.map((marker) => <span
                    key={marker}
                    className={`absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 bg-content-secondary ${marker === 0 ? 'h-3' : 'h-2'}`}
                    style={{ left: `${anglePosition(marker)}%` }}
                />)}
            </div>
            <input
                id="photo-rotation-angle"
                aria-valuetext={`${props.angle} degrees`}
                className="photo-rotation-angle absolute inset-0 w-full"
                max="180"
                min="-180"
                step="1"
                style={style}
                type="range"
                value={props.angle}
                onInput={(event) => previewValue(event.currentTarget.value)}
                onPointerDown={(event) => {shiftRef.current = event.shiftKey;}}
                onPointerMove={(event) => {shiftRef.current = event.shiftKey;}}
                onPointerUp={() => props.onCommit()}
                onPointerCancel={() => props.onCommit()}
                onKeyDown={(event) => {shiftRef.current = event.shiftKey;}}
                onKeyUp={(event) => {shiftRef.current = event.shiftKey; props.onCommit();}}
                onBlur={props.onCommit}
            />
        </div>
        <p className="text-xs text-content-secondary">Whole-degree steps. Hold Shift for 5° steps.</p>
    </fieldset>;
}

export function PhotoRotateOptions(props: PhotoRotateOptionsProps) {
    const actions = useRotateActions(props);
    const angle = Number(props.operation.values.angle ?? 0);
    const expandCanvas = props.operation.values.expandCanvas !== false;
    const flipHorizontal = props.operation.values.flipHorizontal === true;
    const flipVertical = props.operation.values.flipVertical === true;
    const fillMode = Number(props.operation.values.fillMode ?? PHOTO_ROTATION_FILL.transparent);
    return <div className="space-y-3">
        <AngleSlider angle={angle} onPreview={(nextAngle) => actions.preview({ angle: nextAngle })} onCommit={actions.commitDraft} />
        <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-content">Quick actions</legend>
            <div className="grid grid-cols-2 gap-2">
                <OptionTile active={false} icon={RotateCcw} label="90° anticlockwise" onClick={() => actions.commit({ angle: normalizeRotationAngle(angle - 90) })} />
                <OptionTile active={false} icon={RotateCw} label="90° clockwise" onClick={() => actions.commit({ angle: normalizeRotationAngle(angle + 90) })} />
                <OptionTile active={flipHorizontal} icon={FlipHorizontal2} label="Flip horizontal" onClick={() => actions.commit({ flipHorizontal: !flipHorizontal })} />
                <OptionTile active={flipVertical} icon={FlipVertical2} label="Flip vertical" onClick={() => actions.commit({ flipVertical: !flipVertical })} />
            </div>
        </fieldset>
        <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-content">Canvas</legend>
            <div className="grid grid-cols-2 gap-2">
                <OptionTile active={!expandCanvas} icon={Minimize2} label="Keep dimensions" onClick={() => actions.commit({ expandCanvas: false })} />
                <OptionTile active={expandCanvas} icon={Maximize2} label="Expand canvas" onClick={() => actions.commit({ expandCanvas: true })} />
            </div>
        </fieldset>
        <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-content">Fill exposed pixels</legend>
            <div className="grid grid-cols-4 gap-2">
                <OptionTile active={fillMode === PHOTO_ROTATION_FILL.transparent} icon={Grid2X2} label="Transparent" onClick={() => actions.commit({ fillMode: PHOTO_ROTATION_FILL.transparent })} />
                <OptionTile active={fillMode === PHOTO_ROTATION_FILL.black} icon={Square} iconClassName="fill-black text-black" label="Black" onClick={() => actions.commit({ fillMode: PHOTO_ROTATION_FILL.black })} />
                <OptionTile active={fillMode === PHOTO_ROTATION_FILL.white} icon={Square} iconClassName="fill-white text-content-secondary" label="White" onClick={() => actions.commit({ fillMode: PHOTO_ROTATION_FILL.white })} />
                <OptionTile active={fillMode === PHOTO_ROTATION_FILL.ai} disabled icon={Sparkles} label="AI fill" title="AI fill will be added later" onClick={() => undefined} />
            </div>
        </fieldset>
    </div>;
}
