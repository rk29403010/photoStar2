# Acceptance debugging: People and variants

## Scope and preserved evidence

2026-09-26, root checkout `task/fix-relationships-timeline-regressions`, base
`b372a33c9f697cc7cea19785c58f633dcbcc8237`. This is real-data acceptance debugging,
not a reopening of deferred semantic-relationships architecture work.

The existing 37-asset database is
`worktrees/semantic-relationships-phase1-foundation/.local/acceptance-profile/PhotoLibraryDesktop/library.db`.
It must not be reset, recreated or overwritten. A read-only SQLite backup was
saved to `artifacts/acceptance-debug/library-before.sqlite`; local diagnostics
are intentionally not source-controlled. Normal face workflows update derived
analysis in the original database. Original assets and the fixture are retained.

## Initial People evidence

| Boundary | Observed before repair |
| --- | --- |
| Detected faces | 52 on 18 of 36 analysed assets |
| Recognition issues | 18 identical ArcFace-model-not-found warnings |
| Face-vector generations | 19 successful, all empty; no failed generation recorded |
| Active face-vector heads | 19, including the old candidate fixture; all zero vectors |
| `face_embedding` vectors / represented stable Faces | 0 / 0 |
| Stable Faces stored | 53 including the fixture |
| Identity clusters / members | 0 / 0 |
| `face_assignments` | 0 |
| People | Alice and Mary, each zero faces/photos |

The grouped recognition message is exactly `ArcFace model not found. Run tooling/scripts/core/download_arcface_model.cjs to install w600k_r50.onnx.` (18 issues).
The complete initial generation-head rows are retained in
`artifacts/acceptance-debug/baseline.json` under `heads`.

The root runtime resolves `C:/Users/robin/Projects/photoStar2/deployments/common/models/w600k_r50.onnx`, size
174383860 bytes. The acceptance profile and previous semantic worktree do not
contain that model. The root runtime's recognizer reports it available. No
download or threshold adjustment was required.

`generate-face-vectors` previously recorded missing-model warnings and returned
a successful artifact. Thus 36/36 meant invocations returned, not embeddings
were generated. Failures now throw through the existing workflow failure path,
retaining processing issues and previous successful generation heads. No-face
assets still legitimately publish successful empty generations.

The first real rerun generated all 52 embeddings, exposing a second failure:
IdentityCluster rejected confidence greater than one. Read-only inspection of
real vectors found 14 self-cosines above one, maximum `1.0000000000000002`.
Cosine output now clamps roundoff to its mathematical interval [-1, 1]. Zero
vectors still yield NaN and invalid inputs are not manufactured into confidence.
Recognition thresholds remain unchanged.

## Reporting repairs

- Control nodes now record completed step scope. Previously collect had no
  step record, and the visualiser displayed invented idle 0/0 progress.
- Successful terminal steps report completed input scope rather than dividing
  one batch invocation by 36 assets. Running/failed steps retain observed counts.
- Unrecorded historical control nodes say `Progress not recorded`.
- The collect label is `Collect analysed images`: this control passes asset
  subjects and does not produce weak Face-to-Person candidate evidence.
- A pre-existing stats decoder omission of backend `photosWithoutDate` was
  corrected after it blocked `qa:quick`.

## Variant evidence and repair

The user clarified the acceptance examples as the three ungrouped pairs below
(`485609`, `213908`, `322100`), alongside the already-working `174808` pair.
No five-member family is inferred. All four are among the 13 images in `compare`.

| Original | Generated counterpart | Stored pHash / dHash distance |
| --- | --- | --- |
| `174808-082918_06.jpg` | `Gemini_Generated_Image_hbhdlohbhdlohbhd.png` | 2 / 4 |
| `213908-082918_02.jpg` | `Gemini_Generated_Image_as9m5pas9m5pas9m.png` | 27 / 8 |
| `322100-083018_04.jpg` | `Gemini_Generated_Image_9e07pg9e07pg9e07.png` | 3 / 9 |
| `485609-082918_02.jpg` | `Gemini_Generated_Image_eqmtc2eqmtc2eqmt.png` | 8 / 3 |

