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

- River column = `baseIndent + max(firstWord length over clauses)`. `baseIndent` = the **minimum**
  indentation across the query's non-empty lines (the left margin where the widest clause head
  sits; **preserved**, so a query at column 0 → river at 6). Minimum (not first-line) so it round
  trips even when the first clause is not the widest (e.g. `update ... returning`).
- Clause first word right-aligned to the river; arguments start 1 space after. Multi-word keywords
  (`left join`, `order by`) align only their **first** word; the rest flows.
- Joins with **more than one ON condition always break** (regardless of width); the `and`/`or`
  conditions align under `on`. A single-condition ON stays inline.
- `where`/`on`: connectors (`and`/`or`) right-aligned to the river (RIVER mode).
- Parenthesized boolean groups expand in BLOCK mode (connectors left-aligned, indented). This
  reproduces the user's golden example, which is intentionally inconsistent between the two levels
  — **do not "fix" it without asking** (see roadmap).
- Keywords lowercased (config); identifiers preserved. `between ... and ...` — that `and` is not a
  connector.
- **DML** (`insert`/`update`/`delete`) formats like a select: the anchors join the river. `set`
  and `values` are list clauses that break **one item per line whenever there's more than one**
  (unlike select/from lists, which break only on width); a single assignment/tuple stays inline.
  `delete from` is kept together as one head. `insert into t (cols)` keeps a space before the
  column-list `(` (via `renderInsertClause`, since `renderTokens` would glue it as a call).
- Line comments: **inline** comments (trailing code on a line) stay attached to that line's last
  token — in lists (`ListItem.comment`) and on `where`/`having` conditions (`BoolTerm.comment`).
  **Standalone** comments (alone on a line, detected via `token.newlineBefore`) stay on their own
  line: leading comments at the base margin, everything else (between clauses, between list items,
  between `where` conditions via `BoolTerm.commentsBefore`, trailing) at the content column
  `riverEnd + 1`. A comment after the final `;` glues under the statement. Standalone/inline
  comments inside expanded paren groups (BLOCK mode), before the first `where` condition (keyword
  alone, condition drops below), and inside a `join` ON all reflow now. Passthrough (unchanged SQL)
  only remains for a comment mid-token or inside an inline subquery/scalar-paren expression.

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

## Suggested skills to create (not yet created)

Future sessions would move faster with these — create under `.claude/skills/<name>/SKILL.md`:

1. **`regen-format-cases`** — given SQL inputs (+ optional options), run `format()` and emit/append
   exact YAML entries to a `test/cases/*.yaml`. Automates the generator pattern in
   `.claude/rules/testing.md` so `expected` is always correct.
2. **`build-install-vsix`** — build → `vsce package` (with the flags above) → uninstall previous
   extension id → `code --install-extension --force`. Wraps the repeated local-deploy dance.
3. **`add-formatter-behavior`** — TDD workflow for extending formatting: add a failing YAML case
   first, implement in `layout.ts`/`segmenter.ts`, then green + idempotency. Enforces YAML-first
   regression discipline.

## Open items / roadmap

See **`.claude/rules/roadmap.md`** for known limitations and decisions awaiting the user
(nested-paren BLOCK-mode inconsistency, subqueries/CTEs, `case when`, DML, comments inside boolean
expressions).
