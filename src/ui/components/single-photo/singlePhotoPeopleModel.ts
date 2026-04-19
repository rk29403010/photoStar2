import type { Asset, FaceBox, PhotoMetadataSourceSummary } from '../../../boundary/contracts/core.ts';
import { readCanonicalStoredPhotoBox } from '../../../services/faces/faceImageGeometry.ts';

type SubjectRecord = Record<string, unknown>;
type BoundingBoxRecord = Record<string, unknown>;

export type SinglePhotoPeopleKind =
    | 'local-face'
    | 'resolved-person'
    | 'remote-subject'
    | 'region-of-interest';

export interface SinglePhotoPeopleColor {
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

export interface SinglePhotoOverlayBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface SinglePhotoPeopleItem {
    key: string;
    kind: SinglePhotoPeopleKind;
    label: string;
    box: SinglePhotoOverlayBox;
    sourceLabel?: string;
    detail?: string;
    tags: string[];
    icon: string;
    raw: unknown;
}

export interface SinglePhotoPeopleModel {
    peopleItems: SinglePhotoPeopleItem[];
    regionsOfInterest: SinglePhotoPeopleItem[];
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
};

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

function getBoxCenter(box: SinglePhotoOverlayBox) {
    return {
        x: box.x + (box.w / 2),
        y: box.y + (box.h / 2),
    };
}

function isPointInsideBox(point: { x: number; y: number }, box: SinglePhotoOverlayBox): boolean {
    return point.x >= box.x
        && point.x <= box.x + box.w
        && point.y >= box.y
        && point.y <= box.y + box.h;
}

function computeIntersectionArea(left: SinglePhotoOverlayBox, right: SinglePhotoOverlayBox): number {
    const x1 = Math.max(left.x, right.x);
    const y1 = Math.max(left.y, right.y);
    const x2 = Math.min(left.x + left.w, right.x + right.w);
    const y2 = Math.min(left.y + left.h, right.y + right.h);
    return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function hasMeaningfulOverlap(subjectBox: SinglePhotoOverlayBox, faceBox: SinglePhotoOverlayBox): boolean {
    const faceCenter = getBoxCenter(faceBox);
    if (isPointInsideBox(faceCenter, subjectBox)) {
        return true;
    }

    const intersection = computeIntersectionArea(subjectBox, faceBox);
    const faceArea = faceBox.w * faceBox.h;
    return faceArea > 0 && (intersection / faceArea) >= 0.35;
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

function isAiSubjectSource(source: PhotoMetadataSourceSummary | undefined): boolean {
    return source?.sourceKind === 'gemini_flash_scout' || source?.sourceKind === 'gemini_pro_refined';
}

function isPersonSubject(subject: SubjectRecord): boolean {
    return (asString(subject.type) ?? 'person') === 'person';
}

function shouldSnapSubjectToFace(subjectBox: SinglePhotoOverlayBox, faceBox: SinglePhotoOverlayBox): boolean {
    if (hasMeaningfulOverlap(subjectBox, faceBox)) {
        return false;
    }

    const subjectCenter = getBoxCenter(subjectBox);
    const faceCenter = getBoxCenter(faceBox);
    const horizontalDelta = Math.abs(faceCenter.x - subjectCenter.x);
    const verticalDelta = Math.abs(faceCenter.y - subjectCenter.y);
    const maxHorizontalDelta = Math.max(
        0.04,
        Math.min(0.12, Math.max(subjectBox.w, faceBox.w) * 1.1),
    );
    const maxVerticalDelta = Math.max(0.16, subjectBox.h * 6, faceBox.h * 6);

    return horizontalDelta <= maxHorizontalDelta && verticalDelta <= maxVerticalDelta;
}

function scoreFaceMatch(subjectBox: SinglePhotoOverlayBox, faceBox: SinglePhotoOverlayBox): number {
    const subjectCenter = getBoxCenter(subjectBox);
    const faceCenter = getBoxCenter(faceBox);
    const horizontalDelta = Math.abs(faceCenter.x - subjectCenter.x);
    const verticalDelta = Math.abs(faceCenter.y - subjectCenter.y);
    const widthDelta = Math.abs(faceBox.w - subjectBox.w);
    const heightDelta = Math.abs(faceBox.h - subjectBox.h);
    return (horizontalDelta * 5) + (verticalDelta * 2) + widthDelta + heightDelta;
}

function resolveSubjectDisplayBox(params: {
    asset: Asset;
    subject: SubjectRecord;
    source: PhotoMetadataSourceSummary | undefined;
    subjectBox: SinglePhotoOverlayBox;
}): SinglePhotoOverlayBox {
    if (!isAiSubjectSource(params.source) || !isPersonSubject(params.subject)) {
        return params.subjectBox;
    }

    const candidateFaces = (params.asset.faces ?? [])
        .map(buildFaceBox)
        .filter((box): box is SinglePhotoOverlayBox => box !== null)
        .filter((faceBox) => shouldSnapSubjectToFace(params.subjectBox, faceBox));

    if (candidateFaces.length === 0) {
        return params.subjectBox;
    }

    const [bestFace] = candidateFaces
        .map((faceBox) => ({ faceBox, score: scoreFaceMatch(params.subjectBox, faceBox) }))
        .sort((left, right) => left.score - right.score);

    return bestFace ? bestFace.faceBox : params.subjectBox;
}

function buildSubjectItems(asset: Asset): SinglePhotoPeopleItem[] {
    const subjects = (asset.photo_metadata?.projection.subjects ?? [])
        .filter(isRecord) as SubjectRecord[];
    const sourceLabel = buildSourceLabel(asset.photo_metadata?.provenance?.subjects, asset);
    const source = asset.photo_metadata?.provenance?.subjects;

    return subjects.flatMap((subject, index) => {
        const box = normalizeBoundingBox(subject.bounding_box);
        if (!box) {
            return [];
        }

        const displayBox = resolveSubjectDisplayBox({
            asset,
            subject,
            source,
            subjectBox: box,
        });

        return [{
            key: `subject-${index}`,
            kind: 'remote-subject' as const,
            label: asString(subject.label) ?? `Subject ${index + 1}`,
            box: displayBox,
            sourceLabel,
            detail: asString(subject.location_desc) ?? asString(subject.features),
            tags: [
                ...asStringArray(subject.suggested_names),
                ...[asString(subject.type), asString(subject.emotion), asString(subject.age_range)].filter(Boolean) as string[],
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

export function buildSinglePhotoPeopleModel(asset: Asset): SinglePhotoPeopleModel {
    return {
        peopleItems: [
            ...buildFaceItems(asset),
            ...buildSubjectItems(asset),
        ],
        regionsOfInterest: buildRegionOfInterestItems(asset),
    };
}
