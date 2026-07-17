---
name: add-formatter-behavior
description: TDD workflow for extending or fixing how the Riverleaf SQL formatter lays out SQL. Use when changing formatting behavior in src/formatter (layout.ts, segmenter.ts, render.ts) — it enforces adding a failing YAML case first, then implementing, then verifying green and idempotent.
---

# add-formatter-behavior

Change formatting the safe way: lock the desired output as data first, then make the code produce
it. This keeps the suite as our regression guardrail and prevents silent behavior drift.

## Before coding

Read `.claude/rules/formatting-spec.md` (the algorithm: river math, RIVER vs BLOCK modes, ON
secondary river, comment handling, passthrough) and the module you'll touch.

## Workflow

1. **Capture the desired output.** Decide the exact `expected` for the new/changed input. If it's a
   fix, the user often shows the target output — mirror it precisely (indentation matters).

2. **Add a failing case (red).** Add an entry to a `test/cases/*.yaml` with `description`,
   optional `options`, `input`, `expected`. For a brand-new behavior whose exact output you must
   compute, use the `regen-format-cases` skill — but only after you've reviewed the output as
   correct. Run `npm test`; confirm it fails for the right reason (or, for a not-yet-supported
   input, that current behavior is a safe passthrough).

3. **Implement.** Change `layout.ts` / `segmenter.ts` / `render.ts` / `keywords.ts`. Keep the core
   pure (no `vscode` import). Prefer extending existing helpers (`splitListItems`, `parseBoolExpr`,
   `renderBoolRiver`/`renderBoolBlock`) over new ad-hoc paths.

4. **Green + idempotent.** `npm test` (the runner also asserts `format(expected) === expected`) and
   `npm run lint`. Never regress: if you can't place a token safely, fall back to passthrough
   rather than emit wrong SQL.

5. **Verify in the editor** if runtime changed: run the `build-install-vsix` skill, reload, and
   format a real `.sql`.

6. **Update docs.** Edit `.claude/rules/formatting-spec.md` if the algorithm changed, and
   `CLAUDE.md` if a locked decision or the feature summary shifted.

## Guardrails

- English only, spaces only, single trailing newline, no trailing whitespace.
- Don't "fix" the RIVER-vs-BLOCK paren asymmetry without the user's confirmation (a locked decision).
- Throwaway scripts go to the scratchpad, never committed.
