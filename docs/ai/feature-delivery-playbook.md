# Feature delivery playbook

Use this playbook when a feature needs conversational discovery before it is
ready for normal guided implementation. It complements the task lifecycle; it
does not create a second registry, branch type, or task format.

## Start with a short task card

The requester supplies the outcome, important constraints, what may be mocked,
and the condition that makes the feature ready to harden. The coordinator owns
the detailed implementation plan.

```powershell
pnpm.cmd run thread:new-integration -- --task "<feature>" --objective "<outcome>" --acceptance "<criterion> | <criterion>" --phase explore
```

`objective`, `acceptanceCriteria`, and `deliveryPhase` are durable task-capsule
metadata. Update them with `thread:update` as the conversation narrows the
work. Do not use the operational `note` field as a task card.

## Explore

Explore is for rapid conversational prototyping. The coordinator may mock a
backend or data source, but records the mock boundary and the replacement
condition in the task card. Run targeted checks and `qa:quick`; promote a
task-owned runtime when visible behavior needs evidence. Do not create leaf
tasks merely to make an uncertain prototype look planned.

## Build

Once the intended experience and boundaries are clear, the coordinator creates
one narrow leaf brief at a time. A brief contains:

1. Outcome and observed evidence.
2. Exact owned files/contracts and excluded shared files.
3. Mock boundary and its hardening condition.
4. One mechanical change and the acceptance check.

Low-reasoning agents are appropriate only for these fully-guided, disjoint
leaves. They do not choose product behavior, invent architecture, alter shared
contracts, or widen their scope. Use an integration task for shared hosts,
registries, contracts, workflow tooling, and documentation.

## Harden

Replace or explicitly retain approved mocks, add targeted regression coverage,
and gather fresh runtime evidence for visible behavior. Run `qa:ready`; the
targeted UI boot smoke runs for UI/runtime changes. Run `qa:merge` before
publication. A task is not ready to ship solely because its prototype looks
convincing.

## UI boot smoke

`pnpm.cmd run ui:smoke -- --force` runs the browser boot check on demand. The
readiness and merge gates invoke it only when the branch affects the UI, web
entrypoint, runtime boot path, or its smoke implementation. It is deliberately
outside `qa:quick`.
