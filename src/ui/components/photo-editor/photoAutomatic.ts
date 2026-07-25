import type { Asset, PhotoEditOperation, PhotoEditTool } from "../../../boundary/contracts/core.ts";
import { generatedPhotoEditToolPlugins } from "../../../services/photoEditing/generatedPhotoEditToolPluginRegistry.ts";
import type {
  PhotoEditAutomaticSuggestion,
  PhotoEditToolPlugin,
} from "../../../services/photoEditing/photoEditToolPlugin.ts";
import type {
  AutomaticBox,
  AutomaticPhotoAnalysis,
  AutomaticPhotoContext,
} from "../../../shared/photoEditing/automatic.ts";
import { readNormalizedBox } from "./maskCandidates.ts";

export type PhotoAutomaticSuggestion = PhotoEditAutomaticSuggestion & {
  provider: string;
  tool: PhotoEditTool;
};

function frameBox(asset: Asset): AutomaticBox | null {
  const frame = asset.frame_detection;
  if (!frame) { return null; }
  const box = readNormalizedBox(frame.box);
  if (box) { return box; }
  const points = frame.points ?? [];
  if (points.length < 3) { return null; }
  const left = Math.min(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const right = Math.max(...points.map((point) => point.x));
  const bottom = Math.max(...points.map((point) => point.y));
  return readNormalizedBox({ x: left, y: top, width: right - left, height: bottom - top });
}

function metadataBoxes(asset: Asset, field: "regionsOfInterest" | "subjects"): AutomaticBox[] {
  return (asset.photo_metadata?.projection[field] ?? []).map(readNormalizedBox)
    .filter((box): box is AutomaticBox => box !== null);
}

export function automaticContextFromAsset(asset: Asset): AutomaticPhotoContext {
  return {
    attentionBoxes: [...metadataBoxes(asset, "subjects"), ...metadataBoxes(asset, "regionsOfInterest")],
    faceBoxes: (asset.faces ?? []).map((face) => readNormalizedBox(face.box))
      .filter((box): box is AutomaticBox => box !== null),
    frameBox: frameBox(asset),
    sceneHint: asset.photo_metadata?.projection.type ?? null,
  };
}

function collectPluginSuggestion(
  plugin: PhotoEditToolPlugin,
  asset: Asset,
  analysis: AutomaticPhotoAnalysis,
  context: AutomaticPhotoContext,
  semanticGeometrySafe: boolean,
): PhotoAutomaticSuggestion | null {
  if (!plugin.suggest) { return null; }
  try {
    const suggestion = plugin.suggest({ asset, analysis, context, semanticGeometrySafe });
    if (!suggestion || (suggestion.requiresSemanticGeometry && !semanticGeometrySafe)) { return null; }
    return { ...suggestion, provider: plugin.id, tool: plugin.id };
  } catch {
    return null;
  }
}

export function buildPhotoAutomaticSuggestions(
  asset: Asset,
  analysis: AutomaticPhotoAnalysis,
  semanticGeometrySafe = true,
  plugins: readonly PhotoEditToolPlugin[] = generatedPhotoEditToolPlugins,
): PhotoAutomaticSuggestion[] {
  const context = automaticContextFromAsset(asset);
  return plugins.flatMap((plugin, index) => {
    const suggestion = collectPluginSuggestion(plugin, asset, analysis, context, semanticGeometrySafe);
    return suggestion ? [{ index, suggestion }] : [];
  }).sort((left, right) => (left.suggestion.order ?? 0) - (right.suggestion.order ?? 0) || left.index - right.index)
    .map(({ suggestion }) => suggestion);
}

function compatibleOperationIndex(operations: PhotoEditOperation[], tool: PhotoEditTool): number {
  for (let index = operations.length - 1; index >= 0; index -= 1) {
    if (operations[index].tool === tool) { return index; }
  }
  return -1;
}

function generatedOperation(plugin: PhotoEditToolPlugin | undefined, suggestion: PhotoAutomaticSuggestion): PhotoEditOperation {
  const operation: PhotoEditOperation = {
    id: crypto.randomUUID(), tool: suggestion.tool, name: suggestion.name, enabled: true, maskId: null,
    values: { ...plugin?.defaults, ...suggestion.values },
  };
  const migrated = plugin?.migrateOperation
    ? plugin.migrateOperation(operation, suggestion.recipeVersion ?? plugin.recipeVersion)
    : operation;
  plugin?.validateOperation?.(migrated);
  return migrated;
}

export function mergeAutomaticSuggestions(
  operations: PhotoEditOperation[],
  suggestions: PhotoAutomaticSuggestion[],
  plugins: readonly PhotoEditToolPlugin[] = generatedPhotoEditToolPlugins,
): PhotoEditOperation[] {
  const pluginsById = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  return suggestions.reduce((current, suggestion) => {
    const plugin = pluginsById.get(suggestion.provider);
    const generated = generatedOperation(plugin, suggestion);
    const existingIndex = suggestion.operationPolicy === "append"
      ? -1
      : compatibleOperationIndex(current, suggestion.tool);
    if (existingIndex < 0) { return [...current, generated]; }
    return current.map((operation, index) => index === existingIndex
      ? { ...operation, name: generated.name, values: { ...operation.values, ...generated.values } }
      : operation);
  }, operations);
}
