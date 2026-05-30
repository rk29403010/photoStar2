import { SchemaType, type ResponseSchema } from '@google/generative-ai';
import { z } from 'zod';

export type GeminiMetadataImageStrategy = 'overview_only' | 'overview_plus_tiles';

type ZodLikeSchema = {
    constructor: { name: string };
    description?: string;
    options?: string[];
    isInt?: boolean;
    element?: ZodLikeSchema;
    shape?: Record<string, ZodLikeSchema>;
    unwrap?: () => ZodLikeSchema;
}

function unwrapZodSchema(schema: ZodLikeSchema | undefined) {
    let currentSchema = schema;
    let nullable = false;

    while (currentSchema) {
        const name = currentSchema.constructor?.name;
        if (name === 'ZodNullable') {
            nullable = true;
            currentSchema = currentSchema.unwrap?.();
        } else if (name === 'ZodOptional') {
            currentSchema = currentSchema.unwrap?.();
        } else {
            break;
        }
    }
    return { currentSchema, nullable };
}

function isPropertyOptional(value: unknown): boolean {
    let checkVal = value as ZodLikeSchema | undefined;
    while (checkVal) {
        const subType = checkVal.constructor?.name;
        if (subType === 'ZodOptional') {
            return true;
        }
        if (subType === 'ZodNullable') {
            checkVal = checkVal.unwrap?.();
        } else {
            break;
        }
    }
    return false;
}

function convertObjectSchema(currentSchema: ZodLikeSchema | undefined): Record<string, unknown> {
    const properties: Record<string, ResponseSchema> = {};
    const required: string[] = [];
    const shape = currentSchema?.shape || {};

    for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToGeminiSchema(value);
        if (!isPropertyOptional(value)) {
            required.push(key);
        }
    }

    const result: Record<string, unknown> = { properties };
    if (required.length > 0) {
        result.required = required;
    }
    return result;
}

function handleZodString(_currentSchema: ZodLikeSchema, result: Record<string, unknown>) {
    result.type = SchemaType.STRING;
}

function handleZodEnum(currentSchema: ZodLikeSchema, result: Record<string, unknown>) {
    result.type = SchemaType.STRING;
    result.enum = currentSchema.options;
    result.format = 'enum';
}

function handleZodNumber(currentSchema: ZodLikeSchema, result: Record<string, unknown>) {
    const isInt = Boolean(currentSchema.isInt);
    result.type = isInt ? SchemaType.INTEGER : SchemaType.NUMBER;
}

function handleZodBoolean(_currentSchema: ZodLikeSchema, result: Record<string, unknown>) {
    result.type = SchemaType.BOOLEAN;
}

function handleZodArray(currentSchema: ZodLikeSchema, result: Record<string, unknown>) {
    result.type = SchemaType.ARRAY;
    result.items = zodToGeminiSchema(currentSchema.element);
}

function handleZodObject(currentSchema: ZodLikeSchema, result: Record<string, unknown>) {
    result.type = SchemaType.OBJECT;
    Object.assign(result, convertObjectSchema(currentSchema));
}

const typeHandlers: Record<string, (currentSchema: ZodLikeSchema, result: Record<string, unknown>) => void> = {
    ZodString: handleZodString,
    ZodEnum: handleZodEnum,
    ZodNumber: handleZodNumber,
    ZodBoolean: handleZodBoolean,
    ZodArray: handleZodArray,
    ZodObject: handleZodObject
};

function zodToGeminiSchema(schema: unknown): ResponseSchema {
    const { currentSchema, nullable } = unwrapZodSchema(schema as ZodLikeSchema | undefined);
    if (!currentSchema) {
        return { type: SchemaType.STRING };
    }

    const typeName = currentSchema.constructor?.name || '';
    const description = currentSchema.description;
    const result: Record<string, unknown> = {};

    if (description) {
        result.description = description;
    }
    if (nullable) {
        result.nullable = true;
    }

    const handler = typeHandlers[typeName];
    if (handler) {
        handler(currentSchema, result);
    } else {
        result.type = SchemaType.STRING;
    }

    return result as unknown as ResponseSchema;
}


