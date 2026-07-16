export type RgbColour = { blue: number; green: number; red: number };

export const COLOUR_POP_COUNT_KEY = 'colourCount';
export const COLOUR_POP_RANGE_KEY = 'colourRange';
export const COLOUR_POP_SOFTNESS_KEY = 'softness';
export const DEFAULT_COLOUR_POP_RANGE = 28;
export const DEFAULT_COLOUR_POP_SOFTNESS = 0.35;
export const MAX_COLOUR_POP_COLOURS = 12;

type OperationValues = Record<string, boolean | number>;
type HsvColour = { hue: number; saturation: number; value: number };
type PaletteBucket = RgbColour & { count: number };

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function byte(value: number): number {
    return Math.round(clamp(value, 0, 255));
}

function numberValue(values: OperationValues, key: string, fallback: number): number {
    const value = values[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colourKey(index: number): string {
    return `colour${index}`;
}

export function packRgb(colour: RgbColour): number {
    return ((byte(colour.red) << 16) | (byte(colour.green) << 8) | byte(colour.blue)) >>> 0;
}

export function unpackRgb(packed: number): RgbColour {
    const value = Math.round(clamp(packed, 0, 0xFFFFFF));
    return { red: (value >> 16) & 0xFF, green: (value >> 8) & 0xFF, blue: value & 0xFF };
}

export function readColourPopColours(values: OperationValues): RgbColour[] {
    const count = Math.round(clamp(numberValue(values, COLOUR_POP_COUNT_KEY, 0), 0, MAX_COLOUR_POP_COLOURS));
    return Array.from({ length: count }, (_, index) => unpackRgb(numberValue(values, colourKey(index), 0)));
}

export function writeColourPopColours(values: OperationValues, colours: RgbColour[]): OperationValues {
    const selected = colours.slice(0, MAX_COLOUR_POP_COLOURS);
    const next: OperationValues = { ...values, [COLOUR_POP_COUNT_KEY]: selected.length };
    for (let index = 0; index < MAX_COLOUR_POP_COLOURS; index += 1) {
        if (index < selected.length) {next[colourKey(index)] = packRgb(selected[index]);}
        else {delete next[colourKey(index)];}
    }
    return next;
}

function rgbToHsv(colour: RgbColour): HsvColour {
    const red = colour.red / 255;
    const green = colour.green / 255;
    const blue = colour.blue / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    let hue = 0;
    if (delta > 0 && maximum === red) {hue = 60 * (((green - blue) / delta) % 6);}
    else if (delta > 0 && maximum === green) {hue = 60 * (((blue - red) / delta) + 2);}
    else if (delta > 0) {hue = 60 * (((red - green) / delta) + 4);}
    return {
        hue: hue < 0 ? hue + 360 : hue,
        saturation: maximum === 0 ? 0 : delta / maximum,
        value: maximum,
    };
}

export function colourDistance(first: RgbColour, second: RgbColour): number {
    const a = rgbToHsv(first);
    const b = rgbToHsv(second);
    const rawHue = Math.abs(a.hue - b.hue);
    const hue = Math.min(rawHue, 360 - rawHue);
    const hueWeight = Math.min(1, Math.max(a.saturation, b.saturation) * 2);
    const saturation = (a.saturation - b.saturation) * 60;
    const value = (a.value - b.value) * 30;
    return Math.hypot(hue * hueWeight, saturation, value);
}

function retentionForColour(colour: RgbColour, selected: RgbColour[], range: number, softness: number): number {
    if (selected.length === 0) {return 0;}
    const distance = Math.min(...selected.map((candidate) => colourDistance(colour, candidate)));
    const outer = clamp(range, 1, 100);
    const inner = outer * (1 - clamp(softness, 0, 1));
    if (distance <= inner) {return 1;}
    if (distance >= outer || outer === inner) {return 0;}
    const progress = (outer - distance) / (outer - inner);
    return progress * progress * (3 - (2 * progress));
}

export function applyColourPopPixels(data: Uint8Array | Uint8ClampedArray, values: OperationValues): Uint8ClampedArray {
    const selected = readColourPopColours(values);
    const range = numberValue(values, COLOUR_POP_RANGE_KEY, DEFAULT_COLOUR_POP_RANGE);
    const softness = numberValue(values, COLOUR_POP_SOFTNESS_KEY, DEFAULT_COLOUR_POP_SOFTNESS);
    const output = new Uint8ClampedArray(data.length);
    for (let offset = 0; offset < data.length; offset += 4) {
        const colour = { red: data[offset], green: data[offset + 1], blue: data[offset + 2] };
        const retention = retentionForColour(colour, selected, range, softness);
        const luma = (0.2126 * colour.red) + (0.7152 * colour.green) + (0.0722 * colour.blue);
        output[offset] = luma + ((colour.red - luma) * retention);
        output[offset + 1] = luma + ((colour.green - luma) * retention);
        output[offset + 2] = luma + ((colour.blue - luma) * retention);
        output[offset + 3] = data[offset + 3];
    }
    return output;
}

function bucketSaturation(bucket: PaletteBucket): number {
    return rgbToHsv(bucket).saturation;
}

export function quantizeColourPalette(data: Uint8Array | Uint8ClampedArray, maximum = 12): RgbColour[] {
    const buckets = new Map<number, PaletteBucket>();
    for (let offset = 0; offset < data.length; offset += 16) {
        if (data[offset + 3] < 32) {continue;}
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
        const current = buckets.get(key) ?? { red: 0, green: 0, blue: 0, count: 0 };
        current.red += red;
        current.green += green;
        current.blue += blue;
        current.count += 1;
        buckets.set(key, current);
    }
    const candidates = [...buckets.values()].map((bucket) => ({
        red: Math.round(bucket.red / bucket.count),
        green: Math.round(bucket.green / bucket.count),
        blue: Math.round(bucket.blue / bucket.count),
        count: bucket.count,
    }));
    candidates.sort((first, second) => (second.count * (0.35 + (1.65 * bucketSaturation(second))))
        - (first.count * (0.35 + (1.65 * bucketSaturation(first)))));
    const palette: RgbColour[] = [];
    for (const candidate of candidates) {
        if (palette.every((colour) => colourDistance(colour, candidate) > 12)) {palette.push(candidate);}
        if (palette.length >= maximum) {break;}
    }
    return palette;
}

export function rgbCss(colour: RgbColour): string {
    return `rgb(${byte(colour.red)} ${byte(colour.green)} ${byte(colour.blue)})`;
}
