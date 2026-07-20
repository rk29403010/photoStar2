export type TuneImageValues = {
  brightness: number; contrast: number; shadows: number; midtones: number; highlights: number;
  blackPoint: number; whitePoint: number; temperature: number; tint: number;
  vibrance: number; saturation: number; hue: number;
};

export const TUNE_IMAGE_DEFAULTS: Readonly<TuneImageValues> = {
  brightness: 0, contrast: 0, shadows: 0, midtones: 0, highlights: 0,
  blackPoint: 0, whitePoint: 0, temperature: 0, tint: 0, vibrance: 0, saturation: 0, hue: 0,
};

function readTuneValues(values: Record<string, number | boolean>): TuneImageValues {
  return {
    brightness: numericValue(values, "brightness"), contrast: numericValue(values, "contrast"), shadows: numericValue(values, "shadows"), midtones: numericValue(values, "midtones"), highlights: numericValue(values, "highlights"),
    blackPoint: numericValue(values, "blackPoint"), whitePoint: numericValue(values, "whitePoint"), temperature: numericValue(values, "temperature"), tint: numericValue(values, "tint"), vibrance: numericValue(values, "vibrance"), saturation: numericValue(values, "saturation"), hue: numericValue(values, "hue"),
  };
}

function clamp(value: number, minimum = 0, maximum = 1): number { return Math.min(maximum, Math.max(minimum, value)); }
function numericValue(values: Record<string, number | boolean>, key: keyof TuneImageValues): number {
  const candidate = values[key];
  const maximum = key === "hue" ? 180 : 100;
  return typeof candidate === "number" && Number.isFinite(candidate) ? clamp(candidate, -maximum, maximum) : 0;
}
function smoothstep(start: number, end: number, input: number): number {
  const x = clamp((input - start) / (end - start)); return x * x * (3 - 2 * x);
}
function hueToRgb(p: number, q: number, hue: number): number {
  const t = (hue + 1) % 1;
  if (t < 1 / 6) { return p + (q - p) * 6 * t; }
  if (t < 1 / 2) { return q; }
  if (t < 2 / 3) { return p + (q - p) * (2 / 3 - t) * 6; }
  return p;
}
function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const maximum = Math.max(red, green, blue); const minimum = Math.min(red, green, blue); const light = (maximum + minimum) / 2;
  if (maximum === minimum) { return [0, 0, light]; }
  const delta = maximum - minimum; const saturation = light > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
  let hue = (red - green) / delta + 4;
  if (maximum === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (maximum === green) {
    hue = (blue - red) / delta + 2;
  }
  return [hue / 6, saturation, light];
}
function hslToRgb(hue: number, saturation: number, light: number): [number, number, number] {
  if (saturation === 0) { return [light, light, light]; }
  const q = light < 0.5 ? light * (1 + saturation) : light + saturation - light * saturation; const p = 2 * light - q;
  return [hueToRgb(p, q, hue + 1 / 3), hueToRgb(p, q, hue), hueToRgb(p, q, hue - 1 / 3)];
}

/** Deterministic Tune Image renderer. Order: temperature, tint, points, tonal regions, brightness, contrast, vibrance, saturation, hue. */
export function applyTuneImagePixels(source: ArrayLike<number>, values: Record<string, number | boolean>): Uint8ClampedArray {
  const settings = readTuneValues(values);
  const output = new Uint8ClampedArray(source.length);
  const blackBoundary = clamp(settings.blackPoint / 125, -0.8, 0.8);
  const whiteBoundary = clamp(1 - settings.whitePoint / 125, 0.2, 1.8);
  for (let offset = 0; offset < source.length; offset += 4) {
    let red = (source[offset] ?? 0) / 255; let green = (source[offset + 1] ?? 0) / 255; let blue = (source[offset + 2] ?? 0) / 255;
    red = clamp(red + settings.temperature / 625 + settings.tint / 2000); green = clamp(green - settings.tint / 850); blue = clamp(blue - settings.temperature / 625 + settings.tint / 2000);
    let [hue, saturation, luminance] = rgbToHsl(red, green, blue);
    luminance = clamp((luminance - blackBoundary) / Math.max(0.1, whiteBoundary - blackBoundary));
    const shadowWeight = 1 - smoothstep(0.08, 0.62, luminance); const midtoneWeight = smoothstep(0.08, 0.32, luminance) * (1 - smoothstep(0.62, 0.92, luminance)); const highlightWeight = smoothstep(0.38, 0.92, luminance);
    luminance = clamp(luminance + (settings.shadows * shadowWeight + settings.midtones * midtoneWeight + settings.highlights * highlightWeight) / 180);
    luminance = clamp(luminance * (1 + settings.brightness / 200));
    const contrast = 1 + settings.contrast / 100; luminance = clamp(0.5 + (luminance - 0.5) * contrast);
    const vibranceFactor = settings.vibrance / 100 * (1 - saturation); saturation = clamp(saturation + vibranceFactor + settings.saturation / 100);
    hue = (hue + settings.hue / 360 + 1) % 1;
    [red, green, blue] = hslToRgb(hue, saturation, luminance);
    output[offset] = Math.round(clamp(red) * 255); output[offset + 1] = Math.round(clamp(green) * 255); output[offset + 2] = Math.round(clamp(blue) * 255); output[offset + 3] = source[offset + 3] ?? 255;
  }
  return output;
}
