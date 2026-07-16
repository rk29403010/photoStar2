export type TunePercentControl = 'brightness' | 'contrast' | 'saturation';

const MINIMUM_PERCENT = -100;
const MAXIMUM_PERCENT = 100;

function clampPercent(value: number): number {
    return Math.min(MAXIMUM_PERCENT, Math.max(MINIMUM_PERCENT, Math.round(value)));
}

function finiteOr(value: unknown, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function tunePercentFromRecipeValue(control: TunePercentControl, value: unknown): number {
    const neutralValue = control === 'contrast' ? 0 : 1;
    const recipeValue = finiteOr(value, neutralValue);
    const percent = control === 'contrast' ? recipeValue * 100 : (recipeValue - 1) * 100;
    return clampPercent(percent);
}

export function recipeValueFromTunePercent(control: TunePercentControl, value: number): number {
    const percent = clampPercent(value);
    return control === 'contrast' ? percent / 100 : 1 + percent / 100;
}

export function formatTunePercent(value: number): string {
    const percent = clampPercent(value);
    return `${percent > 0 ? '+' : ''}${percent}%`;
}

export function hueColorDegrees(value: unknown): number {
    const hue = Math.round(finiteOr(value, 0));
    return ((hue % 360) + 360) % 360;
}
