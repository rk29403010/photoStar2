import type { SemanticPredicatePlugin } from '../../contracts';

const plugin: SemanticPredicatePlugin = {
    id: 'semantic.represents_photograph',
    manifest: {
        key: 'represents_photograph',
        version: 1,
        allowedSubjectKinds: ['asset', 'region'],
        allowedObjectKinds: ['photograph'],
        valueSchema: null,
        qualifierSchema: null,
        symmetric: false,
        transitive: false,
        inverseKey: null,
        cardinality: 'many_to_many',
        autoResolutionPolicy: 'none',
        reviewPolicy: 'optional',
        projectionEligible: true,
        presentationCollapseEligible: true,
        labels: { subjectToObject: 'represents photograph', objectToSubject: 'represented by' },
        deprecatedBy: null,
    },
};
export default plugin;
