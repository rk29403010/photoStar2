export type ScrfdDecodeCandidate = {
    score: number;
    box: [number, number, number, number];
    landmarks: Array<{ x: number; y: number }>;
}

type CreateScrfdAnchorCentersParams = {
    featureWidth: number;
    featureHeight: number;
    stride: number;
    anchorCount: number;
}

type DecodeScrfdCandidatesParams = {
    scores: Float32Array;
    boxPredictions: Float32Array;
    landmarkPredictions: Float32Array;
    anchorCenters: Array<[number, number]>;
    stride: number;
    imageWidth: number;
    imageHeight: number;
    detScale: number;
    scoreThreshold: number;
}

function cleanFloat(value: number): number {
    return Number.parseFloat(value.toFixed(6));
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function normalizeCoordinate(value: number, maxDimension: number): number {
    if (maxDimension <= 0) {
        return 0;
    }

    return cleanFloat(clamp(value / maxDimension, 0, 1));
}

export function createScrfdAnchorCenters(params: CreateScrfdAnchorCentersParams): Array<[number, number]> {
    const centers: Array<[number, number]> = [];

    for (let row = 0; row < params.featureHeight; row += 1) {
        for (let column = 0; column < params.featureWidth; column += 1) {
            const center: [number, number] = [column * params.stride, row * params.stride];
            for (let anchorIndex = 0; anchorIndex < params.anchorCount; anchorIndex += 1) {
                centers.push(center);
            }
        }
    }

    return centers;
}

export function decodeScrfdCandidates(params: DecodeScrfdCandidatesParams): ScrfdDecodeCandidate[] {
    const candidates: ScrfdDecodeCandidate[] = [];

    for (let index = 0; index < params.anchorCenters.length; index += 1) {
        const score = params.scores[index];
        if (score < params.scoreThreshold) {
            continue;
        }

        const center = params.anchorCenters[index];
        const left = params.boxPredictions[index * 4] * params.stride;
        const top = params.boxPredictions[index * 4 + 1] * params.stride;
        const right = params.boxPredictions[index * 4 + 2] * params.stride;
        const bottom = params.boxPredictions[index * 4 + 3] * params.stride;

        const x1 = clamp((center[0] - left) / params.detScale, 0, params.imageWidth);
        const y1 = clamp((center[1] - top) / params.detScale, 0, params.imageHeight);
        const x2 = clamp((center[0] + right) / params.detScale, 0, params.imageWidth);
        const y2 = clamp((center[1] + bottom) / params.detScale, 0, params.imageHeight);
        if (x2 <= x1 || y2 <= y1) {
            continue;
        }

        const landmarks: Array<{ x: number; y: number }> = [];
        for (let landmarkIndex = 0; landmarkIndex < 5; landmarkIndex += 1) {
            const x = (center[0] + (params.landmarkPredictions[index * 10 + landmarkIndex * 2] * params.stride)) / params.detScale;
            const y = (center[1] + (params.landmarkPredictions[index * 10 + landmarkIndex * 2 + 1] * params.stride)) / params.detScale;
            landmarks.push({
                x: normalizeCoordinate(x, params.imageWidth),
                y: normalizeCoordinate(y, params.imageHeight),
            });
        }

        candidates.push({
            score: cleanFloat(score),
            box: [
                normalizeCoordinate(x1, params.imageWidth),
                normalizeCoordinate(y1, params.imageHeight),
                normalizeCoordinate(x2, params.imageWidth),
                normalizeCoordinate(y2, params.imageHeight),
            ],
            landmarks,
        });
    }

    return candidates;
}
