# Local semantic integration acceptance

Local integration continuation on 2026-09-12, based on `e3491b4`.

## Confirmed regressions and repairs

- WP13e: a disposable SQLite database demonstrated that soft rebuild deleted
  Contributor profiles and review responses. The reset snapshot also omitted
  attribution, subjective certainty and original wording. The regression test
  now checks full records across reset and reopen, including unknown, abstain,
  conflicting testimony and superseding decisions. Existing semantic and stable
  Face reset tests remain green.
- WP13d: browser inspection showed Close immediately reopened Person details.
  The close callback dispatched a refresh synchronously, allowing the old
  selection closure to restore the person. Closing now only clears selection;
  browser reinspection confirmed dismissal.
- WP13d: a 1280-pixel browser viewport showed clipped certainty and Save controls
  in five-column suggestion cards. Suggested cards now use at most three columns
  and the native selector stays within the card width.

## Runtime evidence

- Registered local integration branch: `task/semantic-relationships-phase1-foundation`.
- Runtime: `dev:desktop-runtime`, web 5913, backend 5914.
- Disposable profile: `.local/acceptance-profile/PhotoLibraryDesktop`.
- Real People journey displayed all eight certainty choices, including named
  ambiguity between Alice and Mary, and raw similarity `0.81`.
- Keyboard selection and Save produced `Identity response saved.` for
  `unknown_no_clue`; database inspection confirmed original wording `I don't know`,
  no accepted/rejected candidate decision, and dismissal of reviewed candidates.
- Full remaining acceptance and WP15/WP16 gates are still in progress.

## CI diagnostics integration

PR #44 merges cleanly locally; its workflow-policy tests pass. Its recorded CI
failure successfully uploaded `qa-merge-log`, proving artifact availability.
Canonical integration validation remains required before publication.
