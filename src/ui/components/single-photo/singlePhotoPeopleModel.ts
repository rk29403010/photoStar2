import type { Asset, FaceBox, NormalizedPoint, PhotoMaskMetadataItem, PhotoMetadataSourceSummary } from '../../../boundary/contracts/core.ts';
import { readCanonicalStoredPhotoBox } from '../../../services/faces/faceImageGeometry.ts';

type SubjectRecord = Record<string, unknown>;
type BoundingBoxRecord = Record<string, unknown>;

export type SinglePhotoPeopleKind =
    | 'local-face'
    | 'resolved-person'
    | 'remote-subject'
    | 'region-of-interest'
    | 'segmented-object';

export type SinglePhotoPeopleColor = {
    border: string;
    borderHover: string;
    glowRgb: string;
    labelBackground: string;
    labelText: string;
    panelBackground: string;
    panelBackgroundHover: string;
    panelBorder: string;
    panelBorderHover: string;
    panelText: string;
    panelMutedText: string;
    chipBackground: string;
    chipText: string;
}

export type SinglePhotoOverlayBox = {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type SinglePhotoPeopleItem = {
    key: string;
    kind: SinglePhotoPeopleKind;
    label: string;
    box: SinglePhotoOverlayBox;
    points?: NormalizedPoint[];
    sourceLabel?: string;
    detail?: string;
    tags: string[];
    icon: string;
    raw: unknown;
}

export type SinglePhotoPeopleModel = {
    peopleItems: SinglePhotoPeopleItem[];
    regionsOfInterest: SinglePhotoPeopleItem[];
    segmentedObjects: SinglePhotoPeopleItem[];
}

const SINGLE_PHOTO_PEOPLE_COLORS: Record<SinglePhotoPeopleKind, SinglePhotoPeopleColor> = {
    'local-face': {
        border: '#38bdf8',
        borderHover: '#e0f2fe',
        glowRgb: '56,189,248',
        labelBackground: 'rgba(8,47,73,0.88)',
        labelText: '#7dd3fc',
        panelBackground: 'rgba(14,116,144,0.08)',
        panelBackgroundHover: 'rgba(14,116,144,0.18)',
        panelBorder: 'rgba(56,189,248,0.22)',
        panelBorderHover: 'rgba(125,211,252,0.7)',
        panelText: '#7dd3fc',
        panelMutedText: '#94a3b8',
        chipBackground: 'rgba(14,116,144,0.35)',
        chipText: '#bae6fd',
    },
    'resolved-person': {
        border: '#22c55e',
        borderHover: '#dcfce7',
        glowRgb: '34,197,94',
        labelBackground: 'rgba(20,83,45,0.88)',
        labelText: '#86efac',
        panelBackground: 'rgba(34,197,94,0.08)',
        panelBackgroundHover: 'rgba(34,197,94,0.18)',
        panelBorder: 'rgba(34,197,94,0.24)',
        panelBorderHover: 'rgba(134,239,172,0.72)',
        panelText: '#86efac',
        panelMutedText: '#94a3b8',
        chipBackground: 'rgba(21,128,61,0.35)',
        chipText: '#dcfce7',
    },
    'remote-subject': {
        border: '#c084fc',
        borderHover: '#f5d0fe',
        glowRgb: '192,132,252',
        labelBackground: 'rgba(88,28,135,0.88)',
        labelText: '#e9d5ff',
        panelBackground: 'rgba(99,102,241,0.08)',
        panelBackgroundHover: 'rgba(99,102,241,0.18)',
        panelBorder: 'rgba(129,140,248,0.24)',
        panelBorderHover: 'rgba(216,180,254,0.72)',
        panelText: '#c4b5fd',
        panelMutedText: '#94a3b8',
        chipBackground: 'rgba(126,34,206,0.3)',
        chipText: '#e9d5ff',
    },
    'region-of-interest': {
        border: '#f59e0b',
        borderHover: '#fef3c7',
        glowRgb: '245,158,11',
        labelBackground: 'rgba(120,53,15,0.9)',
        labelText: '#fde68a',
        panelBackground: 'rgba(245,158,11,0.08)',
        panelBackgroundHover: 'rgba(245,158,11,0.18)',
        panelBorder: 'rgba(245,158,11,0.26)',
        panelBorderHover: 'rgba(252,211,77,0.72)',
        panelText: '#fcd34d',
        panelMutedText: '#94a3b8',
        chipBackground: 'rgba(180,83,9,0.35)',
        chipText: '#fef3c7',
    },
    'segmented-object': {
        border: '#fb7185',
        borderHover: '#ffe4e6',
        glowRgb: '251,113,133',
        labelBackground: 'rgba(136,19,55,0.9)',
        labelText: '#fecdd3',
        panelBackground: 'rgba(244,63,94,0.08)',
        panelBackgroundHover: 'rgba(244,63,94,0.18)',
        panelBorder: 'rgba(244,63,94,0.26)',
        panelBorderHover: 'rgba(253,164,175,0.72)',
        panelText: '#fda4af',
        panelMutedText: '#94a3b8',
        chipBackground: 'rgba(190,24,93,0.35)',
        chipText: '#ffe4e6',
    },
};

export type SinglePhotoOverlayMode = 'people' | 'objects' | null;

export function getVisibleSinglePhotoOverlayItems(asset: Asset, overlayMode: SinglePhotoOverlayMode): SinglePhotoPeopleItem[] {
    const model = buildSinglePhotoPeopleModel(asset);
    if (overlayMode === 'people') {
        return model.peopleItems;
    }
    if (overlayMode === 'objects') {
        return [...model.regionsOfInterest, ...model.segmentedObjects];
    }
    return [];
}

export function getSinglePhotoPeopleColor(kind: SinglePhotoPeopleKind): SinglePhotoPeopleColor {
    return SINGLE_PHOTO_PEOPLE_COLORS[kind];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
        : [];
}

function hasVisibleArea(box: SinglePhotoOverlayBox): boolean {
    return box.w > 0 && box.h > 0;
}

function cleanFloat(value: number): number {
    return Number.parseFloat(value.toFixed(6));
}


function normalizeBoundingBox(value: unknown): SinglePhotoOverlayBox | null {
    const box = readCanonicalStoredPhotoBox(value);
    if (!box) {
        return null;
    }

    const normalized = {
        x: box.x,
        y: box.y,
        w: box.width,
        h: box.height,
    };
    if (!hasVisibleArea(normalized)) {
        return null;
    }

    return normalized;
}

function lookupManualAuthor(source: PhotoMetadataSourceSummary | undefined, asset: Asset): string | undefined {
    if (!source?.sourceId) {
        return undefined;
    }

    const assertion = asset.photo_metadata?.evidence?.manualAssertions.find((candidate) => {
        if (!candidate || typeof candidate !== 'object') {
            return false;
        }

        return (candidate as { id?: string }).id === source.sourceId;
    });

    return assertion && typeof assertion === 'object'
        ? asString((assertion as { user_id?: unknown }).user_id)
        : undefined;
}

function buildSourceLabel(source: PhotoMetadataSourceSummary | undefined, asset: Asset): string | undefined {
    let label: string | undefined;

    switch (source?.sourceKind) {
        case undefined:
        case null:
            label = undefined;
            break;
        case 'gemini_pro_refined':
            label = 'Pro refined';
            break;
        case 'gemini_flash_scout':
            label = 'Flash scout';
            break;
        case 'manual':
        case 'manual_user':
            label = 'Manual';
            break;
        default:
            label = undefined;
            break;
    }

    if (label !== 'Manual') {
        return label;
    }

    const author = lookupManualAuthor(source, asset);
    return author ? `${label} · ${author}` : label;
}

function buildFaceItems(asset: Asset): SinglePhotoPeopleItem[] {
    return (asset.faces ?? []).flatMap((face, faceIndex) => {
        const box = buildFaceBox(face);
        if (!box) {
            return [];
        }

        return [buildFaceItem(asset, face, faceIndex, box)];
    });
}

function buildFaceBox(face: FaceBox): SinglePhotoOverlayBox | null {
    const box = readCanonicalStoredPhotoBox(face.box);
    if (!box) {
        return null;
    }

    return {
        x: box.x,
        y: box.y,
        w: box.width,
        h: box.height,
    };
}

function buildFaceItem(asset: Asset, face: FaceBox, faceIndex: number, box: SinglePhotoOverlayBox): SinglePhotoPeopleItem {
    const isResolved = Boolean(face.person_id || face.person_name);
    const kind: SinglePhotoPeopleKind = isResolved ? 'resolved-person' : 'local-face';

    return {
        key: `face-${faceIndex}`,
        kind,
        label: face.person_name || 'Unknown person',
        box,
        detail: isResolved ? `Face #${faceIndex + 1} matched by people resolution` : `Face #${faceIndex + 1} detected locally`,
        tags: face.embedding || asset.face_embeddings?.[faceIndex] ? ['embedding'] : [],
        icon: isResolved ? '🙂' : '👤',
        raw: face,
    };
}

function buildSubjectItems(asset: Asset): SinglePhotoPeopleItem[] {
    const subjects = (asset.photo_metadata?.projection.subjects ?? [])
        .filter(isRecord) as SubjectRecord[];
    const sourceLabel = buildSourceLabel(asset.photo_metadata?.provenance?.subjects, asset);

    return subjects.flatMap((subject, index) => {
        const box = normalizeBoundingBox(subject.bounding_box);
        if (!box) {
            return [];
        }

        return [{
            key: `subject-${index}`,
            kind: 'remote-subject' as const,
            label: asString(subject.label) ?? `Subject ${index + 1}`,
            box,
            sourceLabel,
            detail: asString(subject.location_desc) ?? asString(subject.features),
            tags: [
                ...asStringArray(subject.suggested_names),
                ...[asString(subject.type), asString(subject.emotion), asString(subject.age_range)].filter((value): value is string => Boolean(value)),
            ],
            icon: subject.type === 'pet' ? '🐾' : '🤖',
            raw: subject,
        }];
    });
}


function buildRegionOfInterestItems(asset: Asset): SinglePhotoPeopleItem[] {
    const regions = (asset.photo_metadata?.projection.regionsOfInterest ?? [])
        .filter(isRecord) as BoundingBoxRecord[];
    const sourceLabel = buildSourceLabel(asset.photo_metadata?.provenance?.regionsOfInterest, asset);

    return regions.flatMap((region, index) => {
        const box = normalizeBoundingBox(region.bounding_box);
        if (!box) {
            return [];
        }

        const kind = asString(region.kind);
        return [{
            key: `roi-${index}`,
            kind: 'region-of-interest' as const,
            label: asString(region.label) ?? `Region ${index + 1}`,
            box,
            sourceLabel,
            detail: asString(region.significance),
            tags: kind ? [kind] : [],
            icon: '🧭',
            raw: region,
        }];
    });
}

function polygonBox(points: NormalizedPoint[]): SinglePhotoOverlayBox | null {
    if (points.length < 3) {
        return null;
    }

    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    const x = cleanFloat(Math.min(...xValues));
    const y = cleanFloat(Math.min(...yValues));
    const w = cleanFloat(Math.max(...xValues) - x);
    const h = cleanFloat(Math.max(...yValues) - y);
    return hasVisibleArea({ x, y, w, h }) ? { x, y, w, h } : null;
}

function isObjectMask(mask: PhotoMaskMetadataItem): boolean {
    return !mask.inverted
        && mask.source.moduleId !== 'runtime.detect_frame'
        && (mask.points?.length ?? 0) >= 3;
}

function sourceLabelForMask(mask: PhotoMaskMetadataItem): string {
    switch (mask.source.moduleId) {
        case 'runtime.detect_faces':
            return 'Local segmentation';
        case 'runtime.generate_ai_metadata':
            return 'AI analysis';
        default:
            return mask.source.moduleId;
    }
}

function buildSegmentedObjectItems(asset: Asset): SinglePhotoPeopleItem[] {
    return (asset.mask_metadata?.masks ?? []).flatMap((mask) => {
        if (!isObjectMask(mask)) {
            return [];
        }

        const points = mask.points ?? [];
        const box = mask.box
            ? { x: mask.box.x, y: mask.box.y, w: mask.box.width, h: mask.box.height }
            : polygonBox(points);
        if (!box) {
            return [];
        }

        return [{
            key: `mask-${mask.source.moduleId}-${mask.source.referenceId}`,
            kind: 'segmented-object' as const,
            label: mask.label,
            box,
            points,
            sourceLabel: sourceLabelForMask(mask),
            detail: mask.description,
            tags: [mask.kind],
            icon: '◇',
            raw: mask,
        }];
    });
}

function calculateOverlapCoefficient(boxA: SinglePhotoOverlayBox, boxB: SinglePhotoOverlayBox): number {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
    const yB = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);

    const interWidth = Math.max(0, xB - xA);
    const interHeight = Math.max(0, yB - yA);
    const interArea = interWidth * interHeight;

    if (interArea === 0) {return 0;}

    const areaA = boxA.w * boxA.h;
    const areaB = boxB.w * boxB.h;

    return interArea / Math.min(areaA, areaB);
}

