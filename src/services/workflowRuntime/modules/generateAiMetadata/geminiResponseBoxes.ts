import { normalizeStoredPhotoBox } from '../../../faces/faceImageGeometry';
import type { GeminiResponse } from './geminiTypes';

type ImageStrategy = 'overview_only' | 'overview_plus_tiles';
type IndexedCropRegion = {
    imageIndex: number;
    left: number;
    top: number;
    width: number;
    height: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSourceImageIndex(value: Record<string, unknown>): number | null {
    return typeof value.source_image_index === 'number' && Number.isInteger(value.source_image_index)
        ? value.source_image_index
        : null;
}

function readBoundingBoxCoordinateSpace(value: Record<string, unknown>): 'full_photo' | 'crop_local' | null {
    return value.bounding_box_coordinate_space === 'full_photo' || value.bounding_box_coordinate_space === 'crop_local'
        ? value.bounding_box_coordinate_space
        : null;
}

function createGeminiResponseContractError(message: string): Error {
    const error = new Error(`Gemini response violated the requested image-part contract: ${message}`);
    error.name = 'GeminiResponseContractError';
    return error;
}

function isOutOfRangeSourceImageIndex(sourceImageIndex: number | null, imagePartCount: number): sourceImageIndex is number {
    return sourceImageIndex !== null && (sourceImageIndex < 1 || sourceImageIndex > imagePartCount);
}

function isOverviewOnlySourceImageMismatch(params: {
    imageStrategy: ImageStrategy;
    sourceImageIndex: number | null;
}): params is { imageStrategy: 'overview_only'; sourceImageIndex: number } {
    return params.imageStrategy !== 'overview_plus_tiles'
        && params.sourceImageIndex !== null
        && params.sourceImageIndex !== 1;
}

function isOverviewOnlyCropLocalMismatch(params: {
    imageStrategy: ImageStrategy;
    coordinateSpace: 'full_photo' | 'crop_local' | null;
}): boolean {
    return params.coordinateSpace === 'crop_local' && params.imageStrategy !== 'overview_plus_tiles';
}

function isMissingDetailCropReference(params: {
    coordinateSpace: 'full_photo' | 'crop_local' | null;
    sourceImageIndex: number | null;
}): boolean {
    return params.coordinateSpace === 'crop_local'
        && (params.sourceImageIndex === null || params.sourceImageIndex < 2);
}

function createContractMessage(params: {
    sourceImageIndex: number | null;
    coordinateSpace: 'full_photo' | 'crop_local' | null;
    imageStrategy: ImageStrategy;
    imagePartCount: number;
    entryKind: 'subject' | 'region';
    entryIndex: number;
}): string | null {
    const entryLabel = `${params.entryKind} #${params.entryIndex + 1}`;
    if (isOutOfRangeSourceImageIndex(params.sourceImageIndex, params.imagePartCount)) {
        return `${entryLabel} referenced source_image_index=${params.sourceImageIndex} but only ${params.imagePartCount} image part(s) were sent.`;
    }
    if (isOverviewOnlySourceImageMismatch({
        imageStrategy: params.imageStrategy,
        sourceImageIndex: params.sourceImageIndex,
    })) {
        return `${entryLabel} referenced source_image_index=${params.sourceImageIndex} during an overview-only request.`;
    }
    if (isOverviewOnlyCropLocalMismatch({
        imageStrategy: params.imageStrategy,
        coordinateSpace: params.coordinateSpace,
    })) {
        return `${entryLabel} used crop_local coordinates during an overview-only request.`;
    }
    if (isMissingDetailCropReference({
        coordinateSpace: params.coordinateSpace,
        sourceImageIndex: params.sourceImageIndex,
    })) {
        return `${entryLabel} used crop_local coordinates without pointing to a detail crop image.`;
    }
    return null;
}

function assertGeminiEntryContract(params: {
    entry: unknown;
    imageStrategy: ImageStrategy;
    imagePartCount: number;
    entryKind: 'subject' | 'region';
    entryIndex: number;
}): void {
    if (!isRecord(params.entry)) {
        return;
    }

    const message = createContractMessage({
        sourceImageIndex: readSourceImageIndex(params.entry),
        coordinateSpace: readBoundingBoxCoordinateSpace(params.entry),
        imageStrategy: params.imageStrategy,
        imagePartCount: params.imagePartCount,
        entryKind: params.entryKind,
        entryIndex: params.entryIndex,
    });
    if (message) {
        throw createGeminiResponseContractError(message);
    }
}

function remapCropLocalBoxToFullPhoto(params: {
    box: unknown;
    tileRegion: IndexedCropRegion;
    imageWidth: number;
    imageHeight: number;
}): { x: number; y: number; width: number; height: number } | null {
    const localBox = normalizeStoredPhotoBox(params.box);
    if (!localBox) {
        return null;
    }

    return normalizeStoredPhotoBox({
        x: (params.tileRegion.left / params.imageWidth) + ((localBox.x * params.tileRegion.width) / params.imageWidth),
        y: (params.tileRegion.top / params.imageHeight) + ((localBox.y * params.tileRegion.height) / params.imageHeight),
        width: (localBox.width * params.tileRegion.width) / params.imageWidth,
        height: (localBox.height * params.tileRegion.height) / params.imageHeight,
    });
}

function remapGeminiEntryBoxFromTileSpace(params: {
    entry: unknown;
    tileRegions: IndexedCropRegion[];
    imageWidth: number | null;
    imageHeight: number | null;
}): unknown {
    if (!isRecord(params.entry)) {
        return params.entry;
    }

    const sourceImageIndex = readSourceImageIndex(params.entry);
    const coordinateSpace = readBoundingBoxCoordinateSpace(params.entry);
    if (coordinateSpace !== 'crop_local' || sourceImageIndex === null || !params.imageWidth || !params.imageHeight) {
        return params.entry;
    }

    const tileRegion = params.tileRegions.find((candidate) => candidate.imageIndex === sourceImageIndex);
    if (!tileRegion) {
        return params.entry;
    }

    const remappedBoundingBox = remapCropLocalBoxToFullPhoto({
        box: params.entry.bounding_box,
        tileRegion,
        imageWidth: params.imageWidth,
        imageHeight: params.imageHeight,
    });
    if (!remappedBoundingBox) {
        return params.entry;
    }

    return {
        ...params.entry,
        bounding_box: remappedBoundingBox,
        bounding_box_coordinate_space: 'full_photo',
    };
}

export function isGeminiResponseContractError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'GeminiResponseContractError';
}

