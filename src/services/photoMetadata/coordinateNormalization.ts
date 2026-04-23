import {
    normalizeStoredPhotoBox,
    readCanonicalStoredPhotoBox,
    type StoredPhotoBox,
} from '../faces/faceImageGeometry';
import type {
    PhotoMetadataBlock,
    PhotoMetadataRegionOfInterest,
    PhotoMetadataSubject,
} from './types';

type SubjectLike = Omit<PhotoMetadataSubject, 'bounding_box'> & {
    bounding_box: unknown;
};

type RegionLike = Omit<PhotoMetadataRegionOfInterest, 'bounding_box'> & {
    bounding_box: unknown;
};

export type PhotoMetadataCoordinateSpace = {
    width?: number | null | undefined;
    height?: number | null | undefined;
};

type ResolvedPhotoMetadataCoordinateSpace = {
    width: number;
    height: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFinitePositiveNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function readStoredPhotoBoxCandidate(value: unknown): StoredPhotoBox | null {
    if (!isRecord(value)) {
        return null;
    }

    if (typeof value.x !== 'number'
        || typeof value.y !== 'number'
        || typeof value.width !== 'number'
        || typeof value.height !== 'number'
        || !Number.isFinite(value.x)
        || !Number.isFinite(value.y)
        || !Number.isFinite(value.width)
        || !Number.isFinite(value.height)) {
        return null;
    }

    return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
    };
}

function hasCoordinateSpace(value: PhotoMetadataCoordinateSpace | undefined): value is ResolvedPhotoMetadataCoordinateSpace {
    return isFinitePositiveNumber(value?.width) && isFinitePositiveNumber(value?.height);
}

function fitsWithinPixelDimensions(
    box: StoredPhotoBox,
    coordinateSpace: ResolvedPhotoMetadataCoordinateSpace,
): boolean {
    return box.x >= 0
        && box.y >= 0
        && box.width > 0
        && box.height > 0
        && box.x + box.width <= coordinateSpace.width
        && box.y + box.height <= coordinateSpace.height;
}

function isObviouslyPixelSpace(
    box: StoredPhotoBox,
    coordinateSpace: ResolvedPhotoMetadataCoordinateSpace,
): boolean {
    return fitsWithinPixelDimensions(box, coordinateSpace)
        && (box.x > 1000
            || box.y > 1000
            || box.width > 1000
            || box.height > 1000
            || box.x + box.width > 1000
            || box.y + box.height > 1000);
}

function normalizePixelSpaceBox(
    box: StoredPhotoBox,
    coordinateSpace: ResolvedPhotoMetadataCoordinateSpace,
): StoredPhotoBox | null {
    return normalizeStoredPhotoBox({
        x: box.x / coordinateSpace.width,
        y: box.y / coordinateSpace.height,
        width: box.width / coordinateSpace.width,
        height: box.height / coordinateSpace.height,
    });
}

function normalizePhotoMetadataBoundingBox(
    value: unknown,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
): StoredPhotoBox | null {
    const canonical = readCanonicalStoredPhotoBox(value);
    if (canonical) {
        return canonical;
    }

    if (Array.isArray(value)) {
        return normalizeStoredPhotoBox(value);
    }

    const rawBox = readStoredPhotoBoxCandidate(value);
    if (!rawBox) {
        return null;
    }

    if (hasCoordinateSpace(coordinateSpace) && isObviouslyPixelSpace(rawBox, coordinateSpace)) {
        const pixelSpaceBox = normalizePixelSpaceBox(rawBox, coordinateSpace);
        if (pixelSpaceBox) {
            return pixelSpaceBox;
        }
    }

    return normalizeStoredPhotoBox(rawBox);
}

function normalizeSubject(
    subject: SubjectLike,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
): PhotoMetadataSubject | null {
    const boundingBox = normalizePhotoMetadataBoundingBox(subject.bounding_box, coordinateSpace);
    if (!boundingBox) {
        return null;
    }

    return {
        ...subject,
        bounding_box: boundingBox,
    };
}

function normalizeRegionOfInterest(
    region: RegionLike,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
): PhotoMetadataRegionOfInterest | null {
    const boundingBox = normalizePhotoMetadataBoundingBox(region.bounding_box, coordinateSpace);
    if (!boundingBox) {
        return null;
    }

    return {
        ...region,
        bounding_box: boundingBox,
    };
}

export function normalizePhotoMetadataBlockBoxes(
    block: PhotoMetadataBlock,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
): PhotoMetadataBlock {
    return {
        ...block,
        subjects: block.subjects
            .map((subject) => normalizeSubject(subject, coordinateSpace))
            .filter((subject): subject is PhotoMetadataSubject => subject !== null),
        regions_of_interest: block.regions_of_interest
            .map((region) => normalizeRegionOfInterest(region, coordinateSpace))
            .filter((region): region is PhotoMetadataRegionOfInterest => region !== null),
    };
}

export function normalizePhotoMetadataSubjects(value: unknown, coordinateSpace?: PhotoMetadataCoordinateSpace): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!isRecord(entry)) {
            return [];
        }

        const normalized = normalizeSubject(entry as SubjectLike, coordinateSpace);
        return normalized ? [normalized] : [];
    });
}

export function normalizePhotoMetadataRegionsOfInterest(
    value: unknown,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!isRecord(entry)) {
            return [];
        }

        const normalized = normalizeRegionOfInterest(entry as RegionLike, coordinateSpace);
        return normalized ? [normalized] : [];
    });
}

export function readCanonicalPhotoMetadataSubjects(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!isRecord(entry) || !readCanonicalStoredPhotoBox(entry.bounding_box)) {
            return [];
        }

        return [entry];
    });
}

export function readCanonicalPhotoMetadataRegionsOfInterest(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!isRecord(entry) || !readCanonicalStoredPhotoBox(entry.bounding_box)) {
            return [];
        }

        return [entry];
    });
}
