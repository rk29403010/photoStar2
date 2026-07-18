export type AutomaticBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export type AutomaticPhotoContext = {
  attentionBoxes: AutomaticBox[];
  faceBoxes: AutomaticBox[];
  frameBox: AutomaticBox | null;
  sceneHint: string | null;
};

export type AutomaticScene = "framed" | "group" | "landscape" | "portrait" | "general";

export type AutomaticTuneValues = {
  blackPoint: number;
  brightness: number;
  contrast: number;
  highlights: number;
  hue: number;
  saturation: number;
  shadows: number;
  temperature: number;
  tint: number;
  whitePoint: number;
};

export type AutomaticPhotoAnalysis = {
  attentionCrop: AutomaticBox | null;
  clippedHighlights: number;
  clippedShadows: number;
  confidence: number;
  globalMedian: number;
  scene: AutomaticScene;
  straightenAngle: number;
  straightenConfidence: number;
  subjectMedian: number | null;
  tune: AutomaticTuneValues;
};

const DEFAULT_TUNE: AutomaticTuneValues = {
  blackPoint: 0,
  brightness: 1,
  contrast: 0,
  highlights: 0,
  hue: 0,
  saturation: 1,
  shadows: 0,
  temperature: 0,
  tint: 0,
  whitePoint: 255,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clean(value: number, digits = 4): number {
  return Number.parseFloat(value.toFixed(digits));
}

function percentile(histogram: Uint32Array, total: number, fraction: number): number {
  const target = Math.max(1, Math.ceil(total * fraction));
  let count = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    count += histogram[value];
    if (count >= target) {
      return value;
    }
  }
  return 255;
}

function normalizedBox(box: AutomaticBox): AutomaticBox | null {
  const x = clamp(box.x, 0, 1);
  const y = clamp(box.y, 0, 1);
  const width = clamp(box.width, 0, 1 - x);
  const height = clamp(box.height, 0, 1 - y);
  return width > 0.001 && height > 0.001
    ? { x: clean(x), y: clean(y), width: clean(width), height: clean(height) }
    : null;
}

function includesPoint(boxes: AutomaticBox[], x: number, y: number): boolean {
  return boxes.some((box) =>
    x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height);
}

type HistogramMetrics = {
  averageBlue: number;
  averageGreen: number;
  averageRed: number;
  clippedHighlights: number;
  clippedShadows: number;
  global: Uint32Array;
  globalCount: number;
  saturation: number;
  subject: Uint32Array;
  subjectCount: number;
};

function collectHistogram(
  data: ArrayLike<number>,
  width: number,
  height: number,
  subjectBoxes: AutomaticBox[],
): HistogramMetrics {
  const global = new Uint32Array(256);
  const subject = new Uint32Array(256);
  let globalCount = 0;
  let subjectCount = 0;
  let clippedHighlights = 0;
  let clippedShadows = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let saturation = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    if ((data[offset + 3] ?? 255) === 0) {
      continue;
    }
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    global[luma] += 1;
    globalCount += 1;
    clippedShadows += luma <= 3 ? 1 : 0;
    clippedHighlights += luma >= 252 ? 1 : 0;
    red += r;
    green += g;
    blue += b;
    saturation += (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
    const x = (pixel % width + 0.5) / width;
    const y = (Math.floor(pixel / width) + 0.5) / height;
    if (includesPoint(subjectBoxes, x, y)) {
      subject[luma] += 1;
      subjectCount += 1;
    }
  }
  const denominator = Math.max(1, globalCount);
  return {
    averageBlue: blue / denominator,
    averageGreen: green / denominator,
    averageRed: red / denominator,
    clippedHighlights: clippedHighlights / denominator,
    clippedShadows: clippedShadows / denominator,
    global,
    globalCount,
    saturation: saturation / denominator,
    subject,
    subjectCount,
  };
}

