import type { TagDefinitionStatus } from './tagTypes';

export type SeedTagDefinition = {
    canonicalLabel: string;
    description: string;
    status: TagDefinitionStatus;
    category: string;
}

const ACTIVE_STATUS: TagDefinitionStatus = 'active';
const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
const CENTURIES = ['19th century', '20th century', '21st century'] as const;
const STARTER_TAGS = [
    'portrait',
    'group photo',
    'family',
    'childhood',
    'everyday life',
    'affection',
    'celebration',
    'play',
    'ceremony',
    'indoors',
    'outdoors',
    'travel',
    'holiday',
    'meal',
    'sport',
    'document',
    'snapshot',
    'formal portrait',
] as const;

function createSeedTagDefinition(canonicalLabel: string, description: string, category: string): SeedTagDefinition {
    return {
        canonicalLabel,
        description,
        status: ACTIVE_STATUS,
        category,
    };
}

function buildCenturyTags() {
    return CENTURIES.map((label) => createSeedTagDefinition(label, `Deterministic century bucket for dated photos in the ${label}.`, 'date'));
}

function buildDecadeTags() {
    const decadeTags: SeedTagDefinition[] = [];
    for (let decadeStart = 1900; decadeStart <= 2020; decadeStart += 10) {
        const decadeLabel = `${decadeStart}s`;
        decadeTags.push(createSeedTagDefinition(decadeLabel, `Deterministic decade bucket for photos from the ${decadeLabel}.`, 'date'));
        decadeTags.push(createSeedTagDefinition(`early ${decadeLabel}`, `Deterministic early-period bucket within the ${decadeLabel}.`, 'date'));
        decadeTags.push(createSeedTagDefinition(`mid ${decadeLabel}`, `Deterministic mid-period bucket within the ${decadeLabel}.`, 'date'));
        decadeTags.push(createSeedTagDefinition(`late ${decadeLabel}`, `Deterministic late-period bucket within the ${decadeLabel}.`, 'date'));
    }

    return decadeTags;
}

function buildSeasonTags() {
    return SEASONS.map((label) => createSeedTagDefinition(label, `Deterministic seasonal bucket for dated photos captured in ${label}.`, 'date'));
}

function buildStarterTags() {
    return STARTER_TAGS.map((label) => createSeedTagDefinition(label, `Curated starter vocabulary tag for ${label}.`, 'starter'));
}

export function getSeedTagDefinitions() {
    return [
        ...buildCenturyTags(),
        ...buildDecadeTags(),
        ...buildSeasonTags(),
        ...buildStarterTags(),
    ];
}
