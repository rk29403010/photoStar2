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

export type LocalFaceLike = {
    box: StoredPhotoBox;
};

function cleanFloat(value: number): number {
    return Number.parseFloat(value.toFixed(6));
}

function getBoxCenter(box: StoredPhotoBox) {
    return {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
    };
}

type Point = { x: number; y: number };

function evaluateCandidateTranslation(
    cand: { dx: number; dy: number },
    subjectCenters: Point[],
    faceCenters: Point[],
    tolerance: number,
): { matches: number; totalDistance: number } {
    let matches = 0;
    let totalDistance = 0;
    const matchedFaces = new Set<number>();

    for (const sc of subjectCenters) {
        const shiftedX = sc.x + cand.dx;
        const shiftedY = sc.y + cand.dy;

        let closestFaceIdx = -1;
        let closestDist = Infinity;

        for (let i = 0; i < faceCenters.length; i++) {
            if (matchedFaces.has(i)) {
                continue;
            }
            const fc = faceCenters[i]!;
            const dist = Math.hypot(fc.x - shiftedX, fc.y - shiftedY);
            if (dist < closestDist) {
                closestDist = dist;
                closestFaceIdx = i;
            }
        }

        if (closestFaceIdx !== -1 && closestDist < tolerance) {
            matches += 1;
            totalDistance += closestDist;
            matchedFaces.add(closestFaceIdx);
        }
    }

    return { matches, totalDistance };
}

function getFaceCenters(faces: LocalFaceLike[] | undefined): Point[] {
    if (!faces) {
        return [];
    }
    return faces
        .map((f) => f.box ? getBoxCenter(f.box) : null)
        .filter((c): c is Point => c !== null);
}

function getSubjectCenters(subjects: SubjectLike[]): Point[] {
    const personSubjects = subjects.filter((s) => {
        const type = typeof s.type === 'string' ? s.type : 'person';
        return type === 'person';
    });
    return personSubjects
        .map((s) => {
            const box = readCanonicalStoredPhotoBox(s.bounding_box);
            return box ? getBoxCenter(box) : null;
        })
        .filter((c): c is Point => c !== null);
}

function findBestTranslation(
    candidates: Array<{ dx: number; dy: number }>,
    subjectCenters: Point[],
    faceCenters: Point[],
): { dx: number; dy: number } | null {
    let bestTranslation: { dx: number; dy: number } | null = null;
    let maxMatchCount = 0;
    let minAverageDistance = Infinity;
    const TOLERANCE = 0.12;

    for (const cand of candidates) {
        const { matches, totalDistance } = evaluateCandidateTranslation(
            cand,
            subjectCenters,
            faceCenters,
            TOLERANCE,
        );

        if (matches > maxMatchCount || (matches === maxMatchCount && totalDistance / (matches || 1) < minAverageDistance)) {
            maxMatchCount = matches;
            minAverageDistance = totalDistance / (matches || 1);
            bestTranslation = cand;
        }
    }

    return bestTranslation;
}

export function solveConsensusTranslation(
    faces: LocalFaceLike[] | undefined,
    subjects: SubjectLike[],
): { dx: number; dy: number } | null {
    if (!faces || faces.length === 0 || subjects.length === 0) {
        return null;
    }

    const faceCenters = getFaceCenters(faces);
    const subjectCenters = getSubjectCenters(subjects);
    if (faceCenters.length === 0 || subjectCenters.length === 0) {
        return null;
    }

    const candidates: Array<{ dx: number; dy: number }> = [];
    for (const fc of faceCenters) {
        for (const sc of subjectCenters) {
            candidates.push({ dx: fc.x - sc.x, dy: fc.y - sc.y });
        }
    }

    return findBestTranslation(candidates, subjectCenters, faceCenters);
}


function resolveCanonicalBox(
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

function normalizePhotoMetadataBoundingBox(
    value: unknown,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
    translation?: { dx: number; dy: number } | null,
): StoredPhotoBox | null {
    const canonical = resolveCanonicalBox(value, coordinateSpace);
    if (!canonical) {
        return null;
    }

    if (translation) {
        const x = Math.max(0, Math.min(1 - canonical.width, cleanFloat(canonical.x + translation.dx)));
        const y = Math.max(0, Math.min(1 - canonical.height, cleanFloat(canonical.y + translation.dy)));
        return {
            x,
            y,
            width: canonical.width,
            height: canonical.height,
        };
    }

    return canonical;
}

function normalizeSubject(
    subject: SubjectLike,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
    translation?: { dx: number; dy: number } | null,
): PhotoMetadataSubject | null {
    const boundingBox = normalizePhotoMetadataBoundingBox(subject.bounding_box, coordinateSpace, translation);
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
    translation?: { dx: number; dy: number } | null,
): PhotoMetadataRegionOfInterest | null {
    const boundingBox = normalizePhotoMetadataBoundingBox(region.bounding_box, coordinateSpace, translation);
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
    faces?: LocalFaceLike[],
): PhotoMetadataBlock {
    const translation = solveConsensusTranslation(faces, block.subjects as SubjectLike[]);

    return {
        ...block,
        subjects: block.subjects
            .map((subject) => normalizeSubject(subject as SubjectLike, coordinateSpace, translation))
            .filter((subject): subject is PhotoMetadataSubject => subject !== null),
        regions_of_interest: block.regions_of_interest
            .map((region) => normalizeRegionOfInterest(region as RegionLike, coordinateSpace, translation))
            .filter((region): region is PhotoMetadataRegionOfInterest => region !== null),
    };
}

export function normalizePhotoMetadataSubjects(
    value: unknown,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
    faces?: LocalFaceLike[],
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

    const translation = solveConsensusTranslation(faces, subjects);

    return subjects.flatMap((entry) => {
        const normalized = normalizeSubject(entry, coordinateSpace, translation);
        return normalized ? [normalized] : [];
    });
}

export function normalizePhotoMetadataRegionsOfInterest(
    value: unknown,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
    faces?: LocalFaceLike[],
    subjects?: unknown[],
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

    const subjectsList = Array.isArray(subjects)
        ? subjects.flatMap((entry) => (isRecord(entry) ? [entry as SubjectLike] : []))
        : [];

    const translation = solveConsensusTranslation(faces, subjectsList);

    return regions.flatMap((entry) => {
        const normalized = normalizeRegionOfInterest(entry, coordinateSpace, translation);
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
