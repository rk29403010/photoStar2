import type { Asset, PhotoEditOperation, PhotoEditTool } from "../../../boundary/contracts/core.ts";
import type {
  AutomaticBox,
  AutomaticPhotoAnalysis,
  AutomaticPhotoContext,
} from "../../../shared/photoEditing/automatic.ts";
import { frameCropBox } from "../../../shared/photoEditing/automatic.ts";
import { FOCUS_DEFAULTS, FOCUS_SHAPE, writeFocusPoints } from "../../../shared/photoEditing/focus.ts";
import { readNormalizedBox } from "./maskCandidates.ts";

export type PhotoAutomaticSuggestion = {
  confidence: number;
  id: string;
  label: string;
  name: string;
  rationale: string;
  tool: PhotoEditTool;
  values: Record<string, number | boolean>;
};

function frameBox(asset: Asset): AutomaticBox | null {
  const frame = asset.frame_detection;
  if (!frame) {
    return null;
  }
  const box = readNormalizedBox(frame.box);
  if (box) {
    return box;
  }
  const points = frame.points ?? [];
  if (points.length < 3) {
    return null;
  }
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  return readNormalizedBox({ x: left, y: top, width: right - left, height: bottom - top });
}

function metadataBoxes(asset: Asset, field: "regionsOfInterest" | "subjects"): AutomaticBox[] {
  return (asset.photo_metadata?.projection[field] ?? [])
    .map(readNormalizedBox)
    .filter((box): box is AutomaticBox => box !== null);
}

export function automaticContextFromAsset(asset: Asset): AutomaticPhotoContext {
  const faceBoxes = (asset.faces ?? [])
    .map((face) => readNormalizedBox(face.box))
    .filter((box): box is AutomaticBox => box !== null);
  return {
    attentionBoxes: [
      ...metadataBoxes(asset, "subjects"),
      ...metadataBoxes(asset, "regionsOfInterest"),
    ],
    faceBoxes,
    frameBox: frameBox(asset),
    sceneHint: asset.photo_metadata?.projection.type ?? null,
  };
}

function cropSuggestion(
  analysis: AutomaticPhotoAnalysis,
  context: AutomaticPhotoContext,
): PhotoAutomaticSuggestion | null {
  const detectedFrame = frameCropBox(context);
  const box = detectedFrame ?? analysis.attentionCrop;
  if (!box || box.width * box.height > 0.94) {
    return null;
  }
  return {
    confidence: detectedFrame ? 0.98 : Math.min(0.82, analysis.confidence),
    id: detectedFrame ? "automatic-frame-crop" : "automatic-attention-crop",
    label: detectedFrame ? "Remove detected frame" : "Crop around the subject",
    name: detectedFrame ? "Remove detected frame" : "Smart subject crop",
    rationale: detectedFrame
      ? "Uses the photo boundary saved by the ingest workflow."
      : "Keeps detected faces and important regions with comfortable breathing room.",
    tool: "crop",
    values: { ...box },
  };
}

function rotationSuggestion(analysis: AutomaticPhotoAnalysis): PhotoAutomaticSuggestion | null {
  if (analysis.straightenAngle === 0 || analysis.straightenConfidence < 0.28) {
    return null;
  }
  return {
    confidence: analysis.straightenConfidence,
    id: "automatic-straighten",
    label: `Straighten ${Math.abs(analysis.straightenAngle).toFixed(1)}°`,
    name: "Automatic straighten",
    rationale: "Aligns the strongest repeated horizontal or vertical lines. EXIF orientation is already handled separately.",
    tool: "rotate",
    values: {
      angle: analysis.straightenAngle,
      pivotX: 0.5,
      pivotY: 0.5,
      expandCanvas: false,
      fillMode: 0,
      flipHorizontal: false,
      flipVertical: false,
    },
  };
}

function focusSuggestion(
  analysis: AutomaticPhotoAnalysis,
  context: AutomaticPhotoContext,
): PhotoAutomaticSuggestion | null {
  if (context.faceBoxes.length === 0) {
    return null;
  }
  const points = context.faceBoxes.slice(0, 5).map((box) => ({
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  }));
  const values = writeFocusPoints({
    ...FOCUS_DEFAULTS,
    shape: FOCUS_SHAPE.circular,
    size: context.faceBoxes.length === 1 ? 0.24 : 0.16,
    falloff: 0.24,
    strength: 0.32,
  }, points, 0);
  return {
    confidence: Math.min(0.9, analysis.confidence),
    id: "automatic-portrait-focus",
    label: context.faceBoxes.length === 1 ? "Portrait focus" : "Group focus",
    name: "Automatic portrait focus",
    rationale: `Places ${points.length} focus ${points.length === 1 ? "point" : "points"} on detected faces and gently softens the background.`,
    tool: "focus",
    values,
  };
}

export function buildPhotoAutomaticSuggestions(
  asset: Asset,
  analysis: AutomaticPhotoAnalysis,
  semanticGeometrySafe = true,
): PhotoAutomaticSuggestion[] {
  const assetContext = automaticContextFromAsset(asset);
  const context = semanticGeometrySafe
    ? assetContext
    : { ...assetContext, attentionBoxes: [], faceBoxes: [], frameBox: null };
  return [
    cropSuggestion(analysis, context),
    rotationSuggestion(analysis),
    focusSuggestion(analysis, context),
  ].filter((suggestion): suggestion is PhotoAutomaticSuggestion => suggestion !== null);
}

export function mergeAutomaticSuggestions(
  operations: PhotoEditOperation[],
  suggestions: PhotoAutomaticSuggestion[],
): PhotoEditOperation[] {
  return suggestions.reduce((current, suggestion) => {
    let existingIndex = -1;
    for (let index = current.length - 1; index >= 0; index -= 1) {
      if (current[index].tool === suggestion.tool) {
        existingIndex = index;
        break;
      }
    }
    if (existingIndex < 0) {
      return [...current, {
        id: crypto.randomUUID(),
        tool: suggestion.tool,
        name: suggestion.name,
        enabled: true,
        maskId: null,
        values: { ...suggestion.values },
      }];
    }
    return current.map((operation, index) => index === existingIndex
      ? { ...operation, values: { ...operation.values, ...suggestion.values } }
      : operation);
  }, operations);
}