`artifacts/acceptance-debug/compare-distances.json` contains all 78 pairwise
distances, rather than a guessed five-image subset. The stored `phash64` is
actually an 8x8 mean hash (aHash), not a DCT pHash. Both hash distances must be
at most 2 for near-duplicates and 6 for the existing strict variant rule. Only
the first pair qualifies through that rule; those thresholds remain unchanged.
Variant clustering sorts by EXIF time then unit ID and requires each member to
match a fixed cluster anchor; it does not join arbitrary transitive chains.
No anchoring change can restore pairs already excluded by the two hash cutoffs.

`variantStructure.ts` adds a separately versioned variant-only fallback. It
compares spatial gradients on oriented 32x32 greyscale samples, requiring cosine
at least 0.8, dHash distance at most 12 and absolute log aspect-ratio difference
at most 0.1. Blank/invalid samples fail closed. Colour/tone shifts can preserve
gradient layout even when a global mean-brightness hash changes substantially.
The three supplied pairs scored 0.963828, 0.846345 and 0.988693 respectively;
no other pair in the 36 real acceptance images scored above 0.65 in the initial
gradient probe. This is acceptance-set evidence, not a claim of universal recall
for arbitrary crops, composites or viewpoint changes.

Only the dHash-reachable neighbourhood of changed assets is sampled, each image
once per run. No stale persistent descriptor or schema migration is introduced.
The same structural match participates in reachability and direct-anchor checks.
Actual pHash/dHash distances remain in observations; structural scores and the
`spatial-gradient-v1` measurement are stored as evidence with algorithm 2.0.
Gallery projection validates that evidence and its dHash distance instead of
silently reapplying the old dual-six cutoff. Near-duplicate policy and anchored
nontransitive clustering are unchanged.

## Verification and exact next action

Core build, face-vector/failed-retry retention tests, workflow progress tests,
cosine-bound tests and IdentityCluster tests passed. `qa:quick` passed after both
coherent repairs. The structural-variant core build, 16 targeted grouping tests
and `qa:quick` also passed. Tests cover tonal-change measurement, unrelated/blank
images, malformed evidence, one-sided incremental reachability, anchored
nontransitivity, durable provenance, gallery grouping and unaffected groups.
The final `qa:ready` run passed: branch-wide lint/complexity, application/core
typechecks, 209 repository tests, 153 UI tests and affected browser boot smoke.
Two stale timeline wiring assertions were updated to the existing sort-mode
argument and Undated label; no timeline implementation was changed for them.
The separately observed Filename-sort blank-gallery issue remains recorded in
`docs/todo.md` and is not claimed fixed by this acceptance repair.

The final real run `aee54901-1fc3-4cef-b240-2d8097038a20` completed successfully:
Detect faces, Generate face vectors, Collect analysed images and Resolve people
each reported 36/36 with zero failures. The database now has 52 active vectors
on 52 stable Faces, 49 IdentityClusters, 52 cluster members and 52 assignments.
There are 104 stored vectors including the retained prior generation; 37
successful generation heads (19 empty including the fixture), and 54 superseded
generations. Recognition issues are empty. All 37 asset IDs, paths, stored file
hashes and sizes match the original backup, and SQLite `quick_check` is `ok`.
The original Alice/Mary rows are retained. Seven workflow UI model tests passed.
The live People page was reloaded and visually verified with face thumbnails:
51 rows, comprising 49 generated People plus Alice/Mary. Person 5 has two
photos, 48 generated People have one photo, and Alice/Mary remain at zero.
`face_count` in the API counts distinct assigned photos, not individual faces.
The screenshot is retained locally at `artifacts/acceptance-debug/people-after.png`.

The live grouping run `67a87c10-636b-48d2-bbe8-ce38a40aab9f` completed 36/36
without failures. The real `get_assets` response contains exactly four variant
stacks of two images, including all three clarified pairs. Read-only detector
verification found exactly three supplemental matches and no extra groupings.
Asset identities/fingerprints still match the backup and SQLite integrity is ok.
The rendered gallery shows the two-photo stack badges; opening the garden
colourisation shows `Gemini_Generated_Image_eqmtc2eqmtc2eqmt.png` in a
`VARIANT · 2 PHOTOS` viewer. Gallery evidence is retained locally at
`artifacts/acceptance-debug/variants-after.png`.

The task-owned root runtime remains `dev:desktop-runtime`, web 5173/backend 5174,
using the preserved acceptance APPDATA profile. No publication or merge is
authorized by this acceptance-debugging request.
