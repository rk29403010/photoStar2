import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { InlineFeedback } from '../feedback/InlineFeedback';
import {
    buildIdentityReviewChoices,
    type IdentityCandidatePerson,
    type IdentityReviewKind,
} from './identityReviewChoices';

export function IdentityReviewControl(props: {
    readonly candidateName: string;
    readonly candidatePeople: readonly IdentityCandidatePerson[];
    readonly onRespond: (kind: IdentityReviewKind, wording: string) => Promise<void>;
}) {
    const choices = useMemo(() => buildIdentityReviewChoices(props.candidatePeople), [props.candidatePeople]);
    const [kind, setKind] = useState<IdentityReviewKind>('definite_identification');
    const [busy, setBusy] = useState(false);
    const selectedChoice = choices.find((choice) => choice.kind === kind) ?? choices[0]!;

    const submit = async () => {
        setBusy(true);
        try {
            await props.onRespond(selectedChoice.kind, selectedChoice.label);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="grid gap-2 p-3">
            <label className="grid gap-1 text-xs text-content-secondary">
                <span>Is this {props.candidateName}?</span>
                <select
                    aria-label={`Identity certainty for ${props.candidateName}`}
                    className="rounded-md border border-content/20 bg-surface p-2 text-content"
                    disabled={busy}
                    value={kind}
                    onChange={(event) => setKind(event.target.value as IdentityReviewKind)}
                >
                    {choices.map((choice) => (
                        <option key={choice.kind} value={choice.kind}>{choice.label}</option>
                    ))}
                </select>
            </label>
            <button
                type="button"
                className="rounded-md bg-brand-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => void submit()}
            >
                {busy ? 'Saving…' : 'Save response'}
            </button>
        </div>
    );
}

export class IdentityReviewErrorBoundary extends Component<
    { children: ReactNode; onRetry: () => void },
    { error: string | null }
> {
    state = { error: null as string | null };

    static getDerivedStateFromError(error: Error) {
        return { error: error.message };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Identity review controls failed', error, info);
    }

    private readonly retry = () => {
        this.setState({ error: null });
        this.props.onRetry();
    };

    render() {
        if (!this.state.error) {
            return this.props.children;
        }
        return (
            <InlineFeedback
                mode="inline"
                state="error"
                message="Identity review controls could not be shown."
                actions={<button type="button" onClick={this.retry}>Try again</button>}
            />
        );
    }
}
