import { useEffect, useMemo, useRef } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import type { PhotoEditOperation } from "@contracts/core";
import {
  FOCUS_SHAPE,
  FOCUS_STYLE,
  MAX_FOCUS_POINTS,
  applyFocusPixels,
  prepareFocusBlurredPixels,
  readFocusPoints,
  readFocusShape,
  readFocusStyle,
  writeFocusPoints,
} from "@shared/photoEditing/focus";
import type { FocusPoint } from "@shared/photoEditing/focus";
import type { ColourPopImage } from "./colourPopImage";
import {
  fittedPhotoEditorSize,
  usePhotoEditorContainerSize,
  usePhotoEditorSourceImage,
} from "./photoEditorCanvasImage";
import type { CanvasSize } from "./photoEditorCanvasImage";
import {
  dragFocusTarget,
  focusHandlePositions,
  focusPointOnStage,
  hitFocusTarget,
  selectedFocusPointIndex,
} from "./photoFocusGeometry";
import type { FocusCanvasPoint, FocusDragTarget } from "./photoFocusGeometry";

type FocusOverlayProps = {
  readonly operation: PhotoEditOperation;
  readonly previewUrl: string | null;
  readonly showWithoutChange: boolean;
  readonly sourceUrl: string | null;
  readonly onCommit: (operation: PhotoEditOperation) => void;
  readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

type FocusCanvasProps = {
  readonly operation: PhotoEditOperation;
  readonly showWithoutChange: boolean;
  readonly source: ColourPopImage;
  readonly stage: CanvasSize;
  readonly onCommit: (operation: PhotoEditOperation) => void;
  readonly onPreviewChange: (operation: PhotoEditOperation) => void;
};

function numberValue(operation: PhotoEditOperation, key: string, fallback: number): number {
  const candidate = operation.values[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
}

function localPoint(event: ReactPointerEvent<HTMLButtonElement>): FocusCanvasPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(bounds.width, event.clientX - bounds.left)),
    y: Math.max(0, Math.min(bounds.height, event.clientY - bounds.top)),
  };
}

function lineGuide(
  point: FocusPoint,
  stage: CanvasSize,
  angle: number,
  offset: number,
) {
  const centre = focusPointOnStage(point, stage);
  const radians = angle * Math.PI / 180;
  const direction = { x: Math.cos(radians), y: Math.sin(radians) };
  const normal = { x: -direction.y, y: direction.x };
  const length = Math.hypot(stage.width, stage.height);
  const lineCentre = {
    x: centre.x + normal.x * offset,
    y: centre.y + normal.y * offset,
  };
  return {
    x1: lineCentre.x - direction.x * length,
    x2: lineCentre.x + direction.x * length,
    y1: lineCentre.y - direction.y * length,
    y2: lineCentre.y + direction.y * length,
  };
}

function CircularGuides(props: {
  readonly operation: PhotoEditOperation;
  readonly stage: CanvasSize;
}) {
  const points = readFocusPoints(props.operation.values);
  const selected = selectedFocusPointIndex(props.operation.values);
  const minimumEdge = Math.min(props.stage.width, props.stage.height);
  const size = numberValue(props.operation, "size", 0.2) * minimumEdge;
  const falloff = numberValue(props.operation, "falloff", 0.18) * minimumEdge;
  return points.map((point, index) => {
    const centre = focusPointOnStage(point, props.stage);
    return (
      <g key={`circle-guide-${index}`}>
        <circle
          className={index === selected ? "fill-none stroke-brand-accent" : "fill-none stroke-white/80"}
          cx={centre.x}
          cy={centre.y}
          r={size}
          strokeWidth={2}
        />
        <circle
          className="fill-none stroke-white/70"
          cx={centre.x}
          cy={centre.y}
          r={size + falloff}
          strokeDasharray="6 5"
          strokeWidth={1.5}
        />
      </g>
    );
  });
}

