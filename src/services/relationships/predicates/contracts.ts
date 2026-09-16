import type { JsonValue, SemanticEntityKind } from '../semanticTypes';

export type SemanticPredicateCardinality = 'many_to_many' | 'many_to_one' | 'one_to_many' | 'one_to_one';

export type SemanticPredicateManifest = {
    key: string;
    version: number;
    allowedSubjectKinds: readonly SemanticEntityKind[];
    allowedObjectKinds: readonly SemanticEntityKind[];
    valueSchema: JsonValue | null;
    qualifierSchema: JsonValue | null;
    symmetric: boolean;
    transitive: boolean;
    inverseKey: string | null;
    cardinality: SemanticPredicateCardinality;
    autoResolutionPolicy: 'none' | 'deterministic';
    reviewPolicy: 'none' | 'optional' | 'required';
    projectionEligible: boolean;
    presentationCollapseEligible: boolean;
    labels: { subjectToObject: string; objectToSubject: string | null };
    deprecatedBy: string | null;
};

export type SemanticPredicatePlugin = {
    id: string;
    manifest: SemanticPredicateManifest;
};
