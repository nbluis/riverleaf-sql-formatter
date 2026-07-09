# Testing rules

Tests are **data-driven**. Behavior is locked by YAML fixtures, not by TypeScript assertions, so
scenarios can be added without touching code — this is our regression guardrail.

## Structure

- `test/cases/*.yaml` — one file per family (e.g. `postgres.yaml`, and future `mysql.yaml`,
  `postgres_cte.yaml`, `psql.yaml`, ...).
- `test/cases.test.ts` — the runner. It reads **every** `*.yaml`/`*.yml` in `test/cases/` and, per
  entry, asserts:
  1. `format(input, options) === expected`
  2. idempotency: `format(expected, options) === expected` (opt out with `idempotent: false`).

## Case schema

```yaml
- description: what this checks            # shows up as the test name
  options:                                 # optional; merged over DEFAULT_OPTIONS
    maxLineLength: 100                      #   (default 80 / lower / indentSize 2)
  input: |
    <unformatted sql>
  expected: |
    <formatted sql>
  idempotent: false                        # optional, rare — only if reflow isn't stable
```

## How to author `expected` — do NOT hand-count spaces

River alignment has deep, exact indentation. Always generate `expected` from the formatter:

1. Write a throwaway script **in the scratchpad** (never commit it) that imports
   `./src/formatter/format.ts`, defines the inputs (+options), calls `format`, and either prints
   the output or dumps a full yaml via `js-yaml`'s `dump({ lineWidth: -1, noRefs: true })`.
2. Run it with `npx tsx <script>.mjs`.
3. Paste/verify the exact output into the yaml, then delete the script.

`js-yaml.dump` automatically emits a block-scalar indentation indicator (e.g. `|2`) when the first
content line has leading spaces (the base-4 golden), so leading indentation round-trips correctly.
First-line-flush cases use plain `|`.

**Important:** only capture `expected` output you have actually reviewed as correct. Generating and
pasting blindly makes the test tautological. The point is: once a *reviewed* output is captured, the
test ensures it never silently changes.

## Naming / dummy data

Use realistic but context-free names (`customers`, `orders`, `order_items`, `customer_id`,
`total_amount`, ...). No single letters (`a`, `b`, `t`). No real business tables from the user's
domain.

## Growing the suite

Prefer adding a case for every fix or new behavior (TDD: add the case first, watch it fail, then
implement). New SQL dialect quirks → a new yaml file; the runner picks it up with zero code change.
