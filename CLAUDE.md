# Riverleaf SQL Formatter — project guide for agents

VS Code extension that formats SQL in the **river alignment** style: the first word of each
clause is right-aligned to a common column (the "river"), spaces only, never tabs.

> Personal project of **Eduardo Bohrer** (publisher `nbluis`, author "Eduardo Bohrer").
> Standalone and independent — don't infer an organization from the parent folder name in the path.

## Golden rule

Everything user-facing and in-code is **English** — comments, identifiers, README, docs, test
descriptions. The user converses in Portuguese; the codebase stays English.

## Layout & responsibilities

Pure formatting core (no `vscode` import), consumed by a thin extension layer.

- `src/formatter/types.ts` — `Token`, `FormatOptions`, `DEFAULT_OPTIONS` (maxLineLength **80**,
  keywordCase `lower`, indentSize `2`).
- `src/formatter/keywords.ts` — keyword sets: `CLAUSE_STARTERS`, `JOIN_STARTERS`,
  `BOOL_CONNECTORS`, `KEYWORD_FOLLOWERS`, `KEYWORDS`, `FUNCTION_KEYWORDS`.
- `src/formatter/tokenizer.ts` — `tokenize(sql)`: lexer, drops whitespace, keeps comments/strings,
  records `start`/`end` offsets and `newlineBefore` (used to tell standalone vs inline comments).
- `src/formatter/render.ts` — `renderTokens` (canonical single-line spacing), keyword casing.
- `src/formatter/segmenter.ts` — `splitStatements`, `segmentClauses`, `parseBoolExpr`
  (`BoolTerm`/`BoolNode`), `splitCommaList`, `splitListItems` (extracts inline trailing comments +
  standalone `commentsBefore`). `segmentClauses` lifts standalone comments into clause
  `commentsBefore` / statement `trailingComments`.
- `src/formatter/layout.ts` — `Layout` class: the alignment engine (river math, RIVER vs BLOCK
  modes, line breaking). **The hard part lives here.**
- `src/formatter/format.ts` — public `format(sql, options)`, base-indent detection, comment-safety
  gate + passthrough fallback.
- `src/extension.ts` — registers document + range formatting providers; reads config from
  `riverleaf.*` and `editor.rulers[0]` (fallback 80).

## Formatting rules (summary)

- River column = `baseIndent + max(firstWord length over clauses)`. `baseIndent` is always **0**
  (D2, 2026-07-16): output is normalized to the left margin, discarding any source indentation. The
  widest clause head lands at column 0 (e.g. river at 6 for a `select`), so it round trips.
  (Formerly `baseIndent` = the minimum source indent, preserved; that scan was removed when D2
  chose normalization.)
- Clause first word right-aligned to the river; arguments start 1 space after. Multi-word keywords
  (`left join`, `order by`) align only their **first** word; the rest flows.
- Joins with **more than one ON condition always break** (regardless of width); the `and`/`or`
  conditions align under `on`. A single-condition ON stays inline.
- `where`/`on`: connectors (`and`/`or`) right-aligned to the river (RIVER mode).
- Parenthesized boolean groups expand in BLOCK mode which, since D1 (locked 2026-07-15), also
  **right-aligns** connectors — to the group's own river (`blockIndent - 1`), operands at
  `blockIndent`. The closing `)` still aligns under the owner connector (unchanged). So both levels
  are RIVER now (the old left-aligned inconsistency is gone).
- Keywords lowercased (config); identifiers preserved. `between ... and ...` — that `and` is not a
  connector.
- **DML** (`insert`/`update`/`delete`) formats like a select: the anchors join the river. `set`
  and `values` are list clauses that break **one item per line whenever there's more than one**
  (unlike select/from lists, which break only on width); a single assignment/tuple stays inline.
  `delete from` is kept together as one head. `insert into t (cols)` keeps a space before the
  column-list `(` (via `renderInsertClause`, since `renderTokens` would glue it as a call).
