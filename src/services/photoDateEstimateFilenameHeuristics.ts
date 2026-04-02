const GENERIC_CAMERA_TOKENS = new Set([
    'dcim',
    'dsc',
    'dscn',
    'img',
    'mvi',
    'pb',
    'pict',
    'pxl',
    'scan',
]);

function stripTrailingTwoDigitYear(token: string): string {
    return token.replace(/\d{2}$/u, '').toLowerCase();
}

function getFilenameTokens(stem: string): string[] {
    return stem.split(/[^a-z0-9']+/iu).filter((token) => token.length > 0);
}

export function isWhatsAppExportStem(stem: string): boolean {
    return /^whatsapp image \d{4}-\d{2}-\d{2} at \d{2}\.\d{2}\.\d{2}/i.test(stem);
}

export function isMeaningfulFilenameStem(stem: string): boolean {
    const tokens = getFilenameTokens(stem);
    const alphaChars = (stem.match(/[a-z]/giu) ?? []).length;
    const digitChars = (stem.match(/\d/gu) ?? []).length;
    const descriptiveTokens = tokens.filter((token) => /^[a-z][a-z']{2,}(?:\d{2})?$/iu.test(token));
    const nonGenericDescriptiveTokens = descriptiveTokens.filter((token) => (
        !GENERIC_CAMERA_TOKENS.has(stripTrailingTwoDigitYear(token))
    ));
    const longDigitTokenCount = tokens.filter((token) => /^\d{3,}$/u.test(token)).length;

    if (nonGenericDescriptiveTokens.length === 0) {
        return false;
    }
    if (alphaChars < 3) {
        return false;
    }
    if (digitChars > Math.ceil(alphaChars * 1.5)) {
        return false;
    }

    return longDigitTokenCount <= nonGenericDescriptiveTokens.length;
}
