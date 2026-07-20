# riverleaf-sql-formatter

Format SQL in the **river alignment** style: clause keywords are right-aligned to a common vertical
column (the "river"), using **spaces** only, never tabs. A dependency-free library and CLI — the same
engine that powers the [Riverleaf SQL Formatter](https://github.com/nbluis/riverleaf-sql-formatter)
VS Code extension.

```sql
select id, name from planets where mass > 10
```

```sql
select id,
       name
  from planets
 where mass > 10
```

The right edge of `select`, `from`, and `where` land on the same column — the river — so the eye
follows one clean vertical line down the query.

> 🚧 **Work in progress** — behavior, rules, and options may change between versions.

## Install

```bash
npm install riverleaf-sql-formatter
```

The package is **ESM-only** and has **zero runtime dependencies**.

## Library

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

### API

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

## CLI

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

## License

[MIT](https://github.com/nbluis/riverleaf-sql-formatter/blob/main/LICENSE)
