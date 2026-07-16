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
select order_month as previous_order_month from monthly_order_summaries previous_order
join customers on customers.customer_id = previous_order.customer_id
left join shipping_addresses on shipping_addresses.customer_id = customers.customer_id and shipping_addresses.address_type = customers.default_address_type and shipping_addresses.priority between 1 and 2 and (shipping_addresses.region_id = customers.region_id or shipping_addresses.country_code = customers.country_code)
where previous_order.organization_id = current_order.organization_id and previous_order.organization_id = 220 and previous_order.customer_id = current_order.customer_id and previous_order.order_month < current_order.order_month and previous_order.order_count > 0
order by order_month desc limit 1
```

After (width = 100):

```sql
    select order_month as previous_order_month
      from monthly_order_summaries previous_order
      join customers on customers.customer_id = previous_order.customer_id
      left join shipping_addresses on shipping_addresses.customer_id = customers.customer_id
                                  and shipping_addresses.address_type = customers.default_address_type
                                  and shipping_addresses.priority between 1 and 2
                                  and (
                                    shipping_addresses.region_id = customers.region_id
                                    or shipping_addresses.country_code = customers.country_code
                                  )
     where previous_order.organization_id = current_order.organization_id
       and previous_order.organization_id = 220
       and previous_order.customer_id = current_order.customer_id
       and previous_order.order_month < current_order.order_month
       and previous_order.order_count > 0
     order by order_month desc
     limit 1
```

A smaller one — `group by` / `having` / `order by`, from a single compact line:

```sql
select department_id, count(*) from employees group by department_id having count(*) > 5 order by department_id
```

becomes:

```sql
select department_id, count(*)
  from employees
 group by department_id
having count(*) > 5
 order by department_id
```

A join with more than one ON condition always breaks, aligning `and`/`or` under `on`:

```sql
select table1.column1, table2.column2
  from table1
  join table2 on table2.id = table1.ref_id
             and table2.ref_id is null
```

## Rules

- **Spaces, never tabs.**
- The **first word** of each clause (`select`, `from`, `join`, `left`, `where`, `and`,
  `order`, `limit`, ...) is right-aligned to a common river; arguments start right after.
- **Keywords lowercased** by default; identifiers preserved.
- **JOINs with more than one ON condition always break**, aligning the `and`/`or`
  conditions under the `on` — regardless of line width. A join with a single ON condition
  stays inline (there is nothing to align).
- In `where`/`having`, the `and`/`or` connectors align to the main river.
- A **SELECT with many columns** stays on one line if it fits; otherwise it breaks with
  trailing commas, aligning the columns.
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
  and `where` reuses the river.
- **Subqueries and CTEs** expand recursively — `from (select ...) alias`, a single
  `with name as (...)`, a `where ... in (select ...)` (as the first of several conditions too),
  a subquery as a `join` table (`join (select ...) alias on ...`), and a scalar subquery in the
  select list. The inner query is re-aligned one level in and the closing `)` aligns under the
  owner clause keyword (or the item column, for a scalar subquery). A comment inside any of these
  expanded subqueries is reflowed by the recursion.
- **`case ... end`** in the select list (or `group by` / `order by`, and in a `where` / `having`
  condition) expands with `when` / `else` / `end` aligned under `case`; anything after the `end`
  (e.g. `> 100`) rides the `end` line. A nested `case` in a branch expands recursively at the
  column where the inner `case` begins.
- **Maximum width** = the first value of `editor.rulers` (fallback 80), or the override in
  `riverleaf.maxLineLength`.

## Usage

Open a `.sql` file and run **Format Document** (`Shift+Alt+F` / `⇧⌥F`), or select a range
and use **Format Selection**. It also works with *format on save*.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `riverleaf.maxLineLength` | `null` | Maximum width. When `null`, uses `editor.rulers[0]` (fallback 80). |
| `riverleaf.keywordCase` | `lower` | `lower` / `upper` / `preserve`. |
| `riverleaf.indentSize` | `2` | Spaces per nesting level (parentheses/subqueries). |

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
  options:            # optional; defaults to maxLineLength 80, keywordCase lower, indentSize 2
    maxLineLength: 100
  input: |
    select a,b from t
  expected: |
    select a, b
      from t
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
- **Subqueries / CTEs** stay inline when they are: multiple comma-separated CTEs, a subquery inside
  a multi-condition `where` other than the first condition, a subquery inside a `join` ON, or a
  subquery wrapped in a function call.
- **`case`** stays inline when it is wrapped in a function call, or inside a `join` ON; a long
  `when ... then` is not wrapped.

## License

[MIT](LICENSE)
