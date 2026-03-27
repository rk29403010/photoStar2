import type { PhotoMetadataBundle } from '../contracts/core';

type RequestArgs<T> = {
    idPrefix: string;
    command: string;
    payload?: Record<string, unknown>;
    timeoutMs?: number;
    select: (data: Record<string, unknown>) => T;
};

type RequestFn = <T>(args: RequestArgs<T>) => Promise<T>;

export interface RecordPhotoMetadataAssertionInput {
    assetId: string;
    fieldPath: string;
    value: unknown;
    userId: string;
    note?: string | null;
    includeEvidence?: boolean;
}

export function createPhotoMetadataActions(params: { request: RequestFn }) {
    return {
        getPhotoMetadata: (assetId: string, includeEvidence = true): Promise<PhotoMetadataBundle> => params.request<PhotoMetadataBundle>({
            idPrefix: `get_photo_metadata_${assetId}`,
            command: 'get_photo_metadata',
            payload: { assetId, includeEvidence },
            timeoutMs: 10000,
            select: (data) => data.photo_metadata as PhotoMetadataBundle,
        }),
        recordPhotoMetadataAssertion: (input: RecordPhotoMetadataAssertionInput): Promise<{ manualAssertion: Record<string, unknown>; photo_metadata: PhotoMetadataBundle }> => params.request({
            idPrefix: `record_photo_metadata_assertion_${input.assetId}_${Date.now()}`,
            command: 'record_photo_metadata_assertion',
            payload: {
                assetId: input.assetId,
                fieldPath: input.fieldPath,
                value: input.value,
                userId: input.userId,
                note: input.note ?? null,
                includeEvidence: input.includeEvidence === true,
            },
            timeoutMs: 10000,
            select: (data) => ({
                manualAssertion: data.manualAssertion as Record<string, unknown>,
                photo_metadata: data.photo_metadata as PhotoMetadataBundle,
            }),
        }),
        refinePhotoMetadata: (
            assetId: string,
            options: {
                aiMode?: 'mock' | 'live' | 'off';
                imageStrategy?: 'overview_only' | 'overview_plus_tiles';
            } = {},
        ): Promise<string> => params.request<string>({
            idPrefix: `refine_photo_metadata_${assetId}`,
            command: 'start_selected_subject_metadata_workflow',
            payload: {
                aiMode: options.aiMode ?? 'live',
                imageStrategy: options.imageStrategy ?? 'overview_plus_tiles',
                selectedSubjects: [{ subjectType: 'asset', subjectId: assetId }],
            },
            timeoutMs: 10000,
            select: (data) => String(data.runId || ''),
        }),
    };
}
