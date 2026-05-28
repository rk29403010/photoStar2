import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseManager } from '../data/db';
import { readFileSync } from 'node:fs';

type ExifParserModule = {
    create(buffer: Buffer): {
        parse(): {
            tags?: Record<string, unknown>;
        };
    };
};

async function loadExifParser(): Promise<ExifParserModule> {
    return await import('exif-parser') as ExifParserModule;
}

type EmbeddedBlockMap = {
    exif?: Record<string, unknown>;
    xmp?: Record<string, unknown>;
    iptc?: Record<string, unknown>;
    icc?: Record<string, unknown>;
};

type TimestampCandidate = {
    source: string;
    value: string;
};

export type EmbeddedMetadataPayload = {
    schema_version: 1;
    file: {
        path: string;
        format: string | null;
        width: number | null;
        height: number | null;
        orientation: number | null;
        density: number | null;
        space: string | null;
        channels: number | null;
        has_alpha: boolean | null;
        pages: number | null;
        is_progressive: boolean | null;
    };
    embedded: EmbeddedBlockMap;
    derived: {
        capture_datetime: string | null;
        timestamp_source: string | null;
        timestamp_candidates: TimestampCandidate[];
    };
}

type SharpMetadataLike = {
    format?: string;
    width?: number;
    height?: number;
    orientation?: number;
    density?: number;
    space?: string;
    channels?: number;
    hasAlpha?: boolean;
    pages?: number;
    isProgressive?: boolean;
    exif?: Buffer;
    xmp?: Buffer;
    iptc?: Buffer;
    icc?: Buffer;
};

type ParsedExifData = {
    tags?: Record<string, unknown>;
};

type BuildEmbeddedMetadataPayloadParams = {
    filePath: string;
    fileStats: {
        birthtime: Date;
    };
    metadata: SharpMetadataLike;
    parsedExif: ParsedExifData | null;
};

export type AssetMetadataSnapshot = {
    width: number | null;
    height: number | null;
    embeddedMetadata: EmbeddedMetadataPayload;
    captureDatetime: string | null;
    metadataTimestampSource: string | null;
}

type DbHandle = ReturnType<DatabaseManager['getDb']>;

type EmbeddedFileInfo = EmbeddedMetadataPayload['file'];
type EmbeddedDerivedInfo = EmbeddedMetadataPayload['derived'];

function toUtf8Text(buffer: Buffer): string | undefined {
    const text = buffer.toString('utf8').split('\u0000').join('').trim();
    if (!text) {
        return undefined;
    }

    const printableChars = Array.from(text).filter((char) => {
        const codePoint = char.codePointAt(0) ?? 0;
        return codePoint === 9 || codePoint === 10 || codePoint === 13 || (codePoint >= 32 && codePoint <= 126);
    }).length;

    if (printableChars / text.length < 0.85) {
        return undefined;
    }

    return text;
}

function toReadableScalar(value: unknown): unknown {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Buffer.isBuffer(value)) {
        return `[binary ${value.length} bytes]`;
    }
    if (Array.isArray(value)) {
        return value.map((item) => toReadableScalar(item));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, toReadableScalar(nestedValue)]),
        );
    }
    return value;
}

function decodeUtf16Le(buf: Buffer): string {
    let str = buf.toString('utf16le');
    const nullIdx = str.indexOf('\0');
    if (nullIdx !== -1) {
        str = str.substring(0, nullIdx);
    }
    return str.trim();
}

function decodeXpTag(value: unknown): unknown {
    if (Array.isArray(value) && value.every(x => typeof x === 'number')) {
        return decodeUtf16Le(Buffer.from(value));
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        return decodeUtf16Le(Buffer.from(value));
    }
    return value;
}

function normaliseParsedTags(tags: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!tags) {
        return undefined;
    }

    const xpKeys = ['XPTitle', 'XPComment', 'XPAuthor', 'XPKeywords', 'XPSubject'];
    const decodedTags = { ...tags };
    for (const key of xpKeys) {
        if (decodedTags[key] !== undefined) {
            decodedTags[key] = decodeXpTag(decodedTags[key]);
        }
    }

    return Object.fromEntries(
        Object.entries(decodedTags)
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([key, value]) => [key, toReadableScalar(value)]),
    );
}

