import {
  Aperture,
  Blend,
  CloudSun,
  Contrast,
  Crop,
  Focus,
  ImageUp,
  Palette,
  ScanEye,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PhotoEditOperation, PhotoEditTool } from "@contracts/core";
import { PHOTO_EFFECT_DEFAULTS, PHOTO_EFFECT_KIND } from "@shared/photoEditing/effects";
import { FOCUS_DEFAULTS } from "@shared/photoEditing/focus";
import { RED_EYE_DEFAULTS } from "@shared/photoEditing/redEye";

export type ToolDefinition = {
  id: PhotoEditTool;
  label: string;
  icon: LucideIcon;
  defaults: Record<string, number | boolean>;
  controls: Array<{
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
  }>;
};

export const PHOTO_EDITOR_TOOLS: ToolDefinition[] = [
  {
    id: "adjust",
    label: "Tune image",
    icon: SlidersHorizontal,
    defaults: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      hue: 0,
      blackPoint: 0,
      midtones: 0,
      whitePoint: 0,
      shadows: 0,
      highlights: 0,
      temperature: 0,
      tint: 0,
      vibrance: 0,
    },
    controls: [
      { key: "brightness", label: "Brightness", min: -100, max: 100, step: 1 },
      { key: "contrast", label: "Contrast", min: -100, max: 100, step: 1 },
      { key: "shadows", label: "Shadows", min: -100, max: 100, step: 1 },
      { key: "midtones", label: "Midtones", min: -100, max: 100, step: 1 },
      { key: "highlights", label: "Highlights", min: -100, max: 100, step: 1 },
      { key: "blackPoint", label: "Black point", min: -100, max: 100, step: 1 },
      { key: "whitePoint", label: "White point", min: -100, max: 100, step: 1 },
      { key: "temperature", label: "Temperature", min: -100, max: 100, step: 1 },
      { key: "tint", label: "Tint", min: -100, max: 100, step: 1 },
      { key: "vibrance", label: "Vibrance", min: -100, max: 100, step: 1 },
      { key: "saturation", label: "Saturation", min: -100, max: 100, step: 1 },
      { key: "hue", label: "Hue", min: -180, max: 180, step: 1 },
    ],
  },
  {
    id: "crop",
    label: "Crop",
    icon: Crop,
    defaults: { x: 0, y: 0, width: 1, height: 1 },
    controls: [
      { key: "x", label: "Left", min: 0, max: 0.95, step: 0.01 },
      { key: "y", label: "Top", min: 0, max: 0.95, step: 0.01 },
      { key: "width", label: "Width", min: 0.05, max: 1, step: 0.01 },
      { key: "height", label: "Height", min: 0.05, max: 1, step: 0.01 },
    ],
  },
  {
    id: "rotate",
    label: "Rotate",
    icon: RotateCw,
    defaults: {
      angle: 0,
      pivotX: 0.5,
      pivotY: 0.5,
      expandCanvas: true,
      fillMode: 0,
      flipHorizontal: false,
      flipVertical: false,
    },
    controls: [],
  },
  {
    id: "blur",
    label: "Blur",
    icon: Blend,
    defaults: { sigma: 2 },
    controls: [
      { key: "sigma", label: "Strength", min: 0.3, max: 30, step: 0.1 },
    ],
  },
  {
    id: "dehaze",
    label: "Dehaze",
    icon: CloudSun,
    defaults: { strength: 0.45, radiusPercent: 1.5 },
    controls: [
      { key: "strength", label: "Fog removal", min: 0, max: 1, step: 0.01 },
      {
        key: "radiusPercent",
        label: "Detail radius",
        min: 0.5,
        max: 3,
        step: 0.25,
      },
    ],
  },
  {
    id: "colour_pop",
    label: "Colour pop",
    icon: Palette,
    defaults: { colourCount: 0, colourRange: 28, softness: 0.35 },
    controls: [],
  },
  {
    id: "effects",
    label: "Effects",
    icon: Sparkles,
    defaults: PHOTO_EFFECT_DEFAULTS[PHOTO_EFFECT_KIND.ripple],
    controls: [],
  },
  {
    id: "focus",
    label: "Focus",
    icon: Aperture,
    defaults: FOCUS_DEFAULTS,
    controls: [],
  },
  {
    id: "red_eye",
    label: "Red eye",
    icon: ScanEye,
    defaults: RED_EYE_DEFAULTS,
    controls: [],
  },
  {
    id: "sharpen",
    label: "Details",
    icon: Focus,
    defaults: { sigma: 1 },
    controls: [
      { key: "sigma", label: "Strength", min: 0.1, max: 5, step: 0.1 },
    ],
  },
  {
    id: "grayscale",
    label: "Black & white",
    icon: Contrast,
    defaults: {},
    controls: [],
  },
  {
    id: "restore",
    label: "Restore old photo",
    icon: ImageUp,
    defaults: {
      fadeRecovery: 1.08,
      contrast: 0.12,
      saturation: 1.08,
      denoise: 1,
      detail: 0.8,
    },
    controls: [
      {
        key: "fadeRecovery",
        label: "Fade recovery",
        min: 0.5,
        max: 2,
        step: 0.01,
      },
      { key: "contrast", label: "Contrast", min: -0.5, max: 1, step: 0.01 },
      {
        key: "saturation",
        label: "Colour recovery",
        min: 0,
        max: 2,
        step: 0.01,
      },
      { key: "denoise", label: "Dust reduction", min: 1, max: 5, step: 2 },
      { key: "detail", label: "Detail recovery", min: 0.1, max: 5, step: 0.1 },
    ],
  },
];

export function createPhotoEditOperation(
  tool: ToolDefinition,
): PhotoEditOperation {
  return {
    id: crypto.randomUUID(),
    tool: tool.id,
    name: tool.label,
    enabled: true,
    maskId: null,
    values: { ...tool.defaults },
  };
}
