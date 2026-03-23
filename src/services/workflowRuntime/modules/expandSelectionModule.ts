import type { ModuleDefinition } from '../contracts';

type SelectedSubject = {
    subjectType: string;
    subjectId: string;
};

function readSelectedSubjects(parameters: Record<string, unknown>): SelectedSubject[] {
    const rawItems = parameters.selectedSubjects;
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new Error("expand-selection requires a non-empty 'selectedSubjects' array");
    }

    const items: SelectedSubject[] = [];
    for (const item of rawItems) {
        if (typeof item !== 'object' || item === null) {
            throw new Error('expand-selection received an invalid selected subject entry');
        }
        const candidate = item as Partial<SelectedSubject>;
        if (typeof candidate.subjectType !== 'string' || candidate.subjectType.trim().length === 0) {
            throw new Error('expand-selection requires each selected subject to include a subjectType');
        }
        if (typeof candidate.subjectId !== 'string' || candidate.subjectId.trim().length === 0) {
            throw new Error('expand-selection requires each selected subject to include a subjectId');
        }
        items.push({
            subjectType: candidate.subjectType,
            subjectId: candidate.subjectId,
        });
    }

    return items;
}

function ensureAssetOnly(items: SelectedSubject[]): void {
    // TODO: Resolve non-asset selections into assets when group/person/album resolvers exist.
    const unsupported = items.find((item) => item.subjectType !== 'asset');
    if (unsupported) {
        throw new Error(`expand-selection only supports asset subjects in v1; received '${unsupported.subjectType}'`);
    }
}

function dedupeSubjects(items: SelectedSubject[]): SelectedSubject[] {
    const seen = new Set<string>();
    const deduped: SelectedSubject[] = [];

    for (const item of items) {
        const key = `${item.subjectType}:${item.subjectId}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(item);
    }

    return deduped;
}

export function createExpandSelectionModule(): ModuleDefinition {
    return {
        id: 'runtime.expand_selection',
        version: 1,
        capability: 'derive',
        accepts: ['selection'],
        produces: [],
        run: async (context) => {
            const selectedSubjects = readSelectedSubjects(context.parameters);
            ensureAssetOnly(selectedSubjects);

            return {
                outputs: [],
                emittedSubjects: dedupeSubjects(selectedSubjects),
            };
        },
    };
}
