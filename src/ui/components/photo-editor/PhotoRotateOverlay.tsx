import { Crosshair, Ruler } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PHOTO_ROTATION_FILL } from "@contracts/core";
import type { NormalizedPoint, PhotoEditOperation } from "@contracts/core";
import { Button } from "../Primitives";
import {
  clampNormalizedPoint,
  rotationLayout,
  straightenCorrection,
} from "./rotationGeometry";

type Size = { height: number; width: number };
type Line = { end: NormalizedPoint; start: NormalizedPoint };
type PivotDrag = { clientX: number; clientY: number; pivot: NormalizedPoint };

type PhotoRotateOverlayProps = {
  readonly operation: PhotoEditOperation;
  readonly showWithoutChange: boolean;
  readonly sourceUrl: string | null;
  readonly onCommit: (operation: PhotoEditOperation) => void;
  readonly onDraftChange: (operation: PhotoEditOperation) => void;
};

function numberValue(
  operation: PhotoEditOperation,
  key: string,
  fallback: number,
): number {
  const value = operation.values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function useStageSize(rootRef: React.RefObject<HTMLDivElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 1, height: 1 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }
    const update = () =>
      setSize({ width: root.clientWidth, height: root.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);
  return size;
}

function TransparencyGrid() {
  return (
    <svg aria-hidden="true" className="absolute inset-0 h-full w-full">
      <defs>
        <pattern
          id="rotation-transparency-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <rect width="20" height="20" className="fill-surface" />
          <rect width="10" height="10" className="fill-content/10" />
          <rect
            x="10"
            y="10"
            width="10"
            height="10"
            className="fill-content/10"
          />
        </pattern>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="url(#rotation-transparency-grid)"
      />
    </svg>
  );
}

function canvasClass(fillMode: number): string {
  if (fillMode === PHOTO_ROTATION_FILL.black) {
    return "bg-black";
  }
  if (fillMode === PHOTO_ROTATION_FILL.white) {
    return "bg-white";
  }
  return "bg-surface";
}

function lineLength(line: Line): number {
  return Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
}

function localPoint(
  event: React.PointerEvent<HTMLDivElement>,
): NormalizedPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function releasePointer(event: React.PointerEvent<HTMLElement>): void {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

function useOperationActions(props: PhotoRotateOverlayProps) {
  const operationRef = useRef(props.operation);
  useEffect(() => {
    operationRef.current = props.operation;
  }, [props.operation]);
  const updateValues = (values: Record<string, number | boolean>) => {
    const operation = operationRef.current;
    const next = { ...operation, values: { ...operation.values, ...values } };
    operationRef.current = next;
    props.onDraftChange(next);
  };
  const commit = () => props.onCommit(operationRef.current);
  return { commit, current: () => operationRef.current, updateValues };
}

function useStraightenGesture(onCorrection: (correction: number) => void) {
  const [line, setLine] = useState<Line | null>(null);
  const [lineMode, setLineMode] = useState(false);
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!lineMode) {
      return;
    }
    const point = localPoint(event);
    setLine({ start: point, end: point });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (lineMode && event.currentTarget.hasPointerCapture(event.pointerId)) {
      const point = localPoint(event);
      setLine((current) => (current ? { ...current, end: point } : null));
    }
  };
  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (line && lineLength(line) >= 12) {
      onCorrection(straightenCorrection(line.start, line.end));
      setLineMode(false);
    }
    releasePointer(event);
    setLine(null);
  };
  const pointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    setLine(null);
    releasePointer(event);
  };
  const toggle = () => {
    setLine(null);
    setLineMode((current) => !current);
  };
  return {
    line,
    lineMode,
    pointerCancel,
    pointerDown,
    pointerMove,
    pointerUp,
    toggle,
  };
}

function rotatedImageStyle(params: {
  angle: number;
  imageSize: Size;
  layout: ReturnType<typeof rotationLayout>;
  pivot: NormalizedPoint;
  scale: number;
}) {
  return {
    height: params.imageSize.height * params.scale,
    left: -params.layout.minX * params.scale,
    top: -params.layout.minY * params.scale,
    transform: `rotate(${params.angle}deg)`,
    transformOrigin: `${params.pivot.x * 100}% ${params.pivot.y * 100}%`,
    width: params.imageSize.width * params.scale,
  };
}

function StraightenLine({ line }: { readonly line: Line }) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <line
        x1={line.start.x}
        y1={line.start.y}
        x2={line.end.x}
        y2={line.end.y}
        className="stroke-white"
        strokeWidth="2"
      />
      <circle
        cx={line.start.x}
        cy={line.start.y}
        r="5"
        className="fill-brand-accent stroke-white"
      />
      <circle
        cx={line.end.x}
        cy={line.end.y}
        r="5"
        className="fill-brand-accent stroke-white"
      />
    </svg>
  );
}

