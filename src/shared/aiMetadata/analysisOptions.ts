export type AiMetadataImageStrategy = 'overview_only' | 'overview_plus_tiles';
export type AiMetadataPass = 'scout' | 'refine';

export type AiMetadataRequestOptions = {
    imageStrategy?: AiMetadataImageStrategy;
    metadataPass?: AiMetadataPass;
}
