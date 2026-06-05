import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TagDefinitionSummary } from '@contracts/core';
import type { BusyAction, TagDetail } from './tagVocabularyTypes';
import {
    TagDetailPanel,
    TagList,
    VocabularyHeader,
    VocabularySearchBar,
} from './TagVocabularySections';

type TagVocabularyViewProps = {
    readonly active: boolean;
    readonly listAvailableTags: () => Promise<TagDefinitionSummary[]>;
    readonly getTagDefinitionDetail: (payload: { tagDefinitionId: string }) => Promise<TagDetail>;
    readonly renameTagDefinition: (payload: { tagDefinitionId: string; canonicalLabel: string }) => Promise<TagDetail>;
    readonly createTagAlias: (payload: { tagDefinitionId: string; aliasLabel: string }) => Promise<TagDetail>;
    readonly deleteTagAlias: (payload: { tagAliasId: string }) => Promise<TagDetail>;
    readonly mergeTagDefinitions: (payload: { sourceTagDefinitionId: string; targetTagDefinitionId: string }) => Promise<TagDetail>;
}

function getSearchLabel(tag: TagDefinitionSummary) {
    return `${tag.canonicalLabel} ${tag.category ?? ''}`.trim().toLowerCase();
}

function getFilteredTags(tags: TagDefinitionSummary[], searchText: string) {
    const normalizedSearch = searchText.trim().toLowerCase();
    return normalizedSearch
        ? tags.filter((tag) => getSearchLabel(tag).includes(normalizedSearch))
        : tags;
}

function getMergeTarget(tags: TagDefinitionSummary[], sourceTagId: string, mergeTargetLabel: string) {
    const normalizedLabel = mergeTargetLabel.trim();
    if (!normalizedLabel) {
        return null;
    }

    return tags.find((tag) => (
        tag.id !== sourceTagId
        && tag.canonicalLabel.localeCompare(normalizedLabel, undefined, { sensitivity: 'base' }) === 0
    )) ?? null;
}

