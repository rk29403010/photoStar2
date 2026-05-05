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
        <article style={{ border: '1px solid rgba(148,163,184,0.18)', borderRadius: 14, background: 'rgba(15,23,42,0.55)', padding: 16, display: 'grid', gap: 12 }}>
            <div>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#60a5fa', marginBottom: 6 }}>{props.reviewItem.reviewItemType.replaceAll('_', ' ')}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{proposedLabel || 'Untitled proposal'}</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Subject: {props.reviewItem.subjectType} {props.reviewItem.subjectId}</div>
            </div>
            <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Approve As</span>
                <input
                    type="text"
                    value={tagLabel}
                    list="reviews-tag-suggestions"
                    onChange={(event) => setTagLabel(event.target.value)}
                    style={{ background: '#111827', color: '#e5e7eb', border: '1px solid rgba(148,163,184,0.24)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}
                />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" disabled={busy} onClick={() => void handleAction('approved')} style={{ border: '1px solid rgba(74,222,128,0.38)', background: 'rgba(34,197,94,0.14)', color: '#86efac', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
                    Approve
                </button>
                <button type="button" disabled={busy} onClick={() => void handleAction('rejected')} style={{ border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(239,68,68,0.12)', color: '#fca5a5', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
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
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: '#06080d', color: '#e5e7eb', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 24 }}>
                <div>
                    <div style={{ fontSize: 12, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Review Inbox</div>
                    <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Pending Tag Proposals</h2>
                    <div style={{ marginTop: 8, fontSize: 13, color: '#94a3b8' }}>{reviewItems.length} pending proposals, {tagCountLabel}</div>
                </div>
                <button type="button" onClick={() => void refresh()} disabled={loading} style={{ border: '1px solid rgba(96,165,250,0.35)', background: 'rgba(37,99,235,0.12)', color: '#bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
                    Refresh
                </button>
            </div>

            {reviewItems.length === 0 ? (
                <div style={{ border: '1px dashed rgba(148,163,184,0.2)', borderRadius: 16, padding: 24, color: '#94a3b8', textAlign: 'center' }}>
                    No pending tag proposals right now.
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 16 }}>
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
