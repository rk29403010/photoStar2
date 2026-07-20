export const RED_EYE_MODE = { human: 0, pet: 1 } as const;
export const MAX_RED_EYE_POINTS = 12;
export type RedEyePoint = { x: number; y: number; radius: number };
export type RedEyeValues = Record<string, number | boolean>;

export const RED_EYE_DEFAULTS: RedEyeValues = {
    mode: RED_EYE_MODE.human,
    pointCount: 0,
    strength: 1,
};

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

function numberValue(values: RedEyeValues, key: string, fallback: number): number {
    const value = values[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readRedEyePoints(values: RedEyeValues): RedEyePoint[] {
    const count = Math.round(clamp(numberValue(values, 'pointCount', 0), 0, MAX_RED_EYE_POINTS));
    return Array.from({ length: count }, (_, index) => ({
        x: clamp(numberValue(values, `pointX${index}`, 0.5), 0, 1),
        y: clamp(numberValue(values, `pointY${index}`, 0.5), 0, 1),
        radius: clamp(numberValue(values, `pointRadius${index}`, 0.025), 0.004, 0.2),
    }));
}

export function writeRedEyePoints(values: RedEyeValues, points: readonly RedEyePoint[]): RedEyeValues {
    const bounded = points.slice(0, MAX_RED_EYE_POINTS);
    const next: RedEyeValues = { ...values, pointCount: bounded.length };
    bounded.forEach((point, index) => {
        next[`pointX${index}`] = clamp(point.x, 0, 1);
        next[`pointY${index}`] = clamp(point.y, 0, 1);
        next[`pointRadius${index}`] = clamp(point.radius, 0.004, 0.2);
    });
    return next;
}

function isEyeReflection(red: number, green: number, blue: number, pet: boolean): boolean {
    if (pet) {
        return green > 100 && green > red * 1.22 && green > blue * 1.1;
    }
    return red > 90 && red > green * 1.45 && red > blue * 1.45;
}

export function detectRedEyePoints(
    data: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    faceBoxes: readonly { x: number; y: number; width: number; height: number }[],
    values: RedEyeValues,
): RedEyePoint[] {
    const pet = Math.round(numberValue(values, 'mode', RED_EYE_MODE.human)) === RED_EYE_MODE.pet;
    const points: RedEyePoint[] = [];
    for (const box of faceBoxes) {
        scanFaceForEyeReflections(data, width, height, box, pet, points);
    }
    return points.slice(0, MAX_RED_EYE_POINTS);
}

function scanFaceForEyeReflections(data: Uint8Array | Uint8ClampedArray, width: number, height: number, box: { x: number; y: number; width: number; height: number }, pet: boolean, points: RedEyePoint[]): void {
    const left = Math.max(0, Math.floor(box.x * width)); const right = Math.min(width, Math.ceil((box.x + box.width) * width));
    const top = Math.max(0, Math.floor((box.y + box.height * 0.18) * height)); const bottom = Math.min(height, Math.ceil((box.y + box.height * 0.58) * height));
    const radius = clamp(Math.min(box.width, box.height) * 0.06, 0.012, 0.08);
    for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
            const offset = (y * width + x) * 4;
            if (isEyeReflection(data[offset], data[offset + 1], data[offset + 2], pet)) { addEyeCandidate(points, { x: (x + 0.5) / width, y: (y + 0.5) / height, radius }); }
        }
    }
}

function addEyeCandidate(points: RedEyePoint[], candidate: RedEyePoint): void {
    const overlaps = points.some((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) < candidate.radius * 2);
    if (!overlaps && points.length < MAX_RED_EYE_POINTS) { points.push(candidate); }
}

export function applyRedEyePixels(data: Uint8Array | Uint8ClampedArray, width: number, height: number, values: RedEyeValues): Uint8ClampedArray {
    const strength = clamp(numberValue(values, 'strength', 1), 0, 1);
    if (strength === 0) { return new Uint8ClampedArray(data); }
    const pet = Math.round(numberValue(values, 'mode', RED_EYE_MODE.human)) === RED_EYE_MODE.pet;
    const points = readRedEyePoints(values);
    const output = new Uint8ClampedArray(data);
    points.forEach((point) => applyPoint(data, output, width, height, point, strength, pet));
    return output;
}

function applyPoint(data: Uint8Array | Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number, point: RedEyePoint, strength: number, pet: boolean): void {
    const radius = point.radius * Math.min(width, height); const left = Math.max(0, Math.floor(point.x * width - radius)); const right = Math.min(width, Math.ceil(point.x * width + radius));
    const top = Math.max(0, Math.floor(point.y * height - radius)); const bottom = Math.min(height, Math.ceil(point.y * height + radius));
    for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
            const distance = Math.hypot(x + 0.5 - point.x * width, y + 0.5 - point.y * height) / radius;
            if (distance <= 1) { correctEyePixel(data, output, (y * width + x) * 4, strength * (1 - distance * distance), pet); }
        }
    }
}

function correctEyePixel(data: Uint8Array | Uint8ClampedArray, output: Uint8ClampedArray, offset: number, blend: number, pet: boolean): void {
    const red = data[offset]; const green = data[offset + 1]; const blue = data[offset + 2];
    if (!isEyeReflection(red, green, blue, pet)) { return; }
    const neutral = pet ? (red + green + blue) / 3 : (green + blue) / 2;
    output[offset] = Math.round(red + (neutral - red) * blend);
    output[offset + 1] = Math.round(green + (neutral - green) * blend * (pet ? 1 : 0.25));
    output[offset + 2] = Math.round(blue + (neutral - blue) * blend * (pet ? 1 : 0.25));
}
