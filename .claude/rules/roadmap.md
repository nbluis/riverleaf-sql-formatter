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
- **Rule-based breaking (2026-07-16).** ✅ Resolved. Breaking is by **rule (count), not by width**:
  list clauses break one item per line when >1 item; `where`/`having`/`join` ON break when >1
  condition; a boolean group always expands; everything at expression level (single item/condition,
  function args, `in (...)`, a `values` tuple, a `when ... then`) grows on one line. `maxLineLength`,
  `fits()`, `maxWidth`, the `riverleaf.maxLineLength` setting and the `editor.rulers` fallback were
  all removed (phases R1–R3). This supersedes the former Phase 8 (C2) and Phase 12 (B2) width wraps.

## Decisions awaiting the user

- *(none — D3, an explicit default `maxLineLength`, is moot: there is no line-width option anymore.)*

## Implemented features & their residual inline/passthrough sub-cases

The feature areas below are implemented (phases 1–12). What remains are the narrower sub-cases each
one still renders inline or passes through unchanged — the "Known limitations" in the README.

- **Line comments inside boolean expressions.** ✅ Done. Handled: comments in list clauses, around
  clauses (leading / between / trailing), **inline and standalone comments on `where`/`having`
  conditions**, **inside expanded parenthesized groups** (BLOCK mode), **before the first
  `where`/`having` condition** (keyword sits alone, first condition drops below the comment), and
  **inside a `join` ON** (reflowed under the ON river). See `formatting-spec.md` → Comments.
  **Comments inside an expanded subquery** (from / cte / join-table / scalar-in-select / **any**
  where/having condition / join ON condition) also reflow now — `isCommentSafe` recurses into every
  subquery it expands (Phase 5, B1; extended in Phase 10 to non-first where + join ON) — including
  each CTE of a multi-CTE `with` (Phase 6). Remaining passthrough: a comment mid-token, or inside a
  subquery that is *not* expanded (function-wrapped).
- **Subqueries / CTEs (`with`).** ✅ Done (Phase 5 extended the positions; Phase 6 added multiple
  CTEs; Phase 10 added non-first where + join ON conditions). Expand recursively: `from (...) alias`,
  one or more comma-separated CTEs (`with a as (...), b as (...)`), a `where`/`having` condition
  subquery in **any** position, a subquery inside a **`join` ON** condition, a subquery as a **`join`
  table** (`join (...) alias on ...`, alias + ON on the `)` line — single ON inline, multi-condition
  ON keeps the secondary river), and a **scalar subquery in the select list** (expanded at the item
  column, `afterStr` like `as item_count` on the `)` line). The inner query is formatted at
  `ownerLeading + indentSize`. The `)` aligns under the **owner**: the clause keyword for the first
  `where`/`having` condition; the `and`/`or` connector (its `lineStart`) for a later condition or a
  join ON condition (Phase 10, `emitTerm`'s `expandSubquery` flag); the item column for a scalar
  subquery. For a **multi-CTE `with`** (Phase 6, A1), each CTE name after the first recedes to the
  `with` column, the comma follows the previous `)`, and every `)` aligns under `with`; falls back to
  the one-liner only if some CTE body is not a parenthesized `select`/`with`. Nested subqueries
  recurse; a subquery's inner river is recomputed. **`LATERAL` derived tables** (2026-07-16) expand
  the same way in every position — `join`/`cross join lateral (...)`, `from lateral (...)`, and a
  `from`-list `, lateral (...)` — via the shared `findDerivedSubquery` (accepts a `(` that is the
  first token or preceded only by the `LATERAL` keyword; `LATERAL` was added to `KEYWORDS` so it is
  not glued to the `(` as a function). The **`with` preamble** now sits at the base **column 0**, off
  the river (2026-07-16). Still inline: a subquery wrapped in a function call. Decisions with the
  user: "shallow indent, `)` aligned under the clause keyword" (2026-07-15); multi-CTE layout
  (2026-07-15); non-first/ON `)` under the connector (2026-07-16); `with` at column 0 + `lateral`
  everywhere (2026-07-16).
- **`case when ... then ... else ... end`.** ✅ Done (list items + where/having + nested). A
  select/group-by/order-by list item that is exactly `case [selector] when ... [else ...] end
  [alias]` expands: `case` on the item line, each `when`/`else` segment and the closing `end`
  aligned at the item's column (the `case` column). `parseCase`/`renderCase` in `layout.ts`;
  `renderItemLines` routes each list item. **Phase 7**: a **nested `case`** in a `when`/`else` branch
  expands recursively at the column where the inner `case` begins (`renderCaseSegment`/
  `findNestedCase`); a `case` in a **`where`/`having`** condition expands at the operand column with
  anything after `end` (e.g. `> 100`) on the `end` line (`emitTerm` with the `expandCase` flag).
  **Phase 11 (A3)**: a `case` in a **`join` ON** condition expands too (`renderOn` passes
  `expandCase` true; `hasCase` forces the break, even single-ON). A `when ... then` grows on one line
  and is never wrapped (the former Phase 8/C2 `findThen` width wrap was removed in R3, rule-based
  breaking). Still inline: a `case` wrapped in a function.
- **DML** — `insert` / `update` / `delete`. ✅ Done. Formats like a select: anchors join the river;
  `set`/`values` break one item per line (>1 item — so multi-row `values` breaks one tuple per line);
  `delete from` kept together. `insert ... select` recomputes the river for the select. The
  **INSERT column list** breaks by count (>1 column → one per line, aligned one column past the `(`,
  trailing commas, `)` on the last, via `renderInsertClause` + `renderTupleBroken`; layout locked
  with the user 2026-07-16, columns under the first). The interior of a `values` tuple is expression
  level and **grows** on one line (the former Phase 12/B2 `tupleNeedsWrap`/`hasWideTuple` width wrap
  was removed in R3). Reviewed golden cases in `test/cases/dml.yaml`.

## When you pick one up

1. Read `formatting-spec.md` and the relevant module.
2. Add a failing YAML case first (`testing.md`).
3. Implement, keep idempotency, re-run `npm test` + `npm run lint`.
4. Re-package + re-install the vsix only if runtime code changed.
5. Update this file.
