# ADR-005: Progressive feature delivery and UI smoke

- Status: Accepted
- Date: 2026-07-30

## Context

PhotoStar2 needs both rapid conversational feature discovery and deliberate
changes to established code. Static checks and UI model tests can pass while a
React boot failure leaves the application blank. Running broad browser suites
in every edit loop would make ordinary work unnecessarily slow.

## Decision

1. Keep one registered task capsule as the durable feature record. It stores a
   short objective, acceptance criteria, and one delivery phase: `explore`,
   `build`, or `harden`.
2. A coordinator turns the short request into detailed, ephemeral leaf briefs
   only after exploration establishes the relevant evidence and boundaries.
   Low-reasoning agents receive only narrow, fully-guided mechanical leaves.
3. Mocks are permitted in `explore` and `build` only when their boundary and
   hardening replacement condition are recorded in the task card.
4. A browser boot smoke starts an isolated runtime and fails on browser errors,
   a blank root, startup failure feedback, or absence of the application shell.
   It runs for affected UI/runtime changes at readiness and integration, never
   in `qa:quick`.

## Consequences

- Feature requests can begin with conversational prototypes instead of
  user-authored subtask prompts.
- The canonical task record stays concise and portable while implementation
  detail is generated only when it is actionable.
- Browser startup is protected without imposing browser startup latency on
  non-UI changes or the keystroke loop.
- UI-affecting changes have one additional runtime dependency: a supported
  local or CI headless browser.

## Rejected alternatives

- Requiring a detailed prompt for every leaf: it shifts coordinator work back
  to the user and slows exploration.
- Allowing low-reasoning agents to infer product or shared-contract decisions:
  this makes prototype ambiguity leak into production architecture.
- Running a full end-to-end suite in `qa:quick`: it makes the ordinary loop
  slow without adding proportionate confidence for every edit.