function summariseUnsupportedBlock(buffer: Buffer | undefined): Record<string, unknown> | undefined {
    if (!buffer || buffer.length === 0) {
        return undefined;
    }

    const text = toUtf8Text(buffer);
    return {
        parse_status: 'unparsed',
        byte_length: buffer.length,
        ...(text ? { text_preview: text.slice(0, 200) } : {}),
    };
}

function extractXmpFields(buffer: Buffer | undefined): Record<string, unknown> | undefined {
    if (!buffer || buffer.length === 0) {
        return undefined;
    }

    const text = toUtf8Text(buffer);
    if (!text) {
        return summariseUnsupportedBlock(buffer);
    }

    const fields: Record<string, unknown> = {};
    const attrPattern = /<([A-Za-z0-9:_-]+)\s+([^>]*?)\/>/g;
    let attrMatch: RegExpExecArray | null = attrPattern.exec(text);
    while (attrMatch) {
        const [, tagName, rawAttrs] = attrMatch;
        const singleAttrPattern = /([A-Za-z0-9:_-]+)=["']([^"']+)["']/g;
        let singleAttrMatch: RegExpExecArray | null = singleAttrPattern.exec(rawAttrs);
        while (singleAttrMatch) {
            const [, attrName, attrValue] = singleAttrMatch;
            fields[`${tagName}.@${attrName}`] = attrValue;
            singleAttrMatch = singleAttrPattern.exec(rawAttrs);
        }
        attrMatch = attrPattern.exec(text);
    }

    const tagPattern = /<([A-Za-z0-9:_-]+)>([^<]+)<\/\1>/g;
    let match: RegExpExecArray | null = tagPattern.exec(text);
    while (match) {
        const [, key, value] = match;
        const trimmedValue = value.trim();
        if (trimmedValue) {
            fields[key] = trimmedValue;
        }
        match = tagPattern.exec(text);
    }

    return Object.keys(fields).length > 0
        ? fields
        : {
            parse_status: 'unparsed',
            text_preview: text.slice(0, 200),
        };
}

function toIsoString(value: number): string | null {
    const timestampMs = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseExifLikeString(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const exifMatch = trimmed.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
    if (exifMatch) {
        const [, year, month, day, hour, minute, second] = exifMatch;
        return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
    }

    const directDate = new Date(trimmed);
    if (!Number.isNaN(directDate.getTime())) {
        return directDate.toISOString();
    }

    return null;
}

function normaliseDateValue(value: unknown): string | null {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value === 'number') {
        return toIsoString(value);
    }
    if (typeof value === 'string') {
        return parseExifLikeString(value);
    }
    return null;
}

function pushTimestampCandidate(candidates: TimestampCandidate[], source: string, rawValue: unknown): void {
    const isoValue = normaliseDateValue(rawValue);
    if (!isoValue) {
        return;
    }
    candidates.push({ source, value: isoValue });
}

function collectExifTimestampCandidates(parsedExif: ParsedExifData | null): TimestampCandidate[] {
    const tags = parsedExif?.tags ?? {};
    const candidates: TimestampCandidate[] = [];
    const preferredKeys = [
        'DateTimeOriginal',
        'CreateDate',
        'DateTimeDigitized',
        'ModifyDate',
    ];

    for (const key of preferredKeys) {
        pushTimestampCandidate(candidates, `exif.${key}`, tags[key]);
    }

    return candidates;
}

function collectXmpTimestampCandidates(metadata: SharpMetadataLike): TimestampCandidate[] {
    if (!metadata.xmp || metadata.xmp.length === 0) {
        return [];
    }

    const text = metadata.xmp.toString('utf8');
    const matches = text.match(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?/g) ?? [];
    const candidates: TimestampCandidate[] = [];
    for (const match of matches) {
        pushTimestampCandidate(candidates, 'xmp.text', match);
    }
    return candidates;
}

function getDimensions(metadata: SharpMetadataLike): { width: number | null; height: number | null } {
    const width = metadata.width ?? null;
    const height = metadata.height ?? null;
    const isRotated = (metadata.orientation ?? 1) >= 5;
    if (!width || !height || !isRotated) {
        return { width, height };
    }

    return {
        width: height,
        height: width,
    };
}

async function parseExifFromFile(filePath: string): Promise<ParsedExifData | null> {
    let fileBuffer: Buffer;
    try {
        fileBuffer = readFileSync(filePath);
    } catch {
        return null;
    }

    try {
        const exifParser = await loadExifParser();
        return exifParser.create(fileBuffer).parse();
    } catch {
        return null;
    }
}

