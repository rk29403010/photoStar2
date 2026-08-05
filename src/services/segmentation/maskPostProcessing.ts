import type { SegmentationMask } from './contracts';

export const MAX_PERSISTED_SEGMENT_MASKS = 12;
export const MAX_EDITOR_MASK_DIMENSION = 512;

function area(mask: SegmentationMask): number { return mask.alpha.reduce((total, value) => total + (value > 0 ? 1 : 0), 0) / mask.alpha.length; }
function overlap(left: SegmentationMask, right: SegmentationMask): number { let intersection = 0; let union = 0; for (let index = 0; index < left.alpha.length; index += 1) { const a = left.alpha[index] > 0; const b = right.alpha[index] > 0; if (a || b) {union += 1;} if (a && b) {intersection += 1;} } return union === 0 ? 0 : intersection / union; }
export function retainSegmentationMasks(masks: SegmentationMask[], max = MAX_PERSISTED_SEGMENT_MASKS): SegmentationMask[] {
    return masks.filter((mask) => { const fraction = area(mask); return fraction >= 0.002 && fraction <= 0.98; }).sort((left, right) => (right.score ?? 0) - (left.score ?? 0)).filter((mask, index, accepted) => accepted.slice(0, index).every((other) => overlap(mask, other) < 0.9)).slice(0, max);
}
