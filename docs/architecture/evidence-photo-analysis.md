# Evidence-oriented photo analysis

The analysis source of truth is relational claims, source references, immutable
stage runs, and explicit image manifests. Development databases must be recreated;
there is no migration, backfill, old-result reader, or dual-write path.

## Responsibilities

1. **Local facts** own oriented geometry, embedded/file metadata, filename/path
   evidence, canonical local Face IDs, and deterministic image transforms.
2. **Perception** optionally extracts localized signs, inscriptions, badges,
   vehicles, distinctive objects, damage and protected text. It records
   observations, not broad historical conclusions. Enable with
   `job_ai_model_perception`; omission keeps the high-volume path cheap.
3. **Scout** makes a photograph useful immediately: a short neutral caption,
   classification/tags, broad visual date/location hypotheses, appearance for
   supplied faces, archive clues, quality/enhancement assessment, and promising
   unresolved questions. It receives visual inputs without filename, EXIF,
   candidate demographics, or earlier hypotheses to preserve independent evidence.
4. **Context retrieval** reads bounded local evidence, known people and recognition
   candidates, family-tree links, accepted relationships and user-confirmed related
   photographs. This stage never changes an identity or invents a name.
5. **Refine** answers selected field/subject questions. The response and persistence
   boundaries both reject unrelated updates. It can revise or reject date/location,
   assess supplied identity candidates, interpret historical clues, transcribe text,
   and reconcile contradictions. Prior hypotheses are omitted from its prompt;
   independent observations and attributable contextual evidence are supplied.
6. **User truth** records immutable confirmed/corrected claims. AI cannot supersede
   user-confirmed or locally known facts. Explicit user correction can supersede
   an earlier claim for that exact field and subject.

The existing workflow plug-ins orchestrate this service through the shared job
runtime. There is no additional feedback channel or polling loop.

## Contracts and epistemic states

`src/shared/photoAnalysis/contracts.ts` is the reusable validation boundary.
Every field claim has a typed value, confidence (`high`, `medium`, `low`,
`unknown`), at most three concise evidence items, at most two contradictions,
source IDs, a kind, and an explicit supersession reference. Evidence items
reference sources and are displayable observations, never reasoning transcripts.

Kinds distinguish `observation`, `known_fact`, `hypothesis`,
`inferred_conclusion`, and `user_confirmed`. Claim states distinguish active,
rejected and superseded history. Null conclusions preserve unsupported/unknown
answers without falling through to a lower-authority claim. Field/subject
resolution orders user confirmation, known facts, inferred conclusions,
hypotheses, then observations. Immutable insertion order resolves equal rank;
second-resolution timestamps and random UUID order do not determine chronology.

Appearance has an apparent age interval, presentation, expression and clothing.
It remains an observation about a canonical Face, separate from a Person's
recorded birth date or demographic information. Identity values contain only a
supplied candidate Person ID or null. Identity inference never writes an accepted
Face-to-Person decision; the existing human decision workflow remains authoritative.

## Geometry and images

Internal geometry is EXIF-oriented full-photo normalized `{x,y,width,height}`.
Model boxes are always named `{left,top,right,bottom}` corners in `[0,1000]`
relative to a mandatory `sourceImageId`. Constraints enforce individual bounds;
host validation enforces positive area, source existence and all cross-field rules.

Sharp decodes and orients once. Every overview, face crop and detail crop derives
from that same raster. Crops round outward once to integer pixel boundaries;
their exact normalized footprint is stored in the image manifest. Mapping a model
box to a photograph is a deterministic affine mapping through that footprint.
There is no face matching, consensus scale/translation repair, inferred coordinate
format, or raw-orientation fallback. Faces never move in response to AI output.

Faces are sorted by canonical database Face ID and supplied as F1/F2 aliases.
The alias-to-Face map is retained with each request and resolved directly.
Overview defaults to a 1536px maximum edge, face crops to 512px with context,
and detail crops to 2048px without enlargement. These are task-specific controls,
not a global 768px ceiling; detail concerns use original-image crops. The SDK's
media-resolution controls are independent from pixel sizing and optional.

## Quality and safe enhancement

Quality uses broad bands for technical quality, composition, engagement,
historical interest, family interest, enhancement potential, confidence and risk.
Poor technical quality cannot generate a deletion judgement.

Recommendations declare an action, whole-image/Face/region target, expected
benefit, confidence, risk, concise reason, protected faces/regions and whether
the action is generative. Automatic eligibility is derived by the host from high
benefit, high confidence and low risk; generative work, face restoration and text
preservation do not qualify for unattended automatic execution. These assessments
are recommendations; they do not modify photographs or silently start editing.

## Storage and application access

Creation DDL lives in `src/data/schema/photoAnalysis.ts`. Tables are
`analysis_runs`, `analysis_images`, `analysis_sources`, `analysis_claims`,
`analysis_claim_sources`, and `analysis_regions`. Claim/source foreign keys enforce
asset scope. Run writes validate first and become visible atomically. Failed runs
retain available usage/attempt data without publishing invalid claims.

`photo_analysis_winners` and `photo_analysis_display` are read views, never writable
metadata storage. The existing gallery/profile display reads a permanent projection
of current claims. Old quality scores, discard flags and loose enhancement strings
are not populated. Rich structured data is available through `get_photo_analysis`
and `photo_metadata.analysis` for subsequent UI/networking work.

Winning tag claims project into searchable `analysis` tag assignments against the
active tag vocabulary. Unknown machine-suggested labels enter the existing tag
review queue once per photograph and normalized label. User-corrected tag claims
replace that projection without altering separately assigned manual tags.

`record_photo_analysis_truth` accepts the typed field/subject/value contract with
user attribution. Profile edits use the same source of truth. Soft reset preserves
user claims together with supporting source/run history; machine-only analysis is
disposable. No development database is deleted by this change.

## Google provider and evaluation

`@google/genai` replaces the deprecated `@google/generative-ai` package.
`models.generateContent` uses `responseJsonSchema` plus strict host validation.
Model names are freely configurable in `job_ai_model_scout`, `job_ai_model_refine`
and `job_ai_model_perception`; no whitelist selects an obsolete model or hidden
fallback. Thinking and media-resolution controls are explicit, optional stage
settings. Prompts contain no request for step-by-step reasoning. No model thoughts
or reasoning essays are requested or stored.

Provider telemetry retains actual model version/response ID, raw usage metadata
(including thought/cached counts when provided), per-attempt latency/status, total
latency, bounded retries and cancellations. SDK hidden retries are disabled so
reported attempts reflect actual calls. Refine failure never falls back to Scout.

`ai-metadata:debug` opens its selected database read-only and uses production
preparation, contracts, prompts and provider requests. It supports dry runs, model
and prompt variants, explicit target concerns, image manifests and attempt/usage
exports. Bundle and Studio-pack tools export the new stage-specific contracts.
No paid API benchmark or real archive upload is required by deterministic tests.

## Acceptance coverage

Deterministic coverage includes all eight EXIF orientations, asymmetric borders,
exact outward-rounded crop mapping, invalid/reversed boxes and unknown image IDs,
canonical Face alias association, bounded candidate identity retrieval,
asset-scoped evidence/provenance, targeted updates, protected authoritative/null
claims, structured enhancement safety, read-only debug, retries and cancellation,
clean schema creation, application display projection and durable user reset state.
