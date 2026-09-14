# Semantic reset and durability matrix

**Status:** authoritative Phase 1 reset contract  
**Scope:** WP15 reset, recomputation, model replacement and reimport behavior  
**Rule:** machine-derived state may be regenerated; human work, archive identity
and audit history may be destroyed only by the explicit factory-reset path.

`Preserve` includes keeping the row available until a successful replacement is
ready. `Rebuild` means invalidate the relevant current projection and regenerate
it from its authority. `Mixed` requires the row-level rule in the ownership
column. Factory reset destroys all library product state and then recreates only
schema and code-owned defaults.

## Product-state matrix

| State / tables | Ownership rule | Soft rebuild | Face reset | Relationship recompute | Model replacement | Factory reset |
| --- | --- | --- | --- | --- | --- | --- |
| `asset_identities`, `assets_manual` | Durable archive identity and manual state | Preserve | Preserve | Preserve | Preserve | Destroy |
| `assets` | Mixed. Live analysis fields rebuild; rows required by durable asset-linked records remain archive anchors until those records are identity-backed. `binned_at` is human disposition. | Mixed | Preserve | Preserve | Preserve | Destroy |
| `contributors`, `review_responses`, `review_response_propositions` | Durable human testimony, including responses with no proposition | Preserve | Preserve | Preserve | Preserve | Destroy |
| `semantic_entities` | Mixed. Preserve entities reached from durable testimony, decisions, evidence, representations or review responses; rebuild unreferenced machine-only entities. | Mixed | Preserve | Preserve | Preserve | Destroy |
| `semantic_propositions` | Mixed. Preserve propositions reached from human/import attestations, non-machine decisions, review-response links or durable membership. | Mixed | Preserve | Rebuild machine scope | Rebuild relevant machine scope | Destroy |
| `semantic_attestations`, `semantic_evidence`, `semantic_decisions` | Human/import history and its supersession ancestry are durable; machine rows rebuild. | Mixed | Preserve | Preserve human; rebuild machine | Preserve human; rebuild machine | Destroy |
| `people`, `person_redirects` | Confirmed, manually touched, merged and retired People plus all redirects are durable; unreferenced provisional machine People rebuild. | Mixed | Mixed | Preserve | Preserve | Destroy |
| `family_trees`, `people_gedcom_links` | Durable imported archive data and manual links | Preserve | Preserve | Preserve | Preserve | Destroy |
| `archive_representations`, Photograph entities/membership | Human/import membership and lineage ancestry are durable; system projections rebuild. | Mixed | Preserve | Preserve human; rebuild system | Preserve human; rebuild relevant system | Destroy |
| `photo_edit_documents`, `photo_edit_styles` | Durable user recipes, lineage and saved styles | Preserve | Preserve | Preserve | Preserve | Destroy |
| `photo_metadata_assertions` | Durable manual assertions and audit history | Preserve | Preserve | Preserve | Preserve | Destroy |
| `photo_metadata_blocks` | Imported or machine evidence; keep current successful data until replacement succeeds. | Rebuild | Preserve | Preserve | Rebuild relevant model | Destroy |
| `photo_metadata_projection` | Rebuildable projection from blocks and manual assertions | Rebuild | Preserve | Rebuild if affected | Rebuild if affected | Destroy |
| `tag_definitions`, `tag_aliases` | Provenance-free and therefore conservatively durable; user edits cannot currently be separated from seed vocabulary. | Preserve | Preserve | Preserve | Preserve | Destroy |
| `asset_tag_assignments` | `manual` rows are durable; `ai`, `legacy_ai` and `system` rows rebuild. | Mixed | Preserve | Rebuild relevant machine rows | Rebuild relevant machine rows | Destroy |
| `review_items` | Reviewed rows and reviewer/note/time fields are durable; pending machine proposals rebuild. Rows without explicit provenance are preserved when ambiguous. | Mixed | Preserve | Rebuild relevant pending rows | Rebuild relevant pending rows | Destroy |
| user `albums`, `album_items` | User-authored collection and membership are durable. System album definitions rebuild; Bin membership reflects durable human disposition. | Mixed | Preserve | Preserve | Preserve | Destroy |
| `library_presentation_preferences`, user `settings`, `folder_history` | Durable user/configuration/presentation state | Preserve | Preserve | Preserve | Preserve | Destroy |
| `capture_sequences`, members | Accepted/rejected or human/import rows are durable; proposed system rows rebuild. | Mixed | Preserve | Rebuild machine proposals | Rebuild relevant machine proposals | Destroy |
| stable `visual_regions`, `faces` | Preserve/reconcile when referenced by any human work, including review-only testimony. | Preserve/reconcile | Preserve/reconcile | Preserve | Preserve/reconcile | Destroy |
| `visual_region_geometry_generations` | Retain the latest reconciliation baseline and human-referenced history; append replacement detector geometry after success. | Mixed | Mixed | Preserve | Mixed | Destroy |
| `analysis_generations` | Machine provenance ledger. Retain referenced/audit generations; prepare replacements separately. | Mixed | Invalidate face scope | Invalidate scope | Replace generation after success | Destroy |
| `analysis_generation_heads` | Rebuildable current pointer; switch only to a successful generation. | Rebuild | Rebuild face scope | Rebuild scope | Atomic switch after success | Destroy |
| `feature_vectors`, `identity_clusters`, `identity_cluster_members`, `face_person_candidates` | Rebuildable machine state. Candidate decision status is a projection of durable semantic decisions. | Rebuild | Rebuild | Rebuild identity scope | Rebuild | Destroy |
| `visual_similarity_observations`, `asset_similarity_edges`, `asset_features` | Rebuildable machine analysis/projection | Rebuild | Preserve | Rebuild | Rebuild relevant model | Destroy |
| `face_assignments` | Transitional rebuildable projection | Rebuild | Rebuild | Rebuild identity scope | Rebuild | Destroy |
| `derived_results`, runtime `asset_mask_metadata`, `previews` | Rebuildable machine/cache state; domain reset removes only affected sources. | Rebuild | Rebuild face subset | Rebuild affected subset | Rebuild affected subset | Destroy |
| workflow/job/issue/event state | Operational state; a domain reset invalidates affected running work and preserves unrelated history where useful. | Rebuild | Mixed | Mixed | Mixed | Destroy |
| `schema_migrations`, predicate-definition snapshots | Machine-owned schema/registry metadata | Recreate/verify | Preserve | Regenerate only on contract change | Preserve | Recreate |