function StraightGuides(props: {
  readonly operation: PhotoEditOperation;
  readonly stage: CanvasSize;
}) {
  const points = readFocusPoints(props.operation.values);
  const minimumEdge = Math.min(props.stage.width, props.stage.height);
  const size = numberValue(props.operation, "size", 0.2) * minimumEdge;
  const falloff = numberValue(props.operation, "falloff", 0.18) * minimumEdge;
  const angle = numberValue(props.operation, "angle", 0);
  return points.flatMap((point, pointIndex) => [
    <line key={`straight-${pointIndex}-a`} {...lineGuide(point, props.stage, angle, -size)} className="stroke-brand-accent" strokeWidth={2} />,
    <line key={`straight-${pointIndex}-b`} {...lineGuide(point, props.stage, angle, size)} className="stroke-brand-accent" strokeWidth={2} />,
    <line key={`straight-${pointIndex}-c`} {...lineGuide(point, props.stage, angle, -(size + falloff))} className="stroke-white/70" strokeDasharray="6 5" strokeWidth={1.5} />,
    <line key={`straight-${pointIndex}-d`} {...lineGuide(point, props.stage, angle, size + falloff)} className="stroke-white/70" strokeDasharray="6 5" strokeWidth={1.5} />,
  ]);
}

function FocusGuides(props: {
  readonly operation: PhotoEditOperation;
  readonly stage: CanvasSize;
}) {
  const points = readFocusPoints(props.operation.values);
  const selected = selectedFocusPointIndex(props.operation.values);
  const handles = focusHandlePositions(props.operation.values, props.stage);
  const showAngle = readFocusShape(props.operation.values) === FOCUS_SHAPE.straight
    || readFocusStyle(props.operation.values) === FOCUS_STYLE.motionStreak;
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      viewBox={`0 0 ${props.stage.width} ${props.stage.height}`}
    >
      {readFocusShape(props.operation.values) === FOCUS_SHAPE.circular
        ? <CircularGuides {...props} />
        : <StraightGuides {...props} />}
      {points.map((point, index) => {
        const centre = focusPointOnStage(point, props.stage);
        return (
          <g key={`focus-centre-${index}`}>
            <circle
              className={index === selected ? "fill-brand-accent stroke-white" : "fill-surface stroke-white"}
              cx={centre.x}
              cy={centre.y}
              r={index === selected ? 9 : 7}
              strokeWidth={2}
            />
            <text className="fill-white text-xs font-semibold" x={centre.x} y={centre.y + 4} textAnchor="middle">
              {index + 1}
            </text>
          </g>
        );
      })}
      <circle className="fill-brand-accent stroke-white" cx={handles.size.x} cy={handles.size.y} r={7} strokeWidth={2} />
      <circle className="fill-surface stroke-white" cx={handles.falloff.x} cy={handles.falloff.y} r={7} strokeDasharray="3 2" strokeWidth={2} />
      {showAngle && (
        <>
          <line className="stroke-white/80" x1={handles.centre.x} y1={handles.centre.y} x2={handles.angle.x} y2={handles.angle.y} strokeWidth={1.5} />
          <circle className="fill-surface stroke-brand-accent" cx={handles.angle.x} cy={handles.angle.y} r={8} strokeWidth={2} />
        </>
      )}
    </svg>
  );
}

function useFocusCanvasFrame(
  props: FocusCanvasProps,
  canvasRef: RefObject<HTMLCanvasElement | null>,
) {
  const strength = numberValue(props.operation, "strength", 0.55);
  const blurred = useMemo(
    () => prepareFocusBlurredPixels(props.source.data, props.source.width, props.source.height, strength),
    [props.source, strength],
  );
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }
    canvas.width = props.source.width;
    canvas.height = props.source.height;
    const output = props.showWithoutChange
      ? props.source.data
      : applyFocusPixels(props.source.data, props.source.width, props.source.height, props.operation.values, blurred);
    const frame = context.createImageData(props.source.width, props.source.height);
    frame.data.set(output);
    context.putImageData(frame, 0, 0);
  }, [blurred, canvasRef, props.operation.values, props.showWithoutChange, props.source]);
}

