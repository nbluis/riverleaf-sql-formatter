<p align="center">
  <img src="assets/riverleaf.svg" alt="Riverleaf SQL Formatter" width="440">
</p>

<h1 align="center">Riverleaf SQL Formatter 🍃</h1>

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

## Rules

- **Spaces, never tabs.**
- The **first word** of each clause (`select`, `from`, `join`, `left`, `where`, `and`,
  `order`, `limit`, ...) is right-aligned to a common river; arguments start right after.
- **Keywords lowercased** by default; identifiers preserved.
- **JOINs do not break** by default. They only break when the line exceeds the maximum
  width; then the `and`/`or` conditions align under the `on`.
- In `where`/`having`, the `and`/`or` connectors align to the main river.
- A **SELECT with many columns** stays on one line if it fits; otherwise it breaks with
  trailing commas, aligning the columns.
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

## Known limitations (roadmap)

- Line comments (`--`) in the middle of a statement cause that slice to be **kept as-is**
  (so code is not commented out when lines are joined). Comments at the end of a
  line/statement are formatted normally.
- Subqueries and CTEs (`with`) are still rendered inline (without recomputing the inner
  river) — planned refinement.
- `case when ... end` and INSERT/UPDATE/DELETE alignment are basic for now.

## License

[MIT](LICENSE)
