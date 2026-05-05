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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
            <div>
                <div style={{ fontSize: 12, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Vocabulary</div>
                <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Canonical Tag Management</h2>
                <div style={{ marginTop: 8, fontSize: 13, color: '#94a3b8' }}>{props.tagCount} active tags available for curation.</div>
            </div>
            <button type="button" onClick={props.onRefresh} disabled={props.loading} style={{ border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(37,99,235,0.12)', color: '#bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: props.loading ? 'wait' : 'pointer' }}>
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
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <input type="text" value={props.searchText} onChange={(event) => props.onSearchTextChange(event.target.value)} placeholder="Search tags or categories" style={{ width: 320, maxWidth: '100%', background: '#111827', color: '#e5e7eb', border: '1px solid rgba(148,163,184,0.24)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }} />
            {props.errorMessage ? <span style={{ color: '#fca5a5', fontSize: 12 }}>{props.errorMessage}</span> : null}
        </div>
    );
}

export function TagList(props: {
    readonly tags: TagDefinitionSummary[];
    readonly selectedTagId: string | null;
    readonly onSelect: (tagDefinitionId: string) => void;
}) {
    if (props.tags.length === 0) {
        return <div style={{ border: '1px dashed rgba(148,163,184,0.2)', borderRadius: 16, padding: 20, color: '#94a3b8' }}>No tags match that search.</div>;
    }

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            {props.tags.map((tag) => {
                const selected = tag.id === props.selectedTagId;
                return (
                    <button key={tag.id} type="button" onClick={() => props.onSelect(tag.id)} style={{ textAlign: 'left', borderRadius: 14, border: selected ? '1px solid rgba(96,165,250,0.55)' : '1px solid rgba(148,163,184,0.16)', background: selected ? 'rgba(30,41,59,0.95)' : 'rgba(15,23,42,0.55)', color: '#e2e8f0', padding: 14, cursor: 'pointer', display: 'grid', gap: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{tag.canonicalLabel}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
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
        <section style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 16, background: 'rgba(15,23,42,0.55)', padding: 18, display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selected Tag</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{props.selectedDetail.tag.canonicalLabel}</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
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
        <section style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 16, background: 'rgba(15,23,42,0.55)', padding: 18, display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Rename Canonical Tag</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input type="text" value={props.renameLabel} onChange={(event) => props.onRenameLabelChange(event.target.value)} style={{ flex: '1 1 280px', background: '#111827', color: '#e5e7eb', border: '1px solid rgba(148,163,184,0.24)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }} />
                <button type="button" onClick={props.onRename} disabled={props.busyAction !== null || !props.renameLabel.trim()} style={{ border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(37,99,235,0.12)', color: '#bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: props.busyAction ? 'wait' : 'pointer' }}>
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
        <section style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 16, background: 'rgba(15,23,42,0.55)', padding: 18, display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Aliases</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input type="text" value={props.aliasLabel} onChange={(event) => props.onAliasLabelChange(event.target.value)} placeholder="Add alias" style={{ flex: '1 1 280px', background: '#111827', color: '#e5e7eb', border: '1px solid rgba(148,163,184,0.24)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }} />
                <button type="button" onClick={props.onAddAlias} disabled={props.busyAction !== null || !props.aliasLabel.trim()} style={{ border: '1px solid rgba(74,222,128,0.38)', background: 'rgba(34,197,94,0.14)', color: '#86efac', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: props.busyAction ? 'wait' : 'pointer' }}>
                    Add Alias
                </button>
            </div>
            {props.aliases.length === 0 ? <div style={{ fontSize: 12, color: '#94a3b8' }}>No aliases yet.</div> : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {props.aliases.map((alias) => (
                        <button key={alias.id} type="button" onClick={() => props.onDeleteAlias(alias.id)} disabled={props.busyAction !== null} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, border: '1px solid rgba(148,163,184,0.22)', background: 'rgba(15,23,42,0.8)', color: '#e2e8f0', padding: '8px 12px', cursor: props.busyAction ? 'wait' : 'pointer' }}>
                            <span>{alias.aliasLabel}</span>
                            <span style={{ color: '#fca5a5', fontSize: 12 }}>Remove</span>
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
        <section style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 16, background: 'rgba(15,23,42,0.55)', padding: 18, display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Merge Into Another Tag</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Use this when two canonical tags describe the same concept and one should become the long-term target.</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <input type="text" value={props.mergeTargetLabel} list="tag-vocabulary-merge-targets" onChange={(event) => props.onMergeTargetLabelChange(event.target.value)} placeholder="Target canonical tag" style={{ flex: '1 1 280px', background: '#111827', color: '#e5e7eb', border: '1px solid rgba(148,163,184,0.24)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }} />
                <button type="button" onClick={props.onMerge} disabled={props.busyAction !== null || !props.mergeTargetLabel.trim()} style={{ border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: props.busyAction ? 'wait' : 'pointer' }}>
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
        return <div style={{ border: '1px dashed rgba(148,163,184,0.2)', borderRadius: 16, padding: 24, color: '#94a3b8' }}>Select a tag to manage its canonical label, aliases, and merge target.</div>;
    }

    return (
        <div style={{ display: 'grid', gap: 18 }}>
            <SelectedTagCard selectedDetail={props.selectedDetail} />
            <RenameTagSection renameLabel={props.renameLabel} busyAction={props.busyAction} onRenameLabelChange={props.onRenameLabelChange} onRename={props.onRename} />
            <AliasSection aliases={props.selectedDetail.aliases} aliasLabel={props.aliasLabel} busyAction={props.busyAction} onAliasLabelChange={props.onAliasLabelChange} onAddAlias={props.onAddAlias} onDeleteAlias={props.onDeleteAlias} />
            <MergeSection tags={props.tags} selectedTagId={props.selectedDetail.tag.id} mergeTargetLabel={props.mergeTargetLabel} busyAction={props.busyAction} onMergeTargetLabelChange={props.onMergeTargetLabelChange} onMerge={props.onMerge} />
        </div>
    );
}
