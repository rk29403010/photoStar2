import { useMemo, useState } from 'react';
import type { Asset, ReviewItemSummary, TagDefinitionSummary } from '@contracts/core';
import { Section } from './shared';

interface TagManagementSectionProps {
  asset: Asset;
  availableTags?: TagDefinitionSummary[];
  onAssignTag?: (tagLabel: string) => Promise<void>;
  onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
}

function getReviewItemProposedLabel(reviewItem: ReviewItemSummary) {
  try {
    const parsed = JSON.parse(reviewItem.payloadJson) as { proposedLabel?: unknown };
    return typeof parsed.proposedLabel === 'string' ? parsed.proposedLabel.trim() : '';
  } catch {
    return '';
  }
}

function getSuggestedTagLabels(availableTags: TagDefinitionSummary[] | undefined) {
  return (availableTags ?? []).map((tag) => tag.canonicalLabel);
}

function getManualTags(asset: Asset) {
  return (asset.tags ?? []).filter((tag) => tag.sourceKind === 'manual');
}

function getNonManualTags(asset: Asset) {
  return (asset.tags ?? []).filter((tag) => tag.sourceKind !== 'manual');
}

function EmptyTagState({ message }: { message: string }) {
  return <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>{message}</div>;
}

function TagBadge(props: {
  label: string;
  sourceLabel: string;
  removable: boolean;
  onRemove?: () => void;
  busy: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.55)' }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{props.label}</div>
        <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{props.sourceLabel}</div>
      </div>
      {props.removable ? (
        <button type="button" onClick={props.onRemove} disabled={props.busy} style={{ border: '1px solid rgba(248,113,113,0.35)', background: 'transparent', color: '#fca5a5', borderRadius: 8, cursor: props.busy ? 'wait' : 'pointer', padding: '4px 8px', fontSize: 11 }}>
          Remove
        </button>
      ) : null}
    </div>
  );
}

function TagAssignmentList(props: {
  asset: Asset;
  busyKey: string | null;
  onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  setBusyKey: (value: string | null) => void;
}) {
  const manualTags = getManualTags(props.asset);
  const nonManualTags = getNonManualTags(props.asset);

  if (manualTags.length === 0 && nonManualTags.length === 0) {
    return <EmptyTagState message="No canonical tags assigned yet." />;
  }

  const handleRemove = async (tagDefinitionId: string) => {
    if (!props.onRemoveTag) {
      return;
    }
    props.setBusyKey(`remove-${tagDefinitionId}`);
    try {
      await props.onRemoveTag(tagDefinitionId);
    } finally {
      props.setBusyKey(null);
    }
  };

  return (
    <>
      {manualTags.map((tag) => (
        <TagBadge key={`${tag.tagDefinitionId}-${tag.sourceKind}`} label={tag.canonicalLabel} sourceLabel="manual" removable={Boolean(props.onRemoveTag)} busy={props.busyKey === `remove-${tag.tagDefinitionId}`} onRemove={props.onRemoveTag ? () => void handleRemove(tag.tagDefinitionId) : undefined} />
      ))}
      {nonManualTags.map((tag) => (
        <TagBadge key={`${tag.tagDefinitionId}-${tag.sourceKind}`} label={tag.canonicalLabel} sourceLabel={tag.sourceKind} removable={false} busy={false} />
      ))}
    </>
  );
}

