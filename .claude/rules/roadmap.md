# Roadmap & open decisions

State as of the current session. Update this file as items are resolved.

## Decisions resolved

- **Nested-paren BLOCK vs RIVER inconsistency (D1).** ✅ Resolved (Phase 9, 2026-07-16). Connectors
  inside an expanded parenthesized group now right-align (RIVER) to the group's own river
  (`blockIndent - 1`), same as the top level; the closing `)` position is unchanged. The golden
  example was updated. (See `formatting-spec.md` → "RIVER everywhere (D1)".)
- **Base indent (D2).** ✅ Resolved (Phase 9, 2026-07-16) — **normalize to column 0**. Decided with
  the user via a two-option preview (the user changed the initial pick): output always starts at the
  left margin regardless of source indentation. `base` is now the constant `0` in `format()` (the
  old `detectBaseIndent` minimum-indent scan was removed). The widest clause head lands at column 0,
  so the result still round trips (reformatting a column-0 query keeps it there). Inner subquery
  blocks are still indented one level in, recursively. Trade-off accepted: any intentional source
  indentation (SQL embedded in an indented block) is discarded.

## Decisions awaiting the user

- **Default `maxLineLength` (D3).** Setting default is `null` → resolves to `editor.rulers[0]`, else
  80. User has considered pinning an explicit default; deferred (out of scope for now).

## Implemented features & their residual inline/passthrough sub-cases

All four feature areas below are implemented (phases 1–8). What remains are the narrower sub-cases
each one still renders inline or passes through unchanged — the "Known limitations" in the README.

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
  `set`/`values` break one item per line (>1 item — so **multi-row `values` does break**, one tuple
  per line); `delete from` kept together; `insert into t (cols)` on one line. `insert ... select`
  recomputes the river for the select. Reviewed golden cases in `test/cases/dml.yaml`. Residual
  limitation: the **INSERT column list** `(col, col, ...)` and a **single wide `values` tuple** never
  wrap internally, even past the width (kept single-line for now).

## When you pick one up

1. Read `formatting-spec.md` and the relevant module.
2. Add a failing YAML case first (`testing.md`).
3. Implement, keep idempotency, re-run `npm test` + `npm run lint`.
4. Re-package + re-install the vsix only if runtime code changed.
5. Update this file.
