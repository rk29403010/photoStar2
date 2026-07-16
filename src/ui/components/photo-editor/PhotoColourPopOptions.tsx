import { Check, Eraser } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PhotoEditOperation } from '@contracts/core';
import {
    COLOUR_POP_RANGE_KEY,
    COLOUR_POP_SOFTNESS_KEY,
    DEFAULT_COLOUR_POP_RANGE,
    DEFAULT_COLOUR_POP_SOFTNESS,
    colourDistance,
    quantizeColourPalette,
    readColourPopColours,
    rgbCss,
    writeColourPopColours,
} from '@shared/photoEditing/colourPop';
import type { RgbColour } from '@shared/photoEditing/colourPop';
import { Button } from '../Primitives';
import { loadColourPopImage } from './colourPopImage';

type PhotoColourPopOptionsProps = {
    readonly operation: PhotoEditOperation;
    readonly sourceUrl: string | null;
    readonly onCommit: (operation: PhotoEditOperation) => void;
    readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

function useImagePalette(sourceUrl: string | null): RgbColour[] {
    const [palette, setPalette] = useState<RgbColour[]>([]);
    useEffect(() => {
        let active = true;
        setPalette([]);
        if (sourceUrl) {
            void loadColourPopImage(sourceUrl, 180)
                .then((image) => {if (active) {setPalette(quantizeColourPalette(image.data, 12));}})
                .catch(() => {if (active) {setPalette([]);}});
        }
        return () => {active = false;};
    }, [sourceUrl]);
    return palette;
}

function swatchStyle(colour: RgbColour): CSSProperties {
    return { backgroundColor: rgbCss(colour) };
}

function ColourSwatch(props: {
    readonly colour: RgbColour;
    readonly selected: boolean;
    readonly onClick: () => void;
}) {
    const label = `${props.selected ? 'Remove' : 'Keep'} colour ${rgbCss(props.colour)}`;
    const border = props.selected ? 'border-brand-accent ring-2 ring-brand-accent' : 'border-content/20 hover:ring-2';
    return <button
        type="button"
        aria-label={label}
        aria-pressed={props.selected}
        className={`relative size-8 rounded-md border focus-visible:ring-2 focus-visible:ring-brand-accent ${border}`}
        style={swatchStyle(props.colour)}
        title={label}
        onClick={props.onClick}
    >
        {props.selected && <Check aria-hidden="true" className="absolute inset-1 mix-blend-difference text-white" size={22} />}
    </button>;
}

function selectedColour(colour: RgbColour, selected: RgbColour[]): boolean {
    return selected.some((candidate) => colourDistance(candidate, colour) < 4);
}

function SliderControl(props: {
    readonly id: string;
    readonly label: string;
    readonly maximum: number;
    readonly minimum: number;
    readonly value: number;
    readonly valueText: string;
    readonly onCommit: () => void;
    readonly onInput: (value: number) => void;
}) {
    return <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-content-secondary">
            <label htmlFor={props.id}>{props.label}</label>
            <output className="font-mono tabular-nums text-content" htmlFor={props.id}>{props.valueText}</output>
        </div>
        <input
            id={props.id}
            name={props.id}
            className="w-full accent-brand-accent"
            max={props.maximum}
            min={props.minimum}
            step="1"
            type="range"
            value={props.value}
            onChange={() => undefined}
            onInput={(event) => props.onInput(Number(event.currentTarget.value))}
            onPointerUp={props.onCommit}
            onPointerCancel={props.onCommit}
            onKeyUp={props.onCommit}
            onBlur={props.onCommit}
        />
    </div>;
}

function useColourPopActions(props: PhotoColourPopOptionsProps) {
    const draftRef = useRef(props.operation);
    useEffect(() => {draftRef.current = props.operation;}, [props.operation]);
    const previewValue = (key: string, value: number) => {
        const next = { ...draftRef.current, values: { ...draftRef.current.values, [key]: value } };
        draftRef.current = next;
        props.onPreviewChange(next);
    };
    const commitDraft = () => props.onCommit(draftRef.current);
    const commitColours = (colours: RgbColour[]) => {
        const next = { ...draftRef.current, values: writeColourPopColours(draftRef.current.values, colours) };
        draftRef.current = next;
        props.onPreviewChange(next);
        props.onCommit(next);
    };
    return { commitColours, commitDraft, previewValue };
}

function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number {
    const value = operation.values[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function PhotoColourPopOptions(props: PhotoColourPopOptionsProps) {
    const palette = useImagePalette(props.sourceUrl);
    const selected = readColourPopColours(props.operation.values);
    const actions = useColourPopActions(props);
    const toggle = (colour: RgbColour) => actions.commitColours(selectedColour(colour, selected)
        ? selected.filter((candidate) => colourDistance(candidate, colour) >= 4)
        : [...selected, colour]);
    const range = Math.round(numberValue(props.operation, COLOUR_POP_RANGE_KEY, DEFAULT_COLOUR_POP_RANGE));
    const softness = Math.round(numberValue(props.operation, COLOUR_POP_SOFTNESS_KEY, DEFAULT_COLOUR_POP_SOFTNESS) * 100);
    return <div className="space-y-4">
        <p className="text-sm text-content-secondary">Click a colour in the photo or choose it from the image palette. Everything else becomes black & white.</p>
        <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-content">Colours to keep</legend>
            {selected.length > 0
                ? <div className="flex flex-wrap gap-2">{selected.map((colour) => <ColourSwatch key={rgbCss(colour)} colour={colour} selected onClick={() => toggle(colour)} />)}</div>
                : <p className="text-xs text-content-secondary">No colours selected — the whole image is black & white.</p>}
            {selected.length > 0 && <Button className="px-2 py-1 text-xs" variant="secondary" onClick={() => actions.commitColours([])}><Eraser aria-hidden="true" size={14} />Clear colours</Button>}
        </fieldset>
        <fieldset className="space-y-2" aria-busy={Boolean(props.sourceUrl) && palette.length === 0} aria-live="polite">
            <legend className="text-xs font-semibold text-content">Image palette</legend>
            <div className="flex flex-wrap gap-2">{palette.map((colour) => <ColourSwatch key={rgbCss(colour)} colour={colour} selected={selectedColour(colour, selected)} onClick={() => toggle(colour)} />)}</div>
        </fieldset>
        <SliderControl id={`${props.operation.id}-range`} label="Colour range" minimum={5} maximum={80} value={range} valueText={`${range}%`} onInput={(value) => actions.previewValue(COLOUR_POP_RANGE_KEY, value)} onCommit={actions.commitDraft} />
        <SliderControl id={`${props.operation.id}-softness`} label="Edge transition" minimum={0} maximum={100} value={softness} valueText={`${softness}%`} onInput={(value) => actions.previewValue(COLOUR_POP_SOFTNESS_KEY, value / 100)} onCommit={actions.commitDraft} />
    </div>;
}
