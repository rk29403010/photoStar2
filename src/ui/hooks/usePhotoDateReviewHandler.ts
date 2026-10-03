import { useCallback } from 'react';
import type { usePhotoLibrary } from './usePhotoLibrary';

export type PhotoDateReviewReasonCode =
    | 'scanned_or_edited'
    | 'born_digital_exif_wrong'
    | 'ai_right_metadata_wrong'
    | 'ai_wrong_metadata_right'
    | 'manual_family_knowledge';

export type PhotoDateCorrectionInput = {
    assetId: string;
    correctedDate: string;
    reasonCode: PhotoDateReviewReasonCode;
    note?: string;
}

const PHOTO_DATE_REVIEW_USER_ID = 'photo-date-review';

function buildStructuredNote(input: PhotoDateCorrectionInput): string {
    const lines = [`photo_date_review_reason=${input.reasonCode}`];
    if (input.note && input.note.trim().length > 0) {
        lines.push(input.note.trim());
    }
    return lines.join('\n');
}

type PhotoLibraryActions = ReturnType<typeof usePhotoLibrary>['actions'];

export function usePhotoDateReviewHandler(actions: PhotoLibraryActions) {
    return useCallback(async (input: PhotoDateCorrectionInput) => {
        const note = buildStructuredNote(input);

        await actions.recordPhotoMetadataAssertion({
            assetId: input.assetId, fieldPath: 'date',
            value: { start: input.correctedDate.trim(), end: input.correctedDate.trim(), label: input.correctedDate.trim() },
            userId: PHOTO_DATE_REVIEW_USER_ID, note, includeEvidence: true,
        });

        await actions.loadAssetDetails(input.assetId, { includeEvidence: true });
        await actions.recalculatePhotoDates(input.assetId);
    }, [actions]);
}
