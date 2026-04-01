import type { PhotoMetadataBundle } from '../contracts/core';
import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';

export interface RecordPhotoMetadataAssertionInput {
    assetId: string;
    fieldPath: string;
    value: unknown;
    userId: string;
    note?: string | null;
    includeEvidence?: boolean;
}

function requireResponseData(data: Record<string, unknown> | undefined, command: string): Record<string, unknown> {
    if (data) {return data;}
    throw new Error(`Missing response data for ${command}`);
}

export function createPhotoMetadataActions(params: { request: RequestFn }) {
    return {
        getPhotoMetadata: (assetId: string, includeEvidence = true): Promise<PhotoMetadataBundle> => params.request<PhotoMetadataBundle>({
            idPrefix: `get_photo_metadata_${assetId}`,
            command: 'get_photo_metadata',
            payload: { assetId, includeEvidence },
            timeoutMs: 10000,
            select: (data) => requireResponseData(data, 'get_photo_metadata').photo_metadata as PhotoMetadataBundle,
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
            select: (data) => {
                const response = requireResponseData(data, 'record_photo_metadata_assertion');
                return {
                    manualAssertion: response.manualAssertion as Record<string, unknown>,
                    photo_metadata: response.photo_metadata as PhotoMetadataBundle,
                };
            },
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
            select: (data) => String(requireResponseData(data, 'start_selected_subject_metadata_workflow').runId || ''),
        }),
        recalculatePhotoDate: (assetId: string): Promise<string> => params.request<string>({
            idPrefix: `recalculate_photo_date_${assetId}`,
            command: 'start_library_photo_date_workflow',
            payload: { mediaId: assetId },
            timeoutMs: 10000,
            select: (data) => String(requireResponseData(data, 'start_library_photo_date_workflow').runId || ''),
        }),
    };
}
