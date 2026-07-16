import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { PhotoEditOperation } from '@contracts/core';
import { RotateCcw } from 'lucide-react';
import { IconButton } from '../Primitives';
import {
    formatTunePercent,
    hueColorDegrees,
    recipeValueFromTunePercent,
    tunePercentFromRecipeValue,
} from './tuneImageControls';
import type { TunePercentControl } from './tuneImageControls';
import './PhotoTuneOptions.css';

type PhotoTuneOptionsProps = {
    readonly operation: PhotoEditOperation;
    readonly onCommit: (operation: PhotoEditOperation) => void;
    readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

type TuneRangeStyle = CSSProperties & {
    '--tune-fill-end'?: string;
    '--tune-fill-start'?: string;
    '--tune-hue'?: string;
};

const PERCENT_CONTROLS: ReadonlyArray<{ key: TunePercentControl; label: string }> = [
    { key: 'brightness', label: 'Brightness' },
    { key: 'contrast', label: 'Contrast' },
    { key: 'saturation', label: 'Saturation' },
];

const TUNE_DEFAULTS = { brightness: 1, contrast: 0, saturation: 1, hue: 0 } as const;

function percentPosition(value: number): number {
    return (value + 100) / 2;
}

function percentRangeStyle(value: number): TuneRangeStyle {
    const position = percentPosition(value);
    return {
        '--tune-fill-end': `${Math.max(50, position)}%`,
        '--tune-fill-start': `${Math.min(50, position)}%`,
    };
}

function useTuneActions(props: PhotoTuneOptionsProps) {
    const draftRef = useRef(props.operation);
    useEffect(() => {draftRef.current = props.operation;}, [props.operation]);
    const previewValue = (key: string, value: number) => {
        const next = { ...draftRef.current, values: { ...draftRef.current.values, [key]: value } };
        draftRef.current = next;
        props.onPreviewChange(next);
    };
    const commitDraft = () => props.onCommit(draftRef.current);
    const resetValue = (key: keyof typeof TUNE_DEFAULTS) => {
        const next = {
            ...draftRef.current,
            values: { ...draftRef.current.values, [key]: TUNE_DEFAULTS[key] },
        };
        draftRef.current = next;
        props.onPreviewChange(next);
        props.onCommit(next);
    };
    return { commitDraft, previewValue, resetValue };
}

function ResetTuneButton(props: { readonly disabled: boolean; readonly label: string; readonly onClick: () => void }) {
    return <IconButton
        aria-label={`Reset ${props.label}`}
        className="p-1"
        disabled={props.disabled}
        title={`Reset ${props.label}`}
        type="button"
        onClick={props.onClick}
    >
        <RotateCcw aria-hidden="true" size={13} />
    </IconButton>;
}

function PercentSlider(props: {
    readonly control: { key: TunePercentControl; label: string };
    readonly id: string;
    readonly operation: PhotoEditOperation;
    readonly onCommit: () => void;
    readonly onPreview: (key: string, value: number) => void;
    readonly onReset: () => void;
}) {
    const percent = tunePercentFromRecipeValue(props.control.key, props.operation.values[props.control.key]);
    return <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-content-secondary">
            <label htmlFor={props.id}>{props.control.label}</label>
            <span className="flex items-center gap-1">
                <output className="font-mono tabular-nums text-content" htmlFor={props.id}>{formatTunePercent(percent)}</output>
                <ResetTuneButton disabled={percent === 0} label={props.control.label} onClick={props.onReset} />
            </span>
        </div>
        <input
            id={props.id}
            aria-valuetext={formatTunePercent(percent)}
            className="photo-tune-range photo-tune-percent w-full"
            max="100"
            min="-100"
            name={props.control.key}
            step="1"
            style={percentRangeStyle(percent)}
            type="range"
            value={percent}
            onChange={() => undefined}
            onInput={(event) => props.onPreview(props.control.key, recipeValueFromTunePercent(props.control.key, Number(event.currentTarget.value)))}
            onPointerUp={props.onCommit}
            onPointerCancel={props.onCommit}
            onKeyUp={props.onCommit}
            onBlur={props.onCommit}
        />
    </div>;
}

function HueSlider(props: {
    readonly hue: number;
    readonly id: string;
    readonly onCommit: () => void;
    readonly onPreview: (key: string, value: number) => void;
    readonly onReset: () => void;
}) {
    const hue = Number.isFinite(props.hue) ? Math.min(180, Math.max(-180, Math.round(props.hue))) : 0;
    const style: TuneRangeStyle = { '--tune-hue': `hsl(${hueColorDegrees(hue)}deg 85% 55%)` };
    return <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-content-secondary">
            <label htmlFor={props.id}>Hue</label>
            <span className="flex items-center gap-1">
                <output className="font-mono tabular-nums text-content" htmlFor={props.id}>{hue}°</output>
                <ResetTuneButton disabled={hue === 0} label="Hue" onClick={props.onReset} />
            </span>
        </div>
        <input
            id={props.id}
            aria-valuetext={`${hue} degrees`}
            className="photo-tune-range photo-tune-hue w-full"
            max="180"
            min="-180"
            name="hue"
            step="1"
            style={style}
            type="range"
            value={hue}
            onChange={() => undefined}
            onInput={(event) => props.onPreview('hue', Math.round(Number(event.currentTarget.value)))}
            onPointerUp={props.onCommit}
            onPointerCancel={props.onCommit}
            onKeyUp={props.onCommit}
            onBlur={props.onCommit}
        />
    </div>;
}

export function PhotoTuneOptions(props: PhotoTuneOptionsProps) {
    const actions = useTuneActions(props);
    return <div className="space-y-3">
        {PERCENT_CONTROLS.map((control) => <PercentSlider
            key={control.key}
            control={control}
            id={`${props.operation.id}-${control.key}`}
            operation={props.operation}
            onCommit={actions.commitDraft}
            onPreview={actions.previewValue}
            onReset={() => actions.resetValue(control.key)}
        />)}
        <HueSlider
            hue={Number(props.operation.values.hue ?? 0)}
            id={`${props.operation.id}-hue`}
            onCommit={actions.commitDraft}
            onPreview={actions.previewValue}
            onReset={() => actions.resetValue('hue')}
        />
    </div>;
}
