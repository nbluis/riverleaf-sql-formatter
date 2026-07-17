# Roadmap & open items

The aesthetic and breaking-model decisions are settled: breaking is by count, not width; output
normalizes to column 0; connectors right-align at every level; there is no line-width option. The
current rules live in `CLAUDE.md` and `.claude/rules/formatting-spec.md`, and the change history is
in git — this file tracks only what is still **open**.

## Open items

Every feature area is implemented (alignment, list breaking, `where`/`having`, joins,
subqueries/CTEs, `LATERAL`, `case`, DML, comments). A **subquery** or a **`case`** wrapped in a
function call (e.g. `coalesce((select ...), 0)`) now **expands** too — in select/group-by/order-by
items, `where`/`having` conditions, and `join` ON — with the subquery's `)` under the item/operand
column and the rest of the wrapping expression riding the closing line (D3, 2026-07-17).

The only remaining inline/passthrough case is by design, not an open item: a **line comment
mid-expression** (inside a single list item or boolean condition, not at a boundary and not inside a
subquery that expands) forces passthrough, so a line join can never comment out code.

Larger tracked effort: **PostgreSQL coverage gaps** — see `_work/postgres-coverage-gaps-plan.md`
(keywords cut as anchors, untested features). **Phase 1 done (A1, 2026-07-17):** the tokenizer now
lexes operators by maximal munch, so multi-char PG operators (JSONB `@>`/`#>>`/`?|`, regex `~*`/`!~`,
array `&&`, bit-shift `<<`/`>>`) are no longer sliced apart — locked by `test/cases/operators.yaml`.
Remaining: Phase 2 (`IS DISTINCT FROM` / `FOR UPDATE` / `WITH ORDINALITY`), Phase 3 (`ON CONFLICT`),
Phase 4 (golden coverage for working features), Phase 5 (set-ops river decision), Phase 6 (`MERGE`).

## When you pick one up

1. Read `formatting-spec.md` and the relevant module.
2. Add a failing YAML case first (`testing.md`).
3. Implement, keep idempotency, re-run `npm test` + `npm run lint`.
4. Re-package + re-install the vsix only if runtime code changed.
5. Update this file.
