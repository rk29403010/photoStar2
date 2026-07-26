import type { Asset, PhotoEditOperation } from "../../../boundary/contracts/core.ts";
import type { PhotoEditToolPlugin } from '../../../services/photoEditing/photoEditToolPlugin.ts';
import { automaticContextFromAsset } from '../../../services/photoEditing/tools/automaticContext.ts';
import type { AutomaticPhotoAnalysis } from "../../../shared/photoEditing/automatic.ts";
import { generatedPhotoEditToolSuggestionPlugins } from './generatedPhotoEditToolSuggestionRegistry.ts';
import type { PhotoAutomaticSuggestion } from './photoEditToolSuggestionRegistry.ts';
export { automaticContextFromAsset } from '../../../services/photoEditing/tools/automaticContext.ts';

export type { PhotoAutomaticSuggestion } from './photoEditToolSuggestionRegistry.ts';

export function buildPhotoAutomaticSuggestions(
  asset: Asset,
  analysis: AutomaticPhotoAnalysis,
  semanticGeometrySafe = true,
  providers?: readonly PhotoEditToolPlugin[],
): PhotoAutomaticSuggestion[] {
  if (providers) {
    return providers.flatMap((provider, index) => {
      try {
        const suggestion = provider.suggest?.({ asset, analysis, context: automaticContextFromAsset(asset), semanticGeometrySafe });
        return suggestion ? [{ ...suggestion, provider: provider.id, tool: provider.id, index }] : [];
      } catch { return []; }
    }).sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.index - right.index)
      .map(({ index: _index, ...suggestion }) => suggestion);
  }
  return generatedPhotoEditToolSuggestionPlugins
    .map((plugin) => plugin.suggestAutomatic({ analysis, asset, semanticGeometrySafe }))
    .filter((suggestion): suggestion is PhotoAutomaticSuggestion => suggestion !== null);
}

export function mergeAutomaticSuggestions(
  operations: PhotoEditOperation[],
  suggestions: PhotoAutomaticSuggestion[],
  providers?: readonly PhotoEditToolPlugin[],
): PhotoEditOperation[] {
  return suggestions.reduce((current, suggestion) => {
    let existingIndex = -1;
    for (let index = current.length - 1; index >= 0; index -= 1) {
      if (current[index].tool === suggestion.tool) {
        existingIndex = index;
        break;
      }
    }
    const provider = providers?.find((candidate) => candidate.id === suggestion.provider || candidate.id === suggestion.tool);
    const base = { ...provider?.defaults, ...suggestion.values };
    const operation = provider?.migrateOperation
      ? provider.migrateOperation({ id: crypto.randomUUID(), tool: suggestion.tool, name: suggestion.name, enabled: true, maskId: null, values: base }, suggestion.recipeVersion ?? provider.recipeVersion)
      : { id: crypto.randomUUID(), tool: suggestion.tool, name: suggestion.name, enabled: true, maskId: null, values: base };
    provider?.validateOperation?.(operation);
    if (existingIndex < 0 || suggestion.operationPolicy === 'append') {
      return [...current, {
        ...operation,
      }];
    }
    return current.map((existing, index) => index === existingIndex
      ? { ...operation, id: existing.id, values: { ...existing.values, ...operation.values } }
      : existing);
  }, operations);
}
