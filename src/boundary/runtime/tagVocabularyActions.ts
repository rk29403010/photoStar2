import type { TagAliasSummary, TagDefinitionSummary } from '@contracts/core';
import type { RequestFn } from '@boundary/transport/usePhotoLibrary.transport';

export type TagDetailPayload = {
    tag: TagDefinitionSummary;
    aliases: TagAliasSummary[];
};

export type GetTagDefinitionDetailPayload = {
    tagDefinitionId: string;
};

export type RenameTagDefinitionPayload = {
    tagDefinitionId: string;
    canonicalLabel: string;
    description?: string | null;
    category?: string | null;
};

export type CreateTagAliasPayload = {
    tagDefinitionId: string;
    aliasLabel: string;
};

export type DeleteTagAliasPayload = {
    tagAliasId: string;
};

export type MergeTagDefinitionsPayload = {
    sourceTagDefinitionId: string;
    targetTagDefinitionId: string;
};

type RefreshLibrary = (options?: {
    galleryOrder?: 'default' | 'previewed_first';
    preservePagingState?: boolean;
}) => void;

function requestTagDetailCommand(
    request: RequestFn,
    command: string,
    idPrefix: string,
    payload: Record<string, unknown>,
) {
    return request<TagDetailPayload>({
        idPrefix,
        command,
        payload,
        select: (data) => ({
            tag: data?.tag as TagDefinitionSummary,
            aliases: (data?.aliases as TagAliasSummary[]) || [],
        }),
    });
}

async function runVocabularyMutation(
    request: RequestFn,
    refreshLibrary: RefreshLibrary,
    command: 'rename_tag_definition' | 'create_tag_alias' | 'delete_tag_alias' | 'merge_tag_definitions',
    payload: RenameTagDefinitionPayload | CreateTagAliasPayload | DeleteTagAliasPayload | MergeTagDefinitionsPayload,
) {
    const detail = await requestTagDetailCommand(request, command, command, payload as Record<string, unknown>);
    refreshLibrary({ preservePagingState: true });
    return detail;
}

export function createTagVocabularyActions(params: {
    request: RequestFn;
    refreshLibrary: RefreshLibrary;
}) {
    const { request, refreshLibrary } = params;

    return {
        getTagDefinitionDetail: (payload: GetTagDefinitionDetailPayload) => requestTagDetailCommand(
            request,
            'get_tag_definition_detail',
            `get_tag_definition_detail_${payload.tagDefinitionId}`,
            payload,
        ),
        renameTagDefinition: (payload: RenameTagDefinitionPayload) => runVocabularyMutation(
            request,
            refreshLibrary,
            'rename_tag_definition',
            payload,
        ),
        createTagAlias: (payload: CreateTagAliasPayload) => runVocabularyMutation(
            request,
            refreshLibrary,
            'create_tag_alias',
            payload,
        ),
        deleteTagAlias: (payload: DeleteTagAliasPayload) => runVocabularyMutation(
            request,
            refreshLibrary,
            'delete_tag_alias',
            payload,
        ),
        mergeTagDefinitions: (payload: MergeTagDefinitionsPayload) => runVocabularyMutation(
            request,
            refreshLibrary,
            'merge_tag_definitions',
            payload,
        ),
    };
}