type PivotControlProps = {
  readonly imageSize: Size;
  readonly left: number;
  readonly onCommit: () => void;
  readonly onMove: (pivot: NormalizedPoint) => void;
  readonly pivot: NormalizedPoint;
  readonly scale: number;
  readonly top: number;
};

function PivotControl(props: PivotControlProps) {
  const dragRef = useRef<PivotDrag | null>(null);
  return (
    <button
      type="button"
      aria-label="Rotation centre; drag to move"
      className="absolute z-10 flex h-11 w-11 touch-none items-center justify-center rounded-full border-2 border-white bg-brand-accent/80 p-0 text-white shadow-lg focus-visible:ring-2 focus-visible:ring-white"
      style={{ left: props.left - 22, top: props.top - 22 }}
      onPointerDown={(event) => {
        dragRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
          pivot: props.pivot,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) {
          return;
        }
        props.onMove(
          clampNormalizedPoint({
            x:
              drag.pivot.x +
              (event.clientX - drag.clientX) /
                (props.imageSize.width * props.scale),
            y:
              drag.pivot.y +
              (event.clientY - drag.clientY) /
                (props.imageSize.height * props.scale),
          }),
        );
      }}
      onPointerUp={(event) => {
        dragRef.current = null;
        releasePointer(event);
        props.onCommit();
      }}
      onPointerCancel={(event) => {
        dragRef.current = null;
        releasePointer(event);
      }}
    >
      <Crosshair aria-hidden="true" size={22} />
    </button>
  );
}

type RotationCanvasProps = {
  readonly angle: number;
  readonly fillMode: number;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
  readonly gesture: ReturnType<typeof useStraightenGesture>;
  readonly imageSize: Size;
  readonly layout: ReturnType<typeof rotationLayout>;
  readonly onPivotCommit: () => void;
  readonly onPivotMove: (pivot: NormalizedPoint) => void;
  readonly pivot: NormalizedPoint;
  readonly scale: number;
  readonly showControls: boolean;
  readonly sourceUrl: string;
};

function rotationPointerHandlers(
  showControls: boolean,
  gesture: ReturnType<typeof useStraightenGesture>,
): React.DOMAttributes<HTMLDivElement> {
  if (!showControls) {
    return {};
  }
  return {
    onPointerCancel: gesture.pointerCancel,
    onPointerDown: gesture.pointerDown,
    onPointerMove: gesture.pointerMove,
    onPointerUp: gesture.pointerUp,
  };
}

function RotationCanvas(props: RotationCanvasProps) {
  const imageStyle = rotatedImageStyle(props);
  const pointerHandlers = rotationPointerHandlers(
    props.showControls,
    props.gesture,
  );
  return (
    <div
      data-rotation-canvas
      className={`relative overflow-hidden shadow-xl ${canvasClass(props.fillMode)} ${props.showControls && props.gesture.lineMode ? "cursor-crosshair" : ""}`}
      style={{
        height: props.layout.height * props.scale,
        width: props.layout.width * props.scale,
      }}
      {...pointerHandlers}
    >
      {props.fillMode === PHOTO_ROTATION_FILL.transparent && (
        <TransparencyGrid />
      )}
      <div
        data-rotation-image
        className="pointer-events-none absolute max-w-none select-none"
        style={imageStyle}
      >
        <img
          draggable={false}
          width={props.imageSize.width}
          height={props.imageSize.height}
          className="h-full w-full max-w-none"
          src={props.sourceUrl}
          alt="Rotation preview"
          style={{
            transform: `scaleX(${props.flipHorizontal ? -1 : 1}) scaleY(${props.flipVertical ? -1 : 1})`,
          }}
        />
      </div>
      {props.showControls && props.gesture.line && (
        <StraightenLine line={props.gesture.line} />
      )}
      {props.showControls && !props.gesture.lineMode && (
        <PivotControl
          imageSize={props.imageSize}
          left={props.layout.pivotX * props.scale}
          top={props.layout.pivotY * props.scale}
          pivot={props.pivot}
          scale={props.scale}
          onMove={props.onPivotMove}
          onCommit={props.onPivotCommit}
        />
      )}
    </div>
  );
}

