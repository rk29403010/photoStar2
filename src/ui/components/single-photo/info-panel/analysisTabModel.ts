import type { Asset } from '@contracts/core';
import { buildPhotoMetadataAnalysisSummary } from './photoMetadataPanelModel';

export interface AnalysisDetails {
  mode?: string;
  caption?: string;
  tags: string[];
  notes?: string;
}

type AnalysisAssetSource = Pick<Asset, 'ai_metadata' | 'caption'>;

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function getStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

export function buildAnalysisDetails(asset: AnalysisAssetSource): AnalysisDetails {
  const summary = buildPhotoMetadataAnalysisSummary(asset as Asset);
  const ai = asset.ai_metadata;
  return {
    mode: getOptionalString(ai?.mode),
    caption: summary.caption ?? getOptionalString(asset.caption),
    tags: getStringList(ai?.tags),
    notes: summary.description ?? getOptionalString(ai?.notes),
  };
}
