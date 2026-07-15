# Formatting algorithm spec

Read this before editing `src/formatter/layout.ts` or `src/formatter/segmenter.ts`. It captures
the non-obvious rules that are expensive to re-derive from code. Positions below are 0-indexed
character columns.

## Pipeline

`format(sql, options)`:
1. `detectBaseIndent` — `base` = leading spaces of the first non-empty line (tabs expand to
   `indentSize`). This is preserved on output → the formatter is idempotent and respects where the
   query sits.
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

- `select` / `from` / `list` (group by, order by) → `renderListClause`.
- `where` / `having` → `renderBoolClause`.
- `join` → `renderJoinClause`.
- everything else (`limit`, set ops, preamble) → `renderGenericClause` (single line).

### List clauses

`splitListItems` splits on top-level commas and extracts line comments (see Comments). Render:
- If no comment and (single item or fits width) → one line.
- Else break: first item on the head line, rest at `operandCol`, **trailing commas**, each item's
  comment appended after its comma.

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
  - **Standalone comments stay on their own line, aligned to the adjacent rendered line's
    column** (the following line if there is one, else the preceding line):
    - *Leading / between clauses*: `segmentClauses` lifts standalone line comments out of the
      token stream into the following clause's `commentsBefore` (rendered at that clause's
      leading column). This also stops a leading comment from inflating the river width `K`.
    - *Between list items*: `splitListItems` puts a standalone comment into the following item's
      `commentsBefore` (rendered on its own line at the item operand column). A standalone
      comment forces the list to break.
    - *After the last clause*: returned as `Statement.trailingComments`, rendered under the last
      clause's leading column (the `;`, if any, goes on the last code line, before them).
  - **Inline comments** stay attached to the last token of their line: `splitListItems` keeps a
    comment after `X,` or at the end of an item as that item's trailing `comment`; an inline
    comment as the last token of a `where`/`having`/`join` body renders at end of line.
  - `isCommentSafe(statement)`: for list clauses, false if any item is `unsafe` (a line comment
    strictly *inside* an item — not at a boundary); for other clauses, false if a line comment is
    not the last body token (a **mid-expression** comment in `where`/`having`/`on`). If unsafe →
    the whole statement is emitted unchanged (passthrough) so SQL is never commented-out by line
    joins.
- Not yet handled: line comments in the **middle** of a `where`/`on` boolean expression (between
  terms) still trigger passthrough. Extending `commentsBefore`/trailing-comment handling into
  `BoolTerm`s is the natural next step.

## Invariants to keep

- **Idempotent**: `format(format(x)) === format(x)`. The YAML runner asserts this per case.
- **Never corrupt**: if unsure how to place a token safely, prefer passthrough over wrong output.
- **Spaces only**, single trailing newline, no trailing whitespace on any line.