function findOverlappingFace(
    faces: SinglePhotoPeopleItem[],
    subject: SinglePhotoPeopleItem
): SinglePhotoPeopleItem | null {
    let bestMatch: SinglePhotoPeopleItem | null = null;
    let maxOverlap = 0.70;
    for (const face of faces) {
        const overlap = calculateOverlapCoefficient(face.box, subject.box);
        if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestMatch = face;
        }
    }
    return bestMatch;
}

function mergeSubjectIntoFace(
    face: SinglePhotoPeopleItem,
    subject: SinglePhotoPeopleItem
) {
    if (face.label === 'Unknown person' && subject.label && !subject.label.startsWith('Subject')) {
        face.label = subject.label;
    }
    if (subject.tags.length > 0) {
        face.tags = Array.from(new Set([...face.tags, ...subject.tags]));
    }
    if (subject.sourceLabel && !face.tags.includes(subject.sourceLabel)) {
        face.tags.push(subject.sourceLabel);
    }
    face.detail = `${face.detail || ''} | AI Subject: ${subject.label} (${subject.detail || ''})`.trim();
}

function coalescePeopleItems(
    faceItems: SinglePhotoPeopleItem[],
    subjectItems: SinglePhotoPeopleItem[]
): SinglePhotoPeopleItem[] {
    const result = [...faceItems];
    for (const subject of subjectItems) {
        const matchingFace = findOverlappingFace(result, subject);
        if (matchingFace) {
            mergeSubjectIntoFace(matchingFace, subject);
        } else {
            result.push(subject);
        }
    }
    return result;
}

export function buildSinglePhotoPeopleModel(asset: Asset): SinglePhotoPeopleModel {
    const faceItems = buildFaceItems(asset);
    const subjectItems = buildSubjectItems(asset);
    return {
        peopleItems: coalescePeopleItems(faceItems, subjectItems),
        regionsOfInterest: buildRegionOfInterestItems(asset),
        segmentedObjects: buildSegmentedObjectItems(asset),
    };
}
