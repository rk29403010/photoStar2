import { useMemo, useState } from 'react';
import type { Asset, ReviewItemSummary, TagDefinitionSummary } from '@contracts/core';
import { Section } from './shared';

type TagManagementSectionProps = {
  readonly asset: Asset;
  readonly availableTags?: TagDefinitionSummary[];
  readonly onAssignTag?: (tagLabel: string) => Promise<void>;
  readonly onRemoveTag?: (tagDefinitionId: string) => Promise<void>;
  readonly onSetReviewItemStatus?: (payload: {
    reviewItemId: string;
    status: ReviewItemSummary['status'];
    tagLabel?: string;
  }) => Promise<void>;
}

type TagItem = {
  type: 'assigned' | 'pending';
  label: string;
  sourceKind: string;
  tagDefinitionId?: string;
  reviewItemId?: string;
};

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

type TagItemBadgeProps = {
  readonly tag: TagItem;
  readonly isBusy: boolean;
  readonly onRemove: (tagDefinitionId: string) => Promise<void>;
  readonly onReviewAction: (reviewItemId: string, status: ReviewItemSummary['status'], tagLabel?: string) => Promise<void>;
  readonly onRemoveTagEnabled: boolean;
};

function TagItemBadge({ tag, isBusy, onRemove, onReviewAction, onRemoveTagEnabled }: TagItemBadgeProps) {
  if (tag.type === 'assigned') {
    const removable = tag.sourceKind === 'manual' && onRemoveTagEnabled;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs border font-medium ${
          tag.sourceKind === 'manual'
            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
            : 'bg-content/5 border-content/10 text-content-secondary/90'
        }`}
      >
        <span>{tag.label}</span>
        {removable && (
          <button
            type="button"
            onClick={() => tag.tagDefinitionId && void onRemove(tag.tagDefinitionId)}
            disabled={isBusy}
            className="text-indigo-400 hover:text-indigo-200 bg-transparent border-none p-0 cursor-pointer font-bold leading-none text-xs ml-0.5 disabled:opacity-50"
            title="Remove tag"
          >
            ×
          </button>
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs border font-medium bg-amber-500/10 border-amber-500/35 text-amber-300"
    >
      <span className="italic">{tag.label} (AI)</span>
      <span className="flex items-center gap-1.5 ml-1">
        <button
          type="button"
          onClick={() => tag.reviewItemId && void onReviewAction(tag.reviewItemId, 'approved', tag.label)}
          disabled={isBusy}
          className="text-emerald-400 hover:text-emerald-300 bg-transparent border-none p-0 cursor-pointer font-bold leading-none text-xs disabled:opacity-50"
          title="Approve suggestion"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => tag.reviewItemId && void onReviewAction(tag.reviewItemId, 'rejected')}
          disabled={isBusy}
          className="text-rose-400 hover:text-rose-300 bg-transparent border-none p-0 cursor-pointer font-bold leading-none text-xs disabled:opacity-50"
          title="Reject suggestion"
        >
          ✗
        </button>
      </span>
    </span>
  );
}

function useAssetTags(tags?: Asset['tags'], pendingReviewItems?: Asset['pending_review_items']) {
  return useMemo(() => {
    const assigned: TagItem[] = (tags ?? []).map((t) => ({
      type: 'assigned' as const,
      label: t.canonicalLabel,
      sourceKind: t.sourceKind,
      tagDefinitionId: t.tagDefinitionId,
    }));

    const pending: TagItem[] = (pendingReviewItems ?? [])
      .map((item) => {
        const label = getReviewItemProposedLabel(item);
        return {
          type: 'pending' as const,
          label,
          sourceKind: 'ai_proposal',
          reviewItemId: item.id,
        };
      })
      .filter((t) => t.label.length > 0);

    return [...assigned, ...pending].sort((a, b) => a.label.localeCompare(b.label));
  }, [tags, pendingReviewItems]);
}

type AddTagInputProps = {
  readonly onAssignTag: (tagLabel: string) => Promise<void>;
  readonly suggestedLabels: string[];
  readonly busyKey: string | null;
  readonly setBusyKey: (key: string | null) => void;
};

function AddTagInput({ onAssignTag, suggestedLabels, busyKey, setBusyKey }: AddTagInputProps) {
  const [newTagLabel, setNewTagLabel] = useState('');

  const handleAddTag = async () => {
    const trimmed = newTagLabel.trim();
    if (!trimmed) {
      return;
    }
    setBusyKey('add-tag');
    try {
      await onAssignTag(trimmed);
      setNewTagLabel('');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        value={newTagLabel}
        list={suggestedLabels.length > 0 ? 'canonical-tag-suggestions' : undefined}
        onChange={(e) => setNewTagLabel(e.target.value)}
        placeholder="Add or reuse tag"
        className="flex-1 min-w-[150px] h-8 bg-surface-secondary text-content border border-content/10 rounded px-2.5 text-xs outline-none focus:border-brand-accent/50"
      />
      <button
        type="button"
        onClick={() => void handleAddTag()}
        disabled={busyKey === 'add-tag' || newTagLabel.trim().length === 0}
        className="border border-brand-accent/30 bg-brand-accent/10 text-brand-accent rounded cursor-pointer px-3 h-8 text-xs font-bold hover:bg-brand-accent/20 active:scale-95 motion-safe:transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Add Tag
      </button>
      {suggestedLabels.length > 0 && (
        <datalist id="canonical-tag-suggestions">
          {suggestedLabels.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
      )}
    </div>
  );
}

export function TagManagementSection(props: TagManagementSectionProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const suggestedLabels = useMemo(() => getSuggestedTagLabels(props.availableTags), [props.availableTags]);
  const allTags = useAssetTags(props.asset.tags, props.asset.pending_review_items);

  const handleRemove = async (tagDefinitionId: string) => {
    if (!props.onRemoveTag) {
      return;
    }
    setBusyKey(`remove-${tagDefinitionId}`);
    try {
      await props.onRemoveTag(tagDefinitionId);
    } finally {
      setBusyKey(null);
    }
  };

  const handleReviewAction = async (reviewItemId: string, status: ReviewItemSummary['status'], tagLabel?: string) => {
    if (!props.onSetReviewItemStatus) {
      return;
    }
    setBusyKey(reviewItemId);
    try {
      await props.onSetReviewItemStatus({ reviewItemId, status, tagLabel });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Section emoji="🏷️" title="Tags">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5 bg-surface-secondary/40 border border-content/5 rounded-lg p-2.5 min-h-[50px] items-center">
          {allTags.length === 0 ? (
            <div className="text-xs text-content-secondary/60 italic">No tags assigned.</div>
          ) : (
            allTags.map((tag) => {
              const isBusy = busyKey === `remove-${tag.tagDefinitionId}` || busyKey === tag.reviewItemId;
              return (
                <TagItemBadge
                  key={tag.type === 'assigned' ? `${tag.tagDefinitionId}-${tag.sourceKind}` : tag.reviewItemId}
                  tag={tag}
                  isBusy={isBusy}
                  onRemove={handleRemove}
                  onReviewAction={handleReviewAction}
                  onRemoveTagEnabled={Boolean(props.onRemoveTag)}
                />
              );
            })
          )}
        </div>

        {props.onAssignTag && (
          <AddTagInput
            onAssignTag={props.onAssignTag}
            suggestedLabels={suggestedLabels}
            busyKey={busyKey}
            setBusyKey={setBusyKey}
          />
        )}
      </div>
    </Section>
  );
}
