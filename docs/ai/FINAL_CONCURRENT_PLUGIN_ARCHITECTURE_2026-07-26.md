# Final concurrent plug-in architecture — 2026-07-26

Workflow modules and photo tools are self-contained plug-ins registered only by
machine-owned generated registries. Hosts own orchestration, sequencing, masks,
unavailable-operation presentation and local containment; plug-ins own identity,
metadata, UI, rendering, automatic suggestions and migration. Unknown persisted
extensions remain explicit and inspectable, not silently reinterpreted.

Use **start this task** and **finish this task**. The repository owns task
creation, registration, status, resume, integration/leaf routing, overlap
reporting, publication, audit and reconciliation. Task identity is independent
of editor ownership. New main-targeted tasks fetch and branch from `origin/main`;
leaves target their integration branch. Only integration tasks publish to main.

`qa:quick` is the edit loop, `qa:ready` the review gate, and `qa:merge` the
integration gate. Run registry freshness checks explicitly. Normal leaf tasks
do not change contracts, generators, hosts, schemas or generated registries;
those are unavoidable integration-owned surfaces.

Use Terra medium for bounded work, stronger reasoning for architecture or
conflict recovery, and deterministic scripts for lifecycle and validation.
