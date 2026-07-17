<p align="center">
  <img src="assets/riverleaf.png" alt="Riverleaf SQL Formatter" width="440">
</p>

<h1 align="center">Riverleaf SQL Formatter 🍃</h1>

<p align="center">
  <a href="https://github.com/nbluis/riverleaf-sql-formatter/actions/workflows/ci.yml">
    <img src="https://github.com/nbluis/riverleaf-sql-formatter/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="#installation">
    <img src="https://img.shields.io/badge/VS%20Code%20Marketplace-under%20construction-orange.svg" alt="VS Code Marketplace — under construction">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License">
  </a>
</p>

Formats SQL scripts in the **river alignment** style: keywords are right-aligned to a
common vertical column, using **spaces** (never tabs). Your keywords line up along the
bank while a river of whitespace flows down the middle.

**Why a river?** Left-aligned SQL hides where each clause begins in a ragged wall of text.
Pulling every clause keyword onto one column turns the *shape* of a query into something you
can scan in a single downward glance — the whitespace between the bank and the arguments is the
"river" (hence the name, and the 🍃).

> 🚧 **Work in progress** — behavior, rules, and options may change between versions.

**Opinionated by design.** Riverleaf formats SQL the way its author likes to read it, and it will
always prioritize those preferences over being configurable to every style. The
goal is to be an excellent fit for that particular taste — not a general-purpose formatter you tune
to your own conventions.

<table>
<tr><td>

**You write this…**

```sql
select id, name from planets where mass > 10
```

</td></tr>
<tr><td>

**…and get this:**

```sql
select id,
       name
  from planets
 where mass > 10
```

</td></tr>
</table>

The right edge of `select`, `from`, and `where` all land on the same column — the **river** —
so the eye follows one clean vertical line down the query.

<!--
  DEMO GIF placeholder. Record a short (~3-5s) clip of format-on-save aligning a query,
  save it as assets/demo.gif, then delete this comment and uncomment the block below.

<p align="center">
  <img src="assets/demo.gif" alt="Riverleaf aligning SQL on save" width="640">
</p>
-->

## Installation

> 🚧 **VS Code Marketplace listing — under construction.** Not published yet.
> In the meantime, install from a local build:

```bash
git clone https://github.com/nbluis/riverleaf-sql-formatter.git
cd riverleaf-sql-formatter
npm install
npx @vscode/vsce package --allow-missing-repository --skip-license
code --install-extension riverleaf-sql-formatter-0.0.1.vsix --force
```

Once it's on the Marketplace, this will be a one-click **Install** — or
`code --install-extension nbluis.riverleaf-sql-formatter`.

## Usage

Open a `.sql` file and run **Format Document** (`Shift+Alt+F` / `⇧⌥F`), or select a range
and use **Format Selection**. It also works with *format on save*.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `riverleaf.keywordCase` | `lower` | `lower` / `upper` / `preserve`. |
| `riverleaf.indentSize` | `2` | Spaces per nesting level (parentheses/subqueries). |

There is no line-width / maximum-line-length setting: breaking is by rule, not by width.

## Rules

**Spaces only, never tabs. Keywords are lowercased; identifiers are left untouched.**

<table>
<tr><td>

**IN**

```sql
SELECT Name FROM Planets
```

</td></tr>
<tr><td>

**OUT**

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
<tr><td>

**IN**

```sql
select id, name, mass from planets
```

</td></tr>
<tr><td>

**OUT**

```sql
select id,
       name,
       mass
  from planets
```

</td></tr>
</table>

**`where` / `having` break when there is more than one condition**, with `and` / `or` aligned to
the river. A single condition stays inline.

<table>
<tr><td>

**IN**

```sql
select name from planets
where mass > 10 and radius < 5
```

</td></tr>
<tr><td>

**OUT**

```sql
select name
  from planets
 where mass > 10
   and radius < 5
```

</td></tr>
</table>

**A parenthesized boolean group always expands**, aligning its own `and` / `or` one level in.

<table>
<tr><td>

**IN**

```sql
select name from planets
where is_visible = true
and (mass > 10 or radius < 5)
```

</td></tr>
<tr><td>

**OUT**

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
<tr><td>

**IN**

```sql
select p.mass from planets p
join stars s on s.id = p.star_id
and s.parent_id is null
```

</td></tr>
<tr><td>

**OUT**

```sql
select p.mass
  from planets p
  join stars s on s.id = p.star_id
              and s.parent_id is null
```

</td></tr>
</table>

**Subqueries and CTEs expand recursively** — the inner query is re-aligned one level in and its
`)` sits under the owner. The `with` preamble stays at the left margin, off the river.

<table>
<tr><td>

**IN**

```sql
with bright as (select id from stars
where mass > 10) select id from bright
```

</td></tr>
<tr><td>

**OUT**

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
<tr><td>

**IN**

```sql
select name,
case when mass > 10 then 'giant'
else 'dwarf' end as tier
from planets
```

</td></tr>
<tr><td>

**OUT**

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
<tr><td>

**IN**

```sql
update planets set mass = 10,
radius = 5 where id = 1
```

</td></tr>
<tr><td>

**OUT**

```sql
update planets
   set mass = 10,
       radius = 5
 where id = 1
```

</td></tr>
</table>

**Comments keep their place.** A comment trailing code stays on that line; a standalone comment
keeps its own line. (Comments that can't be moved safely are left exactly as written — see
[Known limitations](#known-limitations).)

<table>
<tr><td>

**IN**

```sql
select mass, -- in solar masses
radius from planets
```

</td></tr>
<tr><td>

**OUT**

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
<tr><td>

**IN**

```sql
select apparent_magnitude - absolute_magnitude + distance / luminosity as index from stars
```

</td></tr>
<tr><td>

**OUT**

```sql
select apparent_magnitude - absolute_magnitude + distance / luminosity as index
  from stars
```

</td></tr>
</table>

## Development

```bash
npm install
npm test          # core tests (vitest)
npm run build     # extension bundle (esbuild)
```

To debug, press **F5** in VS Code (opens the Extension Development Host).
To build the `.vsix`: `npm run package`.

### Adding formatting cases

Tests are data-driven: `test/cases/*.yaml` holds the scenarios and `test/cases.test.ts`
loads **every** `.yaml` file in that folder. To add a scenario, drop a new entry into an
existing file (or create a new one like `mysql.yaml`, `postgres_cte.yaml`, ...):

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

Each case is asserted two ways: `format(input, options) === expected`, and that formatting
`expected` again is stable (idempotent — add `idempotent: false` to opt out). No code
changes needed to grow the suite; this is our guardrail against regressions.

## Known limitations

These narrower cases are not reflowed — they are rendered inline or kept exactly as written
(never corrupted):

- **Comments** are kept as-is (the whole statement is passed through unchanged) when a line comment
  sits mid-token, or inside a subquery that is *not* expanded (see below), where it cannot be moved
  without risk of commenting out code.
- **Subqueries / CTEs** stay inline only when the subquery is wrapped in a function call
  (`coalesce((select ...), 0)`).
- **`case`** stays inline only when it is wrapped in a function call.

## License

[MIT](LICENSE)
