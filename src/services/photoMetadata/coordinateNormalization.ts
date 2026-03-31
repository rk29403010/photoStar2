import { normalizeStoredPhotoBox, readCanonicalStoredPhotoBox } from '../faces/faceImageGeometry';
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSubject(subject: SubjectLike): PhotoMetadataSubject | null {
    const boundingBox = normalizeStoredPhotoBox(subject.bounding_box);
    if (!boundingBox) {
        return null;
    }

    return {
        ...subject,
        bounding_box: boundingBox,
    };
}

function normalizeRegionOfInterest(region: RegionLike): PhotoMetadataRegionOfInterest | null {
    const boundingBox = normalizeStoredPhotoBox(region.bounding_box);
    if (!boundingBox) {
        return null;
    }

    return {
        ...region,
        bounding_box: boundingBox,
    };
}

export function normalizePhotoMetadataBlockBoxes(block: PhotoMetadataBlock): PhotoMetadataBlock {
    return {
        ...block,
        subjects: block.subjects
            .map((subject) => normalizeSubject(subject))
            .filter((subject): subject is PhotoMetadataSubject => subject !== null),
        regions_of_interest: block.regions_of_interest
            .map((region) => normalizeRegionOfInterest(region))
            .filter((region): region is PhotoMetadataRegionOfInterest => region !== null),
    };
}

export function normalizePhotoMetadataSubjects(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!isRecord(entry)) {
            return [];
        }

        const normalized = normalizeSubject(entry as SubjectLike);
        return normalized ? [normalized] : [];
    });
}

export function normalizePhotoMetadataRegionsOfInterest(value: unknown): unknown[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.flatMap((entry) => {
        if (!isRecord(entry)) {
            return [];
        }

        const normalized = normalizeRegionOfInterest(entry as RegionLike);
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
