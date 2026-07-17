# Roadmap & open items

The aesthetic and breaking-model decisions are settled: breaking is by count, not width; output
normalizes to column 0; connectors right-align at every level; there is no line-width option. The
current rules live in `CLAUDE.md` and `.claude/rules/formatting-spec.md`, and the change history is
in git — this file tracks only what is still **open**.

## Open items

Every feature area is implemented (alignment, list breaking, `where`/`having`, joins,
subqueries/CTEs, `LATERAL`, `case`, DML, comments). What remains are the narrower sub-cases still
rendered inline or passed through unchanged — the README's "Known limitations":

- A **subquery** or a **`case`** wrapped in a function call (e.g. `coalesce((select ...), 0)`) stays
  inline instead of expanding.
- A **line comment** mid-token, or inside a subquery that is *not* expanded (function-wrapped),
  forces passthrough (the statement is emitted unchanged) so code is never commented out.

Larger tracked effort: **PostgreSQL coverage gaps** — see `_work/postgres-coverage-gaps-plan.md`
(multi-character operators sliced by the tokenizer, keywords cut as anchors, untested features).

## When you pick one up

1. Read `formatting-spec.md` and the relevant module.
2. Add a failing YAML case first (`testing.md`).
3. Implement, keep idempotency, re-run `npm test` + `npm run lint`.
4. Re-package + re-install the vsix only if runtime code changed.
5. Update this file.
