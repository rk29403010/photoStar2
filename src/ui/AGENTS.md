# UI Guardrails

These rules apply under `src/ui/` in addition to the root `AGENTS.md`.

## UX and accessibility

- Prefer clear, low-friction interfaces over exposing implementation detail.
- Use native interactive HTML elements and preserve keyboard access, focus
  visibility, labels, and appropriate image alt text.
- Colour must not be the only way to communicate state. Maintain WCAG 2.1 AA
  contrast for user-facing text and controls.
- Avoid disruptive layout shifts when entering edit states. Inline editing should
  retain the display typography and footprint wherever practical.
- Long-form metadata such as captions/descriptions should have usable width,
  sensible wrapping/clamping, and direct edit affordances rather than cramped
  label/value rows.

## Styling and themes

- Use Tailwind and the existing semantic theme tokens. New UI must work in both
  light and dark themes.
- Static inline `style` values are not allowed; reserve inline styles for values
  genuinely calculated at runtime such as transforms or measured geometry.
- Prefer shared UI components over repeated large utility-class strings.
- Avoid arbitrary raw colours and one-off dimensions when an existing semantic
  token or spacing/size scale fits.

## Feedback and resilience

- Use the shared feedback framework for new user-visible process/status feedback:
  `tracked` for multi-step work, `inline` for slower contextual actions, and
  `transient` for short notices/undo.
- Workflow/manual-task feedback should consume shared workflow/job events rather
  than adding side-channel polling.
- Major screens, tabs, panels, and viewports should fail locally with an existing
  error boundary/fallback pattern rather than taking down the whole UI.

## Verification

For visible UI behavior, gather runtime evidence when it materially helps prove
correctness. Use the repository's affected UI smoke/runtime tooling rather than
adding browser startup to every fast edit loop.
