import {
  FOCUS_SHAPE,
  FOCUS_STYLE,
  readFocusPoints,
  readFocusShape,
  readFocusStyle,
  writeFocusPoints,
} from "../../../shared/photoEditing/focus.ts";
import type { FocusValues } from "../../../shared/photoEditing/focus.ts";
import type { CanvasSize } from "./photoEditorCanvasImage";

export type FocusCanvasPoint = { x: number; y: number };
export type FocusDragTarget =
  | { kind: "angle" | "falloff" | "size"; pointIndex: number }
  | { kind: "centre"; pointIndex: number };

export type FocusHandlePositions = {
  angle: FocusCanvasPoint;
  centre: FocusCanvasPoint;
  falloff: FocusCanvasPoint;
  size: FocusCanvasPoint;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function numberValue(values: FocusValues, key: string, fallback: number): number {
  const candidate = values[key];
  return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
}

export function selectedFocusPointIndex(values: FocusValues): number {
  const points = readFocusPoints(values);
  return Math.round(clamp(numberValue(values, "selectedPoint", 0), 0, points.length - 1));
}

export function focusPointOnStage(
  point: { x: number; y: number },
  stage: CanvasSize,
): FocusCanvasPoint {
  return { x: point.x * stage.width, y: point.y * stage.height };
}

export function focusHandlePositions(
  values: FocusValues,
  stage: CanvasSize,
): FocusHandlePositions {
  const points = readFocusPoints(values);
  const selected = selectedFocusPointIndex(values);
  const centre = focusPointOnStage(points[selected], stage);
  const minimumEdge = Math.min(stage.width, stage.height);
  const size = clamp(numberValue(values, "size", 0.2), 0.01, 0.8) * minimumEdge;
  const falloff = clamp(numberValue(values, "falloff", 0.18), 0.005, 0.8) * minimumEdge;
  const angle = numberValue(values, "angle", 0) * Math.PI / 180;
  const straight = readFocusShape(values) === FOCUS_SHAPE.straight;
  const sizeDirection = straight
    ? { x: -Math.sin(angle), y: Math.cos(angle) }
    : { x: 1, y: 0 };
  return {
    angle: {
      x: centre.x + Math.cos(angle) * minimumEdge * 0.28,
      y: centre.y + Math.sin(angle) * minimumEdge * 0.28,
    },
    centre,
    size: {
      x: centre.x + sizeDirection.x * size,
      y: centre.y + sizeDirection.y * size,
    },
    falloff: {
      x: centre.x + sizeDirection.x * (size + falloff),
      y: centre.y + sizeDirection.y * (size + falloff),
    },
  };
}

function distance(first: FocusCanvasPoint, second: FocusCanvasPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function hitFocusTarget(
  values: FocusValues,
  stage: CanvasSize,
  point: FocusCanvasPoint,
  threshold = 24,
): FocusDragTarget | null {
  const points = readFocusPoints(values);
  const centres = points.map((candidate) => focusPointOnStage(candidate, stage));
  const handles = focusHandlePositions(values, stage);
  const selected = selectedFocusPointIndex(values);
  const showAngle = readFocusShape(values) === FOCUS_SHAPE.straight
    || readFocusStyle(values) === FOCUS_STYLE.motionStreak;
  if (showAngle && distance(handles.angle, point) <= threshold) {
    return { kind: "angle", pointIndex: selected };
  }
  if (distance(handles.falloff, point) <= threshold) {
    return { kind: "falloff", pointIndex: selected };
  }
  if (distance(handles.size, point) <= threshold) {
    return { kind: "size", pointIndex: selected };
  }
  const centreIndex = centres.findIndex((candidate) => distance(candidate, point) <= threshold);
  if (centreIndex >= 0) {
    return { kind: "centre", pointIndex: centreIndex };
  }
  return null;
}

function focusDistanceFromCentre(
  values: FocusValues,
  stage: CanvasSize,
  point: FocusCanvasPoint,
): number {
  const handles = focusHandlePositions(values, stage);
  const deltaX = point.x - handles.centre.x;
  const deltaY = point.y - handles.centre.y;
  const minimumEdge = Math.max(1, Math.min(stage.width, stage.height));
  if (readFocusShape(values) === FOCUS_SHAPE.circular) {
    return Math.hypot(deltaX, deltaY) / minimumEdge;
  }
  const angle = numberValue(values, "angle", 0) * Math.PI / 180;
  return Math.abs((-Math.sin(angle) * deltaX) + (Math.cos(angle) * deltaY)) / minimumEdge;
}

export function dragFocusTarget(
  values: FocusValues,
  stage: CanvasSize,
  target: FocusDragTarget,
  point: FocusCanvasPoint,
): FocusValues {
  if (target.kind === "centre") {
    const points = readFocusPoints(values);
    points[target.pointIndex] = {
      x: clamp(point.x / Math.max(1, stage.width), 0, 1),
      y: clamp(point.y / Math.max(1, stage.height), 0, 1),
    };
    return writeFocusPoints(values, points, target.pointIndex);
  }
  const distanceFromCentre = focusDistanceFromCentre(values, stage, point);
  if (target.kind === "size") {
    return { ...values, size: clamp(distanceFromCentre, 0.01, 0.8) };
  }
  if (target.kind === "falloff") {
    const size = numberValue(values, "size", 0.2);
    return { ...values, falloff: clamp(distanceFromCentre - size, 0.005, 0.8) };
  }
  const centre = focusHandlePositions(values, stage).centre;
  const angle = Math.atan2(point.y - centre.y, point.x - centre.x) * 180 / Math.PI;
  return { ...values, angle };
}
