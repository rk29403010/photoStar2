import {
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type LocalFaceLike = {
    box: StoredPhotoBox;
};

function normalizeSubject(
    subject: SubjectLike,
    _coordinateSpace?: PhotoMetadataCoordinateSpace,
): PhotoMetadataSubject | null {
    const boundingBox = readCanonicalStoredPhotoBox(subject.bounding_box);
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
    _coordinateSpace?: PhotoMetadataCoordinateSpace,
): PhotoMetadataRegionOfInterest | null {
    const boundingBox = readCanonicalStoredPhotoBox(region.bounding_box);
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
    _coordinateSpace?: PhotoMetadataCoordinateSpace,
    _faces?: LocalFaceLike[],
): PhotoMetadataBlock {
    return {
        ...block,
        subjects: block.subjects
            .map((subject) => normalizeSubject(subject as SubjectLike, _coordinateSpace))
            .filter((subject): subject is PhotoMetadataSubject => subject !== null),
        regions_of_interest: block.regions_of_interest
            .map((region) => normalizeRegionOfInterest(region as RegionLike, _coordinateSpace))
            .filter((region): region is PhotoMetadataRegionOfInterest => region !== null),
    };
}

export function normalizePhotoMetadataSubjects(
    value: unknown,
    _coordinateSpace?: PhotoMetadataCoordinateSpace,
    _faces?: LocalFaceLike[],
): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const subjects = value.flatMap((entry) => {
        if (!isRecord(entry)) {
            return [];
        }
        return [entry as SubjectLike];
    });

    return subjects.flatMap((entry) => {
        const normalized = normalizeSubject(entry, _coordinateSpace);
        return normalized ? [normalized] : [];
    });
}

export function normalizePhotoMetadataRegionsOfInterest(
    value: unknown,
    _coordinateSpace?: PhotoMetadataCoordinateSpace,
    _faces?: LocalFaceLike[],
    _subjects?: unknown[],
): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const regions = value.flatMap((entry) => {
        if (!isRecord(entry)) {
            return [];
        }
        return [entry as RegionLike];
    });

    return regions.flatMap((entry) => {
        const normalized = normalizeRegionOfInterest(entry, _coordinateSpace);
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
