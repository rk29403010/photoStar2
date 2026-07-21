# ADR-003: Deterministic plug-in registration

- Status: Accepted
- Date: 2026-07-21

## Context

Workflow modules, photo-editing tools, and future extension families are
growing. Central switch statements and hand-maintained catalogues force every
new feature through the same shared files, causing merge conflicts and allowing
hosts to accumulate feature-specific labels, defaults, UI components, and
algorithms.

Concurrent AI coding sessions need disjoint ownership scopes that can be
integrated predictably without editor-specific workflow rules.

## Decision

1. Prefer self-contained plug-ins that own their implementation, metadata,
   tests, and declared registration input.
2. Define a small extension contract for each family. Hosts discover and
   orchestrate plug-ins through that contract, but contain no individual
   plug-in IDs, labels, defaults, UI components, or algorithms.
3. Discover registries from declared inputs where possible. When a materialized
   registry is needed, generate it deterministically and treat it as
   machine-owned, reproducible output rather than hand-maintained source.
4. Reduce existing shared edit hotspots as extension families evolve. Related
   leaves that still need a shared host, contract, generator, or registry file
   use an integration task and branch instead of competing PRs to `main`.

## Consequences

- Adding a plug-in ordinarily changes its self-contained area rather than a
  central switch or catalogue.
- Hosts become stable orchestration boundaries and are changed only by an
  assigned integration task when the extension contract itself must evolve.
- Generators and contract tests become the reproducibility proof for registry
  output.
- Existing central registries remain compatibility layers until each extension
  family has a deterministic replacement; this ADR does not change application
  behaviour by itself.

## Rejected alternatives

- Continue central switch statements and hand-maintained catalogues: they make
  shared hotspots a normal cost of feature work and undermine disjoint scopes.
- Give Codex and Antigravity separate registries or lifecycle rules: this
  creates incompatible views of the same Git work and does not solve conflicts.
