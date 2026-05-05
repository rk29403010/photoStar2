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

function buildRationale(input: PhotoDateCorrectionInput): string {
    const base = `Manual date review flagged this photo as ${input.reasonCode}.`;
    if (!input.note || input.note.trim().length === 0) {
        return base;
    }
    return `${base} ${input.note.trim()}`;
}

type PhotoLibraryActions = ReturnType<typeof usePhotoLibrary>['actions'];

export function usePhotoDateReviewHandler(actions: PhotoLibraryActions) {
    return useCallback(async (input: PhotoDateCorrectionInput) => {
        const note = buildStructuredNote(input);

        await actions.recordPhotoMetadataAssertion({
            assetId: input.assetId,
            fieldPath: 'estimated_date.most_likely_date',
            value: input.correctedDate.trim(),
            userId: PHOTO_DATE_REVIEW_USER_ID,
            note,
            includeEvidence: true,
        });
        await actions.recordPhotoMetadataAssertion({
            assetId: input.assetId,
            fieldPath: 'estimated_date.display_label',
            value: input.correctedDate.trim(),
            userId: PHOTO_DATE_REVIEW_USER_ID,
            note,
            includeEvidence: true,
        });
        await actions.recordPhotoMetadataAssertion({
            assetId: input.assetId,
            fieldPath: 'estimated_date.rationale',
            value: buildRationale(input),
            userId: PHOTO_DATE_REVIEW_USER_ID,
            note,
            includeEvidence: true,
        });

        await actions.loadAssetDetails(input.assetId, { includeEvidence: true });
        await actions.recalculatePhotoDates(input.assetId);
    }, [actions]);
}
