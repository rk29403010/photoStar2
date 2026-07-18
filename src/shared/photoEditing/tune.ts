function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function numberValue(values: Record<string, number | boolean>, key: string, fallback: number): number {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function applyAdvancedTunePixels(
  source: ArrayLike<number>,
  values: Record<string, number | boolean>,
): Uint8ClampedArray {
  const black = clamp(numberValue(values, "blackPoint", 0), 0, 96);
  const white = clamp(numberValue(values, "whitePoint", 255), black + 32, 255);
  const shadows = clamp(numberValue(values, "shadows", 0), -1, 1);
  const highlights = clamp(numberValue(values, "highlights", 0), -1, 1);
  const temperature = clamp(numberValue(values, "temperature", 0), -1, 1);
  const tint = clamp(numberValue(values, "tint", 0), -1, 1);
  const levelScale = 255 / (white - black);
  const gains = [
    1 + temperature * 0.16 + tint * 0.05,
    1 - tint * 0.12,
    1 - temperature * 0.16 + tint * 0.05,
  ];
  const output = new Uint8ClampedArray(source.length);
  for (let offset = 0; offset < source.length; offset += 4) {
    const luma = (0.2126 * (source[offset] ?? 0)
      + 0.7152 * (source[offset + 1] ?? 0)
      + 0.0722 * (source[offset + 2] ?? 0)) / 255;
    const toneDelta = shadows * 72 * (1 - luma) * (1 - luma)
      + highlights * 72 * luma * luma;
    for (let channel = 0; channel < 3; channel += 1) {
      const balanced = (source[offset + channel] ?? 0) * gains[channel];
      output[offset + channel] = clamp((balanced - black) * levelScale + toneDelta, 0, 255);
    }
    output[offset + 3] = source[offset + 3] ?? 255;
  }
  return output;
}
