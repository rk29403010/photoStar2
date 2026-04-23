import { SchemaType, type ResponseSchema } from '@google/generative-ai';

export type GeminiMetadataImageStrategy = 'overview_only' | 'overview_plus_tiles';

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

function optionalNumber(description: string): ResponseSchema {
    return {
        type: SchemaType.NUMBER,
        description,
        nullable: true,
    };
}

function createBoundingBoxSchema(): ResponseSchema {
    const axisRule = 'Use thousandths of the full original upright photo (0=left/top edge, 1000=right/bottom edge along that axis). Values must stay within 0..1000 inclusive; x+width and y+height must not exceed 1000. Never use the downscaled JPEG pixel grid.';
    return {
        type: SchemaType.OBJECT,
        properties: {
            x: requiredNumber(`Left edge in the full original photo on a normalized 0 to 1000 grid. ${axisRule}`),
            y: requiredNumber(`Top edge in the full original photo on a normalized 0 to 1000 grid. ${axisRule}`),
            width: requiredNumber(`Width in the full original photo on a normalized 0 to 1000 grid. ${axisRule}`),
            height: requiredNumber(`Height in the full original photo on a normalized 0 to 1000 grid. ${axisRule}`),
        },
        required: ['x', 'y', 'width', 'height'],
    };
}

function createBoundingBoxCoordinateSpaceSchema(imageStrategy: GeminiMetadataImageStrategy): ResponseSchema {
    if (imageStrategy === 'overview_only') {
        return {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['full_photo'],
            description: 'Always full_photo when only the overview image is attached.',
            nullable: true,
        };
    }

    return {
        type: SchemaType.STRING,
        format: 'enum',
        enum: ['full_photo', 'crop_local'],
        description: 'full_photo: thousandths of the full original. crop_local: thousandths of the referenced crop image (must set source_image_index to 2-5).',
        nullable: true,
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

function createSubjectSchema(imageStrategy: GeminiMetadataImageStrategy): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            label: requiredString('Unique subject label such as Subject1.'),
            bounding_box: createBoundingBoxSchema(),
            source_image_index: optionalNumber('Image part index: 1 for overview, 2-5 for detail crop, or null if unknown.'),
            bounding_box_coordinate_space: createBoundingBoxCoordinateSpaceSchema(imageStrategy),
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

function createRegionOfInterestSchema(imageStrategy: GeminiMetadataImageStrategy): ResponseSchema {
    return {
        type: SchemaType.OBJECT,
        properties: {
            label: requiredString('Short label for the region of interest.'),
            kind: requiredString('Region kind such as signage, handwriting, clothing, vehicle, architecture, or object.'),
            bounding_box: createBoundingBoxSchema(),
            source_image_index: optionalNumber('Image part index: 1 for overview, 2-5 for detail crop, or null if unknown.'),
            bounding_box_coordinate_space: createBoundingBoxCoordinateSpaceSchema(imageStrategy),
            significance: requiredString('Why the region matters for archive analysis.', true),
        },
        required: ['label', 'kind', 'bounding_box', 'significance'],
    };
}

function createBaseResponseSchema(imageStrategy: GeminiMetadataImageStrategy): ResponseSchema {
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
                items: createSubjectSchema(imageStrategy),
            },
            regions_of_interest: {
                type: SchemaType.ARRAY,
                description: 'Important detail regions that matter for archive research.',
                items: createRegionOfInterestSchema(imageStrategy),
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

function buildGeminiResponseSchema(imageStrategy: GeminiMetadataImageStrategy): ResponseSchema {
    return createBaseResponseSchema(imageStrategy);
}

export function buildGeminiFlashResponseSchema(
    imageStrategy: GeminiMetadataImageStrategy = 'overview_plus_tiles',
): ResponseSchema {
    return buildGeminiResponseSchema(imageStrategy);
}

export function buildGeminiProResponseSchema(
    imageStrategy: GeminiMetadataImageStrategy = 'overview_plus_tiles',
): ResponseSchema {
    return buildGeminiResponseSchema(imageStrategy);
}
