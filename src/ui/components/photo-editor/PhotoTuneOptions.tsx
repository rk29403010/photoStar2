import { RotateCcw, WandSparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { PhotoEditOperation } from "@contracts/core";
import { Button, IconButton } from "../Primitives";
import { InlineFeedback } from "../feedback/InlineFeedback";
import {
  formatTunePercent,
  hueColorDegrees,
  recipeValueFromTunePercent,
  tunePercentFromRecipeValue,
} from "./tuneImageControls";
import type { TunePercentControl } from "./tuneImageControls";
import type { PhotoAutomaticAnalysisState } from "./usePhotoAutomaticAnalysis";
import "./PhotoTuneOptions.css";

type PhotoTuneOptionsProps = {
  readonly automatic: PhotoAutomaticAnalysisState;
  readonly operation: PhotoEditOperation;
  readonly onCommit: (operation: PhotoEditOperation) => void;
  readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

type TuneRangeStyle = CSSProperties & {
  "--tune-fill-end"?: string;
  "--tune-fill-start"?: string;
  "--tune-hue"?: string;
};

type DirectControl = {
  format: (value: number) => string;
  key: "blackPoint" | "highlights" | "shadows" | "temperature" | "tint" | "whitePoint";
  label: string;
  maximum: number;
  minimum: number;
  step: number;
};

const PERCENT_CONTROLS: ReadonlyArray<{ key: TunePercentControl; label: string }> = [
  { key: "brightness", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Saturation" },
];

const directPercent = (value: number) => formatTunePercent(value * 100);
const integer = (value: number) => String(Math.round(value));
const DIRECT_CONTROLS: DirectControl[] = [
  { key: "shadows", label: "Shadows", minimum: -1, maximum: 1, step: 0.01, format: directPercent },
  { key: "highlights", label: "Highlights", minimum: -1, maximum: 1, step: 0.01, format: directPercent },
  { key: "blackPoint", label: "Black point", minimum: 0, maximum: 64, step: 1, format: integer },
  { key: "whitePoint", label: "White point", minimum: 191, maximum: 255, step: 1, format: integer },
  { key: "temperature", label: "Temperature", minimum: -1, maximum: 1, step: 0.01, format: directPercent },
  { key: "tint", label: "Tint", minimum: -1, maximum: 1, step: 0.01, format: directPercent },
];

const TUNE_DEFAULTS = {
  blackPoint: 0,
  brightness: 1,
  contrast: 0,
  highlights: 0,
  hue: 0,
  saturation: 1,
  shadows: 0,
  temperature: 0,
  tint: 0,
  whitePoint: 255,
} as const;

const LIGHT_KEYS = ["brightness", "contrast", "shadows", "highlights", "blackPoint", "whitePoint"] as const;
const COLOUR_KEYS = ["saturation", "temperature", "tint"] as const;

function percentPosition(value: number): number {
  return (value + 100) / 2;
}

function percentRangeStyle(value: number): TuneRangeStyle {
  const position = percentPosition(value);
  return {
    "--tune-fill-end": `${Math.max(50, position)}%`,
    "--tune-fill-start": `${Math.min(50, position)}%`,
  };
}

function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number {
  const value = operation.values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function useTuneActions(props: PhotoTuneOptionsProps) {
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
  return {
    autoKeys: (keys: readonly (keyof typeof TUNE_DEFAULTS)[]) => {
      const recommendation = props.automatic.analysis?.tune;
      if (!recommendation) {
        return;
      }
      const values = { ...draftRef.current.values };
      keys.forEach((key) => { values[key] = recommendation[key]; });
      commitValues(values);
    },
    commitDraft: () => props.onCommit(draftRef.current),
    previewValue: (key: string, value: number) => {
      previewValues({ ...draftRef.current.values, [key]: value });
    },
    resetValue: (key: keyof typeof TUNE_DEFAULTS) => {
      commitValues({ ...draftRef.current.values, [key]: TUNE_DEFAULTS[key] });
    },
  };
}

function ResetTuneButton(props: {
  readonly disabled: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <IconButton
      aria-label={`Reset ${props.label}`}
      className="p-1"
      disabled={props.disabled}
      title={`Reset ${props.label}`}
      type="button"
      onClick={props.onClick}
    >
      <RotateCcw aria-hidden="true" size={13} />
    </IconButton>
  );
}

function ValueActions(props: {
  readonly autoDisabled: boolean;
  readonly label: string;
  readonly resetDisabled: boolean;
  readonly onAuto: () => void;
  readonly onReset: () => void;
}) {
  return (
    <span className="flex items-center gap-1">
      <IconButton
        aria-label={`Automatically set ${props.label}`}
        className="p-1"
        disabled={props.autoDisabled}
        title={`Auto ${props.label}`}
        type="button"
        onClick={props.onAuto}
      >
        <WandSparkles aria-hidden="true" size={13} />
      </IconButton>
      <ResetTuneButton
        disabled={props.resetDisabled}
        label={props.label}
        onClick={props.onReset}
      />
    </span>
  );
}

function SliderHeader(props: {
  readonly autoDisabled: boolean;
  readonly formatted: string;
  readonly id: string;
  readonly label: string;
  readonly resetDisabled: boolean;
  readonly onAuto: () => void;
  readonly onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-xs text-content-secondary">
      <label htmlFor={props.id}>{props.label}</label>
      <span className="flex items-center gap-1">
        <output className="font-mono tabular-nums text-content" htmlFor={props.id}>{props.formatted}</output>
        <ValueActions {...props} />
      </span>
    </div>
  );
}

function PercentSlider(props: {
  readonly autoDisabled: boolean;
  readonly control: { key: TunePercentControl; label: string };
  readonly id: string;
  readonly operation: PhotoEditOperation;
  readonly onAuto: () => void;
  readonly onCommit: () => void;
  readonly onPreview: (key: string, value: number) => void;
  readonly onReset: () => void;
}) {
  const percent = tunePercentFromRecipeValue(props.control.key, props.operation.values[props.control.key]);
  return (
    <div className="space-y-1">
      <SliderHeader
        autoDisabled={props.autoDisabled}
        formatted={formatTunePercent(percent)}
        id={props.id}
        label={props.control.label}
        resetDisabled={percent === 0}
        onAuto={props.onAuto}
        onReset={props.onReset}
      />
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
        onInput={(event) => props.onPreview(
          props.control.key,
          recipeValueFromTunePercent(props.control.key, Number(event.currentTarget.value)),
        )}
        onPointerUp={props.onCommit}
        onPointerCancel={props.onCommit}
        onKeyUp={props.onCommit}
        onBlur={props.onCommit}
      />
    </div>
  );
}

function DirectSlider(props: {
  readonly autoDisabled: boolean;
  readonly control: DirectControl;
  readonly id: string;
  readonly operation: PhotoEditOperation;
  readonly onAuto: () => void;
  readonly onCommit: () => void;
  readonly onPreview: (key: string, value: number) => void;
  readonly onReset: () => void;
}) {
  const fallback = TUNE_DEFAULTS[props.control.key];
  const value = numberValue(props.operation, props.control.key, fallback);
  return (
    <div className="space-y-1">
      <SliderHeader
        autoDisabled={props.autoDisabled}
        formatted={props.control.format(value)}
        id={props.id}
        label={props.control.label}
        resetDisabled={value === fallback}
        onAuto={props.onAuto}
        onReset={props.onReset}
      />
      <input
        id={props.id}
        aria-valuetext={props.control.format(value)}
        className="photo-tune-range photo-tune-percent w-full"
        max={props.control.maximum}
        min={props.control.minimum}
        name={props.control.key}
        step={props.control.step}
        type="range"
        value={value}
        onChange={() => undefined}
        onInput={(event) => props.onPreview(props.control.key, Number(event.currentTarget.value))}
        onPointerUp={props.onCommit}
        onPointerCancel={props.onCommit}
        onKeyUp={props.onCommit}
        onBlur={props.onCommit}
      />
    </div>
  );
}

function HueSlider(props: {
  readonly hue: number;
  readonly id: string;
  readonly onCommit: () => void;
  readonly onPreview: (key: string, value: number) => void;
  readonly onReset: () => void;
}) {
  const hue = Number.isFinite(props.hue) ? Math.min(180, Math.max(-180, Math.round(props.hue))) : 0;
  const style: TuneRangeStyle = { "--tune-hue": `hsl(${hueColorDegrees(hue)}deg 85% 55%)` };
  return (
    <div className="space-y-1">
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
        onInput={(event) => props.onPreview("hue", Math.round(Number(event.currentTarget.value)))}
        onPointerUp={props.onCommit}
        onPointerCancel={props.onCommit}
        onKeyUp={props.onCommit}
        onBlur={props.onCommit}
      />
    </div>
  );
}

function AutomaticTuneActions(props: {
  readonly state: PhotoAutomaticAnalysisState;
  readonly onAutoColour: () => void;
  readonly onAutoLight: () => void;
  readonly onAutoTool: () => void;
}) {
  if (props.state.status === "loading" || props.state.status === "idle") {
    return <InlineFeedback mode="inline" state="pending" message="Analysing light, colour, and subjects…" />;
  }
  if (props.state.status === "unavailable") {
    return <InlineFeedback mode="inline" state="error" message={props.state.error ?? "Automatic tuning is unavailable."} />;
  }
  return (
    <div className="space-y-2">
      <Button className="w-full focus-visible:ring-2 focus-visible:ring-brand-accent" onClick={props.onAutoTool}>
        <WandSparkles aria-hidden="true" size={16} />
        Auto tune
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={props.onAutoLight}>Auto light</Button>
        <Button variant="secondary" onClick={props.onAutoColour}>Auto colour</Button>
      </div>
    </div>
  );
}

export function PhotoTuneOptions(props: PhotoTuneOptionsProps) {
  const actions = useTuneActions(props);
  const autoDisabled = props.automatic.status !== "ready";
  return (
    <div className="space-y-4">
      <AutomaticTuneActions
        state={props.automatic}
        onAutoColour={() => actions.autoKeys(COLOUR_KEYS)}
        onAutoLight={() => actions.autoKeys(LIGHT_KEYS)}
        onAutoTool={() => actions.autoKeys([...LIGHT_KEYS, ...COLOUR_KEYS])}
      />
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-content">Light & levels</legend>
        {PERCENT_CONTROLS.slice(0, 2).map((control) => (
          <PercentSlider
            key={control.key}
            autoDisabled={autoDisabled}
            control={control}
            id={`${props.operation.id}-${control.key}`}
            operation={props.operation}
            onAuto={() => actions.autoKeys([control.key])}
            onCommit={actions.commitDraft}
            onPreview={actions.previewValue}
            onReset={() => actions.resetValue(control.key)}
          />
        ))}
        {DIRECT_CONTROLS.slice(0, 4).map((control) => (
          <DirectSlider
            key={control.key}
            autoDisabled={autoDisabled}
            control={control}
            id={`${props.operation.id}-${control.key}`}
            operation={props.operation}
            onAuto={() => actions.autoKeys([control.key])}
            onCommit={actions.commitDraft}
            onPreview={actions.previewValue}
            onReset={() => actions.resetValue(control.key)}
          />
        ))}
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-content">Colour balance</legend>
        <PercentSlider
          autoDisabled={autoDisabled}
          control={PERCENT_CONTROLS[2]}
          id={`${props.operation.id}-saturation`}
          operation={props.operation}
          onAuto={() => actions.autoKeys(["saturation"])}
          onCommit={actions.commitDraft}
          onPreview={actions.previewValue}
          onReset={() => actions.resetValue("saturation")}
        />
        {DIRECT_CONTROLS.slice(4).map((control) => (
          <DirectSlider
            key={control.key}
            autoDisabled={autoDisabled}
            control={control}
            id={`${props.operation.id}-${control.key}`}
            operation={props.operation}
            onAuto={() => actions.autoKeys([control.key])}
            onCommit={actions.commitDraft}
            onPreview={actions.previewValue}
            onReset={() => actions.resetValue(control.key)}
          />
        ))}
        <HueSlider
          hue={numberValue(props.operation, "hue", 0)}
          id={`${props.operation.id}-hue`}
          onCommit={actions.commitDraft}
          onPreview={actions.previewValue}
          onReset={() => actions.resetValue("hue")}
        />
      </fieldset>
    </div>
  );
}
