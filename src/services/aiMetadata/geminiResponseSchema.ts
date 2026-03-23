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
            x: requiredNumber('Left position of the subject in the image.'),
            y: requiredNumber('Top position of the subject in the image.'),
            width: requiredNumber('Width of the subject in the image.'),
            height: requiredNumber('Height of the subject in the image.'),
        },
        required: ['x', 'y', 'width', 'height'],
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

function createFlashSubjectSchema(): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            label: requiredString('Unique subject label such as Subject1.'),
            bounding_box: createBoundingBoxSchema(),
            type: requiredString('Subject type such as person or pet.'),
            location_desc: requiredString('Relative position of the subject within the image.'),
            gender: requiredString('Estimated gender, or unknown when unclear.', true),
            age_range: requiredString('Estimated age range.', true),
            emotion: requiredString('Estimated emotion.', true),
        },
        required: ['label', 'bounding_box', 'type', 'location_desc', 'gender', 'age_range', 'emotion'],
    };
}

function createProSubjectSchema(): ResponseSchema {
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
        ],
    };
}

function createBaseResponseSchema(subjectSchema: ResponseSchema): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            type: requiredString('High-level image type or category.'),
            estimated_date: requiredString('Estimated date, decade, year, or full date.'),
            location: requiredString('Estimated location or Unknown.'),
            subjects: {
                type: SchemaType.ARRAY,
                description: 'Detected people or pets in the image.',
                items: subjectSchema,
            },
            caption: requiredString('Descriptive caption for the image.'),
            keywords: {
                type: SchemaType.ARRAY,
                description: 'Useful archival keywords for the image.',
                items: requiredString('Keyword.'),
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
            'estimated_date',
            'location',
            'subjects',
            'caption',
            'keywords',
            'emotional_impact',
            'quality',
            'recommended_enhancements',
            'authenticity',
        ],
    };
}

export function buildGeminiFlashResponseSchema(): ResponseSchema {
    return createBaseResponseSchema(createFlashSubjectSchema());
}

export function buildGeminiProResponseSchema(): ResponseSchema {
    return createBaseResponseSchema(createProSubjectSchema());
}