function buildTimestampCandidates(params: BuildEmbeddedMetadataPayloadParams): TimestampCandidate[] {
    const exifCandidates = collectExifTimestampCandidates(params.parsedExif);
    const xmpCandidates = collectXmpTimestampCandidates(params.metadata);
    return [...exifCandidates, ...xmpCandidates];
}

function buildEmbeddedFileInfo(params: BuildEmbeddedMetadataPayloadParams): EmbeddedFileInfo {
    const dimensions = getDimensions(params.metadata);

    return {
        path: params.filePath,
        format: params.metadata.format ?? null,
        width: dimensions.width,
        height: dimensions.height,
        orientation: params.metadata.orientation ?? null,
        density: params.metadata.density ?? null,
        space: params.metadata.space ?? null,
        channels: params.metadata.channels ?? null,
        has_alpha: params.metadata.hasAlpha ?? null,
        pages: params.metadata.pages ?? null,
        is_progressive: params.metadata.isProgressive ?? null,
    };
}

function buildEmbeddedBlocks(params: BuildEmbeddedMetadataPayloadParams): EmbeddedBlockMap {
    return {
        ...(params.metadata.exif ? { exif: normaliseParsedTags(params.parsedExif?.tags) ?? summariseUnsupportedBlock(params.metadata.exif) } : {}),
        ...(params.metadata.xmp ? { xmp: extractXmpFields(params.metadata.xmp) } : {}),
        ...(params.metadata.iptc ? { iptc: summariseUnsupportedBlock(params.metadata.iptc) } : {}),
        ...(params.metadata.icc ? { icc: summariseUnsupportedBlock(params.metadata.icc) } : {}),
    };
}

function buildDerivedInfo(timestampCandidates: TimestampCandidate[]): EmbeddedDerivedInfo {
    const primaryTimestamp = timestampCandidates[0] ?? null;
    return {
        capture_datetime: primaryTimestamp?.value ?? null,
        timestamp_source: primaryTimestamp?.source ?? null,
        timestamp_candidates: timestampCandidates,
    };
}

export function buildEmbeddedMetadataPayload(params: BuildEmbeddedMetadataPayloadParams): EmbeddedMetadataPayload {
    const timestampCandidates = buildTimestampCandidates(params);

    return {
        schema_version: 1,
        file: buildEmbeddedFileInfo(params),
        embedded: buildEmbeddedBlocks(params),
        derived: buildDerivedInfo(timestampCandidates),
    };
}

export async function extractAssetMetadata(filePath: string, birthtime: Date): Promise<AssetMetadataSnapshot | null> {
    try {
        const metadata = await sharp(filePath).metadata();
        const parsedExif = await parseExifFromFile(filePath);
        const embeddedMetadata = buildEmbeddedMetadataPayload({
            filePath,
            fileStats: { birthtime },
            metadata,
            parsedExif,
        });

        return {
            width: embeddedMetadata.file.width,
            height: embeddedMetadata.file.height,
            embeddedMetadata,
            captureDatetime: embeddedMetadata.derived.capture_datetime,
            metadataTimestampSource: embeddedMetadata.derived.timestamp_source,
        };
    } catch {
        return null;
    }
}

export async function persistAssetEmbeddedMetadata(params: {
    db: DbHandle;
    assetId: string;
    originalPath: string;
    fileSize?: number | null;
    birthtime: Date;
}): Promise<AssetMetadataSnapshot | null> {
    const snapshot = await extractAssetMetadata(params.originalPath, params.birthtime);
    if (!snapshot) {
        return null;
    }

    params.db.prepare(`
        UPDATE assets
        SET file_size = COALESCE(file_size, ?),
            width = ?,
            height = ?,
            exif_datetime = ?,
            metadata_timestamp_source = ?
        WHERE id = ?
    `).run(
        params.fileSize ?? null,
        snapshot.width ?? 0,
        snapshot.height ?? 0,
        snapshot.captureDatetime,
        snapshot.metadataTimestampSource,
        params.assetId,
    );

    params.db.prepare('DELETE FROM derived_results WHERE asset_id = ? AND task = ?').run(params.assetId, 'embedded_metadata');
    params.db.prepare(`
        INSERT INTO derived_results (id, asset_id, task, provider, model_version, data)
        VALUES (?, ?, 'embedded_metadata', 'sharp+exif-parser', '1.0', ?)
    `).run(uuidv4(), params.assetId, JSON.stringify(snapshot.embeddedMetadata));

    return snapshot;
}
