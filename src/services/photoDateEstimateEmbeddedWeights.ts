export function getEmbeddedTimestampWeight(source: string | undefined, baseWeight: number): number {
    if (!source) {
        return baseWeight;
    }

    const normalizedSource = source.toLowerCase();
    if (normalizedSource.endsWith('datetimeoriginal')) {
        return baseWeight;
    }
    if (normalizedSource.endsWith('createdate')) {
        return baseWeight * 0.78;
    }
    if (normalizedSource.endsWith('datetimedigitized')) {
        return baseWeight * 0.72;
    }
    if (normalizedSource.endsWith('modifydate')) {
        return baseWeight * 0.45;
    }
    if (normalizedSource === 'xmp.text') {
        return baseWeight * 0.4;
    }

    return baseWeight;
}