function sceneFromContext(
  width: number,
  height: number,
  context: AutomaticPhotoContext,
): AutomaticScene {
  if (context.frameBox) {
    return "framed";
  }
  if (context.faceBoxes.length > 1) {
    return "group";
  }
  if (context.faceBoxes.length === 1) {
    return "portrait";
  }
  const hint = context.sceneHint?.toLowerCase() ?? "";
  if (hint.includes("landscape") || hint.includes("scenery") || width / height >= 1.3) {
    return "landscape";
  }
  return "general";
}

function recommendedTone(
  low: number,
  high: number,
  exposureMedian: number,
  clippedHighlights: number,
  scene: AutomaticScene,
) {
  const targetMedian = scene === "portrait" || scene === "group" ? 132 : 122;
  const brightness = clamp(targetMedian / Math.max(48, exposureMedian), 0.82, 1.2);
  const range = Math.max(48, high - low);
  const contrast = clamp((190 - range) / 520, -0.12, 0.18);
  const shadows = low < 18 || exposureMedian < 92 ? clamp((92 - exposureMedian) / 300, 0, 0.22) : 0;
  const highlights = clippedHighlights > 0.008 || high > 248
    ? -clamp((high - 238) / 90 + clippedHighlights, 0, 0.22)
    : 0;
  return { brightness, contrast, highlights, shadows };
}

function recommendedColour(metrics: HistogramMetrics, scene: AutomaticScene) {
  const channelAverage = (metrics.averageRed + metrics.averageGreen + metrics.averageBlue) / 3;
  const temperature = clamp((metrics.averageBlue - metrics.averageRed) / Math.max(128, channelAverage * 2), -0.28, 0.28);
  const tint = clamp((metrics.averageGreen - (metrics.averageRed + metrics.averageBlue) / 2) / Math.max(128, channelAverage * 2), -0.2, 0.2);
  const targetSaturation = scene === "portrait" || scene === "group" ? 0.3 : 0.36;
  const saturation = clamp(1 + (targetSaturation - metrics.saturation) * 0.35, 0.94, 1.12);
  return { saturation, temperature, tint };
}

function tuneFromMetrics(metrics: HistogramMetrics, scene: AutomaticScene): AutomaticTuneValues {
  if (metrics.globalCount === 0) {
    return DEFAULT_TUNE;
  }
  const low = percentile(metrics.global, metrics.globalCount, 0.005);
  const high = percentile(metrics.global, metrics.globalCount, 0.995);
  const subjectMedian = metrics.subjectCount > 64
    ? percentile(metrics.subject, metrics.subjectCount, 0.5)
    : null;
  const exposureMedian = subjectMedian ?? percentile(metrics.global, metrics.globalCount, 0.5);
  const tone = recommendedTone(low, high, exposureMedian, metrics.clippedHighlights, scene);
  const colour = recommendedColour(metrics, scene);
  return {
    blackPoint: clamp(low - 1, 0, 42),
    brightness: clean(tone.brightness),
    contrast: clean(tone.contrast),
    highlights: clean(tone.highlights),
    hue: 0,
    saturation: clean(colour.saturation),
    shadows: clean(tone.shadows),
    temperature: clean(Math.abs(colour.temperature) < 0.025 ? 0 : colour.temperature),
    tint: clean(Math.abs(colour.tint) < 0.02 ? 0 : colour.tint),
    whitePoint: clamp(high + 1, 213, 255),
  };
}

function grayscale(data: ArrayLike<number>, width: number, height: number): Float32Array {
  const output = new Float32Array(width * height);
  for (let pixel = 0; pixel < output.length; pixel += 1) {
    const offset = pixel * 4;
    output[pixel] = 0.2126 * (data[offset] ?? 0)
      + 0.7152 * (data[offset + 1] ?? 0)
      + 0.0722 * (data[offset + 2] ?? 0);
  }
  return output;
}

type AngleEstimate = { angle: number; confidence: number };

