import { useEffect, useMemo, useRef } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { PhotoEditOperation } from "@contracts/core";
import { applyPhotoEffectPixels } from "@shared/photoEditing/effects";
import type { ColourPopImage } from "./colourPopImage";
import {
  fittedPhotoEditorSize,
  usePhotoEditorContainerSize,
  usePhotoEditorSourceImage,
} from "./photoEditorCanvasImage";
import type { CanvasSize } from "./photoEditorCanvasImage";

function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number {
  const candidate = operation.values[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
}

function pickedPoint(event: ReactMouseEvent<HTMLButtonElement>): { x: number; y: number } {
  if (event.detail === 0) {
    return { x: 0.5, y: 0.5 };
  }
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function markerStyle(operation: PhotoEditOperation, stage: CanvasSize): CSSProperties {
  const radius = numberValue(operation, "size", 0.45) * Math.min(stage.width, stage.height);
  return {
    height: radius * 2,
    left: `${numberValue(operation, "centerX", 0.5) * 100}%`,
    top: `${numberValue(operation, "centerY", 0.5) * 100}%`,
    width: radius * 2,
  };
}

function EffectCanvas(props: {
  readonly operation: PhotoEditOperation;
  readonly showWithoutChange: boolean;
  readonly source: ColourPopImage;
  readonly stage: CanvasSize;
  readonly onChange: (operation: PhotoEditOperation) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.width = props.source.width;
    canvas.height = props.source.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const output = props.showWithoutChange
      ? props.source.data
      : applyPhotoEffectPixels(
          props.source.data,
          props.source.width,
          props.source.height,
          props.operation.values,
        );
    const frame = context.createImageData(props.source.width, props.source.height);
    frame.data.set(output);
    context.putImageData(frame, 0, 0);
  }, [props.operation.values, props.showWithoutChange, props.source]);
  const placeCentre = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const point = pickedPoint(event);
    props.onChange({
      ...props.operation,
      values: {
        ...props.operation.values,
        centerX: point.x,
        centerY: point.y,
      },
    });
  };
  return (
    <button
      type="button"
      aria-label="Place effect centre on the photo; keyboard activation places it in the centre"
      className="relative cursor-crosshair touch-manipulation overflow-hidden bg-transparent p-0 shadow-xl hover:ring-2 hover:ring-brand-accent/70 focus-visible:ring-2 focus-visible:ring-brand-accent"
      disabled={props.showWithoutChange}
      style={{ height: props.stage.height, width: props.stage.width }}
      onClick={placeCentre}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {!props.showWithoutChange && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/90 shadow-sm"
          style={markerStyle(props.operation, props.stage)}
        >
          <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-accent shadow-sm" />
        </span>
      )}
    </button>
  );
}

function PreviewFallback(props: { readonly previewUrl: string | null }) {
  return props.previewUrl ? (
    <img
      className="max-h-full max-w-full object-contain"
      src={props.previewUrl}
      alt="Edit preview"
    />
  ) : null;
}

export function PhotoEffectsOverlay(props: {
  readonly operation: PhotoEditOperation;
  readonly previewUrl: string | null;
  readonly showWithoutChange: boolean;
  readonly sourceUrl: string | null;
  readonly onChange: (operation: PhotoEditOperation) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const source = usePhotoEditorSourceImage(props.sourceUrl);
  const container = usePhotoEditorContainerSize(rootRef);
  const stage = useMemo(() => fittedPhotoEditorSize(container, source), [container, source]);
  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden p-8"
    >
      {source ? (
        <EffectCanvas
          operation={props.operation}
          showWithoutChange={props.showWithoutChange}
          source={source}
          stage={stage}
          onChange={props.onChange}
        />
      ) : (
        <PreviewFallback previewUrl={props.previewUrl} />
      )}
      {!props.showWithoutChange && (
        <p className="pointer-events-none absolute bottom-4 rounded bg-surface/90 px-2 py-1 text-xs text-content shadow-sm">
          Click to place the effect centre
        </p>
      )}
    </div>
  );
}
