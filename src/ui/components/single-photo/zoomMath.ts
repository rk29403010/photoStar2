export const MIN_ZOOM_SCALE = 0.5;
export const MAX_ZOOM_SCALE = 10;
export const ZOOM_STEP = 0.5;

export function clampZoomScale(scale: number): number {
  return Math.max(MIN_ZOOM_SCALE, Math.min(scale, MAX_ZOOM_SCALE));
}

export function getNextZoomScale(scale: number, direction: -1 | 1, step = ZOOM_STEP): number {
  return clampZoomScale(scale + direction * step);
}
