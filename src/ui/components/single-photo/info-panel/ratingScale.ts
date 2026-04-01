export function normalizeRatingPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 1) {
    return Math.round(value * 100);
  }

  if (value <= 10) {
    return Math.round(value * 10);
  }

  return Math.round(value);
}
