import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReviewItemSummary, TagDefinitionSummary } from '@contracts/core';

type ReviewsViewProps = {
    readonly active: boolean;
    readonly listReviewItems: (payload: {
        status?: ReviewItemSummary['status'];
        reviewItemType?: ReviewItemSummary['reviewItemType'];
        subjectType?: string;
        subjectId?: string;
    }) => Promise<ReviewItemSummary[]>;
    readonly listAvailableTags: () => Promise<TagDefinitionSummary[]>;
    readonly setReviewItemStatus: (payload: {
        reviewItemId: string;
        status: ReviewItemSummary['status'];
        tagLabel?: string;
    }) => Promise<void>;
}

function getProposedLabel(reviewItem: ReviewItemSummary) {
    try {
        const parsed = JSON.parse(reviewItem.payloadJson) as { proposedLabel?: unknown };
        return typeof parsed.proposedLabel === 'string' ? parsed.proposedLabel.trim() : '';
    } catch {
        return '';
    }
}

function useReviewInboxData(props: ReviewsViewProps) {
    const { active, listAvailableTags, listReviewItems } = props;
    const [reviewItems, setReviewItems] = useState<ReviewItemSummary[]>([]);
    const [availableTags, setAvailableTags] = useState<TagDefinitionSummary[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [nextReviewItems, nextAvailableTags] = await Promise.all([
                listReviewItems({ status: 'pending', reviewItemType: 'tag_proposal' }),
                listAvailableTags(),
            ]);
            setReviewItems(nextReviewItems);
            setAvailableTags(nextAvailableTags);
        } finally {
            setLoading(false);
        }
    }, [listAvailableTags, listReviewItems]);

    useEffect(() => {
        if (!active) {
            return;
        }
        void refresh();
    }, [active, refresh]);

    return { reviewItems, availableTags, loading, refresh };
}

function ReviewRow(props: {
    readonly reviewItem: ReviewItemSummary;
    readonly availableTags: TagDefinitionSummary[];
    readonly onDecide: (payload: { reviewItemId: string; status: ReviewItemSummary['status']; tagLabel?: string }) => Promise<void>;
}) {
    const proposedLabel = getProposedLabel(props.reviewItem);
    const [tagLabel, setTagLabel] = useState(proposedLabel);
    const [busy, setBusy] = useState(false);

    const handleAction = async (status: ReviewItemSummary['status']) => {
        setBusy(true);
        try {
            await props.onDecide({
                reviewItemId: props.reviewItem.id,
                status,
                tagLabel: status === 'approved' ? tagLabel.trim() || proposedLabel : undefined,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <article className="border border-content/10 rounded-2xl bg-surface-secondary p-4 grid gap-3">
            <div>
                <div className="text-xs uppercase tracking-wider text-brand-accent mb-1.5">{props.reviewItem.reviewItemType.replaceAll('_', ' ')}</div>
                <div className="text-lg font-bold text-content mb-1">{proposedLabel || 'Untitled proposal'}</div>
                <div className="text-xs text-content-secondary">Subject: {props.reviewItem.subjectType} {props.reviewItem.subjectId}</div>
            </div>
            <label className="grid gap-1.5">
                <span className="text-xs text-content-secondary uppercase tracking-wide">Approve As</span>
                <input
                    type="text"
                    value={tagLabel}
                    list="reviews-tag-suggestions"
                    onChange={(event) => setTagLabel(event.target.value)}
                    className="bg-surface text-content border border-content/20 rounded-lg p-2.5 px-3 text-sm focus:border-brand-accent focus:outline-none"
                />
            </label>
            <div className="flex gap-2">
                <button 
                    type="button" 
                    disabled={busy} 
                    onClick={() => void handleAction('approved')} 
                    className={`border border-green-500/35 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-150 disabled:opacity-50 ${busy ? 'cursor-wait' : 'cursor-pointer'}`}
                >
                    Approve
                </button>
                <button 
                    type="button" 
                    disabled={busy} 
                    onClick={() => void handleAction('rejected')} 
                    className={`border border-red-500/35 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg px-3 py-2 text-xs font-semibold transition-colors duration-150 disabled:opacity-50 ${busy ? 'cursor-wait' : 'cursor-pointer'}`}
                >
                    Reject
                </button>
            </div>
            <datalist id="reviews-tag-suggestions">
                {props.availableTags.map((tag) => <option key={tag.id} value={tag.canonicalLabel} />)}
            </datalist>
        </article>
    );
}

export function ReviewsView(props: ReviewsViewProps) {
    const { reviewItems, availableTags, loading, refresh } = useReviewInboxData(props);
    const tagCountLabel = useMemo(() => `${availableTags.length} approved tags`, [availableTags.length]);

    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-surface text-content p-6">
            <div className="flex justify-between items-end gap-4 mb-6">
                <div>
                    <div className="text-xs text-brand-accent uppercase tracking-widest mb-2">Review Inbox</div>
                    <h2 className="m-0 text-3xl font-bold">Pending Tag Proposals</h2>
                    <div className="mt-2 text-sm text-content-secondary">{reviewItems.length} pending proposals, {tagCountLabel}</div>
                </div>
                <button 
                    type="button" 
                    onClick={() => void refresh()} 
                    disabled={loading} 
                    className={`border border-brand-accent/35 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/25 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition-colors duration-150 disabled:opacity-50 ${loading ? 'cursor-wait' : 'cursor-pointer'}`}
                >
                    Refresh
                </button>
            </div>

            {reviewItems.length === 0 ? (
                <div className="border border-dashed border-content/20 rounded-2xl p-6 text-content-secondary text-center">
                    No pending tag proposals right now.
                </div>
            ) : (
                <div className="grid gap-4">
                    {reviewItems.map((reviewItem) => (
                        <ReviewRow
                            key={reviewItem.id}
                            reviewItem={reviewItem}
                            availableTags={availableTags}
                            onDecide={async (payload) => {
                                await props.setReviewItemStatus(payload);
                                await refresh();
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
