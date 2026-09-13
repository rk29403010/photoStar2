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

## WP16e automated acceptance — 2026-09-14

| Required journey | Executable evidence |
| --- | --- |
| Fresh DB and representative ingest | `workflow-runtime-scan-folder.test.cjs`, `workflow-runtime-folder-ingest-commands.test.cjs`, and the full core suite |
| Library open, render, paging and scrolling | `workflow-runtime-progress-and-library-order.test.cjs`, gallery browse/timeline UI tests, and isolated `ui:smoke` |
| Single, range, presentation and timeline selection | `library-gallery-selection.test.cjs`, `library-gallery-presentation-selection.test.cjs`, and timeline selection model tests |
| Bulk actions expand underlying Assets | `selected semantic stack expands bulk actions from presentation membership` plus target selection benchmark |
| Presentation member/filmstrip expansion | `single-photo asset indexes resolve presentation expansion members without group state` and `findSinglePhotoPresentation resolves both representative and non-visible member assets` |
| Editor persistence/render boundary | `photo-edit-schema.test.cjs`, `photo-edit-commands.test.cjs`, `photo-edit-semantic-provenance.test.cjs`, and editor UI suites |
| People load/review/merge/isolate | WP10e/g, WP12c-g and WP13a-d core/UI suites |
| Uncertain testimony and recovery states | WP13b/c/e behavior suites and WP13d loading/error/retry UI contract tests |

The first complete core run exposed a fresh-database regression: a dirty but
empty capture presentation cache was treated like a usable stale projection,
so library queries returned no Assets. Cache reads now rebuild only when no
last-successful rows exist; dirty populated caches still retain the previous
successful projection until the tracked grouping workflow replaces it. The
targeted failures then passed, followed by the complete suite: 394 passed, one
intentional skip, zero failures. All 147 UI tests passed. Isolated desktop
`ui:smoke --force` rendered a visible root without browser/runtime errors.

## CI diagnostics integration

PR #44 merges cleanly locally; its workflow-policy tests pass. Its recorded CI
failure successfully uploaded `qa-merge-log`, proving artifact availability.
Canonical integration validation remains required before publication.
