import type { Asset } from '@contracts/core';
import { buildPhotoMetadataAnalysisSummary } from './photoMetadataPanelModel.ts';

export type AnalysisDetails = {
  mode?: string;
  tags: string[];
  description?: string;
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
    tags: getStringList(ai?.tags),
    description: summary.description ?? getOptionalString(ai?.notes),
  };
}
