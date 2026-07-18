import { Minus, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import type { PhotoEditOperation } from "@contracts/core";
import {
  FOCUS_SHAPE,
  FOCUS_STYLE,
  MAX_FOCUS_POINTS,
  focusPresetValues,
  readFocusPoints,
  readFocusShape,
  readFocusStyle,
  writeFocusPoints,
} from "@shared/photoEditing/focus";
import type {
  FocusPreset,
  FocusShape,
  FocusStyle,
} from "@shared/photoEditing/focus";
import { Button, Checkbox, Select } from "../Primitives";

type PhotoFocusOptionsProps = {
  readonly operation: PhotoEditOperation;
  readonly onCommit: (operation: PhotoEditOperation) => void;
  readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

type SliderDefinition = {
  key: string;
  label: string;
  maximum: number;
  minimum: number;
  step: number;
  format: (value: number) => string;
};

const percent = (value: number) => `${Math.round(value * 100)}%`;
const degrees = (value: number) => `${Math.round(value)}°`;

const BASE_SLIDERS: SliderDefinition[] = [
  { key: "size", label: "Focal size", minimum: 0.01, maximum: 0.8, step: 0.01, format: percent },
  { key: "falloff", label: "Edge falloff", minimum: 0.005, maximum: 0.8, step: 0.005, format: percent },
  { key: "strength", label: "Blur strength", minimum: 0, maximum: 1, step: 0.01, format: percent },
];

const ANGLE_SLIDER: SliderDefinition = {
  key: "angle",
  label: "Angle",
  minimum: -180,
  maximum: 180,
  step: 1,
  format: degrees,
};

const PRESETS: Array<{ label: string; preset: FocusPreset }> = [
  { label: "Portrait", preset: "portrait" },
  { label: "Tilt-shift", preset: "tiltShift" },
  { label: "Group focus", preset: "group" },
  { label: "Focus tunnel", preset: "tunnel" },
  { label: "Orbit", preset: "orbit" },
];

function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number {
  const candidate = operation.values[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
}

function SliderControl(props: {
  readonly definition: SliderDefinition;
  readonly operation: PhotoEditOperation;
  readonly onCommit: () => void;
  readonly onInput: (key: string, value: number) => void;
}) {
  const definition = props.definition;
  const value = numberValue(props.operation, definition.key, definition.minimum);
  const id = `${props.operation.id}-${definition.key}`;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-content-secondary">
        <label htmlFor={id}>{definition.label}</label>
        <output className="font-mono tabular-nums text-content" htmlFor={id}>
          {definition.format(value)}
        </output>
      </div>
      <input
        id={id}
        name={id}
        className="w-full accent-brand-accent"
        max={definition.maximum}
        min={definition.minimum}
        step={definition.step}
        type="range"
        value={value}
        onChange={() => undefined}
        onInput={(event) => props.onInput(definition.key, Number(event.currentTarget.value))}
        onPointerUp={props.onCommit}
        onPointerCancel={props.onCommit}
        onKeyUp={props.onCommit}
        onBlur={props.onCommit}
      />
    </div>
  );
}

function useFocusActions(props: PhotoFocusOptionsProps) {
  const draftRef = useRef(props.operation);
  useEffect(() => {
    draftRef.current = props.operation;
  }, [props.operation]);
  const previewValues = (values: PhotoEditOperation["values"]) => {
    const next = { ...draftRef.current, values };
    draftRef.current = next;
    props.onPreviewChange(next);
    return next;
  };
  const commitValues = (values: PhotoEditOperation["values"]) => {
    const next = previewValues(values);
    props.onCommit(next);
  };
  const previewValue = (key: string, value: number) => {
    previewValues({ ...draftRef.current.values, [key]: value });
  };
  return {
    commitDraft: () => props.onCommit(draftRef.current),
    commitValue: (key: string, value: number | boolean) =>
      commitValues({ ...draftRef.current.values, [key]: value }),
    commitValues,
    previewValue,
    preset: (preset: FocusPreset) => commitValues(focusPresetValues(preset, draftRef.current.values)),
  };
}

function PresetButtons(props: { readonly onSelect: (preset: FocusPreset) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-content">Quick focus</legend>
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((item) => (
          <Button
            key={item.preset}
            type="button"
            variant="secondary"
            className="min-h-10 px-2 text-xs focus-visible:ring-2 focus-visible:ring-brand-accent"
            onClick={() => props.onSelect(item.preset)}
          >
            {item.label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function PointControls(props: {
  readonly operation: PhotoEditOperation;
  readonly onChange: (values: PhotoEditOperation["values"]) => void;
}) {
  const points = readFocusPoints(props.operation.values);
  const selected = Math.min(points.length - 1, Math.round(numberValue(props.operation, "selectedPoint", 0)));
  const select = (index: number) => props.onChange({ ...props.operation.values, selectedPoint: index });
  const add = () => {
    const anchor = points[selected];
    const point = { x: Math.min(0.9, anchor.x + 0.14), y: Math.min(0.9, anchor.y + 0.08) };
    props.onChange(writeFocusPoints(props.operation.values, [...points, point], points.length));
  };
  const remove = () => {
    const next = points.filter((_, index) => index !== selected);
    props.onChange(writeFocusPoints(props.operation.values, next, Math.max(0, selected - 1)));
  };
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-content">Focus points</legend>
      <div className="flex flex-wrap gap-2">
        {points.map((_, index) => (
          <Button
            key={`focus-point-${index + 1}`}
            type="button"
            variant={selected === index ? "primary" : "secondary"}
            className="size-9 p-0 text-xs focus-visible:ring-2 focus-visible:ring-brand-accent"
            aria-pressed={selected === index}
            onClick={() => select(index)}
          >
            {index + 1}
          </Button>
        ))}
        <Button
          type="button"
          variant="secondary"
          className="size-9 p-0 focus-visible:ring-2 focus-visible:ring-brand-accent"
          aria-label="Add focus point"
          disabled={points.length >= MAX_FOCUS_POINTS}
          onClick={add}
        >
          <Plus aria-hidden="true" size={16} />
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="size-9 p-0 focus-visible:ring-2 focus-visible:ring-brand-accent"
          aria-label="Remove selected focus point"
          disabled={points.length <= 1}
          onClick={remove}
        >
          <Minus aria-hidden="true" size={16} />
        </Button>
      </div>
      <p className="text-xs text-content-secondary">
        Select a number, then drag it on the photo. Shift-click adds another point.
      </p>
    </fieldset>
  );
}

function FocusSelectors(props: {
  readonly operation: PhotoEditOperation;
  readonly onChange: (key: string, value: number) => void;
}) {
  const shapeId = `${props.operation.id}-focus-shape`;
  const styleId = `${props.operation.id}-focus-style`;
  return (
    <div className="grid grid-cols-2 gap-2">
      <label htmlFor={shapeId} className="flex flex-col gap-1 text-xs text-content-secondary">
        Shape
        <Select
          id={shapeId}
          name={shapeId}
          value={readFocusShape(props.operation.values)}
          onChange={(event) => props.onChange("shape", Number(event.target.value) as FocusShape)}
        >
          <option value={FOCUS_SHAPE.circular}>Circular</option>
          <option value={FOCUS_SHAPE.straight}>Straight</option>
        </Select>
      </label>
      <label htmlFor={styleId} className="flex flex-col gap-1 text-xs text-content-secondary">
        Blur style
        <Select
          id={styleId}
          name={styleId}
          value={readFocusStyle(props.operation.values)}
          onChange={(event) => props.onChange("style", Number(event.target.value) as FocusStyle)}
        >
          <option value={FOCUS_STYLE.softBlur}>Natural blur</option>
          <option value={FOCUS_STYLE.radialZoom}>Focus tunnel</option>
          <option value={FOCUS_STYLE.motionStreak}>Directional rush</option>
          <option value={FOCUS_STYLE.orbitalBlur}>Orbit focus</option>
        </Select>
      </label>
    </div>
  );
}

export function PhotoFocusOptions(props: PhotoFocusOptionsProps) {
  const actions = useFocusActions(props);
  const shape = readFocusShape(props.operation.values);
  const style = readFocusStyle(props.operation.values);
  const sliders = shape === FOCUS_SHAPE.straight || style === FOCUS_STYLE.motionStreak
    ? [...BASE_SLIDERS, ANGLE_SLIDER]
    : BASE_SLIDERS;
  return (
    <div className="space-y-4">
      <p className="text-sm text-content-secondary">
        Keep one or more areas crisp while shaping the blur directly on the photo.
      </p>
      <PresetButtons onSelect={actions.preset} />
      <FocusSelectors operation={props.operation} onChange={actions.commitValue} />
      <PointControls operation={props.operation} onChange={actions.commitValues} />
      <div className="flex items-center gap-2 text-sm text-content">
        <Checkbox
          aria-label="Invert focus so the focal area becomes blurry"
          checked={Boolean(props.operation.values.inverted)}
          onChange={() => actions.commitValue("inverted", !props.operation.values.inverted)}
        />
        Invert focus
      </div>
      {sliders.map((definition) => (
        <SliderControl
          key={definition.key}
          definition={definition}
          operation={props.operation}
          onCommit={actions.commitDraft}
          onInput={actions.previewValue}
        />
      ))}
    </div>
  );
}
