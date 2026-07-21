<p align="center">
  <img src="https://raw.githubusercontent.com/nbluis/riverleaf-sql-formatter/main/assets/riverleaf.png" alt="Riverleaf SQL Formatter" width="440">
</p>

<h1 align="center">Riverleaf SQL Formatter 🍃</h1>

<p align="center">
  <a href="https://github.com/nbluis/riverleaf-sql-formatter/actions/workflows/ci.yml">
    <img src="https://github.com/nbluis/riverleaf-sql-formatter/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://github.com/nbluis/riverleaf-sql-formatter/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License">
  </a>
</p>

Formats SQL scripts in the **river alignment** style: clause keywords are right-aligned to a common
vertical column, using **spaces** (never tabs). Your keywords line up along the bank while a river of
whitespace flows down the middle.

**Why a river?** Left-aligned SQL hides where each clause begins in a ragged wall of text. Pulling
every clause keyword onto one column turns the *shape* of a query into something you can scan in a
single downward glance — the whitespace between the bank and the arguments is the "river" (hence the
name, and the 🍃).

> 🚧 **Work in progress** — behavior, rules, and options may change between versions.

**Opinionated by design.** Riverleaf formats SQL the way its author likes to read it, and it will
always prioritize those preferences over being configurable to every style. The goal is to be an
excellent fit for that particular taste — not a general-purpose formatter you tune to your own
conventions.

<table>
<tr><th align="left" width="840">You write this…</th></tr>
<tr><td>

```sql
select id, name from planets where mass > 10
```

</td></tr>
<tr><th align="left" width="840">…and get this:</th></tr>
<tr><td>

```sql
select id,
       name
  from planets
 where mass > 10
```

</td></tr>
</table>

The right edge of `select`, `from`, and `where` all land on the same column — the **river** — so the
eye follows one clean vertical line down the query.

It runs the same three ways, from one engine: a **VS Code extension**, a **command-line tool**
(`npx riverleaf`), and a **library** (`import { format }`). Whichever you reach for first, the other
two are there when you need them — see [Usage](#usage).

## Rules

**Spaces only, never tabs. Keywords are lowercased; identifiers are left untouched.**

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
SELECT Name FROM Planets
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
select Name
  from Planets
```

</td></tr>
</table>

**A list with more than one item breaks one item per line, with trailing commas aligned.**
A single-item list stays inline. (Applies to `select`, `from`, `group by`, `order by`, and the
DML `set` / `values` / `insert` column list.)

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
select id, name, mass from planets
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
select id,
       name,
       mass
  from planets
```

</td></tr>
</table>

**`where` / `having` break when there is more than one condition**, with `and` / `or` right-aligned to
the river. A single condition stays inline.

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
select name from planets
where mass > 10 and radius < 5
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
select name
  from planets
 where mass > 10
   and radius < 5
```

</td></tr>
</table>

**A parenthesized boolean group always expands**, with its own `and` / `or` left-aligned at the start
of the group, one level in.

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
select name from planets
where is_visible = true
and (mass > 10 or radius < 5)
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
select name
  from planets
 where is_visible = true
   and (
     mass > 10
     or radius < 5
   )
```

</td></tr>
</table>

**A join with more than one ON condition breaks**, aligning `and` / `or` under `on`. A single-ON
join stays inline.

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
select p.mass from planets p
join stars s on s.id = p.star_id
and s.parent_id is null
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
select p.mass
  from planets p
  join stars s on s.id = p.star_id
              and s.parent_id is null
```

</td></tr>
</table>

**Subqueries and CTEs expand recursively** — the inner query is re-aligned one level in and its
`)` sits under the owner. This also applies to a subquery or a `case` wrapped in a function call
(`coalesce((select ...), 0)`): the inner block expands, its `)` aligns under the item/operand
column, and the rest of the wrapping expression rides the closing line. The `with` preamble stays at
the left margin, off the river.

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
with bright as (select id from stars
where mass > 10) select id from bright
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
with bright as (
  select id
    from stars
   where mass > 10
)
select id
  from bright
```

</td></tr>
</table>

**`case … end` expands** — `when` / `else` / `end` align under `case`; anything after `end` rides
its line. Nested `case`s expand recursively.

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
select name,
case when mass > 10 then 'giant'
else 'dwarf' end as tier
from planets
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
select name,
       case
       when mass > 10 then 'giant'
       else 'dwarf'
       end as tier
  from planets
```

</td></tr>
</table>

**`insert` / `update` / `delete` format like a `select`** — the anchors join the river, and the
same list and `where` rules apply.

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
update planets set mass = 10,
radius = 5 where id = 1
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
update planets
   set mass = 10,
       radius = 5
 where id = 1
```

