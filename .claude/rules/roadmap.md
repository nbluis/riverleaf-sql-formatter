# Roadmap & open decisions

State as of the current session. Update this file as items are resolved.

## Decisions awaiting the user

- **Nested-paren BLOCK vs RIVER inconsistency.** Top-level `where`/`on` connectors are
  right-aligned (RIVER); connectors inside an expanded parenthesized group are left-aligned/indented
  (BLOCK). This matches the user's golden example exactly, but the example is internally
  inconsistent. Confirm this is the desired aesthetic before "fixing" it. (See
  `formatting-spec.md` → "Why RIVER top-level but BLOCK inside parens".)
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
  Remaining passthrough: a comment mid-token or inside an inline subquery/scalar-parenthesized
  expression — folded into the subqueries/CTEs work below.
- **Subqueries / CTEs (`with`).** ✅ Done (common shapes). A parenthesized `select`/`with` in a
  `from (...) alias`, a single CTE body (`with name as (...)`), or a single-condition
  `where ... in (...)` expands recursively: the inner query is formatted at `ownerLeading +
  indentSize` and the closing `)` aligns under the owner clause keyword (alias on the `)` line).
  Nested subqueries recurse; a subquery's inner river is recomputed. Still inline: multiple
  comma-separated CTEs, subqueries inside a multi-condition `where`/`join` ON, scalar subqueries in
  the select list, and any subquery containing a line comment (→ passthrough). Decision made with
  the user (2026-07-15): "shallow indent, `)` aligned under the clause keyword".
- **`case when ... then ... else ... end`.** ✅ Done (select-list items). A select/group-by/order-by
  list item that is exactly `case [selector] when ... [else ...] end [alias]` expands: `case` on the
  item line, each `when`/`else` segment and the closing `end` aligned at the item's column (the
  `case` column). `parseCase`/`renderCase` in `layout.ts`; `renderItemLines` routes each list item.
  A nested `case` stays inline on its branch; a long `when ... then ...` stays on one line (no wrap);
  a `case` not at the start of an item (e.g. wrapped in a function) or in where/join stays inline.
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