function getNextSelectedTagId(
    currentSelectedTagId: string | null,
    nextTags: TagDefinitionSummary[],
) {
    return currentSelectedTagId && nextTags.some((tag) => tag.id === currentSelectedTagId)
        ? currentSelectedTagId
        : nextTags[0]?.id ?? null;
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

function useActiveRefreshEffect(params: {
    active: boolean;
    refresh: () => Promise<void>;
}) {
    const { active, refresh } = params;
    const refreshRef = useRef(refresh);

    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    useEffect(() => {
        if (active) {
            void refreshRef.current();
        }
    }, [active]);
}

function useSelectedDetailEffect(params: {
    active: boolean;
    selectedTagId: string | null;
    selectedDetailId: string | undefined;
    setLoading: (loading: boolean) => void;
    setErrorMessage: (message: string | null) => void;
    loadTagDetail: (tagDefinitionId: string) => Promise<TagDetail>;
}) {
    const {
        active,
        selectedTagId,
        selectedDetailId,
        setLoading,
        setErrorMessage,
        loadTagDetail,
    } = params;
    useEffect(() => {
        if (!active || !selectedTagId || selectedDetailId === selectedTagId) {
            return;
        }

        let cancelled = false;
        setLoading(true);
        setErrorMessage(null);
        void loadTagDetail(selectedTagId)
            .catch((error) => {
                if (!cancelled) {
                    setErrorMessage(getErrorMessage(error));
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [active, loadTagDetail, selectedDetailId, selectedTagId, setErrorMessage, setLoading]);
}

function useTagVocabularyData(props: TagVocabularyViewProps) {
    const [tags, setTags] = useState<TagDefinitionSummary[]>([]);
    const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
    const [selectedDetail, setSelectedDetail] = useState<TagDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const refreshTags = useCallback(async () => {
        const nextTags = await props.listAvailableTags();
        setTags(nextTags);
        setSelectedTagId((currentSelectedTagId) => getNextSelectedTagId(currentSelectedTagId, nextTags));
        return nextTags;
    }, [props]);

    const loadTagDetail = useCallback(async (tagDefinitionId: string) => {
        const detail = await props.getTagDefinitionDetail({ tagDefinitionId });
        setSelectedDetail(detail);
        return detail;
    }, [props]);

    const refresh = useCallback(async (tagDefinitionId?: string | null) => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const nextTags = await refreshTags();
            const nextSelectedTagId = tagDefinitionId ?? selectedTagId ?? nextTags[0]?.id ?? null;
            if (!nextSelectedTagId) {
                setSelectedDetail(null);
                return;
            }
            await loadTagDetail(nextSelectedTagId);
        } catch (error) {
            setErrorMessage(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, [loadTagDetail, refreshTags, selectedTagId]);

    useActiveRefreshEffect({
        active: props.active,
        refresh: () => refresh(),
    });
    useSelectedDetailEffect({
        active: props.active,
        selectedTagId,
        selectedDetailId: selectedDetail?.tag.id,
        setLoading,
        setErrorMessage,
        loadTagDetail,
    });

    return {
        tags,
        selectedTagId,
        setSelectedTagId,
        selectedDetail,
        setSelectedDetail,
        loading,
        errorMessage,
        setErrorMessage,
        refresh,
        refreshTags,
    };
}

function useTagVocabularyActions(params: {
    props: TagVocabularyViewProps;
    tags: TagDefinitionSummary[];
    selectedDetail: TagDetail | null;
    setSelectedDetail: (detail: TagDetail) => void;
    setSelectedTagId: (tagDefinitionId: string | null) => void;
    refresh: (tagDefinitionId?: string | null) => Promise<void>;
    refreshTags: () => Promise<TagDefinitionSummary[]>;
    setErrorMessage: (message: string | null) => void;
}) {
    const [busyAction, setBusyAction] = useState<BusyAction>(null);

    const runAction = useCallback(async (action: BusyAction, work: () => Promise<void>) => {
        setBusyAction(action);
        params.setErrorMessage(null);
        try {
            await work();
        } catch (error) {
            params.setErrorMessage(error instanceof Error ? error.message : String(error));
        } finally {
            setBusyAction(null);
        }
    }, [params]);

    const renameTag = useCallback(async (canonicalLabel: string) => {
        const selectedDetail = params.selectedDetail;
        if (!selectedDetail) {
            return;
        }
        await runAction('rename', async () => {
            const detail = await params.props.renameTagDefinition({
                tagDefinitionId: selectedDetail.tag.id,
                canonicalLabel,
            });
            params.setSelectedDetail(detail);
            await params.refreshTags();
        });
    }, [params, runAction]);

    const createAlias = useCallback(async (aliasLabel: string) => {
        const selectedDetail = params.selectedDetail;
        if (!selectedDetail) {
            return;
        }
        await runAction('alias', async () => {
            const detail = await params.props.createTagAlias({
                tagDefinitionId: selectedDetail.tag.id,
                aliasLabel,
            });
            params.setSelectedDetail(detail);
        });
    }, [params, runAction]);

    const deleteAlias = useCallback(async (tagAliasId: string) => {
        await runAction('alias', async () => {
            const detail = await params.props.deleteTagAlias({ tagAliasId });
            params.setSelectedDetail(detail);
        });
    }, [params, runAction]);

    const mergeTag = useCallback(async (mergeTargetLabel: string) => {
        const selectedDetail = params.selectedDetail;
        if (!selectedDetail) {
            return;
        }
        const mergeTarget = getMergeTarget(params.tags, selectedDetail.tag.id, mergeTargetLabel);
        if (!mergeTarget) {
            params.setErrorMessage('Choose an existing target tag before merging.');
            return;
        }
        if (!globalThis.confirm(`Merge ${selectedDetail.tag.canonicalLabel} -> ${mergeTarget.canonicalLabel}?`)) {
            return;
        }

        await runAction('merge', async () => {
            const detail = await params.props.mergeTagDefinitions({
                sourceTagDefinitionId: selectedDetail.tag.id,
                targetTagDefinitionId: mergeTarget.id,
            });
            params.setSelectedTagId(mergeTarget.id);
            params.setSelectedDetail(detail);
            await params.refresh(mergeTarget.id);
        });
    }, [params, runAction]);

    return { busyAction, renameTag, createAlias, deleteAlias, mergeTag };
}

export function TagVocabularyView(props: TagVocabularyViewProps) {
    const [searchText, setSearchText] = useState('');
    const [aliasLabel, setAliasLabel] = useState('');
    const [mergeTargetLabel, setMergeTargetLabel] = useState('');
    const data = useTagVocabularyData(props);
    const filteredTags = useMemo(() => getFilteredTags(data.tags, searchText), [data.tags, searchText]);
    const actions = useTagVocabularyActions({
        props,
        tags: data.tags,
        selectedDetail: data.selectedDetail,
        setSelectedDetail: data.setSelectedDetail,
        setSelectedTagId: data.setSelectedTagId,
        refresh: data.refresh,
        refreshTags: data.refreshTags,
        setErrorMessage: data.setErrorMessage,
    });
    return (
        <div className="flex-1 min-h-0 overflow-hidden bg-surface text-content p-6 grid grid-rows-[auto_auto_1fr] gap-5">
            <VocabularyHeader tagCount={data.tags.length} loading={data.loading} onRefresh={() => void data.refresh()} />
            <VocabularySearchBar searchText={searchText} errorMessage={data.errorMessage} onSearchTextChange={setSearchText} />
            <div className="min-h-0 grid grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-5">
                <div className="min-h-0 overflow-y-auto pr-1">
                    <TagList tags={filteredTags} selectedTagId={data.selectedTagId} onSelect={(tagDefinitionId) => { data.setSelectedTagId(tagDefinitionId); data.setErrorMessage(null); }} />
                </div>
                <div className="min-h-0 overflow-y-auto">
                    <TagDetailPanelEditor
                        key={data.selectedDetail?.tag.id ?? 'empty'}
                        tags={data.tags}
                        selectedDetail={data.selectedDetail}
                        busyAction={actions.busyAction}
                        aliasLabel={aliasLabel}
                        mergeTargetLabel={mergeTargetLabel}
                        onAliasLabelChange={setAliasLabel}
                        onMergeTargetLabelChange={setMergeTargetLabel}
                        onRename={(renameLabel) => void actions.renameTag(renameLabel.trim())}
                        onAddAlias={() => void actions.createAlias(aliasLabel.trim()).then(() => setAliasLabel(''))}
                        onDeleteAlias={(tagAliasId) => void actions.deleteAlias(tagAliasId)}
                        onMerge={() => void actions.mergeTag(mergeTargetLabel).then(() => setMergeTargetLabel(''))}
                    />
                </div>
            </div>
        </div>
    );
}

function TagDetailPanelEditor(props: {
    readonly tags: TagDefinitionSummary[];
    readonly selectedDetail: TagDetail | null;
    readonly busyAction: BusyAction;
    readonly aliasLabel: string;
    readonly mergeTargetLabel: string;
    readonly onAliasLabelChange: (value: string) => void;
    readonly onMergeTargetLabelChange: (value: string) => void;
    readonly onRename: (renameLabel: string) => void;
    readonly onAddAlias: () => void;
    readonly onDeleteAlias: (tagAliasId: string) => void;
    readonly onMerge: () => void;
}) {
    const [renameLabel, setRenameLabel] = useState(props.selectedDetail?.tag.canonicalLabel ?? '');

    return (
        <TagDetailPanel
            tags={props.tags}
            selectedDetail={props.selectedDetail}
            busyAction={props.busyAction}
            renameLabel={renameLabel}
            aliasLabel={props.aliasLabel}
            mergeTargetLabel={props.mergeTargetLabel}
            onRenameLabelChange={setRenameLabel}
            onAliasLabelChange={props.onAliasLabelChange}
            onMergeTargetLabelChange={props.onMergeTargetLabelChange}
            onRename={() => props.onRename(renameLabel)}
            onAddAlias={props.onAddAlias}
            onDeleteAlias={props.onDeleteAlias}
            onMerge={props.onMerge}
        />
    );
}
