import type { DatabaseManager } from '../../data/db';
import type {
    AnalysisResult, AnalysisSource, AnalysisStage, StoredAnalysisClaim, RefinementTarget,
} from '../../shared/photoAnalysis/contracts';
import type { AnalysisImageSource, CanonicalPhotoBox } from './geometry';

export type AnalysisDb = ReturnType<DatabaseManager['getDb']>;
export type PersistAnalysisRunInput = {
    assetId: string;
    runId?: string;
    stage: AnalysisStage;
    provider: string;
    modelVersion: string | null;
    promptVersion: string;
    result: AnalysisResult;
    sources: AnalysisSource[];
    images?: AnalysisImageSource[];
    telemetry?: Record<string, unknown>;
    targets?: RefinementTarget[];
};
export type StoredAnalysisRun = {
    id: string; assetId: string; stage: AnalysisStage; provider: string;
    modelVersion: string | null; promptVersion: string; createdAt: string;
    status: 'successful' | 'failed';
    telemetry: Record<string, unknown>; targets: RefinementTarget[];
    refinementOpportunities: AnalysisResult['refinementOpportunities'];
};
export type StoredAnalysisRegion = AnalysisResult['regions'][number] & {
    runId: string; fullPhotoBox: CanonicalPhotoBox;
};
export type LoadedAnalysis = {
    runs: StoredAnalysisRun[]; claims: StoredAnalysisClaim[]; winners: StoredAnalysisClaim[];
    sources: AnalysisSource[]; images: AnalysisImageSource[]; regions: StoredAnalysisRegion[];
    refinementOpportunities: AnalysisResult['refinementOpportunities'];
    enhancementRecommendations: Extract<StoredAnalysisClaim, {field: 'enhancements'}>['value'];
};
