<p align="center">
  <img src="assets/riverleaf.png" alt="Riverleaf SQL Formatter" width="440">
</p>

<h1 align="center">Riverleaf SQL Formatter 🍃</h1>

<p align="center">
  <a href="https://github.com/nbluis/riverleaf-sql-formatter/actions/workflows/ci.yml">
    <img src="https://github.com/nbluis/riverleaf-sql-formatter/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License">
  </a>
</p>

Formats SQL scripts in the **river alignment** style: clause keywords are right-aligned to a common
vertical column, using **spaces** (never tabs). Your keywords line up along the bank while a river of
whitespace flows down the middle.

```sql
select id, name from planets where mass > 10
```

```sql
select id,
       name
  from planets
 where mass > 10
```

The right edge of `select`, `from`, and `where` all land on the same column — the **river** — so the
eye follows one clean vertical line down the query.

> 🚧 **Work in progress** — behavior, rules, and options may change between versions.

## Packages

This is an npm-workspaces monorepo with two deliverables:

| Package | What it is | Where |
| --- | --- | --- |
| **[`riverleaf-sql-formatter`](packages/core)** | The formatter as a dependency-free npm library (`format()`) **and** the `riverleaf` CLI. | `packages/core` |
| **Riverleaf SQL Formatter** (VS Code extension) | Format-on-save / Format Document for `.sql`, id `nbluis.riverleaf-sql-formatter`. | [`packages/vscode`](packages/vscode) |

Both share one pure formatting core, so the editor, a script, and CI all produce identical output.

### Use it as a library

```ts
import { format } from 'riverleaf-sql-formatter';

format('select id, name from planets where mass > 10');
```

### Use it from the command line

```bash
# format to stdout, rewrite in place, or fail CI on unformatted files
npx riverleaf query.sql
npx riverleaf --write src/**/*.sql
npx riverleaf --check src/**/*.sql

cat query.sql | npx riverleaf --keyword-case upper
```

Flags: `-w/--write`, `--check`, `--keyword-case lower|upper|preserve`, `--indent-size N`, `--stdin`,
`-h/--help`, `-v/--version`. Globs are expanded by your shell.

### Use it in VS Code

Install the **Riverleaf SQL Formatter** extension, open a `.sql` file, and run **Format Document**
(`Shift+Alt+F` / `⇧⌥F`) or enable *format on save*. See
[`packages/vscode/README.md`](packages/vscode/README.md) for settings and the full rule gallery.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `keywordCase` | `lower` | `lower` / `upper` / `preserve`. |
| `indentSize` | `2` | Spaces per nesting level (parentheses / subqueries). |

There is no line-width / maximum-line-length option: breaking is **by rule (count), not by width**.

## Development

```bash
npm install
npm test           # core tests (vitest) — the full suite
npm run typecheck  # tsc --noEmit on both packages
npm run lint       # eslint
npm run build      # build the core lib + CLI (dist/) and the extension bundle
```

Layout: `packages/core` (the only npm workspace; runtime dependency-free) holds `src/formatter`,
`src/index.ts`, `src/cli.ts`, and the `test/` suite; `packages/vscode` holds the extension and bundles
the core from source. The extension `.vsix` is built with `npm run package`; press **F5** in VS Code
for the Extension Development Host.

### Adding formatting cases

Tests are data-driven: `packages/core/test/cases/*.yaml` holds the scenarios and
`packages/core/test/cases.test.ts` loads **every** `.yaml` file in that folder. Add a scenario by
dropping a new entry into an existing file (or a new one like `mysql.yaml`):

```yaml
- description: what this checks
  options:            # optional; defaults to keywordCase lower, indentSize 2
    keywordCase: upper
  input: |
    select name, designation from stars
  expected: |
    SELECT name,
           designation
      FROM stars
```

Each case is asserted two ways: `format(input, options) === expected`, and that formatting `expected`
again is stable (idempotent — add `idempotent: false` to opt out). No code changes needed to grow the
suite; this is the guardrail against regressions.

## Contributing

Contributions are welcome — especially real-world SQL that Riverleaf mangles.

- **Formatting bug, or a construct you want formatted a certain way?**
  [Open a formatting issue](https://github.com/nbluis/riverleaf-sql-formatter/issues/new/choose)
  with the **input SQL** and the **output you expect**. That input/expected pair is exactly what
  becomes a regression test.
- **Anything else** (feature idea, question, docs) → the *Other issue* template.
- **Pull requests** are test-first: add a YAML case under `packages/core/test/cases/*.yaml` that
  captures the behavior, then make it pass. Before opening the PR, make sure `npm test`,
  `npm run typecheck`, and `npm run lint` are green and formatting stays idempotent.

## License

[MIT](LICENSE)
