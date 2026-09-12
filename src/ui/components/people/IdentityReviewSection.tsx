import { Trash2 } from 'lucide-react';
import { resolveImageUrl } from '@boundary/runtime/backend';
import { InlineFeedback } from '../feedback/InlineFeedback';
import { IdentityReviewControl, IdentityReviewErrorBoundary } from './IdentityReviewControl';
import type { FaceAssignmentInfo, useFaceAssignmentActions, usePersonDetailData } from './identityReviewData';

function AssignmentImage(props: { readonly assignment: FaceAssignmentInfo; readonly alt: string }) {
    return <img src={resolveImageUrl(props.assignment.preview_path || props.assignment.original_path) || undefined}
        alt={props.alt} className="h-full w-full object-cover" />;
}

function ConfirmedAssignmentCard(props: {
    readonly assignment: FaceAssignmentInfo;
    readonly onUnmatch: (faceId: string) => Promise<void>;
}) {
    return (
        <div className="group relative aspect-square overflow-hidden rounded-lg border border-content/10 bg-surface-secondary">
            <AssignmentImage assignment={props.assignment} alt="Confirmed person match" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                <button onClick={() => { void props.onUnmatch(props.assignment.face_id); }} title="Unmatch / Isolate Face">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

function SuggestedAssignmentCard(props: {
    readonly assignment: FaceAssignmentInfo;
    readonly personName: string;
    readonly onReview: ReturnType<typeof useFaceAssignmentActions>['review'];
}) {
    const candidatePeople = props.assignment.candidate_people ?? [];
    return (
        <div className="overflow-hidden rounded-lg border border-content/10 bg-surface-secondary">
            <div className="relative aspect-square">
                <AssignmentImage assignment={props.assignment} alt="Suggested person match" />
                <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                    Similarity {props.assignment.confidence.toFixed(2)}
                </div>
            </div>
            <IdentityReviewControl candidateName={props.personName} candidatePeople={candidatePeople}
                onRespond={(kind, wording) => props.onReview(
                    props.assignment.face_id, kind, wording, candidatePeople,
                )} />
        </div>
    );
}

export function AssignmentGrid(props: {
    readonly assignments: FaceAssignmentInfo[];
    readonly personName: string;
    readonly suggested: boolean;
    readonly actions: ReturnType<typeof useFaceAssignmentActions>;
}) {
    if (props.assignments.length === 0) {
        return <div className="p-6 bg-content/5 rounded-xl text-center text-sm text-content-secondary">No {props.suggested ? 'suggested matches' : 'confirmed photos'}.</div>;
    }
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {props.assignments.map((assignment) => props.suggested
                ? <SuggestedAssignmentCard key={assignment.face_id} assignment={assignment}
                    personName={props.personName} onReview={props.actions.review} />
                : <ConfirmedAssignmentCard key={assignment.face_id} assignment={assignment}
                    onUnmatch={props.actions.unmatch} />)}
        </div>
    );
}

export function IdentityReviewSection(props: {
    readonly actions: ReturnType<typeof useFaceAssignmentActions>;
    readonly data: ReturnType<typeof usePersonDetailData>;
    readonly personName: string;
}) {
    const suggestions = props.data.assignments.filter((item) => item.is_suggested === 1);
    let content = <AssignmentGrid assignments={suggestions} personName={props.personName}
        suggested actions={props.actions} />;
    if (props.data.loading) {
        content = <InlineFeedback mode="inline" state="pending" message="Loading identity suggestions…" />;
    } else if (props.data.error) {
        content = <InlineFeedback mode="inline" state="error" message={props.data.error}
            actions={<button type="button" onClick={() => void props.data.loadAssignments()}>Try again</button>} />;
    }
    return (
        <IdentityReviewErrorBoundary onRetry={() => void props.data.loadAssignments()}>
            <section>
                <h3>Suggested Matches</h3>
                {content}
                {props.actions.feedback && (
                    <InlineFeedback mode="inline" state={props.actions.feedback.state}
                        message={props.actions.feedback.message}
                        actions={props.actions.feedback.state === 'error'
                            ? <button type="button" onClick={props.actions.retry}>Try again</button>
                            : undefined} />
                )}
            </section>
        </IdentityReviewErrorBoundary>
    );
}
