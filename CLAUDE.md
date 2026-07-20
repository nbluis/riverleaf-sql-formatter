# Riverleaf SQL Formatter — project guide for agents

Formats SQL in the **river alignment** style: the first word of each clause is right-aligned to a
common column (the "river"), spaces only, never tabs.

> Personal project of **Eduardo Bohrer** (publisher `nbluis`, author "Eduardo Bohrer").
> Standalone and independent — don't infer an organization from the parent folder name.

## Repository layout (npm workspaces monorepo)

- **`packages/core/`** — the pure formatting core (`src/formatter/`), plus the tests (`test/`). This is
  the package published to npm as `riverleaf-sql-formatter` (library + `riverleaf` CLI). It is the
  **only** npm workspace and stays **dependency-free at runtime** (`js-yaml` is a test-only devDep).
- **`packages/vscode/`** — the VS Code extension (`src/extension.ts`, `esbuild.js`). Marketplace id
  `nbluis.riverleaf-sql-formatter`. It is **not** an npm workspace (its `name` collides with core's on
  purpose — both are `riverleaf-sql-formatter`, one on npm, one via `publisher.name` on the
  Marketplace); it consumes the core and its build/lint tooling is hoisted from the repo root.
- **Root** — workspace manager (`private`, `workspaces: ["packages/core"]`), shared `tsconfig.base.json`
  + `eslint.config.js`, and orchestration scripts. Per-package `tsconfig.json` extend the base.

## Golden rules

- **English everywhere in code and docs** — comments, identifiers, README, test descriptions. The
  user converses in Portuguese; the codebase stays English.
- **Every example uses the astronomy dictionary** (`.claude/rules/example-dictionary.md`): all example
  SQL (test cases, README/doc snippets) uses those tables/columns/aliases/literals, so no real data
  leaks and examples stay isomorphic. Read it before writing or rewriting an example.
- **Never corrupt; stay idempotent.** `format(format(x)) === format(x)`; if a token can't be placed
  safely, prefer passthrough over wrong output. Spaces only, single trailing newline, no trailing
  whitespace.

## Locked decisions (don't re-litigate without the user)

- Breaking is **by rule (count), not by width** — there is no line-width option and no `fits()`.
- Output **normalizes to column 0** (source indentation is discarded); the widest clause head lands
  at column 0, so a formatted query round-trips.
- Connectors (`and`/`or`) **right-align at every level** — top-level and inside expanded groups.
- A `case`/subquery **wrapped in a function call** expands; **set operations stay in the river**.

## Layout & responsibilities

Pure formatting core (no `vscode` import), consumed by a thin extension layer. Files under
`packages/core/src/formatter/`:

- `types.ts` — `Token`, `FormatOptions`, `DEFAULT_OPTIONS` (keywordCase `lower`, indentSize `2`).
- `keywords.ts` — keyword sets (`CLAUSE_STARTERS`, `JOIN_STARTERS`, `BOOL_CONNECTORS`,
  `KEYWORD_FOLLOWERS`, `KEYWORDS`, `FUNCTION_KEYWORDS`).
- `tokenizer.ts` — `tokenize(sql)`: lexer; drops whitespace, keeps comments/strings, records offsets
  and `newlineBefore` (tells standalone from inline comments). Operators use **maximal munch** over
  the PG operator-char set, so multi-char operators (`@>`, `#>>`, `~*`, `&&`, …) stay one token.
- `render.ts` — `renderTokens` (canonical single-line spacing), keyword casing.
- `segmenter.ts` — `splitStatements`, `segmentClauses`, `parseBoolExpr`, `splitListItems`, the
  `findSubquery` family. Lifts standalone comments into `commentsBefore`/`trailingComments`.
- `layout.ts` — the `Layout` alignment engine (river math, RIVER/BLOCK modes, breaking). **The hard
  part.** Read `.claude/rules/formatting-spec.md` before editing this or `segmenter.ts`.
- `format.ts` — public `format(sql, options)`, comment-safety gate + passthrough fallback.
- `packages/vscode/src/extension.ts` — registers the document/range formatting providers; config
  under `riverleaf.*` (`keywordCase`, `indentSize`). Imports `format` from the core.

## Formatting rules at a glance

Full mechanics live in `.claude/rules/formatting-spec.md`. In short:

- **River.** River column = max first-word length over clauses; each clause's first word is
  right-aligned there, arguments start one space after. Multi-word keywords (`left join`, `order by`)
  align only their first word. `with` and its later CTE names sit off-river at column 0.
- **Lists break by count.** `select` / `from` (with a comma) / `group by` / `order by` / `set` /
  `values` / the insert column list break one item per line when there's more than one; a single item
  grows inline.
- **Booleans break by count.** `where`/`having` and a `join` ON break on more than one condition; a
  parenthesized group always expands. `and`/`or` right-align to the river (`between … and …` is not a
  connector).
- **Expression level grows, never breaks** — a single item/condition, function args, `in (...)`, a
  `values` tuple, a `when … then`.
- **`case`, subqueries/CTEs, and function-wrapped `case`/subqueries expand recursively**; the closing
  `)`/`end` aligns under its owner and the rest of the wrapping expression rides that line.
- **DML** formats like a select (anchors join the river); plus `on conflict` upsert and `merge`
  (PG 15+), each with dedicated anchoring so their inner `update`/`insert` are not clause anchors.
- **Comments.** Inline comments stay on their token's line; standalone comments keep their own line
  and reflow. A comment mid-expression forces passthrough (a line join never comments out code).
- **Casing** keywords per config; identifiers preserved.

## Tests

Data-driven: `packages/core/test/cases/*.yaml` (the runner loads **every** yaml and asserts
idempotency per case) plus a property test `packages/core/test/comment-invariants.test.ts`. Add
scenarios by editing yaml — no code changes. **Generate `expected` with the formatter, never
hand-count spaces.** See `.claude/rules/testing.md`.

## Commands (run from the repo root)

```bash
npm test           # vitest (core) — the 341-case suite
npm run typecheck  # tsc --noEmit on both packages
npm run lint       # eslint over packages/*/src + core test
npm run build:vscode  # esbuild bundle → packages/vscode/out/extension.js
npm run package       # vsce package (in packages/vscode)
```

Debug with **F5** (Extension Development Host). For a local install, use the `build-install-vsix`
skill.

## Skills (`.claude/skills/<name>/SKILL.md` — invoke, don't reinvent)

- **`add-formatter-behavior`** — TDD workflow: failing YAML case → implement in
  `layout.ts`/`segmenter.ts` → green + idempotent.
- **`regen-format-cases`** — run `format()` on inputs and emit exact YAML `expected`.
- **`build-install-vsix`** — build → `vsce package` → uninstall previous id → reinstall the `.vsix`.

## Conventions & gotchas

- Throwaway scripts (probes, generators) go to the **scratchpad**, never committed. A generator that
  imports `js-yaml` must live in the **project dir** (the scratchpad can't resolve `node_modules`).
- `js-yaml` is on **5.x** (named exports — `import { dump } from 'js-yaml'`); `@types/js-yaml` stays
  on **4.x** (no 5.x typings; still type-checks clean).
- ESLint uses **flat config** (`eslint.config.js`, ESLint 9+); there is no `.eslintrc`.
  `tsconfig.base.json` sets `"types": ["node"]` (required for the tests to type-check under
  @types/node 26 / TypeScript 6); each package's `tsconfig.json` extends it.
- After changing runtime code (`packages/core/src/formatter/*`, `packages/vscode/src/extension.ts`),
  re-package + re-install to test in the real editor; test-only / README changes don't need it.
