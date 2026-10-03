# Workflow Runtime Guardrails

These rules apply under `src/services/workflowRuntime/` in addition to the root
`AGENTS.md`.

- Workflows and modules are self-contained and self-describing behind the shared
  extension contract.
- A normal module owns its implementation, metadata, tests, and declared registry
  input. Keep module-specific behavior out of generic hosts.
- Hosts orchestrate discovered modules generically. Do not add module IDs, labels,
  defaults, stages, algorithms, or presentation branches to host code.
- Generated workflow registries are machine-owned. Change definitions/manifests
  or the generator and regenerate/check the registry; never hand-edit generated
  output.
- Missing or unavailable definitions must degrade gracefully. Prefer an ID or
  explicit unavailable state over a second hardcoded lookup table.
- Runtime/job progress uses the shared workflow/job event and feedback paths; do
  not introduce parallel polling/status channels for one module.
- Keep workflow execution contracts deterministic at boundaries and put external
  provider/model-specific behavior behind the owning module or provider adapter.
