# Roadmap & open decisions

State as of the current session. Update this file as items are resolved.

## Decisions awaiting the user

- **Nested-paren BLOCK vs RIVER inconsistency.** Top-level `where`/`on` connectors are
  right-aligned (RIVER); connectors inside an expanded parenthesized group are left-aligned/indented
  (BLOCK). This matches the user's golden example exactly, but the example is internally
  inconsistent. Confirm this is the desired aesthetic before "fixing" it. (See
  `formatting-spec.md` → "Why RIVER top-level but BLOCK inside parens".)
- **Base-indent preservation.** `base` = the first non-empty line's indentation, preserved on
  output (a query at column 0 → river at 6; the golden at 4 spaces stays at 4). Confirm this is
  preferred over always normalizing to a fixed indent.
- **Default `maxLineLength`.** Setting default is `null` → resolves to `editor.rulers[0]`, else 80.
  User has considered pinning an explicit default; not decided.

## Not yet implemented (known limitations, documented in README)

- **Line comments inside boolean expressions** (`where`/`on` terms). Currently any line comment that
  isn't a comma-list trailing comment or a clause's last token triggers whole-statement passthrough.
  Natural next step: extend the end-of-line-comment handling (already done for comma lists in
  `splitListItems`) into `BoolTerm`s so `where a = 1 -- note\nand b = 2` reflows.
- **Subqueries / CTEs (`with`).** Rendered inline; the inner river is not recomputed. A parenthesized
  `select` inside `from (...)` or a CTE body stays on effectively one logical line.
- **`case when ... then ... else ... end`.** No dedicated wrapping/alignment.
- **DML** — `insert` / `update` / `delete`. Only basic/generic handling; no reviewed golden cases.

## When you pick one up

1. Read `formatting-spec.md` and the relevant module.
2. Add a failing YAML case first (`testing.md`).
3. Implement, keep idempotency, re-run `npm test` + `npm run lint`.
4. Re-package + re-install the vsix only if runtime code changed.
5. Update this file.
