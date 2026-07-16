# Roadmap & open decisions

State as of the current session. Update this file as items are resolved.

## Decisions resolved

- **Nested-paren BLOCK vs RIVER inconsistency (D1).** ✅ Resolved (Phase 9, 2026-07-16). Connectors
  inside an expanded parenthesized group now right-align (RIVER) to the group's own river
  (`blockIndent - 1`), same as the top level; the closing `)` position is unchanged. The golden
  example was updated. (See `formatting-spec.md` → "RIVER everywhere (D1)".)

## Decisions awaiting the user

- **Base-indent preservation.** `base` = the **minimum** indentation across the query's non-empty
  lines (the widest clause head's column), preserved on output (a query at column 0 → river at 6;
  the golden at 4 spaces stays at 4). Changed from first-line indent to minimum so it round trips
  when the first clause is not the widest (DML `update ... returning`). Confirm preservation is
  preferred over always normalizing to a fixed indent.
- **Default `maxLineLength`.** Setting default is `null` → resolves to `editor.rulers[0]`, else 80.
  User has considered pinning an explicit default; not decided.

## Not yet implemented (known limitations, documented in README)

- **Line comments inside boolean expressions.** ✅ Done. Handled: comments in list clauses, around
  clauses (leading / between / trailing), **inline and standalone comments on `where`/`having`
  conditions**, **inside expanded parenthesized groups** (BLOCK mode), **before the first
  `where`/`having` condition** (keyword sits alone, first condition drops below the comment), and
  **inside a `join` ON** (reflowed under the ON river). See `formatting-spec.md` → Comments.
  **Comments inside an expanded subquery** (from / cte / join-table / scalar-in-select /
  first where condition) also reflow now — `isCommentSafe` recurses into every subquery it expands
  (Phase 5, B1) — including each CTE of a multi-CTE `with` (Phase 6). Remaining passthrough: a
  comment mid-token, or inside a subquery that is *not* expanded (non-first where condition, join
  ON, function-wrapped).
- **Subqueries / CTEs (`with`).** ✅ Done (Phase 5 extended the positions; Phase 6 added multiple
  CTEs). Expand recursively: `from (...) alias`, one or more comma-separated CTEs (`with a as (...),
  b as (...)`), `where ... in (...)` (as a single condition **or the first of several** — the rest
  render below the `)`), a subquery as a **`join` table** (`join (...) alias on ...`, alias + ON on
  the `)` line — single ON inline, multi-condition ON keeps the secondary river), and a **scalar
  subquery in the select list** (expanded at the item column, `afterStr` like `as item_count` on the
  `)` line). The inner query is formatted at `ownerLeading + indentSize` and the `)` aligns under the
  owner clause keyword (or the item column). For a **multi-CTE `with`** (Phase 6, A1), each CTE name
  after the first recedes to the `with` column, the comma follows the previous `)`, and every `)`
  aligns under `with`; falls back to the one-liner only if some CTE body is not a parenthesized
  `select`/`with`. Nested subqueries recurse; a subquery's inner river is recomputed. Still inline: a
  subquery in a non-first `where` condition or inside a `join` ON, and a subquery wrapped in a
  function call. Decision made with the user (2026-07-15): "shallow indent, `)` aligned under the
  clause keyword"; multi-CTE layout locked 2026-07-15.
- **`case when ... then ... else ... end`.** ✅ Done (list items + where/having + nested). A
  select/group-by/order-by list item that is exactly `case [selector] when ... [else ...] end
  [alias]` expands: `case` on the item line, each `when`/`else` segment and the closing `end`
  aligned at the item's column (the `case` column). `parseCase`/`renderCase` in `layout.ts`;
  `renderItemLines` routes each list item. **Phase 7**: a **nested `case`** in a `when`/`else` branch
  expands recursively at the column where the inner `case` begins (`renderCaseSegment`/
  `findNestedCase`); a `case` in a **`where`/`having`** condition expands at the operand column with
  anything after `end` (e.g. `> 100`) on the `end` line (`emitTerm` with the `expandCase` flag).
  **Phase 8 (C2)**: a `when ... then` that exceeds the width breaks **before** `then`
  (`when <cond>` / `then <result>` on their own lines at the `case` column; `renderCaseSegment` +
  `findThen`; an `else` never wraps). Still inline: a `case` wrapped in a function, and a `case`
  inside a `join` ON.
- **DML** — `insert` / `update` / `delete`. ✅ Done. Formats like a select: anchors join the river;
  `set`/`values` break one item per line (>1 item); `delete from` kept together; `insert into
  t (cols)` on one line. `insert ... select` recomputes the river for the select. Reviewed golden
  cases in `test/cases/dml.yaml`. Open: multi-row `values` and INSERT column lists never break onto
  multiple lines even when very wide (kept single-line for now).

## When you pick one up

1. Read `formatting-spec.md` and the relevant module.
2. Add a failing YAML case first (`testing.md`).
3. Implement, keep idempotency, re-run `npm test` + `npm run lint`.
4. Re-package + re-install the vsix only if runtime code changed.
5. Update this file.
