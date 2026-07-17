<p align="center">
  <img src="assets/riverleaf.png" alt="Riverleaf SQL Formatter" width="440">
</p>

<h1 align="center">Riverleaf SQL Formatter 🍃</h1>

<p align="center">
  <a href="https://github.com/nbluis/riverleaf-sql-formatter/actions/workflows/ci.yml">
    <img src="https://github.com/nbluis/riverleaf-sql-formatter/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
</p>

Formats SQL scripts in the **river alignment** style: keywords are right-aligned to a
common vertical column, using **spaces** (never tabs). Your keywords line up along the
bank while a river of whitespace flows down the middle.

> 🚧 **Work in progress** — behavior, rules, and options may change between versions.

**Opinionated by design.** Riverleaf formats SQL the way its author likes to read it, and it will
always prioritize those preferences over being configurable to every style. The
goal is to be an excellent fit for that particular taste — not a general-purpose formatter you tune
to your own conventions. If you want a different look, this probably isn't the tool for you.

## Example

Before:

```sql
select observed_month as previous_observed_month from monthly_observation_summaries previous_summary
join star on star.star_id = previous_summary.star_id
left join planet on planet.star_id = star.star_id and planet.type = star.default_type and planet.apparent_magnitude between 1 and 2 and (planet.constellation_id = star.constellation_id or planet.catalog_number = star.catalog_number)
where previous_summary.galaxy_id = current_summary.galaxy_id and previous_summary.galaxy_id = 220 and previous_summary.star_id = current_summary.star_id and previous_summary.observed_month < current_summary.observed_month and previous_summary.observation_count > 0
order by observed_month desc limit 1
```

After:

```sql
select observed_month as previous_observed_month
  from monthly_observation_summaries previous_summary
  join star on star.star_id = previous_summary.star_id
  left join planet on planet.star_id = star.star_id
                  and planet.type = star.default_type
                  and planet.apparent_magnitude between 1 and 2
                  and (
                    planet.constellation_id = star.constellation_id
                 or planet.catalog_number = star.catalog_number
                  )
 where previous_summary.galaxy_id = current_summary.galaxy_id
   and previous_summary.galaxy_id = 220
   and previous_summary.star_id = current_summary.star_id
   and previous_summary.observed_month < current_summary.observed_month
   and previous_summary.observation_count > 0
 order by observed_month desc
 limit 1
```

A smaller one — `group by` / `having` / `order by`, from a single compact line:

```sql
select station_id, count(*) from astronaut group by station_id having count(*) > 5 order by station_id
```

becomes:

```sql
select station_id,
       count(*)
  from astronaut
 group by station_id
having count(*) > 5
 order by station_id
```

A join with more than one ON condition always breaks, aligning `and`/`or` under `on`:

```sql
select planet.mass,
       star.radius
  from planet
  join star on star.id = planet.star_id
           and star.parent_id is null
```

## Rules

- **Spaces, never tabs.**
- The **first word** of each clause (`select`, `from`, `join`, `left`, `where`, `and`,
  `order`, `limit`, ...) is right-aligned to a common river; arguments start right after.
- **Keywords lowercased** by default; identifiers preserved.
- **Breaking is by rule, not by width.** Line length never decides anything: a construct breaks
  when its *structure* calls for it, and otherwise grows on one line however long. There is no
  maximum-width setting.
- A **list clause with more than one item breaks one item per line**, with trailing commas and the
  columns aligned — `select`, `from` (with a comma), `group by`, `order by`, and the DML
  `set` / `values` / `insert` column list. A single-item list stays inline.
- **`where` / `having` break whenever there is more than one condition**, with the `and`/`or`
  connectors aligned to the main river; a single condition stays inline. A parenthesized boolean
  group always expands and aligns its own `and`/`or` connectors the same way — to the group's river,
  one level in.
- **JOINs with more than one ON condition always break**, aligning the `and`/`or`
  conditions under the `on`. A join with a single ON condition stays inline (there is nothing
  to align).
- **Line comments (`--`)** stay associated with the code around them. A comment that trails
  code on a line stays attached to that line (its last token) — including a comment on a `where`
  condition or inside a parenthesized group. A comment alone on its line stays alone: a leading
  comment sits at the left margin above the statement; comments between list items, between
  clauses, between `where`/`join` ON conditions, inside an expanded group, or trailing the
  statement sit at the content column (aligned with the clause arguments). A comment before the
  first `where`/`having` condition puts the keyword on its own line, with the first condition
  below the comment.
- **INSERT / UPDATE / DELETE** format like a select: the anchors join the river, `set` and
  `values` break one item per line (when there is more than one), `delete from` stays together,
  and `where` reuses the river. An `INSERT` column list with more than one column breaks one per
  line, aligned one column past the `(`. The values inside a `values` tuple stay on one line and
  grow.
- **Subqueries and CTEs** expand recursively — `from (select ...) alias`, one or more
  comma-separated CTEs (`with a as (...), b as (...)`), a `where`/`having` condition subquery in
  **any** position (`where ... in (select ...)`, and after `and`/`or` too), a subquery inside a
  `join` ON condition, a subquery as a `join` table (`join (select ...) alias on ...`), a scalar
  subquery in the select list, and a **`LATERAL` derived table** in any position
  (`join`/`cross join lateral (...)`, `from lateral (...)`, `from t, lateral (...)`). The inner
  query is re-aligned one level in and the closing `)` aligns
  under the owner: the clause keyword for the first `where` condition, the `and`/`or` connector for a
  later one (or ON condition), the item column for a scalar subquery. The `with` preamble is a
  standalone command at the **left margin** (column 0), not aligned to the river: `with` and the
  final `select` share column 0, CTE bodies indent one level in, and each `)` sits under `with`. In a
  multi-CTE `with`, each CTE name after the first recedes to the `with` column and the comma follows
  the previous `)`. A comment inside any of these expanded subqueries is reflowed by the recursion.
- **`case ... end`** in the select list (or `group by` / `order by`, in a `where` / `having`
  condition, and in a `join` ON condition) expands with `when` / `else` / `end` aligned under
  `case`; anything after the `end` (e.g. `> 100`) rides the `end` line. A nested `case` in a branch
  expands recursively at the column where the inner `case` begins. A `when ... then` stays on one
  line and grows, however long.

## Usage

Open a `.sql` file and run **Format Document** (`Shift+Alt+F` / `⇧⌥F`), or select a range
and use **Format Selection**. It also works with *format on save*.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `riverleaf.keywordCase` | `lower` | `lower` / `upper` / `preserve`. |
| `riverleaf.indentSize` | `2` | Spaces per nesting level (parentheses/subqueries). |

There is no line-width / maximum-line-length setting: breaking is by rule, not by width.

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
    select name, designation from star
  expected: |
    SELECT name,
           designation
      FROM star
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
