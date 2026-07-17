# Testing rules

Tests are **data-driven**. Behavior is locked by YAML fixtures, not by TypeScript assertions, so
scenarios can be added without touching code — this is our regression guardrail.

## Structure

- `test/cases/*.yaml` — **one file per subject** (feature), not per dialect:
  - `alignment.yaml` — the river: basic clause alignment, keyword casing, multi-word keywords, indent
    normalization (D2), multi-statement, the no-space-before-`(` call rule, and the showcase example.
  - `lists.yaml` — list clauses breaking by count (`select`/`from`/`group by`/`order by`).
  - `where.yaml` — `where`/`having`: single condition inline, parenthesized group expands, connectors.
  - `joins.yaml` — joins: single-ON inline, multi-ON breaks (secondary river).
  - `comments.yaml` — all comment placement (inline / standalone / leading / between / in-group / ON / post-`;`).
  - `case.yaml` — `case ... end` (list, where/having, join ON, nested).
  - `dml.yaml` — `insert` / `update` / `delete` (+ set/values, insert columns, tuples, `on conflict`
    upsert).
  - `subquery.yaml` — subqueries (non-CTE): from / where / join ON / join-table / scalar / function-wrapped.
  - `cte.yaml` — `with` common table expressions (single, multiple, inner where, comment inside).
  - `lateral.yaml` — `LATERAL` derived tables.
  - `locking.yaml` — the row-locking clause (`for update`/`for share`/`for no key update`/… with
    `of`/`nowait`/`skip locked`); `for` joins the river as a clause head.
  - `from_functions.yaml` — set-returning functions in `from` (`with ordinality` for now; Phase 4
    extends it with `generate_series`/`unnest`/column-definition lists).
  - `operators.yaml` — multi-char operators lexed by maximal munch (JSONB `@>`/`<@`/`#>`/`#>>`/
    `?`/`?|`/`?&`, regex `~`/`~*`/`!~`/`!~*`, array `&&`, bit-shift `<<`/`>>`) plus the classics
    (`::`/`->`/`->>`/`||`/`<>`/`>=`) as a regression guard.
  - A future dialect-specific quirk goes in `dialect_<name>.yaml` (the runner reads flat, non-recursively).
- `test/cases.test.ts` — the runner. It reads **every** `*.yaml`/`*.yml` in `test/cases/` and, per
  entry, asserts:
  1. `format(input, options) === expected`
  2. idempotency: `format(expected, options) === expected` (opt out with `idempotent: false`).

## Comment-safety invariants (`test/comment-invariants.test.ts`)

A second, **property-based** test guards the one coupling most prone to silent breakage: the
comment-reflow layout (`layout.ts`) and the comment-safety gate (`format.ts`) must stay in agreement
— if the gate lets a statement format but the layout can't place a comment, code gets commented out
(a token is swallowed) or a comment is dropped. It builds a corpus by injecting a standalone line
comment, an inline line comment, and a block comment at **every token boundary** of a set of base
queries (astronomy dictionary), plus hand-picked nested/multi-comment shapes, under both keyword
cases, and asserts three **formatting-agnostic** invariants on each:

1. **No code token is swallowed or invented** — `format` preserves the code-token stream (keywords
   compared case-insensitively), so nothing gets commented out.
2. **No comment is dropped** — every line/block comment text survives (as a multiset).
3. **Idempotent** — `format(format(x)) === format(x)`.

Because it checks invariants, not exact output, it never needs updating when formatting legitimately
changes — it only fails on real corruption/loss. When adding or changing comment handling, extend
`BASE_QUERIES` / `HAND_PICKED` rather than snapshotting output. (This net was added after it caught
real bugs: dropped comments in a single-condition `where`/`having`/ON with a standalone comment
above it, a dropped inline comment before the first list item, and a non-idempotent inline comment
after `;`.)

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

**Use the astronomy dictionary** — `.claude/rules/example-dictionary.md`. Every table, column, alias,
and literal in a case comes from there (`planets`, `stars`, `missions`, `mass`, `observed_at`, aliases
`p`/`s`/`ms`, values like `'confirmed'`/`'terrestrial'`). Rewrite any real query onto dictionary names
by role, keeping the structure identical. No real business tables from the user's domain, and no
off-theme placeholders. The dictionary's short aliases (`p`, `s`, `m`, ...) are intentional and
allowed — they supersede any "avoid single-letter alias" habit; what to avoid is *meaningless*
aliases (`a`, `b`, `t`) that carry no role.

## Growing the suite

Prefer adding a case for every fix or new behavior (TDD: add the case first, watch it fail, then
implement). New SQL dialect quirks → a new yaml file; the runner picks it up with zero code change.