- **Subqueries / CTEs** expand recursively (always, for common shapes): `from (select ...) alias`,
  one or more comma-separated CTEs (`with a as (...), b as (...)`), a `where`/`having` condition
  subquery in **any** position, a subquery inside a **join ON** condition, a subquery as a **join
  table** (`join (select ...) alias on ...`), and a **scalar subquery in the select list** (expanded
  at the item column). Inner query re-aligned at `ownerLeading + indentSize`; the closing `)` aligns
  **under the owner** — the clause keyword for the first `where` condition, the `and`/`or` connector
  (`emitTerm`'s `expandSubquery`, Phase 10) for a later/ON condition, or the item column for a scalar
  subquery (`renderSubqueryBlock`/`findSubquery`/`renderInner`/`renderOn`/`itemSubquery`).
  `findSubquery` lives in `segmenter.ts` (shared with `format.ts`). In a **multi-CTE `with`**
  (`renderCteClause` loops `splitCommaList`), each CTE name after the first recedes to the `with`
  column, the comma follows the previous `)`, every `)` aligns under `with`; falls back to the
  one-liner if any CTE body isn't a parenthesized `select`/`with`. Nested subqueries recurse. Still
  inline: a function-wrapped subquery. A comment **inside an expanded** subquery reflows
  (`isCommentSafe` recurses, into each CTE and each condition-subquery too); a comment inside a
  non-expanded one still forces passthrough.
- **`case ... end`** in a select/group-by/order-by list item expands: `case` on the item line,
  each `when`/`else` and the `end` aligned at the item column (`parseCase`/`renderCase`, routed by
  `renderItemLines`). A **nested `case`** in a `when`/`else` branch expands recursively at the
  column where the inner `case` begins (`renderCaseSegment`/`findNestedCase`). A `case` in a
  **`where`/`having`** or a **`join` ON** condition expands at the operand column, with anything
  after `end` (e.g. `> 100`, `= 1`) on the `end` line (`emitTerm`'s `expandCase` flag, set for
  where/having and — since Phase 11 — join ON via `renderOn`). A `when ... then` that exceeds the
  width breaks **before** `then` (`when <cond>` / `then <result>` on their own lines at the `case`
  column; `renderCaseSegment`/`findThen`; an `else` never wraps). A `case` wrapped in a function
  stays inline.
- Line comments: **inline** comments (trailing code on a line) stay attached to that line's last
  token — in lists (`ListItem.comment`) and on `where`/`having` conditions (`BoolTerm.comment`).
  **Standalone** comments (alone on a line, detected via `token.newlineBefore`) stay on their own
  line: leading comments at the base margin, everything else (between clauses, between list items,
  between `where` conditions via `BoolTerm.commentsBefore`, trailing) at the content column
  `riverEnd + 1`. A comment after the final `;` glues under the statement. Standalone/inline
  comments inside expanded paren groups (BLOCK mode), before the first `where` condition (keyword
  alone, condition drops below), and inside a `join` ON also reflow. Passthrough (unchanged SQL)
  applies only to a comment mid-token or inside an inline subquery/scalar-paren expression.

Full algorithm (river math, ON secondary river, BLOCK mode, comment handling, passthrough):
read **`.claude/rules/formatting-spec.md`** before touching `layout.ts`/`segmenter.ts`.

## Tests — read before adding coverage

Data-driven: `test/cases/*.yaml` hold scenarios, `test/cases.test.ts` loads **every** yaml.
Add scenarios by editing/creating a yaml — **no code changes**. Details and the "generate
`expected` from the formatter, never hand-count spaces" workflow: **`.claude/rules/testing.md`**.

## Commands

```bash
npm test            # vitest (core)
npm run build       # esbuild bundle → out/extension.js
npm run lint        # eslint
npm run package     # vsce → .vsix
```

Debug: **F5** (Extension Development Host). Local install (used often):
`npx @vscode/vsce package --allow-missing-repository --skip-license` then
`code --install-extension riverleaf-sql-formatter-0.0.1.vsix --force` (uninstall the previous
extension id first if the publisher/name changed).

## Conventions & gotchas

- Throwaway scripts (formatter probes, case generators) go to the **scratchpad**, never committed.
- `js-yaml` is on **5.x** (bumped from 4.x by Dependabot and vetted here — the test suite is the
  only consumer and uses just `load()`, which is unchanged). `@types/js-yaml` stays on **4.x** (no
  5.x typings published; still type-checks clean against our usage).
- ESLint uses **flat config** (`eslint.config.js`, CommonJS), required by ESLint 9+. It composes
  `@eslint/js` recommended + `@typescript-eslint`'s `flat/recommended`, plus the lenient
  `no-unused-vars` (`argsIgnorePattern: ^_`). There is no `.eslintrc.json` anymore.
- `tsconfig.json` sets `"types": ["node"]` — with `@types/node` 26 + TypeScript 6 the Node globals
  are no longer auto-included, so this is required for the test files to type-check.
- After changing runtime code (`src/formatter/*`, `src/extension.ts`), re-package + re-install to
  test in the real editor. Test-only/README changes don't need re-packaging.
- Config prefix is `riverleaf.*` (not the old `alignedSqlFormatter.*`).

## Skills

These live under `.claude/skills/<name>/SKILL.md` — invoke them, don't reinvent the workflow:

1. **`regen-format-cases`** — run `format()` on SQL inputs and emit exact YAML entries for
   `test/cases/*.yaml` so `expected` is always correct.
2. **`build-install-vsix`** — build → `vsce package` → uninstall previous id →
   `code --install-extension --force`. The local-deploy dance.
3. **`add-formatter-behavior`** — TDD workflow: failing YAML case first, implement in
   `layout.ts`/`segmenter.ts`, then green + idempotency.

Note: generator scripts that import `js-yaml` must live in the **project dir** (the scratchpad
can't resolve `node_modules`); js-yaml 5.x uses named exports (`import { dump } from 'js-yaml'`).

## Open items / roadmap

See **`.claude/rules/roadmap.md`** for the narrower sub-cases still rendered inline (a `case` or
subquery wrapped in a function, comments mid-token or inside a function-wrapped subquery, and DML
lists that never wrap internally — the INSERT column list and a single wide `values` tuple). The
aesthetic decisions are settled: D1 (nested-paren BLOCK vs RIVER →
both RIVER) and D2 (base-indent → **normalize to column 0**) are resolved; only D3 (explicit default
`maxLineLength`) remains deferred.
