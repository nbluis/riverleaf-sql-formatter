<p align="center">
  <img src="https://raw.githubusercontent.com/nbluis/riverleaf-sql-formatter/main/assets/riverleaf.png" alt="Riverleaf SQL Formatter" width="440">
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
npm run build:vscode
cd packages/vscode
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

**`where` / `having` break when there is more than one condition**, with `and` / `or` aligned to
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

**A parenthesized boolean group always expands**, aligning its own `and` / `or` one level in.

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

## Beyond the editor

The same formatter ships as a dependency-free npm package — a `format()` function and a `riverleaf`
CLI (`npx riverleaf query.sql --write`). See the
[`riverleaf-sql-formatter`](https://github.com/nbluis/riverleaf-sql-formatter/tree/main/packages/core)
package.

## Development & contributing

This extension lives in a monorepo alongside the formatter core. See the
[repository README](https://github.com/nbluis/riverleaf-sql-formatter#readme) for the layout, the
test suite, and how to contribute a formatting case.

## License

[MIT](LICENSE)
