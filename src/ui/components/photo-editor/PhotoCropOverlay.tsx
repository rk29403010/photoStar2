import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Crop } from "lucide-react";
import type { PhotoEditOperation } from "@contracts/core";
import { Button } from "../Primitives";
import {
  deriveCropBox,
  fitCropViewportToAspect,
  panCropImage,
  resizeCropViewport,
  resizeCropViewportWithAspect,
} from "./cropGeometry";
import type {
  CropHandle,
  CropViewportState,
  NormalizedBox,
  NormalizedPoint,
} from "./cropGeometry";
import { CropGuideGraphic } from "./PhotoCropOptions";
import { cropAspectKey, cropAspectRatio, cropGuide } from "./cropOptions";
import type { CropGuide } from "./cropOptions";

const CROP_SETTLE_DELAY_MS = 3000;
const HANDLE_TARGET_HALF_SIZE = 22;
const HANDLE_MARKER_EDGE_INSET = 8;
const HANDLES: CropHandle[] = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

type Dimensions = { height: number; width: number };
type DragState = {
  kind: "pan" | CropHandle;
  origin: NormalizedPoint;
  viewport: CropViewportState;
};

type PhotoCropOverlayProps = {
  readonly operation: PhotoEditOperation;
  readonly previewRevision: number;
  readonly previewUrl: string | null;
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

function operationBox(operation: PhotoEditOperation): NormalizedBox {
  return {
    x: numberValue(operation, "x", 0),
    y: numberValue(operation, "y", 0),
    width: numberValue(operation, "width", 1),
    height: numberValue(operation, "height", 1),
  };
}

function fittedDimensions(
  container: Dimensions,
  natural: Dimensions,
): Dimensions {
  if (
    container.width <= 0 ||
    container.height <= 0 ||
    natural.width <= 0 ||
    natural.height <= 0
  ) {
    return { height: 0, width: 0 };
  }
  const scale = Math.min(
    container.width / natural.width,
    container.height / natural.height,
  );
  return { height: natural.height * scale, width: natural.width * scale };
}

function handlePosition(
  frame: NormalizedBox,
  handle: CropHandle,
): NormalizedPoint {
  let horizontal = frame.x + frame.width / 2;
  if (handle.includes("west")) {
    horizontal = frame.x;
  }
  if (handle.includes("east")) {
    horizontal = frame.x + frame.width;
  }
  let vertical = frame.y + frame.height / 2;
  if (handle.includes("north")) {
    vertical = frame.y;
  }
  if (handle.includes("south")) {
    vertical = frame.y + frame.height;
  }
  return { x: horizontal, y: vertical };
}

function boxesMatch(left: NormalizedBox, right: NormalizedBox): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function cursorClass(handle: CropHandle): string {
  if (handle === "north" || handle === "south") {
    return "cursor-ns-resize";
  }
  if (handle === "east" || handle === "west") {
    return "cursor-ew-resize";
  }
  if (handle === "north-east" || handle === "south-west") {
    return "cursor-nesw-resize";
  }
  return "cursor-nwse-resize";
}

function handleMarkerClass(handle: CropHandle): string {
  const feedback =
    "group-hover:bg-brand-accent group-focus-visible:bg-brand-accent motion-safe:transition-colors";
  if (handle === "north" || handle === "south") {
    return `h-1.5 w-6 rounded-full border border-brand-accent bg-content shadow-sm ${feedback}`;
  }
  if (handle === "east" || handle === "west") {
    return `h-6 w-1.5 rounded-full border border-brand-accent bg-content shadow-sm ${feedback}`;
  }
  return `h-4 w-4 rounded-sm border-2 border-brand-accent bg-content shadow-sm ${feedback}`;
}

function dimStyles(
  frame: NormalizedBox,
): Array<{ id: string; style: CSSProperties }> {
  const right = frame.x + frame.width;
  const bottom = frame.y + frame.height;
  return [
    { id: "top", style: { height: `${frame.y * 100}%`, inset: "0 0 auto 0" } },
    {
      id: "left",
      style: {
        height: `${frame.height * 100}%`,
        left: 0,
        top: `${frame.y * 100}%`,
        width: `${frame.x * 100}%`,
      },
    },
    {
      id: "right",
      style: {
        height: `${frame.height * 100}%`,
        left: `${right * 100}%`,
        right: 0,
        top: `${frame.y * 100}%`,
      },
    },
    {
      id: "bottom",
      style: { bottom: 0, left: 0, right: 0, top: `${bottom * 100}%` },
    },
  ];
}

function CropHandleButton(props: {
  readonly dimensions: Dimensions;
  readonly frame: NormalizedBox;
  readonly handle: CropHandle;
  readonly onPointerDown: (
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: CropHandle,
  ) => void;
}) {
  const position = handlePosition(props.frame, props.handle);
  const markerLeft = Math.min(
    props.dimensions.width - HANDLE_MARKER_EDGE_INSET,
    Math.max(HANDLE_MARKER_EDGE_INSET, position.x * props.dimensions.width),
  );
  const markerTop = Math.min(
    props.dimensions.height - HANDLE_MARKER_EDGE_INSET,
    Math.max(HANDLE_MARKER_EDGE_INSET, position.y * props.dimensions.height),
  );
  const left = Math.min(
    props.dimensions.width - HANDLE_TARGET_HALF_SIZE,
    Math.max(HANDLE_TARGET_HALF_SIZE, markerLeft),
  );
  const top = Math.min(
    props.dimensions.height - HANDLE_TARGET_HALF_SIZE,
    Math.max(HANDLE_TARGET_HALF_SIZE, markerTop),
  );
  return (
    <button
      type="button"
      aria-label={`Resize crop from ${props.handle}`}
      data-crop-handle={props.handle}
      className={`group absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center touch-none rounded-none border-0 bg-transparent p-0 hover:border-transparent focus-visible:ring-2 focus-visible:ring-content ${cursorClass(props.handle)}`}
      style={{ left, top }}
      onPointerDown={(event) => props.onPointerDown(event, props.handle)}
    >
      <span
        className={handleMarkerClass(props.handle)}
        style={{
          transform: `translate(${markerLeft - left}px, ${markerTop - top}px)`,
        }}
      />
    </button>
  );
}

function useCropStageDimensions(editing: boolean) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<Dimensions>({
    height: 0,
    width: 0,
  });
  const [natural, setNatural] = useState<Dimensions>({ height: 0, width: 0 });
  const stage = useMemo(
    () => fittedDimensions(container, natural),
    [container, natural],
  );
  useEffect(() => {
    if (!editing) {
      return undefined;
    }
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }
    const update = () =>
      setContainer({ height: root.clientHeight, width: root.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [editing]);
  return { rootRef, setNatural, stage };
}

function useCropSettlement(params: {
  draftRef: { current: PhotoEditOperation };
  onCommit: PhotoCropOverlayProps["onCommit"];
  previewRevision: number;
}) {
  const { draftRef, onCommit, previewRevision } = params;
  const commitTimerRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const [editing, setEditing] = useState(true);
  const [awaitingRevision, setAwaitingRevision] = useState<number | null>(null);
  const clearTimer = useCallback(() => {
    if (commitTimerRef.current) {
      globalThis.clearTimeout(commitTimerRef.current);
    }
  }, []);
  useEffect(() => {
    if (awaitingRevision !== null && previewRevision > awaitingRevision) {
      setEditing(false);
      setAwaitingRevision(null);
    }
  }, [awaitingRevision, previewRevision]);
  useEffect(() => clearTimer, [clearTimer]);
  const beginEditing = useCallback(() => {
    clearTimer();
    setEditing(true);
    setAwaitingRevision(null);
  }, [clearTimer]);
  const commitNow = useCallback(() => {
    clearTimer();
    onCommit(draftRef.current);
    setAwaitingRevision(previewRevision);
  }, [clearTimer, draftRef, onCommit, previewRevision]);
  const scheduleCommit = useCallback(() => {
    clearTimer();
    commitTimerRef.current = globalThis.setTimeout(
      commitNow,
      CROP_SETTLE_DELAY_MS,
    );
  }, [clearTimer, commitNow]);
  return { beginEditing, commitNow, editing, scheduleCommit };
}

function nextViewportForDrag(
  drag: DragState,
  event: ReactPointerEvent<HTMLDivElement>,
  stage: Dimensions,
  aspectRatio: number | null,
): CropViewportState {
  const delta = {
    x: (event.clientX - drag.origin.x) / stage.width,
    y: (event.clientY - drag.origin.y) / stage.height,
  };
  if (drag.kind === "pan") {
    return panCropImage(drag.viewport, delta);
  }
  if (aspectRatio !== null) {
    return resizeCropViewportWithAspect(
      drag.viewport,
      drag.kind,
      delta,
      aspectRatio,
      { width: 44 / stage.width, height: 44 / stage.height },
    );
  }
  return resizeCropViewport(drag.viewport, drag.kind, delta, {
    width: 44 / stage.width,
    height: 44 / stage.height,
  });
}

function useApplyCropAspect(params: {
  aspectKey: string;
  aspectRatio: number | null;
  draftRef: { current: PhotoEditOperation };
  onCommit: PhotoCropOverlayProps["onCommit"];
  onDraftChange: PhotoCropOverlayProps["onDraftChange"];
  stage: Dimensions;
  updateDraft: (viewport: CropViewportState) => void;
  viewport: CropViewportState;
}) {
  const appliedAspectRef = useRef<string | null>(null);
  useEffect(() => {
    if (params.aspectRatio === null) {
      appliedAspectRef.current = params.aspectKey;
      return;
    }
    if (
      params.stage.width <= 0 ||
      params.stage.height <= 0 ||
      appliedAspectRef.current === params.aspectKey
    ) {
      return;
    }
    appliedAspectRef.current = params.aspectKey;
    const nextViewport = fitCropViewportToAspect(
      params.viewport,
      params.aspectRatio,
    );
    if (
      boxesMatch(
        deriveCropBox(nextViewport),
        operationBox(params.draftRef.current),
      )
    ) {
      return;
    }
    params.updateDraft(nextViewport);
    params.onDraftChange(params.draftRef.current);
    params.onCommit(params.draftRef.current);
  }, [params]);
}

function useCropViewport(
  operation: PhotoEditOperation,
  draftRef: { current: PhotoEditOperation },
) {
  const [viewport, setViewport] = useState<CropViewportState>({
    frame: operationBox(operation),
    imageOffset: { x: 0, y: 0 },
  });
  const updateDraft = useCallback(
    (nextViewport: CropViewportState) => {
      const cropBox = deriveCropBox(nextViewport);
      draftRef.current = {
        ...draftRef.current,
        values: { ...draftRef.current.values, ...cropBox },
      };
      setViewport(nextViewport);
    },
    [draftRef],
  );
  useEffect(() => {
    const nextFrame = operationBox(operation);
    if (boxesMatch(nextFrame, operationBox(draftRef.current))) {
      draftRef.current = operation;
      return;
    }
    draftRef.current = operation;
    setViewport({ frame: nextFrame, imageOffset: { x: 0, y: 0 } });
  }, [draftRef, operation]);
  return { updateDraft, viewport };
}

function useCropDrag(params: {
  aspectKey: string;
  aspectRatio: number | null;
  beginEditing: () => void;
  draftRef: { current: PhotoEditOperation };
  onCommit: PhotoCropOverlayProps["onCommit"];
  onDraftChange: PhotoCropOverlayProps["onDraftChange"];
  operation: PhotoEditOperation;
  scheduleCommit: () => void;
  stage: Dimensions;
}) {
  const {
    aspectKey,
    aspectRatio,
    beginEditing,
    draftRef,
    onCommit,
    onDraftChange,
    operation,
    scheduleCommit,
    stage,
  } = params;
  const dragRef = useRef<DragState | null>(null);
  const { updateDraft, viewport } = useCropViewport(operation, draftRef);

  useApplyCropAspect({
    aspectKey,
    aspectRatio,
    draftRef,
    onCommit,
    onDraftChange,
    stage,
    updateDraft,
    viewport,
  });

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, kind: DragState["kind"]) => {
      event.preventDefault();
      beginEditing();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        kind,
        origin: { x: event.clientX, y: event.clientY },
        viewport,
      };
    },
    [beginEditing, viewport],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || stage.width <= 0 || stage.height <= 0) {
        return;
      }
      updateDraft(nextViewportForDrag(drag, event, stage, aspectRatio));
    },
    [aspectRatio, stage, updateDraft],
  );

  const endDrag = useCallback(() => {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    onDraftChange(draftRef.current);
    scheduleCommit();
  }, [draftRef, onDraftChange, scheduleCommit]);
  return { beginDrag, endDrag, handlePointerMove, viewport };
}

