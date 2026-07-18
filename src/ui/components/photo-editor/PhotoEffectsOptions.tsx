import { useEffect, useRef } from "react";
import type { PhotoEditOperation } from "@contracts/core";
import {
  PHOTO_EFFECT_KIND,
  readPhotoEffectKind,
  valuesForPhotoEffect,
} from "@shared/photoEditing/effects";
import type { PhotoEffectKind } from "@shared/photoEditing/effects";
import { Select } from "../Primitives";

type PhotoEffectsOptionsProps = {
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
const integer = (value: number) => String(Math.round(value));
const degrees = (value: number) => `${Math.round(value)}°`;

const SHARED_SLIDERS: SliderDefinition[] = [
  { key: "size", label: "Size", minimum: 0.05, maximum: 1.5, step: 0.01, format: percent },
  { key: "intensity", label: "Strength", minimum: 0, maximum: 1, step: 0.01, format: percent },
];

const RIPPLE_SLIDERS: SliderDefinition[] = [
  ...SHARED_SLIDERS,
  { key: "wavelength", label: "Wave size", minimum: 0.015, maximum: 0.3, step: 0.005, format: percent },
  { key: "softness", label: "Edge falloff", minimum: 0, maximum: 1, step: 0.01, format: percent },
];

const SUNBURST_SLIDERS: SliderDefinition[] = [
  ...SHARED_SLIDERS,
  { key: "rayCount", label: "Rays", minimum: 4, maximum: 64, step: 1, format: integer },
  { key: "rotation", label: "Rotation", minimum: -180, maximum: 180, step: 1, format: degrees },
  { key: "softness", label: "Ray softness", minimum: 0, maximum: 1, step: 0.01, format: percent },
  { key: "hue", label: "Colour tone", minimum: 0, maximum: 360, step: 1, format: degrees },
];

const OVERLAY_SLIDERS: SliderDefinition[] = [
  ...SHARED_SLIDERS,
  { key: "softness", label: "Softness", minimum: 0.05, maximum: 1, step: 0.01, format: percent },
  { key: "hue", label: "Colour tone", minimum: 0, maximum: 360, step: 1, format: degrees },
];

const EFFECT_OPTIONS: Array<{ label: string; value: PhotoEffectKind }> = [
  { label: "Ripple", value: PHOTO_EFFECT_KIND.ripple },
  { label: "Sunburst", value: PHOTO_EFFECT_KIND.sunburst },
  { label: "Lens flare", value: PHOTO_EFFECT_KIND.lensFlare },
  { label: "Light leak", value: PHOTO_EFFECT_KIND.lightLeak },
];

function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number {
  const candidate = operation.values[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
}

function effectSliders(kind: PhotoEffectKind): SliderDefinition[] {
  if (kind === PHOTO_EFFECT_KIND.ripple) {
    return RIPPLE_SLIDERS;
  }
  if (kind === PHOTO_EFFECT_KIND.sunburst) {
    return SUNBURST_SLIDERS;
  }
  return OVERLAY_SLIDERS;
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

function SunburstType(props: {
  readonly operation: PhotoEditOperation;
  readonly onChange: (value: number) => void;
}) {
  const id = `${props.operation.id}-burst-style`;
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-xs text-content-secondary">
      Burst style
      <Select
        id={id}
        name={id}
        value={numberValue(props.operation, "variant", 0)}
        onChange={(event) => props.onChange(Number(event.target.value))}
      >
        <option value={0}>Classic rays</option>
        <option value={1}>Soft glow rays</option>
        <option value={2}>Sharp star</option>
      </Select>
    </label>
  );
}

function useEffectActions(props: PhotoEffectsOptionsProps) {
  const draftRef = useRef(props.operation);
  useEffect(() => {
    draftRef.current = props.operation;
  }, [props.operation]);
  const previewValue = (key: string, value: number) => {
    const next = {
      ...draftRef.current,
      values: { ...draftRef.current.values, [key]: value },
    };
    draftRef.current = next;
    props.onPreviewChange(next);
  };
  const commitValue = (key: string, value: number) => {
    previewValue(key, value);
    props.onCommit(draftRef.current);
  };
  const selectEffect = (kind: PhotoEffectKind) => {
    const next = {
      ...draftRef.current,
      values: valuesForPhotoEffect(kind, draftRef.current.values),
    };
    draftRef.current = next;
    props.onPreviewChange(next);
    props.onCommit(next);
  };
  return {
    commitDraft: () => props.onCommit(draftRef.current),
    commitValue,
    previewValue,
    selectEffect,
  };
}

export function PhotoEffectsOptions(props: PhotoEffectsOptionsProps) {
  const kind = readPhotoEffectKind(props.operation.values);
  const actions = useEffectActions(props);
  const effectId = `${props.operation.id}-effect`;
  return (
    <div className="space-y-4">
      <p className="text-sm text-content-secondary">
        Choose an effect, then click the photo to place its centre.
      </p>
      <label htmlFor={effectId} className="flex flex-col gap-1 text-xs text-content-secondary">
        Effect
        <Select
          id={effectId}
          name={effectId}
          value={kind}
          onChange={(event) => actions.selectEffect(Number(event.target.value) as PhotoEffectKind)}
        >
          {EFFECT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </label>
      {kind === PHOTO_EFFECT_KIND.sunburst && (
        <SunburstType
          operation={props.operation}
          onChange={(value) => actions.commitValue("variant", value)}
        />
      )}
      {effectSliders(kind).map((definition) => (
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
