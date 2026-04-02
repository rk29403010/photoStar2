export type WeightProfile = {
    embedded: number;
    file: number;
    filenameExact: number;
    filenameYear: number;
    filenameDecade: number;
    aiExact: number;
    aiYear: number;
    aiDecade: number;
    aiRange: number;
};

const UNKNOWN_WEIGHTS: WeightProfile = {
    embedded: 0.58,
    file: 0.2,
    filenameExact: 0.95,
    filenameYear: 0.82,
    filenameDecade: 0.56,
    aiExact: 0.7,
    aiYear: 0.64,
    aiDecade: 0.48,
    aiRange: 0.56,
};

const BORN_DIGITAL_WEIGHTS: WeightProfile = {
    embedded: 1.0,
    file: 0.82,
    filenameExact: 0.72,
    filenameYear: 0.66,
    filenameDecade: 0.34,
    aiExact: 0.32,
    aiYear: 0.28,
    aiDecade: 0.22,
    aiRange: 0.26,
};

const SCANNER_WEIGHTS: WeightProfile = {
    embedded: 0.18,
    file: 0.08,
    filenameExact: 1.0,
    filenameYear: 0.92,
    filenameDecade: 0.7,
    aiExact: 0.82,
    aiYear: 0.84,
    aiDecade: 0.88,
    aiRange: 0.92,
};

export function getWeights(profile: 'born_digital' | 'scanner' | 'unknown'): WeightProfile {
    if (profile === 'born_digital') {
        return BORN_DIGITAL_WEIGHTS;
    }
    if (profile === 'scanner') {
        return SCANNER_WEIGHTS;
    }
    return UNKNOWN_WEIGHTS;
}