function BeforeCropView({ sourceUrl }: { readonly sourceUrl: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden p-8">
      <img
        className="max-h-full max-w-full object-contain"
        src={sourceUrl}
        alt="Before crop"
      />
    </div>
  );
}

function SettledCropView(props: {
  readonly onAdjust: () => void;
  readonly previewUrl: string;
}) {
  return (
    <button
      type="button"
      aria-label="Adjust crop"
      className="group relative flex h-full w-full items-center justify-center"
      onClick={props.onAdjust}
    >
      <img
        className="max-h-full max-w-full object-contain"
        src={props.previewUrl}
        alt="Edit preview"
      />
      <span className="absolute bottom-4 flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-sm text-content shadow-sm">
        <Crop size={16} />
        Adjust crop
      </span>
    </button>
  );
}

type CropDragHandlers = ReturnType<typeof useCropDrag>;

function CropCanvas(props: {
  readonly drag: CropDragHandlers;
  readonly guide: CropGuide;
  readonly setNatural: (dimensions: Dimensions) => void;
  readonly sourceUrl: string;
  readonly stage: Dimensions;
}) {
  const { drag, guide, setNatural, sourceUrl, stage } = props;
  const frame = drag.viewport.frame;
  const frameStyle = {
    height: `${frame.height * 100}%`,
    left: `${frame.x * 100}%`,
    top: `${frame.y * 100}%`,
    width: `${frame.width * 100}%`,
  };
  return (
    <div
      className="relative touch-none select-none"
      style={{ height: stage.height, width: stage.width }}
      onPointerMove={drag.handlePointerMove}
      onPointerUp={drag.endDrag}
      onPointerCancel={drag.endDrag}
    >
      <img
        className="absolute inset-0 h-full w-full max-w-none pointer-events-none"
        src={sourceUrl}
        alt="Crop source"
        draggable={false}
        style={{
          transform: `translate(${drag.viewport.imageOffset.x * 100}%, ${drag.viewport.imageOffset.y * 100}%)`,
        }}
        onLoad={(event) =>
          setNatural({
            height: event.currentTarget.naturalHeight,
            width: event.currentTarget.naturalWidth,
          })
        }
      />
      {dimStyles(frame).map((dim) => (
        <div
          key={dim.id}
          data-crop-dim={dim.id}
          className="absolute bg-surface/70 pointer-events-none"
          style={dim.style}
        />
      ))}
      <button
        type="button"
        aria-label="Move image within crop"
        data-crop-frame="true"
        className="absolute cursor-grab touch-none rounded-none border-2 border-brand-accent bg-transparent p-0 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-content"
        style={frameStyle}
        onPointerDown={(event) => drag.beginDrag(event, "pan")}
      />
      {guide !== 0 && (
        <div
          data-crop-guide={guide}
          className="absolute overflow-hidden pointer-events-none"
          style={frameStyle}
        >
          <CropGuideGraphic guide={guide} />
        </div>
      )}
      {HANDLES.map((handle) => (
        <CropHandleButton
          key={handle}
          dimensions={stage}
          frame={frame}
          handle={handle}
          onPointerDown={drag.beginDrag}
        />
      ))}
    </div>
  );
}

