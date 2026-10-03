import { z } from 'zod';
import { refinementTargetSchema } from '../../../../shared/photoAnalysis/contracts';

export const generateAiMetadataParamsSchema = z.object({
    aiMode: z.enum(['mock', 'live', 'off']).default('off'),
    metadataPass: z.enum(['scout', 'refine']).optional(),
    targets: z.array(refinementTargetSchema).min(1).max(6).optional(),
});

export type GenerateAiMetadataParams = z.infer<typeof generateAiMetadataParamsSchema>;
