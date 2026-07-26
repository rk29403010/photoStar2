import type { Asset, PhotoEditOperation } from '@contracts/core';
import type { AutomaticPhotoAnalysis } from '@shared/photoEditing/automatic';

export type PhotoAutomaticSuggestion = { confidence: number; id: string; label: string; name: string; rationale: string; tool: PhotoEditOperation['tool']; values: Record<string, number | boolean> };
export type PhotoEditToolSuggestionPlugin = { id: string; suggestAutomatic: (params: { analysis: AutomaticPhotoAnalysis; asset: Asset; semanticGeometrySafe: boolean }) => PhotoAutomaticSuggestion | null };
