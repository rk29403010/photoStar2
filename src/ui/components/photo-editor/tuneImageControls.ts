export { TUNE_IMAGE_DEFAULTS } from "../../../shared/photoEditing/tune.ts";
import type { TuneImageValues } from "../../../shared/photoEditing/tune.ts";
export type TuneImageControl = keyof TuneImageValues;
export type GuidedTuneImageControl = typeof TUNE_GUIDED_CONTROLS[number];
export type TunePresentation = "guided" | "advanced";
export const TUNE_GUIDED_CONTROLS = ["brightness", "shadows", "highlights", "contrast", "temperature", "vibrance"] as const;
export const TUNE_IMAGE_CONTROLS: readonly TuneImageControl[] = ["brightness", "contrast", "shadows", "midtones", "highlights", "blackPoint", "whitePoint", "temperature", "tint", "vibrance", "saturation", "hue"];
export const TUNE_CONTROL_RANGES = {
  brightness: [-40, 40], contrast: [-35, 35], shadows: [-50, 50], highlights: [-50, 50], temperature: [-40, 40], vibrance: [-30, 50],
} as const;
export function tuneValue(values: Record<string, number | boolean>, key: TuneImageControl): number { const result = values[key]; return typeof result === "number" && Number.isFinite(result) ? Math.round(result) : 0; }
export function formatTuneValue(key: TuneImageControl, value: number): string { return key === "hue" ? `${value > 0 ? "+" : ""}${value}°` : `${value > 0 ? "+" : ""}${value}`; }
export function isOutsideGuidedRange(key: GuidedTuneImageControl, candidate: number): boolean { const [minimum, maximum] = TUNE_CONTROL_RANGES[key]; return candidate < minimum || candidate > maximum; }
