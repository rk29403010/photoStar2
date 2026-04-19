import type { DatabaseManager } from '../../data/db';
import { createTagRepository } from '../tags/tagRepository';
import type { ReviewItemStatus } from '../tags/tagTypes';
import type { CommandHandlerMap } from './types';

type TagSelectionPayload = {
    tagDefinitionId?: string;
    tagLabel?: string;
    description?: string | null;
    category?: string | null;
};

type AssignAssetTagPayload = TagSelectionPayload & {
    assetId: string;
    userId?: string | null;
};

type BulkAssignAssetTagPayload = TagSelectionPayload & {
    assetIds: string[];
    userId?: string | null;
};

type RemoveAssetTagPayload = {
    assetId: string;
    tagDefinitionId: string;
};

type BulkRemoveAssetTagPayload = {
    assetIds: string[];
    tagDefinitionId: string;
};

type ListReviewItemsPayload = {
    status?: ReviewItemStatus;
    reviewItemType?: 'tag_proposal' | 'group_merge' | 'sensitivity_override_candidate';
    subjectType?: string;
    subjectId?: string;
};

type SetReviewItemStatusPayload = {
    reviewItemId: string;
    status: ReviewItemStatus;
    reviewerId?: string | null;
    reviewNote?: string | null;
} & TagSelectionPayload;

type GetTagDefinitionDetailPayload = {
    tagDefinitionId: string;
};

type RenameTagDefinitionPayload = {
    tagDefinitionId: string;
    canonicalLabel: string;
    description?: string | null;
    category?: string | null;
};

type CreateTagAliasPayload = {
    tagDefinitionId: string;
    aliasLabel: string;
};

type DeleteTagAliasPayload = {
    tagAliasId: string;
};

type MergeTagDefinitionsPayload = {
    sourceTagDefinitionId: string;
    targetTagDefinitionId: string;
};

function ensureAssetIds(assetIds: string[]) {
    const normalized = assetIds
        .map((assetId) => assetId.trim())
        .filter((assetId) => assetId.length > 0);
    if (normalized.length === 0) {
        throw new Error('At least one assetId is required');
    }
    return normalized;
}

function assertAssetsExist(db: ReturnType<DatabaseManager['getDb']>, assetIds: string[]) {
    const placeholders = assetIds.map(() => '?').join(', ');
    const rows = db.prepare(`
        SELECT id
        FROM assets
        WHERE id IN (${placeholders})
    `).all(...assetIds) as Array<{ id: string }>;
    if (rows.length !== assetIds.length) {
        const existingIds = new Set(rows.map((row) => row.id));
        const missingIds = assetIds.filter((assetId) => !existingIds.has(assetId));
        throw new Error(`Unknown asset ids: ${missingIds.join(', ')}`);
    }
}

function resolveProvidedTagDefinitionId(
    repository: ReturnType<typeof createTagRepository>,
    tagDefinitionId: string,
) {
    const definition = repository.getTagDefinition(tagDefinitionId);
    if (!definition) {
        throw new Error(`Tag ${tagDefinitionId} not found`);
    }
    if (definition.status !== 'active') {
        throw new Error(`Tag ${definition.canonicalLabel} is retired`);
    }
    return definition.id;
}

function resolveTagDefinitionIdByLabel(
    repository: ReturnType<typeof createTagRepository>,
    payload: TagSelectionPayload,
) {
    const rawLabel = payload.tagLabel?.trim() ?? '';
    if (!rawLabel) {
        throw new Error('tagDefinitionId or tagLabel is required');
    }

    const existingDefinition = repository.findTagDefinitionByLabel(rawLabel);
    if (existingDefinition) {
        if (existingDefinition.status !== 'active') {
            throw new Error(`Tag ${existingDefinition.canonicalLabel} is retired`);
        }
        return existingDefinition.id;
    }

    return repository.createTagDefinition({
        canonicalLabel: rawLabel,
        description: payload.description ?? null,
        status: 'active',
        category: payload.category ?? null,
    });
}

function resolveTagDefinitionId(
    repository: ReturnType<typeof createTagRepository>,
    payload: TagSelectionPayload,
) {
    if (payload.tagDefinitionId) {
        return resolveProvidedTagDefinitionId(repository, payload.tagDefinitionId);
    }

    return resolveTagDefinitionIdByLabel(repository, payload);
}

function getProposedTagLabel(payloadJson: string) {
    try {
        const parsed = JSON.parse(payloadJson) as { proposedLabel?: unknown };
        return typeof parsed.proposedLabel === 'string' ? parsed.proposedLabel.trim() : '';
    } catch {
        return '';
    }
}

