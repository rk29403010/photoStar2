import type { ReactNode } from "react";

export type InlineFeedbackMode = "inline";

type InlineFeedbackProps = {
  readonly actions?: ReactNode;
  readonly message: string;
  readonly mode: InlineFeedbackMode;
  readonly state?: "error" | "pending" | "ready";
};

export function InlineFeedback(props: InlineFeedbackProps) {
  const state = props.state ?? "ready";
  const tone = state === "error"
    ? "border-danger/40 text-danger"
    : "border-content/10 text-content-secondary";
  return (
    <div
      className={`space-y-2 rounded-md border bg-surface-secondary p-3 text-xs ${tone}`}
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
      data-feedback-mode={props.mode}
    >
      <p className="break-words">{props.message}</p>
      {props.actions}
    </div>
  );
}