</td></tr>
</table>

**Comments keep their place.** A comment trailing code stays on that line; a standalone comment
keeps its own line.

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
select mass, -- in solar masses
radius from planets
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
select mass, -- in solar masses
       radius
  from planets
```

</td></tr>
</table>

**Breaking is by rule, not by width.** There is no maximum line length; a single item or condition
grows on one line however long it gets, and only *structure* ever forces a break.

<table>
<tr><th align="left" width="840">IN</th></tr>
<tr><td>

```sql
select apparent_magnitude - absolute_magnitude + distance / luminosity as index from stars
```

</td></tr>
<tr><th align="left" width="840">OUT</th></tr>
<tr><td>

```sql
select apparent_magnitude - absolute_magnitude + distance / luminosity as index
  from stars
```

</td></tr>
</table>

## Usage

The formatter runs the same way whether you drive it from the editor, the shell, or your own code.
Pick the one that fits — the rules above are identical across all three.

### In VS Code

Open a `.sql` file and run **Format Document** (`Shift+Alt+F` / `⇧⌥F`), or select a range and use
**Format Selection**. It also works with *format on save*.

> 🚧 **VS Code Marketplace listing — under construction.** Not published yet. In the meantime,
> install from a local build:

```bash
git clone https://github.com/nbluis/riverleaf-sql-formatter.git
cd riverleaf-sql-formatter
npm install
npm run build:vscode
cd packages/vscode
npx @vscode/vsce package --allow-missing-repository --skip-license
code --install-extension riverleaf-sql-formatter-0.0.1.vsix --force
```

Once it's on the Marketplace, this will be a one-click **Install** — or
`code --install-extension nbluis.riverleaf-sql-formatter`.

| Setting | Default | Description |
| --- | --- | --- |
| `riverleaf.keywordCase` | `lower` | `lower` / `upper` / `preserve`. |
| `riverleaf.indentSize` | `2` | Spaces per nesting level (parentheses/subqueries). |

There is no line-width / maximum-line-length setting: breaking is by rule, not by width.

### From the command line

The same engine ships as the dependency-free `riverleaf-sql-formatter` npm package, which provides a
`riverleaf` CLI:

```bash
# format to stdout
npx riverleaf query.sql

# rewrite files in place
npx riverleaf --write src/**/*.sql

# fail (exit 1) if anything is not already formatted — for CI
npx riverleaf --check src/**/*.sql

# read from stdin
cat query.sql | npx riverleaf --keyword-case upper
```

| Flag | Description |
| --- | --- |
| `-w`, `--write` | Rewrite each file in place (default: print to stdout). |
| `--check` | Exit non-zero if any input is not already formatted. |
| `--keyword-case <c>` | `lower` \| `upper` \| `preserve` (default: `lower`). |
| `--indent-size <n>` | Spaces per nesting level (default: `2`). |
| `--stdin` | Read SQL from stdin even when files are given. |
| `-h`, `--help` | Show help. |
| `-v`, `--version` | Print the version. |

Globs are expanded by your shell. Exit codes: `0` ok, `1` `--check` found unformatted input, `2`
usage or I/O error.

### As a library

```bash
npm install riverleaf-sql-formatter
```

The package is **ESM-only** and has **zero runtime dependencies**.

```ts
import { format } from 'riverleaf-sql-formatter';

format('select id, name from planets where mass > 10');
// select id,
//        name
//   from planets
//  where mass > 10

format('select id from stars', { keywordCase: 'upper' });
// SELECT id
//   FROM stars
```

```ts
function format(sql: string, options?: Partial<FormatOptions>): string;

interface FormatOptions {
  keywordCase: 'lower' | 'upper' | 'preserve'; // default: 'lower'
  indentSize: number;                          // default: 2
}

const DEFAULT_OPTIONS: FormatOptions;
```

`format` is idempotent (`format(format(x)) === format(x)`) and never corrupts input: if a token can't
be placed safely it falls back to passing the statement through unchanged. There is no line-width
option — breaking is **by rule (count), not by width**.

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

This README is the single source of truth: it lives at the repo root, and the npm and Marketplace
listings are generated copies of it (synced at publish time — see
[`scripts/sync-readme.mjs`](https://github.com/nbluis/riverleaf-sql-formatter/blob/main/scripts/sync-readme.mjs)),
so edit it here only. Publishing a new version (npm + Marketplace) is documented in
[RELEASING.md](https://github.com/nbluis/riverleaf-sql-formatter/blob/main/RELEASING.md).

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

[MIT](https://github.com/nbluis/riverleaf-sql-formatter/blob/main/LICENSE)
