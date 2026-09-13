import type { SemanticPredicatePlugin } from '../../contracts';

const plugin: SemanticPredicatePlugin = {
    id: 'semantic.depicts',
    manifest: {
        key: 'depicts',
        version: 1,
        allowedSubjectKinds: ['face', 'region', 'photograph', 'asset'],
        allowedObjectKinds: ['person', 'object'],
        valueSchema: null,
        qualifierSchema: null,
        symmetric: false,
        transitive: false,
        inverseKey: null,
        cardinality: 'many_to_many',
        autoResolutionPolicy: 'none',
        reviewPolicy: 'optional',
        projectionEligible: true,
        presentationCollapseEligible: false,
        labels: { subjectToObject: 'depicts', objectToSubject: 'depicted in' },
        deprecatedBy: null,
    },
};
export default plugin;
