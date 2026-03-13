import type { SubjectTypeDefinition } from './contracts';
import { validateSubjectType } from './contracts';

export class SubjectRegistry {
    private readonly subjectTypes = new Map<string, SubjectTypeDefinition>();

    public register(definition: SubjectTypeDefinition): void {
        validateSubjectType(definition);
        if (this.subjectTypes.has(definition.id)) {
            throw new Error(`duplicate subject type '${definition.id}'`);
        }
        this.subjectTypes.set(definition.id, definition);
    }

    public has(subjectTypeId: string): boolean {
        return this.subjectTypes.has(subjectTypeId);
    }
}
