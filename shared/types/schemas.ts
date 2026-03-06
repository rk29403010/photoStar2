import { z } from 'zod';

// Base WebSocket Command from Frontend -> Backend
export const WsCommandSchema = z.object({
    id: z.string(),
    command: z.string(),
    payload: z.any().optional()
});
export type WsCommand = z.infer<typeof WsCommandSchema>;


// Base WebSocket Response from Backend -> Frontend
export const WsResponseSchema = z.object({
    id: z.string(),
    status: z.enum(['ok', 'error', 'event']),
    data: z.any().nullable().optional(),
    error: z.string().nullable().optional()
});
export type WsResponse = z.infer<typeof WsResponseSchema>;


// Define specific command payloads as we extract handlers
export const ScanFolderPayloadSchema = z.object({
    path: z.string()
});
export type ScanFolderPayload = z.infer<typeof ScanFolderPayloadSchema>;

export const AssetIdPayloadSchema = z.object({
    assetId: z.string()
});

export const SetSensitivityPayloadSchema = AssetIdPayloadSchema.extend({
    status: z.enum(['safe', 'review', 'unsafe']).nullable()
});

export const MergePeoplePayloadSchema = z.object({
    personIds: z.array(z.string()).min(2),
    targetName: z.string()
});

export const RenamePersonPayloadSchema = z.object({
    personId: z.string(),
    newName: z.string()
});
