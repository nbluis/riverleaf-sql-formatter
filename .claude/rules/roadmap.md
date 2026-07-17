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

**PostgreSQL coverage gaps — DONE (all phases, 2026-07-17).** The tracked effort in
`_work/postgres-coverage-gaps-plan.md` is complete; the per-phase details are captured in that plan
and in git. Summary:
- **Phase 1 (A1):** operators lexed by maximal munch — multi-char PG operators (JSONB `@>`/`#>>`/`?|`,
  regex `~*`/`!~`, array `&&`, bit-shift `<<`/`>>`) no longer sliced apart (`operators.yaml`).
- **Phase 2 (A2/A3/A5):** continuation keywords no longer mis-anchor — `IS [NOT] DISTINCT FROM`,
  `WITH ORDINALITY`, and the `FOR UPDATE`/`FOR SHARE` locking clause (`locking.yaml`,
  `from_functions.yaml`, `where.yaml`).
- **Phase 3 (A4):** `INSERT … ON CONFLICT … DO UPDATE/NOTHING` upsert (`dml.yaml`).
- **Phase 4 (B1–B3, B5–B16):** golden guard-rails for the already-working features — `select`,
  `groupby`, `limit`, `expressions` yaml plus extensions to `lists`/`joins`/`from_functions`/`dml`/
  `cte`. (Tests-only, plus the B6 cosmetic `grouping sets (` space.)
- **Phase 5 (B4):** decided set-ops **stay in the river** (`setops.yaml`).
- **Phase 6 (A6):** `MERGE` (PG 15+) via a dedicated `mergeMode` segmentation (`merge.yaml`).

**No open items remain.** New work starts from a fresh plan.

## When you pick one up

1. Read `formatting-spec.md` and the relevant module.
2. Add a failing YAML case first (`testing.md`).
3. Implement, keep idempotency, re-run `npm test` + `npm run lint`.
4. Re-package + re-install the vsix only if runtime code changed.
5. Update this file.