export function assertGeminiResponseContract(params: {
    response: GeminiResponse;
    imageStrategy: ImageStrategy;
    imagePartCount: number;
}): void {
    params.response.subjects.forEach((subject, index) => {
        assertGeminiEntryContract({
            entry: subject,
            imageStrategy: params.imageStrategy,
            imagePartCount: params.imagePartCount,
            entryKind: 'subject',
            entryIndex: index,
        });
    });
    params.response.regions_of_interest.forEach((region, index) => {
        assertGeminiEntryContract({
            entry: region,
            imageStrategy: params.imageStrategy,
            imagePartCount: params.imagePartCount,
            entryKind: 'region',
            entryIndex: index,
        });
    });
}

function repairOverviewOnlyEntry(entry: unknown): { entry: unknown; didRepair: boolean } {
    if (!isRecord(entry)) {
        return { entry, didRepair: false };
    }

    let didRepair = false;
    const next: Record<string, unknown> = { ...entry };
    const sourceImageIndex = readSourceImageIndex(next);
    if (sourceImageIndex !== null && sourceImageIndex !== 1) {
        next.source_image_index = 1;
        didRepair = true;
    }
    if (readBoundingBoxCoordinateSpace(next) === 'crop_local') {
        next.bounding_box_coordinate_space = 'full_photo';
        didRepair = true;
    }

    return { entry: next, didRepair };
}

/**
 * Overview-only requests send a single image; Gemini sometimes tags boxes as crop_local or references
 * non-existent tile indices. Coerce those fields so contract validation does not trigger a blind retry
 * that can reshuffle which boxes are wrong.
 */
export function repairGeminiOverviewOnlyResponseMetadata(
    response: GeminiResponse,
    imageStrategy: ImageStrategy,
): GeminiResponse {
    if (imageStrategy !== 'overview_only') {
        return response;
    }

    let repairCount = 0;
    const repairList = (entries: unknown): unknown => {
        if (!Array.isArray(entries)) {
            return entries;
        }

        return entries.map((entry) => {
            const { entry: repaired, didRepair } = repairOverviewOnlyEntry(entry);
            if (didRepair) {
                repairCount += 1;
            }
            return repaired;
        });
    };

    const repaired: GeminiResponse = {
        ...response,
        subjects: repairList(response.subjects) as GeminiResponse['subjects'],
        regions_of_interest: repairList(response.regions_of_interest) as GeminiResponse['regions_of_interest'],
    };

    if (repairCount > 0) {
        console.warn(
            `[AI Metadata] Repaired ${repairCount} Gemini entries for overview-only (source_image_index / bounding_box_coordinate_space).`,
        );
    }

    return repaired;
}

export function remapGeminiResponseBoxesFromTileSpace(params: {
    response: GeminiResponse;
    tileRegions: IndexedCropRegion[];
    imageWidth: number | null;
    imageHeight: number | null;
}): GeminiResponse {
    return {
        ...params.response,
        subjects: Array.isArray(params.response.subjects)
            ? params.response.subjects.map((subject) => remapGeminiEntryBoxFromTileSpace({
                entry: subject,
                tileRegions: params.tileRegions,
                imageWidth: params.imageWidth,
                imageHeight: params.imageHeight,
            })) as GeminiResponse['subjects']
            : params.response.subjects,
        regions_of_interest: Array.isArray(params.response.regions_of_interest)
            ? params.response.regions_of_interest.map((region) => remapGeminiEntryBoxFromTileSpace({
                entry: region,
                tileRegions: params.tileRegions,
                imageWidth: params.imageWidth,
                imageHeight: params.imageHeight,
            })) as GeminiResponse['regions_of_interest']
            : params.response.regions_of_interest,
    };
}