function RotationToolbar(props: {
  readonly gesture: ReturnType<typeof useStraightenGesture>;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
      <Button
        type="button"
        variant={props.gesture.lineMode ? "primary" : "secondary"}
        className="focus-visible:ring-2 focus-visible:ring-brand-accent"
        aria-pressed={props.gesture.lineMode}
        onClick={props.gesture.toggle}
      >
        <Ruler aria-hidden="true" size={18} />
        {props.gesture.lineMode
          ? "Draw across a straight edge"
          : "Straighten from line"}
      </Button>
      <p className="rounded bg-surface/90 px-2 py-1 text-xs text-content-secondary">
        {props.gesture.lineMode
          ? "Drag between two points; the nearest horizontal or vertical axis is chosen."
          : "Drag the centre target to change the rotation pivot."}
      </p>
    </div>
  );
}

function RotationSourceLoader(props: {
  readonly onLoad: (size: Size) => void;
  readonly sourceUrl: string | null;
}) {
  if (!props.sourceUrl) {
    return null;
  }
  return (
    <img
      role="presentation"
      className="hidden"
      src={props.sourceUrl}
      alt=""
      onLoad={(event) =>
        props.onLoad({
          width: event.currentTarget.naturalWidth,
          height: event.currentTarget.naturalHeight,
        })
      }
    />
  );
}

type RotationStageProps = {
  readonly actions: ReturnType<typeof useOperationActions>;
  readonly angle: number;
  readonly fillMode: number;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
  readonly gesture: ReturnType<typeof useStraightenGesture>;
  readonly imageSize: Size | null;
  readonly layout: ReturnType<typeof rotationLayout> | null;
  readonly pivot: NormalizedPoint;
  readonly scale: number;
  readonly showControls: boolean;
  readonly sourceUrl: string | null;
};

function RotationStage(props: RotationStageProps) {
  if (!props.sourceUrl || !props.layout || !props.imageSize) {
    return <span className="text-content-secondary">Preparing rotation…</span>;
  }
  return (
    <>
      <RotationCanvas
        angle={props.angle}
        fillMode={props.fillMode}
        flipHorizontal={props.flipHorizontal}
        flipVertical={props.flipVertical}
        gesture={props.gesture}
        imageSize={props.imageSize}
        layout={props.layout}
        pivot={props.pivot}
        scale={props.scale}
        showControls={props.showControls}
        sourceUrl={props.sourceUrl}
        onPivotMove={(next) =>
          props.actions.updateValues({ pivotX: next.x, pivotY: next.y })
        }
        onPivotCommit={props.actions.commit}
      />
      {props.showControls && <RotationToolbar gesture={props.gesture} />}
    </>
  );
}

export function PhotoRotateOverlay(props: PhotoRotateOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [imageSize, setImageSize] = useState<Size | null>(null);
  const stageSize = useStageSize(rootRef);
  const actions = useOperationActions(props);
  const angle = numberValue(props.operation, "angle", 0);
  const pivot = clampNormalizedPoint({
    x: numberValue(props.operation, "pivotX", 0.5),
    y: numberValue(props.operation, "pivotY", 0.5),
  });
  const fillMode = numberValue(
    props.operation,
    "fillMode",
    PHOTO_ROTATION_FILL.transparent,
  );
  const flipHorizontal = props.operation.values.flipHorizontal === true;
  const flipVertical = props.operation.values.flipVertical === true;
  const layout = imageSize
    ? rotationLayout({
        ...imageSize,
        angle,
        expandCanvas: props.operation.values.expandCanvas !== false,
        pivot,
      })
    : null;
  const gesture = useStraightenGesture((correction) => {
    actions.updateValues({
      angle: numberValue(actions.current(), "angle", 0) + correction,
    });
    actions.commit();
  });
  const displayedAngle = props.showWithoutChange ? 0 : angle;
  const displayedFlipHorizontal = props.showWithoutChange
    ? false
    : flipHorizontal;
  const displayedFlipVertical = props.showWithoutChange ? false : flipVertical;
  const scale = layout
    ? Math.max(
        0.01,
        Math.min(
          (stageSize.width - 64) / layout.width,
          (stageSize.height - 64) / layout.height,
          1,
        ),
      )
    : 1;
  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden p-8"
    >
      <RotationSourceLoader sourceUrl={props.sourceUrl} onLoad={setImageSize} />
      <RotationStage
        actions={actions}
        angle={displayedAngle}
        fillMode={fillMode}
        flipHorizontal={displayedFlipHorizontal}
        flipVertical={displayedFlipVertical}
        gesture={gesture}
        imageSize={imageSize}
        layout={layout}
        pivot={pivot}
        scale={scale}
        showControls={!props.showWithoutChange}
        sourceUrl={props.sourceUrl}
      />
    </div>
  );
}
