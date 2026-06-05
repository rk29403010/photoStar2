import type { TagAliasSummary, TagDefinitionSummary } from '@contracts/core';
import type { BusyAction, TagDetail } from './tagVocabularyTypes';

function formatAssignmentCount(count?: number) {
    const normalizedCount = count ?? 0;
    return `${normalizedCount} assignment${normalizedCount === 1 ? '' : 's'}`;
}

export function VocabularyHeader(props: {
    readonly tagCount: number;
    readonly loading: boolean;
    readonly onRefresh: () => void;
}) {
    return (
        <div className="flex justify-between items-end gap-4">
            <div>
                <div className="text-xs text-brand-accent uppercase tracking-widest mb-2">Vocabulary</div>
                <h2 className="m-0 text-3xl font-bold">Canonical Tag Management</h2>
                <div className="mt-2 text-sm text-content-secondary">{props.tagCount} active tags available for curation.</div>
            </div>
            <button 
                type="button" 
                onClick={props.onRefresh} 
                disabled={props.loading} 
                className={`border border-brand-accent/35 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/25 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors duration-150 disabled:opacity-50 ${props.loading ? 'cursor-wait' : 'cursor-pointer'}`}
            >
                Refresh
            </button>
        </div>
    );
}

export function VocabularySearchBar(props: {
    readonly searchText: string;
    readonly errorMessage: string | null;
    readonly onSearchTextChange: (value: string) => void;
}) {
    return (
        <div className="flex gap-3 items-center">
            <input 
                type="text" 
                value={props.searchText} 
                onChange={(event) => props.onSearchTextChange(event.target.value)} 
                placeholder="Search tags or categories" 
                aria-label="Search tags or categories"
                className="w-80 max-w-full bg-surface-secondary text-content border border-content/20 rounded-lg p-2.5 px-3 text-sm focus:border-brand-accent focus:outline-none"
            />
            {props.errorMessage ? <span className="text-red-400 text-xs">{props.errorMessage}</span> : null}
        </div>
    );
}

