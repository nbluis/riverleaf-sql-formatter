# Testing rules

Tests are **data-driven**. Behavior is locked by YAML fixtures, not by TypeScript assertions, so
scenarios can be added without touching code — this is the regression guardrail.

## Structure

- `test/cases/*.yaml` — **one file per subject** (feature), not per dialect. The runner reads flat
  (non-recursively), so a new dialect quirk just goes in a new `dialect_<name>.yaml`. Current files:
  - `alignment.yaml` — the river: clause alignment, casing, multi-word keywords, indent normalization,
    multi-statement, the no-space-before-`(` rule, the showcase example.
  - `lists.yaml` — list clauses breaking by count, plus order-by modifiers (`nulls first/last`,
    `using op`).
  - `select.yaml` — `distinct`, `distinct on`, window `over` + a named `window`, `filter`,
    `within group`, a window frame.
  - `groupby.yaml` — `group by rollup` / `cube` / `grouping sets`.
  - `limit.yaml` — `limit` / `offset` / `fetch first`.
  - `setops.yaml` — `union` / `union all` / `intersect` / `except` (they stay in the river).
  - `expressions.yaml` — `cast`/`extract`/`substring`/`trim`/`position`, `array`/subscript/`row`/
    `at time zone`, multi-column `in`.
  - `where.yaml` — `where`/`having`: single condition inline, parenthesized group expands, connectors.
  - `joins.yaml` — single-ON inline, multi-ON breaks (secondary river), `using`/`natural`/`cross`/
    `full outer`.
  - `comments.yaml` — comment placement (inline / standalone / leading / between / in-group / ON /
    post-`;`).
  - `case.yaml` — `case ... end` (list, where/having, join ON, nested).
  - `dml.yaml` — `insert` / `update` / `delete` (+ set/values, insert columns, tuples, `on conflict`
    upsert, `update … from` / `delete … using`, `create view`, standalone `values`).
  - `merge.yaml` — `merge` (PG 15+): `merge into` / `using` / `on` / each `when … then <action>`.
  - `subquery.yaml` — subqueries (non-CTE): from / where / join ON / join-table / scalar /
    function-wrapped.
  - `cte.yaml` — `with` CTEs (single, multiple, inner where, comment inside, `with recursive`).
  - `lateral.yaml` — `LATERAL` derived tables.
  - `locking.yaml` — the row-locking clause (`for update`/`for share`/… with `of`/`nowait`/
    `skip locked`).
  - `from_functions.yaml` — set-returning functions in `from` (`with ordinality`, `generate_series`,
    `unnest`, column-definition lists, `tablesample`).
  - `operators.yaml` — multi-char operators (JSONB / regex / array / bit-shift) plus the classics
    (`::`/`->`/`->>`/`||`/`<>`/`>=`) as a regression guard.
- `test/cases.test.ts` — the runner. It reads **every** `*.yaml`/`*.yml` in `test/cases/` and, per
  entry, asserts:
  1. `format(input, options) === expected`
  2. idempotency: `format(expected, options) === expected` (opt out with `idempotent: false`).

## Comment-safety invariants (`test/comment-invariants.test.ts`)

A second, **property-based** test guards the coupling most prone to silent breakage: the
comment-reflow layout (`layout.ts`) and the comment-safety gate (`format.ts`) must stay in agreement —
if the gate lets a statement format but the layout can't place a comment, code gets commented out (a
token swallowed) or a comment is dropped. It injects a standalone line comment, an inline line comment,
and a block comment at **every token boundary** of a set of base queries, plus hand-picked
nested/multi-comment shapes, under both keyword cases, and asserts three **formatting-agnostic**
invariants:

1. **No code token is swallowed or invented** — `format` preserves the code-token stream (keywords
   compared case-insensitively).
2. **No comment is dropped** — every line/block comment text survives (as a multiset).
3. **Idempotent** — `format(format(x)) === format(x)`.

Because it checks invariants, not exact output, it never needs updating when formatting legitimately
changes — it only fails on real corruption/loss. When adding or changing comment handling, extend
`BASE_QUERIES` / `HAND_PICKED` rather than snapshotting output.

## Case schema

```yaml
- description: what this checks            # shows up as the test name
  options:                                 # optional; merged over DEFAULT_OPTIONS
    keywordCase: upper                      #   (defaults: keywordCase lower / indentSize 2)
  input: |
    <unformatted sql>
  expected: |
    <formatted sql>
  idempotent: false                        # optional, rare — only if reflow isn't stable
```

## Authoring `expected` — never hand-count spaces

River alignment has deep, exact indentation, so always **generate `expected` from the formatter** with
the **`regen-format-cases`** skill (it runs `format()` on a JSON spec and emits exact YAML, appending
to a target file). Only capture output you have **actually reviewed as correct** — generating and
pasting blindly makes the test tautological. The value is locking a *reviewed* output against future
regressions.

## Naming / dummy data

**Use the astronomy dictionary** (`.claude/rules/example-dictionary.md`). Every table, column, alias,
and literal comes from there (`planets`, `stars`, `missions`, `mass`, `observed_at`, aliases `p`/`s`/
`ms`, values like `'confirmed'`/`'terrestrial'`). Rewrite any real query onto dictionary names by role,
keeping the structure identical. The dictionary's short aliases (`p`, `s`, `m`, …) are intentional and
allowed — what to avoid is *meaningless* aliases (`a`, `b`, `t`) that carry no role.

## Growing the suite

Add a case for every fix or new behavior (TDD: add the case first, watch it fail, then implement). A
new SQL dialect quirk → a new yaml file; the runner picks it up with zero code change.