export function buildZodSchema(imageStrategy: GeminiMetadataImageStrategy = 'overview_plus_tiles') {
    const boundingBoxSchema = z.array(z.number().int()).describe(
        'Bounding box coordinates in [ymin, xmin, ymax, xmax] format, normalized from 0 to 1000. All values must be integers between 0 and 1000 inclusive (e.g. [150, 200, 450, 600]).'
    );

    const boundingBoxCoordinateSpaceSchema = imageStrategy === 'overview_only'
        ? z.enum(['full_photo']).nullable().optional().describe('Always full_photo when only the overview image is attached.')
        : z.enum(['full_photo', 'crop_local']).nullable().optional().describe(
            'full_photo: thousandths of the full original. crop_local: thousandths of the referenced crop image (must set source_image_index to 2-5).'
        );

    const subjectSchema = z.object({
        label: z.string().describe('Unique subject label such as Subject1.'),
        bounding_box: boundingBoxSchema,
        source_image_index: z.number().nullable().optional().describe('Image part index: 1 for overview, 2-5 for detail crop, or null if unknown.'),
        bounding_box_coordinate_space: boundingBoxCoordinateSpaceSchema,
        type: z.string().describe('Subject type such as person or pet.'),
        location_desc: z.string().describe('Relative position of the subject within the image.'),
        gender: z.string().nullable().describe('Estimated gender, or unknown when unclear.'),
        animal_type: z.string().nullable().describe('Animal type for pets when present.'),
        age_range: z.string().nullable().describe('Estimated age range.'),
        dob_range: z.string().nullable().describe('Estimated birth decade or range.'),
        emotion: z.string().nullable().describe('Estimated emotion.'),
        gaze: z.string().nullable().describe('Estimated gaze direction.'),
        features: z.string().nullable().describe('Distinctive visible features.'),
        uniform: z.string().nullable().describe('Uniform or notable clothing if present.'),
        suggested_names: z.array(z.string()).describe('Potential names suggested by the image or filename context.'),
    });

    const regionOfInterestSchema = z.object({
        label: z.string().describe('Short label for the region of interest.'),
        kind: z.string().describe('Region kind such as signage, handwriting, clothing, vehicle, architecture, or object.'),
        bounding_box: boundingBoxSchema,
        source_image_index: z.number().nullable().optional().describe('Image part index: 1 for overview, 2-5 for detail crop, or null if unknown.'),
        bounding_box_coordinate_space: boundingBoxCoordinateSpaceSchema,
        significance: z.string().nullable().describe('Why the region matters for archive analysis.'),
    });

    const estimatedDateSchema = z.object({
        most_likely_date: z.string().nullable().describe('Most likely ISO date or a coarse year/decade string.'),
        min_date: z.string().nullable().describe('Earliest plausible ISO date for the photo.'),
        max_date: z.string().nullable().describe('Latest plausible ISO date for the photo.'),
        display_label: z.string().describe('Human-readable label for the estimated date range.'),
        rationale: z.string().nullable().describe('Short explanation for the chosen date range.'),
    });

    const qualitySchema = z.object({
        technical: z.number().int().describe('Technical quality score as an integer from 0 (terrible, blurry, extreme noise) to 100 (perfectly sharp, clear, no artifacts).'),
        lighting: z.number().int().describe('Lighting quality score as an integer from 0 (completely under/overexposed, bad lighting) to 100 (excellent exposure, balanced contrast, clear details).'),
        composition: z.number().int().describe('Composition quality score as an integer from 0 (accidental cropping, bad framing) to 100 (intentional composition, rule of thirds, clean framing).'),
        emotional: z.number().int().describe('Emotional resonance score as an integer from 0 (boring, static) to 100 (high storytelling power, strong emotional impact).'),
        discard: z.boolean().describe('Whether this image should likely be discarded.'),
    });

    const authenticitySchema = z.object({
        score: z.number().int().describe('Estimated authenticity score as an integer from 0 (AI-generated, heavily photoshopped, modern border/watermark) to 100 (pure, authentic, unmanipulated original photograph or document).'),
        reasons: z.array(z.string()).describe('Reasons supporting the authenticity estimate.'),
    });

    // required: ['tag_proposals']
    return z.object({
        type: z.string().describe('High-level image type or category.'),
        caption: z.string().describe('Short one-line summary of the photo.'),
        description: z.string().describe('Fuller narrative description of the photo.'),
        estimated_date: estimatedDateSchema,
        location: z.string().describe('Estimated location or Unknown.'),
        subjects: z.array(subjectSchema).describe('Detected people or pets in the image.'),
        regions_of_interest: z.array(regionOfInterestSchema).describe('Important detail regions that matter for archive research.'),
        keywords: z.array(z.string()).describe('Approved canonical tags chosen from the provided vocabulary.'),
        tag_proposals: z.array(z.string()).describe('Candidate new tags for useful concepts missing from the approved canonical vocabulary.'),
        emotional_impact: z.string().describe('Summary of the image mood or emotional impact.'),
        quality: qualitySchema,
        recommended_enhancements: z.array(z.string()).describe('Recommended restoration or enhancement actions.'),
        authenticity: authenticitySchema,
    });
}

export function buildGeminiResponseSchema(imageStrategy: GeminiMetadataImageStrategy): ResponseSchema {
    return zodToGeminiSchema(buildZodSchema(imageStrategy));
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
