import type { Asset, PhotoEditOperation } from '@contracts/core';
import type { AutomaticPhotoAnalysis } from '@shared/photoEditing/automatic';

export type PhotoAutomaticSuggestion = {
  confidence: number;
  id: string;
  label: string;
  name: string;
  operationPolicy?: 'append' | 'update-latest';
  order?: number;
  provider?: string;
  rationale: string;
  recipeVersion?: number;
  tool: PhotoEditOperation['tool'];
  values: Record<string, number | boolean>;
};
export type PhotoEditToolSuggestionPlugin = { id: string; suggestAutomatic: (params: { analysis: AutomaticPhotoAnalysis; asset: Asset; semanticGeometrySafe: boolean }) => PhotoAutomaticSuggestion | null };