export function PhotoCropOverlay(props: PhotoCropOverlayProps) {
  const draftRef = useRef(props.operation);
  const settlement = useCropSettlement({
    draftRef,
    onCommit: props.onCommit,
    previewRevision: props.previewRevision,
  });
  const { rootRef, setNatural, stage } = useCropStageDimensions(
    settlement.editing,
  );
  const desiredAspectRatio = cropAspectRatio(props.operation);
  const normalizedAspectRatio =
    desiredAspectRatio !== null && stage.width > 0 && stage.height > 0
      ? (desiredAspectRatio * stage.height) / stage.width
      : null;
  const drag = useCropDrag({
    aspectKey: cropAspectKey(props.operation),
    aspectRatio: normalizedAspectRatio,
    beginEditing: settlement.beginEditing,
    draftRef,
    onCommit: props.onCommit,
    onDraftChange: props.onDraftChange,
    operation: props.operation,
    scheduleCommit: settlement.scheduleCommit,
    stage,
  });

  if (props.showWithoutChange && props.sourceUrl) {
    return <BeforeCropView sourceUrl={props.sourceUrl} />;
  }

  if (!settlement.editing && props.previewUrl) {
    return (
      <SettledCropView
        onAdjust={settlement.beginEditing}
        previewUrl={props.previewUrl}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      {props.sourceUrl ? (
        <CropCanvas
          drag={drag}
          guide={cropGuide(props.operation)}
          setNatural={setNatural}
          sourceUrl={props.sourceUrl}
          stage={stage}
        />
      ) : (
        <span className="text-slate-300">Preparing crop canvas…</span>
      )}
      <div className="absolute bottom-4">
        <Button variant="secondary" onClick={settlement.commitNow}>
          Preview crop
        </Button>
      </div>
    </div>
  );
}
