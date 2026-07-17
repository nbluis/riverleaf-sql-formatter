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

- `src/formatter/types.ts` — `Token`, `FormatOptions`, `DEFAULT_OPTIONS` (keywordCase `lower`,
  indentSize `2`). No line-width option: breaking is by rule, not by width.
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
  `riverleaf.*` (`keywordCase`, `indentSize`). No line-width config.

## Formatting rules (summary)

Declarative summary of current behavior. The mechanics (river math, ON secondary river, BLOCK mode,
comment handling, passthrough) live in **`.claude/rules/formatting-spec.md`** — read it before
touching `layout.ts`/`segmenter.ts`.

- **River.** River column = `max(firstWord length over clauses)`; `baseIndent` is always **0**, so
  output is normalized to the left margin (source indentation is discarded) and the widest clause
  head lands at column 0 (round trips). Each clause's first word is right-aligned to the river;
  arguments start 1 space after. Multi-word keywords (`left join`, `order by`) align only their
  **first** word; the rest flows.
- **Breaking is by rule (count), not by width.** A list clause (`select`, `from` with a comma,
  `group by`, `order by`, `set`, `values`, the `insert` column list) breaks one item per line
  whenever there is more than one item; a single item stays inline and grows. `where`/`having` and a
  `join` ON break whenever there is more than one condition; a single condition stays inline. A
  parenthesized boolean group always expands. Line length participates in nothing.
- **Connectors.** `where`/`having`/`on` right-align `and`/`or` to the river (RIVER mode). An
  expanded parenthesized group (BLOCK mode) also right-aligns its connectors — to the group's own
  river (`blockIndent - 1`), operands at `blockIndent` — and the closing `)` aligns under the owner
  connector. `between ... and ...` — that `and` is not a connector.
- **Casing.** Keywords lowercased (config); identifiers preserved.
- **DML** (`insert`/`update`/`delete`) formats like a select: the anchors join the river. `set` and
  `values` are ordinary list clauses (a single assignment/tuple stays inline). `delete from` is one
  head. `insert into t (cols)` keeps a space before the column-list `(`, and that column list breaks
  by count. A `values` tuple interior is expression level — it grows on one line (multi-row `values`
  still breaks one tuple per line).
- **Subqueries / CTEs** expand recursively for the common shapes: `from (select ...) alias`, one or
  more comma-separated CTEs, a `where`/`having` condition subquery in any position, a subquery in a
  `join` ON condition, a subquery as a `join` table, and a scalar subquery in the select list. A
  `LATERAL` derived table expands the same way in every position. The inner query is re-aligned one
  level in and the closing `)` aligns under its owner (the clause keyword, the `and`/`or` connector,
  or the item column). The `with` preamble sits off-river at column 0; in a multi-CTE `with`, each
  later CTE name recedes to the `with` column. Still inline: a subquery wrapped in a function call.
- **`case ... end`** expands in a select/group-by/order-by list item, in a `where`/`having`
  condition, and in a `join` ON — `case`/`when`/`else`/`end` share a column, and anything after
  `end` rides the `end` line. Nested `case`s expand recursively. A `when ... then` grows on one line
  and is never wrapped. Still inline: a `case` wrapped in a function call.
- **Line comments.** Inline comments (trailing code) stay attached to that line's last token.
  Standalone comments (alone on a line) stay on their own line — leading ones at the base margin, the
  rest at the content column (`riverEnd + 1`) — and reflow inside expanded paren groups, before the
  first `where` condition, inside a `join` ON, and inside any expanded subquery. Passthrough (the
  statement is emitted unchanged) applies only to a comment mid-token or inside a non-expanded
  (function-wrapped) subquery.

## Tests — read before adding coverage

Data-driven: `test/cases/*.yaml` hold scenarios, `test/cases.test.ts` loads **every** yaml.
Add scenarios by editing/creating a yaml — **no code changes**. Details and the "generate
`expected` from the formatter, never hand-count spaces" workflow: **`.claude/rules/testing.md`**.

**Every example uses the astronomy dictionary.** All example SQL (test-case `input`/`expected`,
README/doc snippets) is written with names from **`.claude/rules/example-dictionary.md`** — real
queries are rewritten onto those tables/columns/aliases/literals so examples stay isomorphic and
never leak real data. Read it before writing or rewriting any example.

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
- `js-yaml` is on **5.x** (the test suite is its only consumer and uses just `load()`);
  `@types/js-yaml` stays on **4.x** (no 5.x typings published; still type-checks clean against our
  usage).
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

The aesthetic and breaking-model decisions are settled (breaking is by count, not width; output
normalizes to column 0; there is no line-width option). What's left are the narrower sub-cases still
rendered inline or passed through unchanged — a `case` or subquery wrapped in a function call, and
comments mid-token or inside a function-wrapped subquery. See **`.claude/rules/roadmap.md`** and the
README's "Known limitations".
