# Formatting algorithm spec

Read this before editing `src/formatter/layout.ts` or `src/formatter/segmenter.ts`. It captures
the non-obvious rules that are expensive to re-derive from code. Positions below are 0-indexed
character columns.

## Pipeline

`format(sql, options)`:
1. `detectBaseIndent` — `base` = the **minimum** leading indentation across the query's non-empty
   lines (tabs expand to `indentSize`). That is the column of the widest clause head (the river's
   leftmost word), so it is preserved on output and round trips: reformatting a formatted query
   re-detects the same base. Using the first line's indent would compound the indent whenever the
   first clause is not the widest (e.g. `update ... returning`, `returning` being wider than
   `update`). Respects where the query sits.
2. `tokenize` → tokens with offsets.
3. `splitStatements` — split on top-level `;`. Each `Statement` keeps its raw `tokens` (for the
   comment-safety gate and passthrough slicing) and `semicolon`.
4. Per statement: if `isCommentSafe` is false → emit the original source slice unchanged
   (`originalSlice`). Else `Layout.formatStatement`.
5. Join statements with a blank line; ensure a single trailing `\n`.

## The river

- `segmentClauses` cuts the statement into `Clause`s at clause-starting keywords seen at paren
  depth 0. Clause head = the keyword phrase; `firstWord` = lowercased head[0].
  - `GROUP`/`ORDER` only start a clause when followed by `BY` (else they're identifiers).
  - JOIN phrases are consumed whole (`left [outer] join`, `inner join`, `cross join`, ...); a
    `LEFT(` immediately followed by `(` is the function, not a join.
- `K = max(firstWord.length over all clauses)` (dominated by `select`=6 in typical queries).
- `riverEnd = base + K` (exclusive column where first words' right edges land).
- A clause line starts at `leading = riverEnd - firstWord.length`. The head is rendered from there;
  the body follows after one space. Example (base 4, K 6, riverEnd 10):
  `select`→4 leading, `from`→6, `where`→5, `and`→7, `order`→5 (then `by` flows), `left`→6 (then
  `join` flows).
- Operand/arg column for a clause = `leading + headStr.length + 1`.

## Clause kinds → renderers (`Layout`)

- `select` / `list` (group by, order by) → `renderListClause`.
- `from` → `renderFromClause` (subquery-aware; else a list clause).
- `cte` (`WITH`) → `renderCteClause` (subquery-aware; else generic).
- `set` / `values` (DML) → `renderListClause` with `alwaysBreak = true`.
- `insert` (DML) → `renderInsertClause`.
- `where` / `having` → `renderBoolClause` (subquery-aware for a single condition).
- `join` → `renderJoinClause`.
- everything else (`limit`, set ops, `update`/`delete` heads, preamble) → `renderGenericClause`
  (single line).

### DML

`insert` / `update` / `delete` / `set` are `CLAUSE_STARTERS`, so DML anchors join the river and
format like a select. `delete` consumes a following `from` into its head (`delete from t` on one
line). `renderInsertClause` renders `insert into t (cols)` on one line but keeps a space before the
column-list `(` (`renderTokens` would glue it as a function call). `set` and `values` are list
clauses with `alwaysBreak`: one assignment / tuple per line whenever there is more than one item (a
single item stays inline). `where` reuses the normal RIVER bool rendering.

### Subqueries / CTEs (recursive)

`findSubquery(tokens)` (exported from `segmenter.ts`, shared by `layout.ts` and `format.ts`)
returns the first top-level `( ... )` whose first interior token is `SELECT` or `WITH`.
`renderSubqueryBlock(prefix, inner, ownerLeading, afterStr)` emits `prefix(`, then the inner tokens
formatted recursively via `renderInner` (`segmentClauses` → a `Statement` → `formatStatement`) at
`innerBase = ownerLeading + indentSize`, then `pad(ownerLeading) + ') ' + afterStr`. So the inner
block is one level past the owner clause keyword and the closing `)` aligns **under that keyword**
(not the base margin). Hooks:
- `renderFromClause` — `from ( select ... ) alias` when the whole from body is one subquery
  (`sub.open === 0`); `ownerLeading` = `from`'s leading; `afterStr` = the alias.
- `renderCteClause` (`cte` kind, `WITH`) — a single `with name as ( ... )` (nothing after the
  close); `ownerLeading` = `with`'s leading; the `name as` part is the prefix. Multiple
  comma-separated CTEs fall back to `renderGenericClause`.
- `renderBoolClause` — the **first** condition of a `where`/`having` whose atom contains a subquery
  (`where x in ( select ... )`); `ownerLeading` = the clause's leading. When there are more
  conditions, they render below the `)` via `renderRiverTail` (connectors right-aligned at
  `riverEnd`). A subquery in a non-first condition stays inline.
- `renderJoinClause` — the join **table** is a subquery (`join ( select ... ) alias on ...`,
  `findSubquery(tableRef)` with `open === 0`); `ownerLeading` = the join's leading; the alias + ON
  go on the `)` line via `renderOn` (a single ON inline; two or more keep the secondary river right
  after `on`). Note: the segmenter now recognizes `join (` as a join — not the `LEFT(` function —
  only when the interior begins `SELECT`/`WITH`.
- `renderItemLines` — a select/group-by/order-by list item that **is** a scalar subquery
  (`( select ... ) [alias]`, `itemSubquery`: `findSubquery` with `open === 0`); `ownerLeading` =
  the item column; `afterStr` = the part after `)` (e.g. `as item_count`). A subquery merely wrapped
  in a function (`coalesce((select ...), 0)`) is not expanded (`open !== 0`). A scalar-subquery item
  forces the list to break, like a `case`.
Recursion recomputes the inner river and handles nesting. `formatStatement` builds the inner
statement with `semicolon: false`. A subquery containing a line comment expands too: `isCommentSafe`
recurses into every subquery it expands (see Comments), so the recursion places the comment; a
comment inside a *non-expanded* subquery still forces passthrough. Idempotent because the base is
the minimum indent (the inner block never becomes the leftmost).

### List clauses

`splitListItems` splits on top-level commas and extracts line comments (see Comments). Render:
- Stay on one line when there is no comment, no `case` to expand, and (single item, or — unless
  `alwaysBreak` — it fits).
- Else break: first item on the head line, rest at `operandCol`, **trailing commas**, each item's
  comment appended after its comma. An item can span several lines (a `case`) via
  `renderItemLines`; its comma and trailing comment attach to the item's **last** line.

### case expressions

`parseCase(tokens)` matches a list item that is exactly `CASE [selector] WHEN ... [ELSE ...] END
[alias]` (first token `CASE`, matching `END` with case/end nesting, ≥1 `WHEN`/`ELSE` segment).
`renderCase(c, caseCol)` emits `case [selector]` (line 0, no pad — the caller positions it), then
each `WHEN`/`ELSE` segment (via `renderCaseSegment`) and the closing `END [alias]` at `caseCol`
(= the item's column). So `case`/`when`/`else`/`end` share the item column. A long `when ... then
...` is not wrapped (Phase 8).

**Nested `case` (recursive).** `renderCaseSegment(seg, caseCol)` uses `findNestedCase` to locate a
`case ... end` at paren depth 0 inside the segment (skipping the segment's leading `WHEN`/`ELSE`; a
`case` inside parens/a function is left inline). When found, it renders the text before the inner
`case` (e.g. `when x then `) then recurses with `renderCase` at the column where that inner `case`
begins, so the inner `when`/`else`/`end` align there. Anything after the inner `END` rides the inner
`end` line (it is the inner case's `after`).

**`case` in `where`/`having` (C3).** `emitTerm` takes an `expandCase` flag (threaded from
`renderBoolClause` → `renderBoolRiver`/`renderRiverTail`; `renderOn` for a join passes it false).
When set and the term is an atom that `parseCase` accepts, the condition expands: `case` at the
operand column, `when`/`else`/`end` aligned there, and anything after `end` (e.g. `> 100`) on the
`end` line. `renderBoolClause` detects such a term (`hasCase`) and forces the expression to break
(never the inline path). `group by`/`order by` already expand a `case` item via `renderItemLines`.
A `case` inside a `join` ON stays inline (`expandCase` false there).

### Boolean expressions — RIVER vs BLOCK

`parseBoolExpr` → list of `BoolTerm` (`{connector, node}`), node is `atom` or `group`
(a `( ... )` whose interior has >1 term). `between ... and ...` is protected: that `and` is not a
split point (`pendingBetween` counter in `splitTerms`).

- **RIVER mode** (`renderBoolRiver`, used for top-level where/having/on): connectors right-aligned
  so their right edge lands on `connEnd`; operands at `connEnd + 1`. The first term is inline on
  the clause/keyword line.
  - `where`: `connEnd = riverEnd`.
  - `join`: `connEnd = onRiverEnd = leading + len("<head> <tableref> on")` — a **secondary river**
    at the column right after `on`. First ON term stays on the join line. A join with two or more
    ON conditions **always breaks** (regardless of width); a single-condition ON stays inline
    (nothing to align).
- **BLOCK mode** (`renderBoolBlock`, used inside an expanded parenthesized group): connectors are
  **left-aligned** at `blockIndent`; each term is `blockIndent + [connector + " "] + operand`;
  first term has no connector.

When a term is a group that doesn't fit inline (`emitTerm`): emit `... (` on the owner line, render
the interior in BLOCK mode at `blockIndent = ownerLineStart + indentSize`, close with `)` at
`ownerLineStart` (aligned under the connector that owns the group).

### Why RIVER top-level but BLOCK inside parens

This asymmetry is deliberate: it reproduces the user's golden example exactly. In that example the
top-level ON/WHERE connectors are right-aligned (aligned operands) while the connectors inside the
parenthesized group are left-aligned/indented. The example is internally inconsistent between the
two levels, and we matched it on purpose. **Confirm with the user before changing** (roadmap).

## Token spacing (`render.ts` `needsSpace`)

No space: before `, ; ) ] .`; after `( [ .`; around `::`, `->`, `->>`; before `(` when it's a
call/subscript (prev is word/string/number/`)`/`]`, or a keyword in `FUNCTION_KEYWORDS` like
`coalesce`/`cast`). Keywords like `in`/`values`/`on`/`exists`/`select` keep a space before `(`.

## Comments

- Block comments `/* */` render inline and are always safe.
- Line comments `--` must end their physical line. The tokenizer records
  `token.newlineBefore` (a newline separates the token from the previous one, or it is first),
  which distinguishes a **standalone** comment (alone on its line) from an **inline** one
  (trailing code on the same physical line). This drives placement:
  - **Standalone comments stay on their own line.** The *content column* — `riverEnd + 1`, just
    past the river, where clause arguments and list items start — is the anchor:
    - *Leading (before the first clause)*: `segmentClauses` lifts them into the first clause's
      `commentsBefore`, rendered at the **base** margin. This also stops a leading comment from
      inflating the river width `K`.
    - *Between clauses*: lifted into the following clause's `commentsBefore`, rendered at the
      **content column** (`riverEnd + 1`).
    - *Between list items*: `splitListItems` puts a standalone comment into the following item's
      `commentsBefore`, rendered at the item operand column (which is the content column for a
      single-word head). A standalone comment forces the list to break.
    - *After the last clause*: returned as `Statement.trailingComments`, rendered at the **content
      column**. The `;`, if any, goes on the last code line, before them.
  - **Inline comments** stay attached to the last token of their line: `splitListItems` keeps a
    comment after `X,` or at the end of an item as that item's trailing `comment`; in `where`/
    `having` (RIVER mode), `processRawTerms` (via `parseBoolExpr`) extracts an inline comment
    trailing a top-level term into `BoolTerm.comment`, rendered at end of that term's line. A
    comment on an intermediate term forces the expression to break; a comment on the last term
    (or a single term) can stay inline when it fits.
  - **Standalone comments between `where`/`having` conditions**: `processRawTerms` lifts a
    standalone comment (trailing a term, or leading the next after its connector) into the
    following `BoolTerm.commentsBefore`, rendered on its own line at the operand column
    (`connEnd + 1`) above that condition. Any such comment forces the expression to break.
  - **Standalone comment before the first `where`/`having` condition**: lifted into
    `terms[0].commentsBefore`. `renderBoolRiver` then puts the keyword on its own line
    (`firstLinePrefix` trimmed) and drops the comment(s) and the first operand to the operand
    column (`connEnd + 1`).
  - **Comments inside an expanded parenthesized group (BLOCK mode)**: `processRawTerms` treats a
    mid-term comment as safe when the term is a wrapped group whose interior is itself reflowable
    (`asWrappedGroup` + recursive `processRawTerms`), so `parseBoolExpr` recurses and the inner
    `BoolTerm`s carry the comments. `renderBoolBlock` emits each term's `commentsBefore` at
    `blockIndent` and appends inline `comment`. A group carrying any comment always expands
    (`nodeHasComments`), since inline rendering (`renderInlineBool`) drops comments.
  - **Comments inside a `join` ON**: `renderJoinClause` reuses `parseBoolExpr` + `renderBoolRiver`,
    so between-condition standalone comments and inline comments already reflow under the ON river.
    The safety gate (`isCommentSafe`) requires the table-ref part before `on` to be comment-free and
    the ON expression to be `boolCommentsReflowable`.
  - *Comment after the final `;`*: a trailing comment-only unit (no clauses) glues under the
    previous block with a single `\n` instead of becoming its own blank-line-separated block
    (see `format()`).
  - **Comments inside an expanded subquery** reflow via the recursion. `isCommentSafe`
    (`format.ts`) is itself recursive: for any clause whose subquery it *will* expand, it recurses
    into that subquery's interior (`clausesCommentsSafe(segmentClauses(inner).clauses)`) instead of
    rejecting the mid-item/mid-term comment. Because the top-level gate recurses into every subquery
    the layout expands, a formatted inner block never carries an unsafe comment — so `renderInner`
    needs no gate of its own. The recursion mirrors the layout's expansion conditions exactly
    (`fromCommentsSafe` / `cteCommentsSafe` / `whereCommentsSafe` / `joinCommentsSafe` /
    `listCommentsSafe`): the parts *outside* the subquery must be comment-free, and the subquery
    must be one that is actually expanded (from body / single CTE / **first** where condition / join
    table / a select-list item that **is** the subquery). `whereCommentsSafe` uses
    `blankFirstSubquery` to re-check the remaining conditions with the first subquery's interior
    blanked out.
  - `isCommentSafe(statement)`: for list clauses, false if any item is `unsafe` (a line comment
    strictly *inside* an item — not at a boundary) *unless* the item is an expanded scalar subquery
    whose interior recurses safe; for `where`/`having`, false unless `boolCommentsReflowable` (every
    comment at a top-level term boundary — inline-trailing, standalone-between-terms,
    standalone-before-first — or inside a reflowable wrapped group) *or* the only offending comment
    is inside the first condition's expanded subquery; for `from`/`cte`, recurse into the expanded
    subquery (else list/last-token rule); for `join`, the table-ref before `on` must be comment-free
    (or be an expanded subquery whose interior recurses safe) and the ON expression
    `boolCommentsReflowable`; for generic/set ops, false if a line comment is not the last body
    token. If unsafe → the whole statement is emitted unchanged (passthrough) so SQL is never
    commented-out by line joins.
- Still passthrough: a comment mid-token (inside a single condition/item), or inside a subquery that
  is **not** expanded (a non-first `where` condition, a `join` ON, a function-wrapped subquery, or
  one of multiple comma-separated CTEs).

## Invariants to keep

- **Idempotent**: `format(format(x)) === format(x)`. The YAML runner asserts this per case.
- **Never corrupt**: if unsure how to place a token safely, prefer passthrough over wrong output.
- **Spaces only**, single trailing newline, no trailing whitespace on any line.
