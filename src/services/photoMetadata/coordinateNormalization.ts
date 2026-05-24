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

type Transform = { sx: number; sy: number; dx: number; dy: number };

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

function evaluateCandidateTranslation(
    cand: Transform,
    subjectCenters: Point[],
    faceCenters: Point[],
    tolerance: number,
): { matches: number; totalDistance: number } {
    let matches = 0;
    let totalDistance = 0;
    const matchedFaces = new Set<number>();

    for (const sc of subjectCenters) {
        const transformedX = sc.x * cand.sx + cand.dx;
        const transformedY = sc.y * cand.sy + cand.dy;

        let closestFaceIdx = -1;
        let closestDist = Infinity;

        for (let i = 0; i < faceCenters.length; i++) {
            if (matchedFaces.has(i)) {
                continue;
            }
            const fc = faceCenters[i]!;
            const dist = Math.hypot(fc.x - transformedX, fc.y - transformedY);
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

function findBestTranslation(
    candidates: Transform[],
    subjectCenters: Point[],
    faceCenters: Point[],
): Transform | null {
    let bestTranslation: Transform | null = null;
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

    return maxMatchCount > 0 ? bestTranslation : null;
}

function validateAndAlignScale(sx: number, sy: number): { sx: number; sy: number } | null {
    const sxValid = sx >= 0.5 && sx <= 1.1;
    const syValid = sy >= 0.5 && sy <= 1.1;

    if (!sxValid && !syValid) {
        return null;
    }

    return {
        sx: sxValid ? sx : sy,
        sy: syValid ? sy : sx,
    };
}

function calculateCandidateFromPairs(
    s1: Point,
    f1: Point,
    f2: Point,
    dxS: number,
    dyS: number,
): Transform | null {
    const sx = Math.abs(dxS) >= 0.01 ? (f1.x - f2.x) / dxS : 1.0;
    const sy = Math.abs(dyS) >= 0.01 ? (f1.y - f2.y) / dyS : 1.0;

    const scale = validateAndAlignScale(sx, sy);
    if (!scale) {
        return null;
    }

    const dx = f1.x - scale.sx * s1.x;
    const dy = f1.y - scale.sy * s1.y;

    if (dx >= -0.1 && dx <= 0.5 && dy >= -0.1 && dy <= 0.5) {
        return { sx: scale.sx, sy: scale.sy, dx, dy };
    }

    return null;
}

function findFacePairCandidates(
    s1: Point,
    dxS: number,
    dyS: number,
    faceCenters: Point[],
): Transform[] {
    const list: Transform[] = [];
    for (let a = 0; a < faceCenters.length; a++) {
        for (let b = 0; b < faceCenters.length; b++) {
            if (a === b) {
                continue;
            }
            const cand = calculateCandidateFromPairs(s1, faceCenters[a]!, faceCenters[b]!, dxS, dyS);
            if (cand) {
                list.push(cand);
            }
        }
    }
    return list;
}

function generateScaleTranslationCandidates(
    subjectCenters: Point[],
    faceCenters: Point[],
): Transform[] {
    const candidates: Transform[] = [];

    for (let i = 0; i < subjectCenters.length; i++) {
        for (let j = i + 1; j < subjectCenters.length; j++) {
            const s1 = subjectCenters[i]!;
            const s2 = subjectCenters[j]!;
            const dxS = s1.x - s2.x;
            const dyS = s1.y - s2.y;

            if (Math.hypot(dxS, dyS) < 0.01) {
                continue;
            }

            const faceCandidates = findFacePairCandidates(s1, dxS, dyS, faceCenters);
            candidates.push(...faceCandidates);
        }
    }

    return candidates;
}

export function solveConsensusTranslation(
    faces: LocalFaceLike[] | undefined,
    subjects: SubjectLike[],
): Transform | null {
    if (!faces || faces.length === 0 || subjects.length === 0) {
        return null;
    }

    const faceCenters = getFaceCenters(faces);
    const subjectCenters = getSubjectCenters(subjects);
    if (faceCenters.length === 0 || subjectCenters.length === 0) {
        return null;
    }

    const candidates: Transform[] = [];

    // 1. Always generate translation-only candidates (scale = 1.0) for every face-subject pair
    for (const fc of faceCenters) {
        for (const sc of subjectCenters) {
            candidates.push({
                sx: 1.0,
                sy: 1.0,
                dx: fc.x - sc.x,
                dy: fc.y - sc.y,
            });
        }
    }

    // 2. Generate scale + translation candidates from pairs of subjects/faces
    const scaleTranslationCandidates = generateScaleTranslationCandidates(subjectCenters, faceCenters);
    candidates.push(...scaleTranslationCandidates);

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
    translation?: Transform | null,
): StoredPhotoBox | null {
    const canonical = resolveCanonicalBox(value, coordinateSpace);
    if (!canonical) {
        return null;
    }

    if (translation) {
        const sx = translation.sx ?? 1.0;
        const sy = translation.sy ?? 1.0;
        const width = cleanFloat(canonical.width * sx);
        const height = cleanFloat(canonical.height * sy);
        const x = Math.max(0, Math.min(1 - width, cleanFloat(canonical.x * sx + translation.dx)));
        const y = Math.max(0, Math.min(1 - height, cleanFloat(canonical.y * sy + translation.dy)));
        return {
            x,
            y,
            width,
            height,
        };
    }

    return canonical;
}

function normalizeSubject(
    subject: SubjectLike,
    coordinateSpace?: PhotoMetadataCoordinateSpace,
    translation?: Transform | null,
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
    translation?: Transform | null,
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
