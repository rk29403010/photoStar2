import type { Asset, PhotoEditOperation } from "../../../boundary/contracts/core.ts";
import type { AutomaticPhotoAnalysis } from "../../../shared/photoEditing/automatic.ts";
import { generatedPhotoEditToolSuggestionPlugins } from './generatedPhotoEditToolSuggestionRegistry.ts';
import type { PhotoAutomaticSuggestion } from './photoEditToolSuggestionRegistry.ts';
export { automaticContextFromAsset } from '../../../services/photoEditing/tools/automaticContext.ts';

export type { PhotoAutomaticSuggestion } from './photoEditToolSuggestionRegistry.ts';

export function buildPhotoAutomaticSuggestions(
  asset: Asset,
  analysis: AutomaticPhotoAnalysis,
  semanticGeometrySafe = true,
): PhotoAutomaticSuggestion[] {
  return generatedPhotoEditToolSuggestionPlugins
    .map((plugin) => plugin.suggestAutomatic({ analysis, asset, semanticGeometrySafe }))
    .filter((suggestion): suggestion is PhotoAutomaticSuggestion => suggestion !== null);
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
