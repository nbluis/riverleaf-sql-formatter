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
  records `start`/`end` offsets.
- `src/formatter/render.ts` — `renderTokens` (canonical single-line spacing), keyword casing.
- `src/formatter/segmenter.ts` — `splitStatements`, `segmentClauses`, `parseBoolExpr`
  (`BoolTerm`/`BoolNode`), `splitCommaList`, `splitListItems` (extracts trailing line comments).
- `src/formatter/layout.ts` — `Layout` class: the alignment engine (river math, RIVER vs BLOCK
  modes, line breaking). **The hard part lives here.**
- `src/formatter/format.ts` — public `format(sql, options)`, base-indent detection, comment-safety
  gate + passthrough fallback.
- `src/extension.ts` — registers document + range formatting providers; reads config from
  `riverleaf.*` and `editor.rulers[0]` (fallback 80).

## Formatting rules (summary)

- River column = `baseIndent + max(firstWord length over clauses)`. `baseIndent` = indentation of
  the statement's first non-empty line (**preserved**, so a query at column 0 → river at 6).
- Clause first word right-aligned to the river; arguments start 1 space after. Multi-word keywords
  (`left join`, `order by`) align only their **first** word; the rest flows.
- Joins do **not** break unless the line exceeds max width; then ON conditions align under `on`.
- `where`/`on`: connectors (`and`/`or`) right-aligned to the river (RIVER mode).
- Parenthesized boolean groups expand in BLOCK mode (connectors left-aligned, indented). This
  reproduces the user's golden example, which is intentionally inconsistent between the two levels
  — **do not "fix" it without asking** (see roadmap).
- Keywords lowercased (config); identifiers preserved. `between ... and ...` — that `and` is not a
  connector.
- Line comments: kept as end-of-line comments where safe (comma-list items, last token of a
  clause); otherwise the whole statement is passed through unchanged (never corrupt SQL).

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
- `js-yaml` is pinned to **4.3.0** on purpose — the registry's `latest` is an unverified 5.x major;
  4.x matches `@types/js-yaml@4` and dedups with ESLint's copy. Do not bump without vetting.
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