function TagInputRow(props: {
  newTagLabel: string;
  suggestedLabels: string[];
  busyKey: string | null;
  onAssignTag?: (tagLabel: string) => Promise<void>;
  onNewTagLabelChange: (value: string) => void;
  setBusyKey: (value: string | null) => void;
}) {
  if (!props.onAssignTag) {
    return null;
  }

  const handleAddTag = async () => {
    const trimmed = props.newTagLabel.trim();
    if (!trimmed) {
      return;
    }
    props.setBusyKey('add-tag');
    try {
      await props.onAssignTag?.(trimmed);
      props.onNewTagLabelChange('');
    } finally {
      props.setBusyKey(null);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="text" value={props.newTagLabel} list={props.suggestedLabels.length > 0 ? 'canonical-tag-suggestions' : undefined} onChange={(event) => props.onNewTagLabelChange(event.target.value)} placeholder="Add or reuse a canonical tag" style={{ flex: 1, minWidth: 0, background: 'rgba(15,23,42,0.75)', color: '#e2e8f0', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 8, padding: '8px 10px', fontSize: 12 }} />
      <button type="button" onClick={() => void handleAddTag()} disabled={props.busyKey === 'add-tag' || props.newTagLabel.trim().length === 0} style={{ border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(37,99,235,0.18)', color: '#bfdbfe', borderRadius: 8, cursor: props.busyKey === 'add-tag' ? 'wait' : 'pointer', padding: '8px 12px', fontSize: 11, fontWeight: 600 }}>
        Add Tag
      </button>
      {props.suggestedLabels.length > 0 ? (
        <datalist id="canonical-tag-suggestions">
          {props.suggestedLabels.map((label) => <option key={label} value={label} />)}
        </datalist>
      ) : null}
    </div>
  );
}

function PendingTagProposals(props: {
  pendingReviewItems: ReviewItemSummary[];
  busyKey: string | null;
  onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
  setBusyKey: (value: string | null) => void;
}) {
  const handleReviewAction = async (reviewItemId: string, status: ReviewItemSummary['status'], tagLabel?: string) => {
    if (!props.onSetReviewItemStatus) {
      return;
    }
    props.setBusyKey(reviewItemId);
    try {
      await props.onSetReviewItemStatus({ reviewItemId, status, tagLabel });
    } finally {
      props.setBusyKey(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6 }}>Pending Tag Proposals</div>
      {props.pendingReviewItems.length === 0 ? (
        <EmptyTagState message="No pending tag proposals for this photo." />
      ) : (
        props.pendingReviewItems.map((reviewItem) => {
          const proposedLabel = getReviewItemProposedLabel(reviewItem) || 'Untitled proposal';
          return (
            <div key={reviewItem.id} style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 10, padding: 10, background: 'rgba(15,23,42,0.45)' }}>
              <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, marginBottom: 4 }}>{proposedLabel}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>AI suggested this as a new canonical tag.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => void handleReviewAction(reviewItem.id, 'approved', proposedLabel)} disabled={props.busyKey === reviewItem.id} style={{ border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(34,197,94,0.12)', color: '#86efac', borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: props.busyKey === reviewItem.id ? 'wait' : 'pointer' }}>
                  Approve
                </button>
                <button type="button" onClick={() => void handleReviewAction(reviewItem.id, 'rejected')} disabled={props.busyKey === reviewItem.id} style={{ border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: props.busyKey === reviewItem.id ? 'wait' : 'pointer' }}>
                  Reject
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function TagManagementSection(props: TagManagementSectionProps) {
  const [newTagLabel, setNewTagLabel] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const pendingReviewItems = props.asset.pending_review_items ?? [];
  const suggestedLabels = useMemo(() => getSuggestedTagLabels(props.availableTags), [props.availableTags]);

  return (
    <Section emoji="🏷️" title="Canonical Tags">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <TagAssignmentList asset={props.asset} busyKey={busyKey} onRemoveTag={props.onRemoveTag} setBusyKey={setBusyKey} />
        <TagInputRow newTagLabel={newTagLabel} suggestedLabels={suggestedLabels} busyKey={busyKey} onAssignTag={props.onAssignTag} onNewTagLabelChange={setNewTagLabel} setBusyKey={setBusyKey} />
        <PendingTagProposals pendingReviewItems={pendingReviewItems} busyKey={busyKey} onSetReviewItemStatus={props.onSetReviewItemStatus} setBusyKey={setBusyKey} />
      </div>
    </Section>
  );
}