function applyApprovedReviewDecision(params: {
    db: ReturnType<DatabaseManager['getDb']>;
    repository: ReturnType<typeof createTagRepository>;
    reviewItem: ReturnType<ReturnType<typeof createTagRepository>['getReviewItem']>;
    payload: SetReviewItemStatusPayload;
}) {
    const { db, repository, reviewItem, payload } = params;
    if (!reviewItem || payload.status !== 'approved' || reviewItem.reviewItemType !== 'tag_proposal') {
        return;
    }

    const proposedLabel = payload.tagLabel?.trim() || getProposedTagLabel(reviewItem.payloadJson);
    const tagDefinitionId = resolveTagDefinitionId(repository, {
        tagDefinitionId: payload.tagDefinitionId,
        tagLabel: proposedLabel,
        description: payload.description ?? null,
        category: payload.category ?? null,
    });
    if (reviewItem.subjectType !== 'asset') {
        return;
    }

    assertAssetsExist(db, [reviewItem.subjectId]);
    repository.assignTagToAsset({
        assetId: reviewItem.subjectId,
        tagDefinitionId,
        sourceKind: 'manual',
        sourceRecordId: payload.reviewerId ?? null,
        confidence: null,
    });
}

function respondWithAssetTags(
    ctx: Parameters<CommandHandlerMap['get_assets']>[0],
    assetId: string,
) {
    const repository = createTagRepository({ dbManager: ctx.dbManager });
    ctx.respond(ctx.id, 'ok', {
        assetId,
        tags: repository.listTagsForAsset(assetId),
    }, null, ctx.originWs);
}

function getTagDetail(
    repository: ReturnType<typeof createTagRepository>,
    tagDefinitionId: string,
) {
    const tag = repository.listTagDefinitions({
        includeAssignmentCounts: true,
    }).find((definition) => definition.id === tagDefinitionId);
    if (!tag) {
        throw new Error(`Tag ${tagDefinitionId} not found`);
    }

    return {
        tag,
        aliases: repository.listTagAliases(tagDefinitionId),
    };
}

function respondWithTagDetail(
    ctx: Parameters<CommandHandlerMap['get_assets']>[0],
    tagDefinitionId: string,
) {
    const repository = createTagRepository({ dbManager: ctx.dbManager });
    ctx.respond(ctx.id, 'ok', getTagDetail(repository, tagDefinitionId), null, ctx.originWs);
}

