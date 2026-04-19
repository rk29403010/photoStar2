export type AiMetadataImageStrategy = 'overview_only' | 'overview_plus_tiles';
export type AiMetadataPass = 'scout' | 'refine';

export interface AiMetadataRequestOptions {
    imageStrategy?: AiMetadataImageStrategy;
    metadataPass?: AiMetadataPass;
}
