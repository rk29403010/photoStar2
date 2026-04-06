import { SchemaType, type ResponseSchema } from '@google/generative-ai';

function requiredString(description: string, nullable = false): ResponseSchema {
    return {
        type: SchemaType.STRING,
        description,
        nullable,
    };
}

function requiredNumber(description: string): ResponseSchema {
    return {
        type: SchemaType.NUMBER,
        description,
    };
}

function createBoundingBoxSchema(): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            x: requiredNumber('Left position of the subject or region in the image.'),
            y: requiredNumber('Top position of the subject or region in the image.'),
            width: requiredNumber('Width of the subject or region in the image.'),
            height: requiredNumber('Height of the subject or region in the image.'),
        },
        required: ['x', 'y', 'width', 'height'],
    };
}

function createEstimatedDateSchema(): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            most_likely_date: requiredString('Most likely ISO date or a coarse year/decade string.', true),
            min_date: requiredString('Earliest plausible ISO date for the photo.', true),
            max_date: requiredString('Latest plausible ISO date for the photo.', true),
            display_label: requiredString('Human-readable label for the estimated date range.'),
            rationale: requiredString('Short explanation for the chosen date range.', true),
        },
        required: ['most_likely_date', 'min_date', 'max_date', 'display_label', 'rationale'],
    };
}

function createQualitySchema(): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            technical: requiredNumber('Technical quality score.'),
            lighting: requiredNumber('Lighting quality score.'),
            composition: requiredNumber('Composition quality score.'),
            emotional: requiredNumber('Emotional resonance score.'),
            discard: {
                type: SchemaType.BOOLEAN,
                description: 'Whether this image should likely be discarded.',
            },
        },
        required: ['technical', 'lighting', 'composition', 'emotional', 'discard'],
    };
}

function createAuthenticitySchema(): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            score: requiredNumber('Estimated authenticity score.'),
            reasons: {
                type: SchemaType.ARRAY,
                description: 'Reasons supporting the authenticity estimate.',
                items: requiredString('Authenticity reason.'),
            },
        },
        required: ['score', 'reasons'],
    };
}

function createSubjectSchema(): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            label: requiredString('Unique subject label such as Subject1.'),
            bounding_box: createBoundingBoxSchema(),
            type: requiredString('Subject type such as person or pet.'),
            location_desc: requiredString('Relative position of the subject within the image.'),
            gender: requiredString('Estimated gender, or unknown when unclear.', true),
            animal_type: requiredString('Animal type for pets when present.', true),
            age_range: requiredString('Estimated age range.', true),
            dob_range: requiredString('Estimated birth decade or range.', true),
            emotion: requiredString('Estimated emotion.', true),
            gaze: requiredString('Estimated gaze direction.', true),
            features: requiredString('Distinctive visible features.', true),
            uniform: requiredString('Uniform or notable clothing if present.', true),
            suggested_names: {
                type: SchemaType.ARRAY,
                description: 'Potential names suggested by the image or filename context.',
                items: requiredString('Suggested person or pet name.'),
            },
        },
        required: [
            'label',
            'bounding_box',
            'type',
            'location_desc',
            'gender',
            'animal_type',
            'age_range',
            'dob_range',
            'emotion',
            'gaze',
            'features',
            'uniform',
            'suggested_names',
        ],
    };
}

function createRegionOfInterestSchema(): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            label: requiredString('Short label for the region of interest.'),
            kind: requiredString('Region kind such as signage, handwriting, clothing, vehicle, architecture, or object.'),
            bounding_box: createBoundingBoxSchema(),
            significance: requiredString('Why the region matters for archive analysis.', true),
        },
        required: ['label', 'kind', 'bounding_box', 'significance'],
    };
}

function createBaseResponseSchema(): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            type: requiredString('High-level image type or category.'),
            caption: requiredString('Short one-line summary of the photo.'),
            description: requiredString('Fuller narrative description of the photo.'),
            estimated_date: createEstimatedDateSchema(),
            location: requiredString('Estimated location or Unknown.'),
            subjects: {
                type: SchemaType.ARRAY,
                description: 'Detected people or pets in the image.',
                items: createSubjectSchema(),
            },
            regions_of_interest: {
                type: SchemaType.ARRAY,
                description: 'Important detail regions that matter for archive research.',
                items: createRegionOfInterestSchema(),
            },
            keywords: {
                type: SchemaType.ARRAY,
                description: 'Approved canonical tags chosen from the provided vocabulary.',
                items: requiredString('Keyword.'),
            },
            tag_proposals: {
                type: SchemaType.ARRAY,
                description: 'Candidate new tags for useful concepts missing from the approved canonical vocabulary.',
                items: requiredString('Tag proposal.'),
            },
            emotional_impact: requiredString('Summary of the image mood or emotional impact.'),
            quality: createQualitySchema(),
            recommended_enhancements: {
                type: SchemaType.ARRAY,
                description: 'Recommended restoration or enhancement actions.',
                items: requiredString('Enhancement suggestion.'),
            },
            authenticity: createAuthenticitySchema(),
        },
        required: [
            'type',
            'caption',
            'description',
            'estimated_date',
            'location',
            'subjects',
            'regions_of_interest',
            'keywords',
            'tag_proposals',
            'emotional_impact',
            'quality',
            'recommended_enhancements',
            'authenticity',
        ],
    };
}

function buildGeminiResponseSchema(): ResponseSchema {
    return createBaseResponseSchema();
}

export function buildGeminiFlashResponseSchema(): ResponseSchema {
    return buildGeminiResponseSchema();
}

export function buildGeminiProResponseSchema(): ResponseSchema {
    return buildGeminiResponseSchema();
}
