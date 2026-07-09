# Riverleaf SQL Formatter 🍃

Formats SQL scripts in the **river alignment** style: keywords are right-aligned to a
common vertical column, using **spaces** (never tabs). Your keywords line up along the
bank while a river of whitespace flows down the middle.

## Example

Before:

```sql
select year_month as last_visit_month from customer_user_visit_months last_visit
join join1 on join1.column = last_visit.column
left join join2 on join2.column = join1.column and join2.new_criteria1 = join1.new_criteria1 and join2.new_criteria2 between 1 and 2 and (join2.new_criteria4 = join1.new_criteria1 or join2.new_criteria5 = join1.new_criteria5)
where last_visit.organization_id = current_visit.organization_id and last_visit.organization_id = 220
order by year_month desc limit 1
```

After (width = 100):

```sql
    select year_month as last_visit_month
      from customer_user_visit_months last_visit
      join join1 on join1.column = last_visit.column
      left join join2 on join2.column = join1.column
                     and join2.new_criteria1 = join1.new_criteria1
                     and join2.new_criteria2 between 1 and 2
                     and (
                       join2.new_criteria4 = join1.new_criteria1
                       or join2.new_criteria5 = join1.new_criteria5
                     )
     where last_visit.organization_id = current_visit.organization_id
       and last_visit.organization_id = 220
     order by year_month desc
     limit 1
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