function normalizedTangent(gx: number, gy: number): number {
  let tangent = Math.atan2(gy, gx) * 180 / Math.PI + 90;
  while (tangent > 45) {
    tangent -= 90;
  }
  while (tangent < -45) {
    tangent += 90;
  }
  return tangent;
}

function collectAngleBins(gray: Float32Array, width: number, height: number) {
  const bins = new Float64Array(49);
  let edgeWeight = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = y * width + x;
      const gx = gray[index + 1] - gray[index - 1];
      const gy = gray[index + width] - gray[index - width];
      const magnitude = Math.hypot(gx, gy);
      if (magnitude >= 28) {
        const tangent = normalizedTangent(gx, gy);
        if (Math.abs(tangent) <= 12) {
          bins[Math.round((tangent + 12) * 2)] += magnitude;
          edgeWeight += magnitude;
        }
      }
    }
  }
  return { bins, edgeWeight };
}

function strongestAngleBin(bins: Float64Array): number {
  let bestBin = 24;
  for (let index = 0; index < bins.length; index += 1) {
    if (bins[index] > bins[bestBin]) {
      bestBin = index;
    }
  }
  return bestBin;
}

function estimateStraighten(data: ArrayLike<number>, width: number, height: number): AngleEstimate {
  if (width < 5 || height < 5) {
    return { angle: 0, confidence: 0 };
  }
  const { bins, edgeWeight } = collectAngleBins(grayscale(data, width, height), width, height);
  if (edgeWeight === 0) {
    return { angle: 0, confidence: 0 };
  }
  const bestBin = strongestAngleBin(bins);
  const neighbourhood = bins[bestBin]
    + (bins[bestBin - 1] ?? 0)
    + (bins[bestBin + 1] ?? 0);
  const confidence = clamp(neighbourhood / edgeWeight * 3, 0, 1);
  const detected = bestBin / 2 - 12;
  return Math.abs(detected) >= 0.5 && confidence >= 0.28
    ? { angle: clean(-detected, 2), confidence: clean(confidence) }
    : { angle: 0, confidence: clean(confidence) };
}

function unionBoxes(boxes: AutomaticBox[]): AutomaticBox | null {
  const valid = boxes.map(normalizedBox).filter((box): box is AutomaticBox => box !== null);
  if (valid.length === 0) {
    return null;
  }
  const left = Math.min(...valid.map((box) => box.x));
  const top = Math.min(...valid.map((box) => box.y));
  const right = Math.max(...valid.map((box) => box.x + box.width));
  const bottom = Math.max(...valid.map((box) => box.y + box.height));
  const horizontalPadding = Math.max(0.04, (right - left) * 0.15);
  const topPadding = Math.max(0.06, (bottom - top) * 0.2);
  const bottomPadding = Math.max(0.04, (bottom - top) * 0.12);
  return normalizedBox({
    x: left - horizontalPadding,
    y: top - topPadding,
    width: right - left + horizontalPadding * 2,
    height: bottom - top + topPadding + bottomPadding,
  });
}

function attentionScore(data: ArrayLike<number>, gray: Float32Array, width: number, index: number): number {
  const edge = Math.abs(gray[index + 1] - gray[index - 1])
    + Math.abs(gray[index + width] - gray[index - width]);
  const offset = index * 4;
  const maximum = Math.max(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0);
  const minimum = Math.min(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0);
  return Math.max(0, edge - 18) + (maximum - minimum) * 0.18;
}

function collectAttentionScores(data: ArrayLike<number>, width: number, height: number) {
  const gray = grayscale(data, width, height);
  const columns = 12;
  const rows = 12;
  const scores = new Float64Array(columns * rows);
  let scoreTotal = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const index = y * width + x;
      const score = attentionScore(data, gray, width, index);
      if (score > 0) {
        const column = Math.min(columns - 1, Math.floor(x / width * columns));
        const row = Math.min(rows - 1, Math.floor(y / height * rows));
        scores[row * columns + column] += score;
        scoreTotal += score;
      }
    }
  }
  return { columns, rows, scores, scoreTotal };
}

