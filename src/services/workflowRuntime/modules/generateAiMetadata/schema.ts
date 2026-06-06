import { z } from 'zod';

export const generateAiMetadataParamsSchema = z.object({
    aiMode: z.enum(['mock', 'live', 'off']).default('off'),
    metadataPass: z.enum(['scout', 'refine']).optional(),
    imageStrategy: z.enum(['overview_only', 'overview_plus_tiles']).optional(),
});

export type GenerateAiMetadataParams = z.infer<typeof generateAiMetadataParamsSchema>;
