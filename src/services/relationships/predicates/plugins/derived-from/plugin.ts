import type { SemanticPredicatePlugin } from '../../contracts';

const plugin: SemanticPredicatePlugin = {
    id: 'semantic.derived_from',
    manifest: {
        key: 'derived_from',
        version: 1,
        allowedSubjectKinds: ['asset', 'photograph'],
        allowedObjectKinds: ['asset', 'photograph'],
        valueSchema: null,
        qualifierSchema: null,
        symmetric: false,
        transitive: true,
        inverseKey: null,
        cardinality: 'many_to_many',
        autoResolutionPolicy: 'deterministic',
        reviewPolicy: 'none',
        projectionEligible: true,
        presentationCollapseEligible: false,
        labels: { subjectToObject: 'derived from', objectToSubject: null },
        deprecatedBy: null,
    },
};
export default plugin;
