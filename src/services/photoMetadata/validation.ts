import {
    PHOTO_METADATA_ASSERTION_FIELD_PATHS,
    type PhotoMetadataAssertionFieldPath,
} from './fieldPaths';
import type {
    PhotoMetadataAuthenticity,
    PhotoMetadataBoundingBox,
    PhotoMetadataBlock,
    PhotoMetadataEstimatedDate,
    PhotoMetadataQuality,
    PhotoMetadataRegionOfInterest,
    PhotoMetadataSubject,
} from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === 'string';
}

function isNullableIsoDate(value: unknown): value is string | null {
    return value === null || isIsoDateString(value);
}

function isDateOnly(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isUtcIsoDateTime(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
}

function isValidCalendarDate(value: string): boolean {
    if (!isDateOnly(value)) {
        return false;
    }

    const [year, month, day] = value.split('-').map((part) => Number(part));
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    return utcDate.getUTCFullYear() === year
        && utcDate.getUTCMonth() === month - 1
        && utcDate.getUTCDate() === day;
}

function isValidUtcDateTime(value: string): boolean {
    if (!isUtcIsoDateTime(value)) {
        return false;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return false;
    }

    const canonical = parsed.toISOString();
    return canonical === value || canonical === `${value.slice(0, -1)}.000Z`;
}

export function isIsoDateString(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false;
    }

    return isValidCalendarDate(value) || isValidUtcDateTime(value);
}

export function normalizeIsoDateOrNull(value: unknown): string | null {
    if (value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();
    return isIsoDateString(trimmed) ? trimmed : null;
}

export function isPhotoMetadataFieldPath(value: unknown): value is PhotoMetadataAssertionFieldPath {
    return typeof value === 'string' && PHOTO_METADATA_ASSERTION_FIELD_PATHS.includes(value as PhotoMetadataAssertionFieldPath);
}

export function isPhotoMetadataBoundingBox(value: unknown): value is PhotoMetadataBoundingBox {
    return isPlainObject(value)
        && isFiniteNumber(value.x)
        && isFiniteNumber(value.y)
        && isFiniteNumber(value.width)
        && isFiniteNumber(value.height);
}

function hasEstimatedDateShape(value: Record<string, unknown>): boolean {
    if (typeof value.display_label !== 'string') {
        return false;
    }

    return isNullableIsoDate(value.most_likely_date)
        && isNullableIsoDate(value.min_date)
        && isNullableIsoDate(value.max_date)
        && isNullableString(value.rationale);
}

export function isPhotoMetadataEstimatedDate(value: unknown): value is PhotoMetadataEstimatedDate {
    return isPlainObject(value) && hasEstimatedDateShape(value);
}

function hasSubjectIdentityShape(value: Record<string, unknown>): boolean {
    if (typeof value.label !== 'string') {
        return false;
    }
    if (!isPhotoMetadataBoundingBox(value.bounding_box)) {
        return false;
    }
    if (value.type !== 'person' && value.type !== 'pet') {
        return false;
    }
    return typeof value.location_desc === 'string';
}

function hasSubjectOptionalShape(value: Record<string, unknown>): boolean {
    return isNullableString(value.gender)
        && isNullableString(value.animal_type)
        && isNullableString(value.age_range)
        && isNullableString(value.dob_range)
        && isNullableString(value.emotion)
        && isNullableString(value.gaze)
        && isNullableString(value.features)
        && isNullableString(value.uniform)
        && isStringArray(value.suggested_names);
}

export function isPhotoMetadataSubject(value: unknown): value is PhotoMetadataSubject {
    return isPlainObject(value) && hasSubjectIdentityShape(value) && hasSubjectOptionalShape(value);
}

export function isPhotoMetadataRegionOfInterest(value: unknown): value is PhotoMetadataRegionOfInterest {
    return isPlainObject(value)
        && typeof value.label === 'string'
        && typeof value.kind === 'string'
        && isPhotoMetadataBoundingBox(value.bounding_box)
        && isNullableString(value.significance);
}

export function isPhotoMetadataQuality(value: unknown): value is PhotoMetadataQuality {
    return isPlainObject(value)
        && isFiniteNumber(value.technical)
        && isFiniteNumber(value.lighting)
        && isFiniteNumber(value.composition)
        && isFiniteNumber(value.emotional)
        && typeof value.discard === 'boolean';
}

export function isPhotoMetadataAuthenticity(value: unknown): value is PhotoMetadataAuthenticity {
    return isPlainObject(value)
        && isFiniteNumber(value.score)
        && isStringArray(value.reasons);
}

function hasBlockCoreShape(value: Record<string, unknown>): boolean {
    return typeof value.type === 'string'
        && typeof value.caption === 'string'
        && typeof value.description === 'string'
        && typeof value.location === 'string'
        && isPhotoMetadataEstimatedDate(value.estimated_date);
}

function hasBlockEvidenceShape(value: Record<string, unknown>): boolean {
    if (!Array.isArray(value.subjects) || !value.subjects.every(isPhotoMetadataSubject)) {
        return false;
    }
    if (!Array.isArray(value.regions_of_interest) || !value.regions_of_interest.every(isPhotoMetadataRegionOfInterest)) {
        return false;
    }
    if (!isStringArray(value.keywords)) {
        return false;
    }
    if (typeof value.emotional_impact !== 'string') {
        return false;
    }
    if (!isPhotoMetadataQuality(value.quality)) {
        return false;
    }
    if (!Array.isArray(value.recommended_enhancements) || !value.recommended_enhancements.every((item) => typeof item === 'string')) {
        return false;
    }
    return isPhotoMetadataAuthenticity(value.authenticity);
}

export function isPhotoMetadataBlock(value: unknown): value is PhotoMetadataBlock {
    return isPlainObject(value) && hasBlockCoreShape(value) && hasBlockEvidenceShape(value);
}