export const tagCommandHandlers: CommandHandlerMap = {
    list_available_tags: (ctx) => {
        try {
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            ctx.respond(ctx.id, 'ok', {
                tags: repository.listTagDefinitions({
                    status: 'active',
                    includeAssignmentCounts: true,
                }),
            }, null, ctx.originWs);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    get_asset_tags: (ctx) => {
        try {
            const { assetId } = (ctx.payload || {}) as { assetId?: string };
            if (!assetId) {
                throw new Error('assetId is required');
            }
            respondWithAssetTags(ctx, assetId);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    get_tag_definition_detail: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as GetTagDefinitionDetailPayload;
            if (!payload.tagDefinitionId) {
                throw new Error('tagDefinitionId is required');
            }
            respondWithTagDetail(ctx, payload.tagDefinitionId);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    assign_asset_tag: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as AssignAssetTagPayload;
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            const assetIds = ensureAssetIds([payload.assetId]);
            assertAssetsExist(ctx.dbManager.getDb(), assetIds);
            const tagDefinitionId = resolveTagDefinitionId(repository, payload);
            repository.assignTagToAsset({
                assetId: payload.assetId,
                tagDefinitionId,
                sourceKind: 'manual',
                sourceRecordId: payload.userId ?? null,
                confidence: null,
            });
            respondWithAssetTags(ctx, payload.assetId);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    bulk_assign_asset_tag: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as BulkAssignAssetTagPayload;
            const assetIds = ensureAssetIds(payload.assetIds ?? []);
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            const db = ctx.dbManager.getDb();
            assertAssetsExist(db, assetIds);
            const tagDefinitionId = resolveTagDefinitionId(repository, payload);

            db.transaction(() => {
                for (const assetId of assetIds) {
                    repository.assignTagToAsset({
                        assetId,
                        tagDefinitionId,
                        sourceKind: 'manual',
                        sourceRecordId: payload.userId ?? null,
                        confidence: null,
                    });
                }
            })();

            ctx.respond(ctx.id, 'ok', {
                updatedAssetIds: assetIds,
                tagDefinitionId,
            }, null, ctx.originWs);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    remove_asset_tag: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as RemoveAssetTagPayload;
            if (!payload.assetId) {
                throw new Error('assetId is required');
            }
            if (!payload.tagDefinitionId) {
                throw new Error('tagDefinitionId is required');
            }
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            repository.removeTagAssignment({
                assetId: payload.assetId,
                tagDefinitionId: payload.tagDefinitionId,
                sourceKind: 'manual',
            });
            respondWithAssetTags(ctx, payload.assetId);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    bulk_remove_asset_tag: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as BulkRemoveAssetTagPayload;
            const assetIds = ensureAssetIds(payload.assetIds ?? []);
            if (!payload.tagDefinitionId) {
                throw new Error('tagDefinitionId is required');
            }
            const db = ctx.dbManager.getDb();
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            assertAssetsExist(db, assetIds);
            db.transaction(() => {
                for (const assetId of assetIds) {
                    repository.removeTagAssignment({
                        assetId,
                        tagDefinitionId: payload.tagDefinitionId,
                        sourceKind: 'manual',
                    });
                }
            })();

            ctx.respond(ctx.id, 'ok', {
                updatedAssetIds: assetIds,
                tagDefinitionId: payload.tagDefinitionId,
            }, null, ctx.originWs);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    rename_tag_definition: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as RenameTagDefinitionPayload;
            if (!payload.tagDefinitionId) {
                throw new Error('tagDefinitionId is required');
            }
            if (!payload.canonicalLabel?.trim()) {
                throw new Error('canonicalLabel is required');
            }
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            repository.renameTagDefinition(payload);
            respondWithTagDetail(ctx, payload.tagDefinitionId);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    create_tag_alias: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as CreateTagAliasPayload;
            if (!payload.tagDefinitionId) {
                throw new Error('tagDefinitionId is required');
            }
            if (!payload.aliasLabel?.trim()) {
                throw new Error('aliasLabel is required');
            }
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            repository.createTagAlias(payload);
            respondWithTagDetail(ctx, payload.tagDefinitionId);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    delete_tag_alias: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as DeleteTagAliasPayload;
            if (!payload.tagAliasId) {
                throw new Error('tagAliasId is required');
            }
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            const alias = repository.getTagAlias(payload.tagAliasId);
            if (!alias) {
                throw new Error(`Tag alias ${payload.tagAliasId} not found`);
            }
            repository.deleteTagAlias(payload.tagAliasId);
            respondWithTagDetail(ctx, alias.tagDefinitionId);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    merge_tag_definitions: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as MergeTagDefinitionsPayload;
            if (!payload.sourceTagDefinitionId) {
                throw new Error('sourceTagDefinitionId is required');
            }
            if (!payload.targetTagDefinitionId) {
                throw new Error('targetTagDefinitionId is required');
            }
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            repository.mergeTagDefinitions(payload);
            respondWithTagDetail(ctx, payload.targetTagDefinitionId);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    list_review_items: (ctx) => {
        try {
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            const payload = (ctx.payload || {}) as ListReviewItemsPayload;
            ctx.respond(ctx.id, 'ok', {
                reviewItems: repository.listReviewItems({
                    status: payload.status,
                    reviewItemType: payload.reviewItemType,
                    subjectType: payload.subjectType,
                    subjectId: payload.subjectId,
                }),
            }, null, ctx.originWs);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },

    set_review_item_status: (ctx) => {
        try {
            const payload = (ctx.payload || {}) as SetReviewItemStatusPayload;
            if (!payload.reviewItemId) {
                throw new Error('reviewItemId is required');
            }
            const repository = createTagRepository({ dbManager: ctx.dbManager });
            const reviewItem = repository.getReviewItem(payload.reviewItemId);
            if (!reviewItem) {
                throw new Error(`Review item ${payload.reviewItemId} not found`);
            }

            const db = ctx.dbManager.getDb();
            db.transaction(() => {
                applyApprovedReviewDecision({ db, repository, reviewItem, payload });
                repository.updateReviewItem({
                    reviewItemId: reviewItem.id,
                    status: payload.status,
                    reviewerId: payload.reviewerId ?? null,
                    reviewNote: payload.reviewNote ?? null,
                });
            })();

            ctx.respond(ctx.id, 'ok', {
                reviewItem: repository.getReviewItem(payload.reviewItemId),
            }, null, ctx.originWs);
        } catch (error) {
            ctx.respond(ctx.id, 'error', null, error instanceof Error ? error.message : String(error), ctx.originWs);
        }
    },
};