## Reimport policy

1. The same prior path reuses a durable Asset identity only when its persisted
   content fingerprint is compatible.
2. A missing prior path may reattach on one unique safe fingerprint match.
3. Multiple matching identities are ambiguous and never transfer identity
   automatically.
4. Different content at a previously known path creates a replacement Asset and
   identity. The prior durable record remains available to its edits, Faces,
   Photographs and testimony.

Path equality by itself is never proof of identity.

## Executable acceptance fixtures

The integrated WP15 fixture must prove:

1. confirmed Person identity, redirect, GEDCOM link, Photograph membership,
   presentation preference, edit document/style and manual metadata survive a
   soft rebuild;
2. Contributor attribution, exact raw testimony and an `unknown/no clue`
   response without an accepted proposition survive reset and reopen;
3. manual tags, user vocabulary/aliases, user albums and completed review notes
   survive while machine assignments/proposals rebuild;
4. stable Face/VisualRegion reconciliation anchors and durable People/history
   survive face reset while vectors, heads, candidates and clusters are
   invalidated;
5. same-file reimport reattaches safely, changed content at one path does not
   inherit identity, and duplicate fingerprint ambiguity does not choose;
6. failed/interrupted soft reset leaves the prior database recoverable and retry
   is deterministic;
7. failed migrations do not record themselves or hide unexpected compatibility
   errors; and
8. failed relationship/model replacement leaves the previous successful head
   and all human attestations/decisions unchanged.