export function TagList(props: {
    readonly tags: TagDefinitionSummary[];
    readonly selectedTagId: string | null;
    readonly onSelect: (tagDefinitionId: string) => void;
}) {
    if (props.tags.length === 0) {
        return <div className="border border-dashed border-content/20 rounded-2xl p-5 text-content-secondary text-center">No tags match that search.</div>;
    }

    return (
        <div className="grid gap-2">
            {props.tags.map((tag) => {
                const selected = tag.id === props.selectedTagId;
                return (
                    <button 
                        key={tag.id} 
                        type="button" 
                        onClick={() => props.onSelect(tag.id)} 
                        className={`text-left rounded-xl border p-3.5 cursor-pointer flex flex-col gap-1 motion-safe:transition-all ${
                            selected 
                                ? 'border-brand-accent bg-brand-accent/10 text-brand-accent font-bold' 
                                : 'border-content/10 bg-surface-secondary text-content hover:border-content/20'
                        }`}
                    >
                        <span className="text-base font-bold">{tag.canonicalLabel}</span>
                        <span className={`text-xs ${selected ? 'text-brand-accent/80' : 'text-content-secondary'}`}>
                            {formatAssignmentCount(tag.assignmentCount)}
                            {tag.category ? ` · ${tag.category}` : ''}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function SelectedTagCard(props: { readonly selectedDetail: TagDetail }) {
    return (
        <section className="border border-content/10 rounded-2xl bg-surface-secondary p-5 grid gap-2">
            <div className="text-xs text-brand-accent uppercase tracking-wider">Selected Tag</div>
            <div className="text-3xl font-bold">{props.selectedDetail.tag.canonicalLabel}</div>
            <div className="text-sm text-content-secondary">
                {formatAssignmentCount(props.selectedDetail.tag.assignmentCount)}
                {props.selectedDetail.tag.category ? ` · ${props.selectedDetail.tag.category}` : ''}
            </div>
        </section>
    );
}

function RenameTagSection(props: {
    readonly renameLabel: string;
    readonly busyAction: BusyAction;
    readonly onRenameLabelChange: (value: string) => void;
    readonly onRename: () => void;
}) {
    return (
        <section className="border border-content/10 rounded-2xl bg-surface-secondary p-5 grid gap-3">
            <div className="text-sm font-bold">Rename Canonical Tag</div>
            <div className="flex gap-2.5 flex-wrap">
                <input 
                    type="text" 
                    value={props.renameLabel} 
                    onChange={(event) => props.onRenameLabelChange(event.target.value)} 
                    aria-label="New canonical tag name"
                    className="flex-[1_1_280px] bg-surface text-content border border-content/20 rounded-lg p-2.5 px-3 text-sm focus:border-brand-accent focus:outline-none"
                />
                <button 
                    type="button" 
                    onClick={props.onRename} 
                    disabled={props.busyAction !== null || !props.renameLabel.trim()} 
                    className={`border border-brand-accent/35 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/25 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors duration-150 disabled:opacity-50 ${props.busyAction ? 'cursor-wait' : 'cursor-pointer'}`}
                >
                    Rename
                </button>
            </div>
        </section>
    );
}

function AliasSection(props: {
    readonly aliases: TagAliasSummary[];
    readonly aliasLabel: string;
    readonly busyAction: BusyAction;
    readonly onAliasLabelChange: (value: string) => void;
    readonly onAddAlias: () => void;
    readonly onDeleteAlias: (tagAliasId: string) => void;
}) {
    return (
        <section className="border border-content/10 rounded-2xl bg-surface-secondary p-5 grid gap-3">
            <div className="text-sm font-bold">Aliases</div>
            <div className="flex gap-2.5 flex-wrap">
                <input 
                    type="text" 
                    value={props.aliasLabel} 
                    onChange={(event) => props.onAliasLabelChange(event.target.value)} 
                    placeholder="Add alias" 
                    aria-label="New alias name"
                    className="flex-[1_1_280px] bg-surface text-content border border-content/20 rounded-lg p-2.5 px-3 text-sm focus:border-brand-accent focus:outline-none"
                />
                <button 
                    type="button" 
                    onClick={props.onAddAlias} 
                    disabled={props.busyAction !== null || !props.aliasLabel.trim()} 
                    className={`border border-green-500/35 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors duration-150 disabled:opacity-50 ${props.busyAction ? 'cursor-wait' : 'cursor-pointer'}`}
                >
                    Add Alias
                </button>
            </div>
            {props.aliases.length === 0 ? <div className="text-xs text-content-secondary">No aliases yet.</div> : (
                <div className="flex flex-wrap gap-2">
                    {props.aliases.map((alias) => (
                        <button 
                            key={alias.id} 
                            type="button" 
                            onClick={() => props.onDeleteAlias(alias.id)} 
                            disabled={props.busyAction !== null} 
                            className={`inline-flex items-center gap-2 rounded-full border border-content/10 bg-surface text-content px-3 py-2 text-xs transition-colors hover:border-red-500/30 ${props.busyAction ? 'cursor-wait' : 'cursor-pointer'}`}
                        >
                            <span>{alias.aliasLabel}</span>
                            <span className="text-red-400 text-xs font-bold">Remove</span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

function MergeSection(props: {
    readonly tags: TagDefinitionSummary[];
    readonly selectedTagId: string;
    readonly mergeTargetLabel: string;
    readonly busyAction: BusyAction;
    readonly onMergeTargetLabelChange: (value: string) => void;
    readonly onMerge: () => void;
}) {
    return (
        <section className="border border-content/10 rounded-2xl bg-surface-secondary p-5 grid gap-3">
            <div className="text-sm font-bold">Merge Into Another Tag</div>
            <div className="text-xs text-content-secondary">Use this when two canonical tags describe the same concept and one should become the long-term target.</div>
            <div className="flex gap-2.5 flex-wrap">
                <input 
                    type="text" 
                    value={props.mergeTargetLabel} 
                    list="tag-vocabulary-merge-targets" 
                    onChange={(event) => props.onMergeTargetLabelChange(event.target.value)} 
                    placeholder="Target canonical tag" 
                    aria-label="Target canonical tag to merge into"
                    className="flex-[1_1_280px] bg-surface text-content border border-content/20 rounded-lg p-2.5 px-3 text-sm focus:border-brand-accent focus:outline-none"
                />
                <button 
                    type="button" 
                    onClick={props.onMerge} 
                    disabled={props.busyAction !== null || !props.mergeTargetLabel.trim()} 
                    className={`border border-red-500/35 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors duration-150 disabled:opacity-50 ${props.busyAction ? 'cursor-wait' : 'cursor-pointer'}`}
                >
                    Merge
                </button>
            </div>
            <datalist id="tag-vocabulary-merge-targets">
                {props.tags.filter((tag) => tag.id !== props.selectedTagId).map((tag) => <option key={tag.id} value={tag.canonicalLabel} />)}
            </datalist>
        </section>
    );
}

export function TagDetailPanel(props: {
    readonly tags: TagDefinitionSummary[];
    readonly selectedDetail: TagDetail | null;
    readonly busyAction: BusyAction;
    readonly renameLabel: string;
    readonly aliasLabel: string;
    readonly mergeTargetLabel: string;
    readonly onRenameLabelChange: (value: string) => void;
    readonly onAliasLabelChange: (value: string) => void;
    readonly onMergeTargetLabelChange: (value: string) => void;
    readonly onRename: () => void;
    readonly onAddAlias: () => void;
    readonly onDeleteAlias: (tagAliasId: string) => void;
    readonly onMerge: () => void;
}) {
    if (!props.selectedDetail) {
        return <div className="border border-dashed border-content/20 rounded-2xl p-6 text-content-secondary text-center">Select a tag to manage its canonical label, aliases, and merge target.</div>;
    }

    return (
        <div className="grid gap-5">
            <SelectedTagCard selectedDetail={props.selectedDetail} />
            <RenameTagSection renameLabel={props.renameLabel} busyAction={props.busyAction} onRenameLabelChange={props.onRenameLabelChange} onRename={props.onRename} />
            <AliasSection aliases={props.selectedDetail.aliases} aliasLabel={props.aliasLabel} busyAction={props.busyAction} onAliasLabelChange={props.onAliasLabelChange} onAddAlias={props.onAddAlias} onDeleteAlias={props.onDeleteAlias} />
            <MergeSection tags={props.tags} selectedTagId={props.selectedDetail.tag.id} mergeTargetLabel={props.mergeTargetLabel} busyAction={props.busyAction} onMergeTargetLabelChange={props.onMergeTargetLabelChange} onMerge={props.onMerge} />
        </div>
    );
}