function weightedAttentionCentre(
  scores: Float64Array,
  columns: number,
  rows: number,
): { x: number; y: number } | null {
  const ordered = Array.from(scores).sort((left, right) => right - left);
  const threshold = ordered[Math.floor(ordered.length * 0.3)] ?? 0;
  let xTotal = 0;
  let yTotal = 0;
  let weightTotal = 0;
  scores.forEach((score, index) => {
    if (score >= threshold && score > 0) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      xTotal += (column + 0.5) / columns * score;
      yTotal += (row + 0.5) / rows * score;
      weightTotal += score;
    }
  });
  return weightTotal === 0 ? null : { x: xTotal / weightTotal, y: yTotal / weightTotal };
}

function pixelAttentionCrop(
  data: ArrayLike<number>,
  width: number,
  height: number,
): AutomaticBox | null {
  if (width < 8 || height < 8) {
    return null;
  }
  const collected = collectAttentionScores(data, width, height);
  if (collected.scoreTotal < width * height * 0.15) {
    return null;
  }
  const centre = weightedAttentionCentre(collected.scores, collected.columns, collected.rows);
  if (!centre) {
    return null;
  }
  const scale = 0.82;
  return normalizedBox({
    x: clamp(centre.x - scale / 2, 0, 1 - scale),
    y: clamp(centre.y - scale / 2, 0, 1 - scale),
    width: scale,
    height: scale,
  });
}

export function frameCropBox(context: AutomaticPhotoContext): AutomaticBox | null {
  const frame = context.frameBox ? normalizedBox(context.frameBox) : null;
  if (!frame || frame.width * frame.height > 0.995) {
    return null;
  }
  const inset = Math.min(0.004, frame.width / 80, frame.height / 80);
  return normalizedBox({
    x: frame.x + inset,
    y: frame.y + inset,
    width: frame.width - inset * 2,
    height: frame.height - inset * 2,
  });
}

export function analyzePhotoPixels(
  data: ArrayLike<number>,
  width: number,
  height: number,
  context: AutomaticPhotoContext,
): AutomaticPhotoAnalysis {
  const faceBoxes = context.faceBoxes.map(normalizedBox).filter((box): box is AutomaticBox => box !== null);
  const attentionBoxes = context.attentionBoxes.map(normalizedBox).filter((box): box is AutomaticBox => box !== null);
  const metrics = collectHistogram(data, width, height, faceBoxes.length > 0 ? faceBoxes : attentionBoxes);
  const scene = sceneFromContext(width, height, { ...context, faceBoxes });
  const straightening = estimateStraighten(data, width, height);
  const globalMedian = metrics.globalCount > 0 ? percentile(metrics.global, metrics.globalCount, 0.5) : 0;
  const subjectMedian = metrics.subjectCount > 64 ? percentile(metrics.subject, metrics.subjectCount, 0.5) : null;
  const signalCount = Number(metrics.globalCount > 0) + Number(context.frameBox !== null)
    + Number(faceBoxes.length > 0) + Number(attentionBoxes.length > 0);
  return {
    attentionCrop: unionBoxes(faceBoxes.length > 0 ? faceBoxes : attentionBoxes)
      ?? pixelAttentionCrop(data, width, height),
    clippedHighlights: clean(metrics.clippedHighlights),
    clippedShadows: clean(metrics.clippedShadows),
    confidence: clean(clamp(signalCount / 3, 0.35, 1)),
    globalMedian,
    scene,
    straightenAngle: straightening.angle,
    straightenConfidence: straightening.confidence,
    subjectMedian,
    tune: tuneFromMetrics(metrics, scene),
  };
}

export function automaticTuneDefaults(): AutomaticTuneValues {
  return { ...DEFAULT_TUNE };
}