function useFocusCanvasInteractions(props: FocusCanvasProps) {
  const dragRef = useRef<FocusDragTarget | null>(null);
  const draftRef = useRef(props.operation);
  useEffect(() => {
    draftRef.current = props.operation;
  }, [props.operation]);
  const previewValues = (values: PhotoEditOperation["values"]) => {
    const next = { ...draftRef.current, values };
    draftRef.current = next;
    props.onPreviewChange(next);
  };
  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const point = localPoint(event);
    const points = readFocusPoints(draftRef.current.values);
    if (event.shiftKey && points.length < MAX_FOCUS_POINTS) {
      const normalized = { x: point.x / props.stage.width, y: point.y / props.stage.height };
      const index = points.length;
      previewValues(writeFocusPoints(draftRef.current.values, [...points, normalized], index));
      dragRef.current = { kind: "centre", pointIndex: index };
    } else {
      const selected = selectedFocusPointIndex(draftRef.current.values);
      dragRef.current = hitFocusTarget(draftRef.current.values, props.stage, point)
        ?? { kind: "centre", pointIndex: selected };
      previewValues(dragFocusTarget(draftRef.current.values, props.stage, dragRef.current, point));
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) {
      return;
    }
    previewValues(dragFocusTarget(draftRef.current.values, props.stage, dragRef.current, localPoint(event)));
  };
  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    props.onCommit(draftRef.current);
  };
  const keyboardCentre = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) {
      return;
    }
    const selected = selectedFocusPointIndex(draftRef.current.values);
    const values = dragFocusTarget(
      draftRef.current.values,
      props.stage,
      { kind: "centre", pointIndex: selected },
      { x: props.stage.width / 2, y: props.stage.height / 2 },
    );
    const next = { ...draftRef.current, values };
    draftRef.current = next;
    props.onPreviewChange(next);
    props.onCommit(next);
  };
  return { keyboardCentre, pointerDown, pointerMove, pointerUp };
}

function FocusCanvas(props: FocusCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useFocusCanvasFrame(props, canvasRef);
  const interactions = useFocusCanvasInteractions(props);
  return (
    <button
      type="button"
      aria-label="Adjust focus on the photo; drag numbered centres and guide handles, or press Enter to centre the selected point"
      className="relative cursor-crosshair touch-none overflow-hidden bg-transparent p-0 shadow-xl hover:ring-2 hover:ring-brand-accent/70 focus-visible:ring-2 focus-visible:ring-brand-accent"
      disabled={props.showWithoutChange}
      style={{ height: props.stage.height, width: props.stage.width }}
      onClick={interactions.keyboardCentre}
      onPointerDown={interactions.pointerDown}
      onPointerMove={interactions.pointerMove}
      onPointerUp={interactions.pointerUp}
      onPointerCancel={interactions.pointerUp}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {!props.showWithoutChange && <FocusGuides operation={props.operation} stage={props.stage} />}
    </button>
  );
}

function PreviewFallback(props: { readonly previewUrl: string | null }) {
  return props.previewUrl ? (
    <img className="max-h-full max-w-full object-contain" src={props.previewUrl} alt="Edit preview" />
  ) : null;
}

export function PhotoFocusOverlay(props: FocusOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const source = usePhotoEditorSourceImage(props.sourceUrl);
  const container = usePhotoEditorContainerSize(rootRef);
  const stage = useMemo(() => fittedPhotoEditorSize(container, source), [container, source]);
  return (
    <div ref={rootRef} className="relative flex h-full w-full items-center justify-center overflow-hidden p-8">
      {source ? (
        <FocusCanvas
          operation={props.operation}
          showWithoutChange={props.showWithoutChange}
          source={source}
          stage={stage}
          onCommit={props.onCommit}
          onPreviewChange={props.onPreviewChange}
        />
      ) : (
        <PreviewFallback previewUrl={props.previewUrl} />
      )}
      {!props.showWithoutChange && (
        <p className="pointer-events-none absolute bottom-4 rounded bg-surface/90 px-2 py-1 text-xs text-content shadow-sm">
          Drag centres and guide handles · Shift-click to add a point
        </p>
      )}
    </div>
  );
}
