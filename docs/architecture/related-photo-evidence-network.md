# Related-photo and event evidence network

## Ownership and target model

This extends the evidence-oriented photo-analysis architecture. It does not make
an event a Photograph, duplicate set, album, identity decision, or writable metadata
blob. Development databases are disposable: creation DDL is the target schema;
there are no network migrations, backfills, compatibility readers or dual writes.

- `src/shared/relatedPhotos.ts` owns compact reusable link features and impact
  contracts; the existing photo-analysis contracts own typed field claims.
- `src/data/schema/relatedPhotos.ts` owns event/membership hypotheses, indexed
  lookup features, revisioned queue, lineage and immutable impact records.
- `src/services/relatedPhotos/` owns deterministic retrieval, membership,
  propagation, bounded People/family context, unresolved opportunities and worker.
- `src/services/photoAnalysis/` still owns model requests, evidence validation,
  immutable runs, authority and field resolution. Refine consumes the new context.
- Existing People semantic decisions and user claims remain identity authorities;
  GEDCOM remains linked record evidence, never a source of invented identities.
- Core boot owns the worker lifetime. Command routing exposes evidence and
  attributed decisions. UI presentation and future impact aggregation consume
  these contracts; no additional ad-hoc feedback channel is introduced.

## Membership hypotheses

`photo_events` has a stable seed and proposed/supported/conflicted state.
`photo_event_members` records role, confidence, evidence, active/rejected/withdrawn
state and revision. Roles distinguish directly anchored, strongly supported,
possible and conflicting members. Membership evidence contains concise matching
observations and their original source IDs. Human confirm/reject/undecided
judgements are immutable attributed `photo_event_decisions`, not UI grouping state.

An event is deliberately a bounded local hypothesis, not a transitive connected
component. Each hypothesis holds at most 64 members, including inactive history.
A full hypothesis does not evict previous members to admit a new photo; another
local hypothesis can be proposed. Conflicting reliable anchors mark the event and
affected members conflicting and retain all authoritative values for review or
explicit membership rejection. No date/location averaging or silent selection.

## Indexed candidates and independent visual features

Scout/perception can produce at most 24 normalized `link_features`: distinctive
clothing, scenes, buildings, vehicles, decorations, objects, season and print
characteristics. Existing independent appearance clothing and localized regions
also contribute. Inferred or context-derived observations never bootstrap links.
Human identities are indexed from existing authority, never fabricated by a model.

Candidate lookup uses indexed feature postings, numbered filename windows,
existing capture-sequence windows, albums/folders and indexed existing visual
similarity observations. Each posting/window is capped; the normal union is 40
photos (explicit retrieval maximum 100). Generic Christmas trees, portraits,
folders, albums, adjacent scans and season alone remain possible/low-confidence.
A strong machine link requires reliable distinctive observations across at least
two meaningful categories and two distinct labels, including non-person evidence.

Raw face cosine is not a probability. Related identity corroboration strengthens
only existing vector candidates, preserves their cosine and never accepts an
identity. The target and supporting membership revisions plus current human
identity roots must still match when candidates are retrieved.

Event-specific face candidate replacement and reverse source dependency lookups
have covering indexes; reconsidering one event does not scan the archive's entire
candidate/source tables. Query-plan regression tests verify these search paths.

## Reversible lineage and confidence

Sources declare root claim IDs and membership revision snapshots. Relational
`analysis_source_roots`, `analysis_claim_roots`, `analysis_source_memberships` and
`analysis_claim_memberships` flatten and deduplicate dependencies. A -> B -> C
retains A's independent roots, not three votes. Immutable runs cannot form a
mutually reinforcing dependency cycle; stale sources cannot be reused.

Deterministic date/location propagation uses direct local/user anchors, not
another inferred neighbour. It requires an independently strong target-to-anchor
link or explicit human confirmation of both memberships. Inferences remain
`inferred_conclusion`; image observations, contextual evidence, membership,
known facts and user truth remain distinct. Supporting link observations are
dependencies too. Confidence cannot exceed root, source or membership confidence,
including the confidence of an intermediate derived source. Weak possible
membership cannot be promoted to high confidence by Refine.

Read views and repository reads synchronously exclude invalid dependencies while
refresh work is pending. Corrections/supersession, source withdrawal, membership
revision changes and rejected identities invalidate old results immediately.
Deletion triggers retire dependants before cascading FKs can erase their lineage.
Replaced visual inputs and changed human identity support revise only the indexed
affected event neighbourhood. Binned members cannot supply event anchors.

Person/family changes withdraw the affected photos' old person/relationship
sources and nonauthoritative contextual conclusions, and queue real dependants.
Independent visual ages and user/direct authority remain intact. Soft reset
preserves human decisions, immutable impacts and their evidence/dependency asset
closure; machine lookup features/candidates rebuild from a durable pending queue.

## Incremental reconsideration and model cost

Evidence persistence and People/GEDCOM mutations write durable reconsideration
requests in the same transaction as truth. Import, face and general asset events
also schedule local work; album changes are durable triggers. Queue keys coalesce
by photo with a monotonically increasing revision. An interrupted running item
resumes after restart; failed items retain errors and require explicit reconsideration.
The worker respects the existing system pause setting and releases its timer and
event subscriptions when stopped.

One queue item processes one capped neighbourhood atomically. The worker first
reassesses membership and direct-root implications, then eligible face candidates
and genuinely unresolved field/identity questions. Field-specific context keys
prevent unrelated membership changes reopening an already answered question.
Family/People context can create an unresolved identity opportunity even without
an event. Context retrieval supplies bounded recorded People and mapped immediate
family, compares independent observed ages with supported dates/DOB/death facts,
and never creates a Person from tree text. Context is excluded from Scout.

No background network operation starts a paid model. Opportunities are available
immediately through existing targeted Refine contracts; the existing manual
workflow decides whether to spend model resources. No engagement delay or drip feed.

## Genuine impacts, not historical inventions

`related_photo_state` stores the last observed comparison state. `archive_impacts`
stores immutable cause/photo/field/before/after/root/time records; live
`ArchiveImpactRecorded` events notify consumers after a successful transaction.
Unchanged replay emits no duplicate impacts. The durable ledger survives restart
and soft reset. It starts with observed changes, not reconstructed historic counts.

Progress means a real confidence/readiness improvement; discovery means new or
changed supported information; opportunity means new investigation or evidence
loss. Candidate corroboration and unresolved Refine targets are recorded without
pretending they are confirmations. Loss of confidence or Ready state is never an
improvement. `metadataReady` and `ready` are separate: the latter also requires
good structured technical/composition assessments, no enhancement recommendation,
resolved people and no pending asset review. These are recorded network state
transitions, not made-up conversions of obsolete quality scores.

Commands expose bounded network membership, human membership decisions, attributed
claim rejection, explicit reconsideration and a cursor-based impact ledger. Future
UI period/count messages must aggregate genuine events and state the observed
coverage period. The existing readiness UI is not redesigned by this phase.

## Deterministic acceptance

`tests/core/related-photo-*.test.cjs` covers Christmas 1976 provenance, false scan
neighbours, circular/copied roots, correction/removal, candidate-only identity
strengthening, conflicting date/location anchors, reversible evidence, bounded
incremental queues, stable replay, source reuse attacks, lifecycle/family updates,
command routing, worker pause/restart/stop, reset durability and honest impacts.
All database fixtures use isolated memory or temporary storage; tests do not
read or mutate the user's normal/acceptance libraries or call paid providers.
