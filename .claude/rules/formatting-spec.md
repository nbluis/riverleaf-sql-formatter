# Formatting algorithm spec

Read this before editing `src/formatter/layout.ts` or `src/formatter/segmenter.ts`. It captures
the non-obvious rules that are expensive to re-derive from code. Positions below are 0-indexed
character columns.

## Pipeline

`format(sql, options)`:
1. `base` is the constant **0** (D2, 2026-07-16): the output always starts at the left margin,
   normalizing away any source indentation. The widest clause head (the river's leftmost word) lands
   at column 0, so it round trips (reformatting a column-0 query re-emits it at column 0). Inner
   subquery blocks are still indented one level in, recursively (their base is `ownerLeading +
   indentSize`, independent of the top-level base). (Earlier versions preserved the minimum source
   indent via `detectBaseIndent`; that scan was removed when D2 chose normalization.)
2. `tokenize` → tokens with offsets.
3. `splitStatements` — split on top-level `;`. Each `Statement` keeps its raw `tokens` (for the
   comment-safety gate and passthrough slicing) and `semicolon`.
4. Per statement: if `isCommentSafe` is false → emit the original source slice unchanged
   (`originalSlice`). Else `Layout.formatStatement`.
5. Join statements with a blank line; ensure a single trailing `\n`.

## Breaking model — by rule, not by width (2026-07-16)

Line length plays **no** part in any breaking decision. There is no `maxLineLength`, no `fits()`,
no `maxWidth` — all removed. Two categories:

- **Structural (count) breaking.** A list clause breaks one item per line whenever it has **more
  than one item** (`select`, `from` with a comma, `group by`, `order by`, `set`, `values`, the
  `insert` column list). A `where`/`having`/`join` ON breaks whenever it has **more than one
  condition**; a parenthesized boolean group **always expands** (it only exists with >1 inner term).
- **Expression level grows, never breaks.** A single item / single condition / function args / an
  `in (...)` list / a `values` tuple interior / a `when ... then` all stay on one line and simply
  grow, however long. The only per-item multi-line expansions are `case`, subqueries, and the
  `insert` column list — all driven by structure, not width.

## The river

- `segmentClauses` cuts the statement into `Clause`s at clause-starting keywords seen at paren
  depth 0. Clause head = the keyword phrase; `firstWord` = lowercased head[0].
  - `GROUP`/`ORDER` only start a clause when followed by `BY` (else they're identifiers).
  - JOIN phrases are consumed whole (`left [outer] join`, `inner join`, `cross join`, ...); a
    `LEFT(` immediately followed by `(` is the function, not a join.
  - **Continuation keywords that must NOT anchor** (guards in `isClauseBoundary`, like the
    `pendingBetween` guard for `between ... and ...`):
    - `IS [NOT] DISTINCT FROM` — a `FROM` immediately preceded by `DISTINCT` is the operator's
      `from`, not a clause (A2).
    - `WITH ORDINALITY` — a `WITH` immediately followed by `ORDINALITY` is a from-item modifier,
      not a CTE; it stays in the `from` item (A5).
  - **Row-locking clause** — `FOR (UPDATE | NO KEY UPDATE | SHARE | KEY SHARE) [OF t, ...]
    [NOWAIT | SKIP LOCKED]`. `FOR` anchors its own clause (kind `generic`, so it joins the river as
    a one-line head like `limit`). The strength keywords (`NO`/`KEY`/`UPDATE`/`SHARE`) are consumed
    **into the head** so the inner `UPDATE`/`SHARE` are never re-examined as DML anchors; the
    remainder (`OF` list, `NOWAIT`/`SKIP LOCKED`) flows as the body (A3).
  - **`ON CONFLICT` (upsert)** — `on conflict [ (target) | on constraint name ] [where predicate]
    do (nothing | update)`. The whole run from `ON CONFLICT` through the `DO NOTHING`/`DO UPDATE`
    terminal is consumed as **one clause head** (kind `generic`, `on` joins the river), so the inner
    `UPDATE` is not a DML anchor and the target `(cols)` + partial-index `WHERE` ride the on-conflict
    line. The `DO UPDATE`'s `SET` and any trailing update `WHERE` then anchor as ordinary river
    clauses below it. `CONFLICT` is a keyword, so `on conflict (cols)` keeps its space before the
    `(` for free (`renderTokens`). `EXCLUDED` stays an identifier (`excluded.col`, preserved) (A4).
- **Set operations stay in the river** (decision, 2026-07-17, B4): `union`/`union all`/`intersect`/
  `except` (kind `setop`) anchor a clause and **do** participate in `K` (unlike `cte`), so `union all`
  sits at leading 1 (`union` on the river, `all` after it) and a wide operator like `intersect`
  (9 chars) pushes the selects right. This was chosen over the off-river-at-column-0 alternative.
- `K = max(firstWord.length over all clauses **except `cte`**)` (dominated by `select`=6 in typical
  queries). The `with` (cte) preamble is **not part of the river** — it is a standalone command that
  always sits at the base column (0), so its first word is excluded from `K` (it never pulls the
  other clauses right) and its `leading` is `base`, not `riverEnd - 4`.
- `riverEnd = base + K` (exclusive column where first words' right edges land).
- A clause line starts at `leading = riverEnd - firstWord.length` (except `cte`, at `base`). The head
  is rendered from there; the body follows after one space. Example (base 0, K 6, riverEnd 6):
  `select`→0 leading, `from`→2, `where`→1, `and`→3, `order`→1 (then `by` flows), `left`→2 (then
  `join` flows), `with`→0 (base, off-river).
- Operand/arg column for a clause = `leading + headStr.length + 1`.

## Clause kinds → renderers (`Layout`)

- `select` / `list` (group by, order by) → `renderListClause`.
- `from` → `renderFromClause` (subquery-aware; else a list clause).
- `cte` (`WITH`) → `renderCteClause` (subquery-aware; else generic).
- `set` / `values` (DML) → `renderListClause` (ordinary list: breaks when >1 item).
- `insert` (DML) → `renderInsertClause`.
- `where` / `having` → `renderBoolClause` (subquery-aware for a single condition).
- `join` → `renderJoinClause`.
- everything else (`limit`, set ops, `update`/`delete` heads, preamble) → `renderGenericClause`
  (single line).

### DML

`insert` / `update` / `delete` / `set` are `CLAUSE_STARTERS`, so DML anchors join the river and
format like a select. `delete` consumes a following `from` into its head (`delete from t` on one
line). `renderInsertClause` renders `insert into t (cols)` but keeps a space before the column-list
`(` (`renderTokens` would glue it as a function call); the column list **breaks by rule** — a list
with >1 column always breaks via `renderTupleBroken` (columns aligned one column past the `(`,
trailing commas, `)` on the last), a single column stays inline. `set` and `values` are ordinary
list clauses (no special flag): one assignment / tuple per line whenever there is more than one item,
a single item inline. A `values` **tuple interior is expression level** — it never breaks, it grows
on one line (multi-row `values` still breaks one tuple per line, by count). `where` reuses the normal
RIVER bool rendering.

### Subqueries / CTEs (recursive)

`findSubquery(tokens)` (exported from `segmenter.ts`, shared by `layout.ts` and `format.ts`)
returns the first top-level `( ... )` whose first interior token is `SELECT` or `WITH`.
`findDerivedSubquery(tokens)` (also exported) is the **table/derived-table** variant used by the
from / join / from-list hooks: it returns that subquery only when it **is** the whole reference —
either the `(` is the first token, **or** it is preceded solely by the `LATERAL` keyword
(`lateral ( select ... ) alias` — a derived-table modifier, not a function call). It returns null for
a function-wrapped subquery (`coalesce((select ...), 0)`, whose `(` is preceded by a function name).
`findWrappedSubquery(tokens)` (exported) returns the first subquery `(` nested at **paren depth ≥ 1**
— the function-wrapped case (`coalesce((select ...), 0)`) or any parenthesized-expression subquery
— and is null for a bare top-level one (`1 + (select ...)`, depth 0, which keeps its inline
behavior). `findAnyDepthSubquery(tokens)` (exported) is the union: the first subquery at **any**
depth, used by the comment-safety gate (which must recurse into every subquery the layout expands).
`renderSubqueryBlock(prefix, inner, ownerLeading, afterStr)` emits `prefix(`, then the inner tokens
formatted recursively via `renderInner` (`segmentClauses` → a `Statement` → `formatStatement`) at
`innerBase = ownerLeading + indentSize`, then `pad(ownerLeading) + ') ' + afterStr`. So the inner
block is one level past the owner clause keyword and the closing `)` aligns **under that keyword**
(not the base margin). Hooks:
- `renderFromClause` — `from ( select ... ) alias` (or `from lateral ( select ... ) alias`) when the
  whole from body is one derived subquery (`findDerivedSubquery`); the `lateral` prefix (if any) rides
  the `(` line; `ownerLeading` = `from`'s leading; `afterStr` = the alias.
- `renderCteClause` (`cte` kind, `WITH`) — one or more comma-separated CTEs. `splitCommaList`
  splits the `with` body; each CTE must be `name as ( select|with ... )` (`findSubquery` matches its
  interior). `ownerLeading` = `with`'s leading (= `base`, column 0 — the cte clause is off-river) for
  **every** CTE, so each `)` aligns under `with` at the base margin. The first CTE's prefix carries
  the `with` head (`with a as (`); each subsequent CTE's prefix is just `pad(leading) + "name as " `
  — its name **recedes to the `with` column** (base 0). The trailing comma
  follows the previous `)` (it is that CTE's `afterStr`, dropped on the last). If any CTE body is not
  a parenthesized `select`/`with` (e.g. a `values` CTE), the whole clause falls back to
  `renderGenericClause` (the one-liner).
- `renderBoolClause` — the **first** condition of a `where`/`having` whose atom contains a subquery
  (`where x in ( select ... )`); `ownerLeading` = the clause's leading (so the `)` sits under the
  keyword). When there are more conditions, they render below the `)` via `renderRiverTail`
  (connectors right-aligned at `riverEnd`). A subquery in a **non-first** condition also expands
  (Phase 10) via `emitTerm`'s `expandSubquery` flag, but with `ownerLeading = lineStart` — the
  connector's column — so its `)` sits under the `and`/`or`. `hasSubquery` forces the break.
- `renderOn` (join ON) — a subquery in an ON condition expands the same way (`expandSubquery` true;
  `)` under the connector, or under the operand for a single ON condition). `hasSubquery` there
  forces a single-condition ON to break instead of staying inline.
- `renderJoinClause` — the join **table** is a derived subquery (`join ( select ... ) alias on ...`,
  `join lateral ( select ... ) alias on ...`, `cross join lateral ( ... )`; `findDerivedSubquery`);
  the `lateral` prefix rides the `(` line; `ownerLeading` = the join's leading; the alias + ON go on
  the `)` line via `renderOn` (a single ON inline; two or more keep the secondary river right after
  `on`). Note: the segmenter recognizes `join (` as a join — not the `LEFT(` function — only when the
  interior begins `SELECT`/`WITH`; a `lateral` between the join phrase and the `(` is fine (`lateral`
  is a keyword, so it is not glued to the `(` and the join phrase does not consume it).
- `renderItemLines` — a from/select/group-by/order-by list item that **is** a derived subquery
  (`( select ... ) [alias]` or a from-list `lateral ( select ... ) alias`, `itemSubquery` =
  `findDerivedSubquery`); the `lateral` prefix rides the `(` line; `ownerLeading` = the item column;
  `afterStr` = the part after `)` (e.g. `as item_count`). A subquery item forces the list to break,
  like a `case`.

### Function-wrapped subqueries / cases (D3, 2026-07-17)

A subquery or a `case` **wrapped in a function call** — nested at paren depth ≥ 1, e.g.
`coalesce((select ...), 0)` or `coalesce(case ... end, 0)` — also expands, in
select/group-by/order-by items (`renderItemLines`), `where`/`having` conditions and `join` ON
(`emitTerm`, via the `expandSubquery` / `expandCase` flags). Two shared helpers glue the surrounding
text with exact token spacing (from `spaceBetween`, exported from `render.ts`):
- `renderPrefix(tokens, idx)` — the on-line text of `tokens[0..idx)` before the construct at `idx`,
  joined so `coalesce(` glues to the inner `(` with no space but `x in` keeps its space.
- `renderAfter(closeTok, after)` — the text after the construct's closing token (`)` of a subquery,
  `end` of a case), joined so `), 0)` / `end, 'x')` have no space before the comma.

Wrapped **subquery**: `findWrappedSubquery` locates it; the inner block expands via
`renderSubqueryBlock(renderPrefix(...), inner, ownerLeading, renderAfter(...))`, so the `)` aligns
under the **item column** (items) or the **operand/connector column** (`lineStart`, conditions), and
the rest of the wrapping expression (`), 0) as top`, `), 0) > 5`) rides the `)` line. Wrapped
**case**: `findWrappedCase` (paren depth ≥ 1, so a top-level `case` in a bare expression such as
`prder by case ...` is **not** matched) locates it; `renderCase` runs at `renderPrefix(...).length`
so `case`/`when`/`else`/`end` align under the `case`, and the rest rides the `end` line (`end, 'x')`).
`hasCase` / `itemHasSubquery` (items) / `condHasSubquery` (conditions) include the wrapped forms so a
single item / single condition / single ON is forced to break and expand.

Recursion recomputes the inner river and handles nesting. `formatStatement` builds the inner
statement with `semicolon: false`. A subquery containing a line comment expands too: `isCommentSafe`
recurses into every subquery it expands (see Comments), so the recursion places the comment; a
comment inside a *non-expanded* subquery still forces passthrough. Idempotent because the top-level
base is always 0 (the outer widest clause head is the leftmost; the inner block never displaces it).

### List clauses

`splitListItems` splits on top-level commas and extracts line comments (see Comments). Render:
- **Break by rule, not by width.** A list with **more than one item always breaks** (one item per
  line) — the same for every list clause: `select`, `from` (with a comma), `group by`, `order by`,
  and the DML `set`/`values`. A **single item stays on one line** (it simply grows) unless it owns a
  comment or expands a `case`/subquery/wide tuple.
- When it breaks: first item on the head line, rest at `operandCol`, **trailing commas**, each
  item's comment appended after its comma. An item can span several lines (a `case`) via
  `renderItemLines`; its comma and trailing comment attach to the item's **last** line.

### case expressions

`parseCase(tokens)` matches a list item that is exactly `CASE [selector] WHEN ... [ELSE ...] END
[alias]` (first token `CASE`, matching `END` with case/end nesting, ≥1 `WHEN`/`ELSE` segment).
`renderCase(c, caseCol)` emits `case [selector]` (line 0, no pad — the caller positions it), then
each `WHEN`/`ELSE` segment (via `renderCaseSegment`) and the closing `END [alias]` at `caseCol`
(= the item's column). So `case`/`when`/`else`/`end` share the item column.

**Long `when ... then`.** A `when ... then <result>` (and an `else`) is expression level — it stays
on a single line and **grows**, however long. It is never wrapped (breaking is by rule, not by
width; the former C2 `findThen` wrap was removed in R3). Only a **nested `case`** in a branch makes
a segment multi-line (see below).

**Nested `case` (recursive).** `renderCaseSegment(seg, caseCol)` uses `findNestedCase` to locate a
`case ... end` at paren depth 0 inside the segment (skipping the segment's leading `WHEN`/`ELSE`; a
`case` inside parens/a function is left inline). When found, it renders the text before the inner
`case` (e.g. `when x then `) then recurses with `renderCase` at the column where that inner `case`
begins, so the inner `when`/`else`/`end` align there. Anything after the inner `END` rides the inner
`end` line (it is the inner case's `after`).

**`case` in `where`/`having`/`join` ON (C3 + A3).** `emitTerm` takes an `expandCase` flag (threaded
from `renderBoolClause` → `renderBoolRiver`/`renderRiverTail`, and from `renderOn` — which passes it
**true** since Phase 11/A3). When set and the term is an atom that `parseCase` accepts, the condition
expands: `case` at the operand column, `when`/`else`/`end` aligned there, and anything after `end`
(e.g. `> 100`, `= 1`) on the `end` line. `renderBoolClause` and `renderOn` detect such a term
(`hasCase`) and force the expression to break (never the inline path) — including a single-condition
ON. `group by`/`order by` already expand a `case` item via `renderItemLines`.

### Boolean expressions — RIVER vs BLOCK

`parseBoolExpr` → list of `BoolTerm` (`{connector, node}`), node is `atom` or `group`
(a `( ... )` whose interior has >1 term). `between ... and ...` is protected: that `and` is not a
split point (`pendingBetween` counter in `splitTerms`).

- **RIVER mode** (`renderBoolRiver`, used for top-level where/having/on): connectors right-aligned
  so their right edge lands on `connEnd`; operands at `connEnd + 1`. The first term is inline on
  the clause/keyword line. `where`/`having` **break whenever there are two or more conditions**
  (by count, never by width); a single condition stays inline unless it is a group (always expands)
  or an atom that expands a `case`/subquery.
  - `where`: `connEnd = riverEnd`.
  - `join`: `connEnd = onRiverEnd = leading + len("<head> <tableref> on")` — a **secondary river**
    at the column right after `on`. First ON term stays on the join line. A join with two or more
    ON conditions **always breaks** (by count); a single-condition ON stays inline
    (nothing to align).
- **BLOCK mode** (`renderBoolBlock`, used inside an expanded parenthesized group): connectors are
  **right-aligned** (RIVER, same as the top level, D1). Operands align at `blockIndent`; each
  connector's right edge lands at `blockIndent - 1` (a secondary river inside the group), so a term
  is `pad(blockIndent - 1 - connLen) + connector + " " + operand`. The first term has no connector
  and sits at `blockIndent`. Standalone comments align with the operands (`blockIndent`).

When a term is a group (`emitTerm`) — a group **always expands** (it only exists with >1 inner term,
so the count rule always breaks it): emit `... (` on the owner line, render the interior in BLOCK
mode at `blockIndent = ownerLineStart + indentSize`, close with `)` at `ownerLineStart` (aligned
under the connector that owns the group). Note: because the `)` position
is unchanged by D1, for a **connector-preceded** group (e.g. `and (` inside an ON/where river) the
`(` and `)` sit in different columns and a short interior connector (`or`) can protrude one column
left of the owner connector — that is the mechanical result of right-aligning to the group river and
is expected. For a **first-term** group (`where (`), the `(` and `)` share a column, matching the
user's locked target.

### RIVER everywhere (D1, locked 2026-07-15)

Both the top level and the inside of an expanded parenthesized group right-align connectors now.
The connectors inside a group align to the **group's own river** (`blockIndent - 1`), mirroring the
top-level where/on style. The closing `)` stays where it was (`ownerLineStart`) — D1 changed
**only** the connector alignment in `renderBoolBlock`, not the `)` emission in `emitTerm`. This
replaced the earlier BLOCK style (connectors left-aligned at `blockIndent`), which was internally
inconsistent with the top level; the golden example was updated to match.

## Operator lexing (`tokenizer.ts`)

Operators are lexed by **maximal munch** over the PG operator-char set
(`+ - * / < > = ~ ! @ # % ^ & | ?`): an operator token is the longest contiguous run of those
chars, so any multi-char operator — built-in, user-defined, JSONB (`@>`, `<@`, `#>`, `#>>`, `?`,
`?|`, `?&`, `@@`, `@?`), regex (`~`, `~*`, `!~`, `!~*`), array (`&&`), bit-shift (`<<`, `>>`), and
the classics (`<=`, `>=`, `<>`, `!=`, `||`, `->`, `->>`, `=>`) — survives as one token instead of
being sliced into single chars (which then got a space wedged inside them, e.g. `@ >`). Notes:
- `@` and `#` are **operator** chars, not identifier chars (they were in the word set, which is
  what sliced `@>`/`#>` apart). `$` stays an identifier char (positional params `$1`).
- `:` is **not** a PG operator char, so `::` and `:=` are recognized explicitly *before* the munch;
  a lone `:` falls through to the fallback.
- PG's trailing-`+`/`-` rule: a multi-char operator ending in `+`/`-` is only a unit if it contains
  one of `~ ! @ # % ^ & | ?`; otherwise the trailing `+`/`-` split off (`x=-1` → `= - 1`, not
  `=- 1`). No further semantic validation — the operator text is preserved as written (never
  corrupt).

## Token spacing (`render.ts` `needsSpace`)

No space: before `, ; ) ] .`; after `( [ .`; around `::`, `->`, `->>`; before `(` when it's a
call/subscript (prev is word/string/number/`)`/`]`, or a keyword in `FUNCTION_KEYWORDS` like
`coalesce`/`cast`). Keywords like `in`/`values`/`on`/`exists`/`select`/`lateral` keep a space before
`(` — so `lateral ( select ... )` is a derived table, not a `lateral(...)` function call. Every
other `operator` token (`@>`, `&&`, `~*`, `<<`, `?|`, `>=`, `||`, …) gets the default binary
spacing — one space on each side (`data @> '{}'`); only `::`/`->`/`->>` are the glued exceptions.

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
    rides its line, and a comment on a single (inline) condition stays with it.
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
    the ON expression to be `boolExprCommentsSafe` (boundary comments **or** comments inside an
    expanded ON-condition subquery, Phase 10).
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
    must be one that is actually expanded (from body / any CTE / **any** where/having condition /
    join ON condition / join table / a select-list item that **is** the subquery).
    `whereCommentsSafe` and the ON branch of `joinCommentsSafe` share `boolExprCommentsSafe`, which
    blanks **every** subquery interior at **any depth** (`blankAllSubqueries`, so a function-wrapped
    one is covered), requires the remainder to be `boolCommentsReflowable`, and checks each subquery
    interior recursively (`subqueryInteriorsSafe`, also any-depth).
  - `isCommentSafe(statement)`: for list clauses, false if any item is `unsafe` (a line comment
    strictly *inside* an item — not at a boundary) *unless* the item expands a subquery — a
    bare/lateral derived one (`findDerivedSubquery`) or a function-wrapped one
    (`findWrappedSubquery`) — whose interior recurses safe and whose surrounding text is comment-free;
    for `where`/`having`, `boolExprCommentsSafe` (every comment at a
    top-level term boundary — inline-trailing, standalone-between-terms, standalone-before-first, or
    inside a reflowable wrapped group — **or** inside any condition's expanded subquery, checked
    recursively); for `from`, recurse into the expanded subquery (else list rule); for `cte`, split
    the `with` body on commas and — when every CTE is an expandable subquery — recurse into each (its
    `name as` and any trailing part must be comment-free), else the last-token rule; for `join`, the
    table-ref before `on` must be comment-free (or be an expanded subquery whose interior recurses
    safe) and the ON expression `boolExprCommentsSafe`; for generic/set ops, false if a line comment
    is not the last body token. If unsafe → the whole statement is emitted unchanged (passthrough) so
    SQL is never commented-out by line joins.
- Still passthrough: a comment mid-expression (inside a single condition/item, not at a boundary and
  not inside a subquery that expands). A function-wrapped subquery now expands, so a comment inside it
  reflows; a comment inside a subquery the layout does *not* expand (a bare depth-0 expression
  subquery in a select item, `1 + (select -- c ...)`) still forces passthrough.

## Invariants to keep

- **Idempotent**: `format(format(x)) === format(x)`. The YAML runner asserts this per case.
- **Never corrupt**: if unsure how to place a token safely, prefer passthrough over wrong output.
- **Spaces only**, single trailing newline, no trailing whitespace on any line.
