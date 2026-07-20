---
name: regen-format-cases
description: Generate exact YAML test cases for the Riverleaf SQL formatter by running the formatter on SQL inputs. Use when adding or updating scenarios in packages/core/test/cases/*.yaml so the expected river-aligned output is always correct instead of being hand-written.
---

# regen-format-cases

River alignment has deep, exact indentation — hand-writing `expected` in the YAML fixtures is
error-prone. This skill runs the real formatter to produce the exact `expected`.

## Steps

1. Write a spec file in the scratchpad — a JSON array of cases, each `{ description, options?, input }`
   (omit `expected`; `options` is optional, e.g. `{ "maxLineLength": 100 }`). Use realistic,
   context-free names (`customers`, `order_id`, ...); no single letters. Example:

   ```json
   [
     { "description": "distinct on a single column", "input": "select distinct status_id from orders" }
   ]
   ```

2. Run the generator from the project root:

   ```bash
   npx tsx .claude/skills/regen-format-cases/regen.mjs <spec.json>
   ```

   Review the printed YAML. When it looks right, append it to the target file:

   ```bash
   npx tsx .claude/skills/regen-format-cases/regen.mjs <spec.json> --append packages/core/test/cases/postgres.yaml
   ```

   (Create a new yaml — `mysql.yaml`, `postgres_cte.yaml`, ... — for a distinct family.)

3. Run `npm test`. The runner (`packages/core/test/cases.test.ts`) picks up every yaml and also
   asserts idempotency.

## Rules

- **Review before trusting.** Only capture output you have actually judged correct — otherwise the
  test is tautological. The value is locking a *reviewed* output against future regressions.
- Do not commit the scratchpad spec file.
- See `.claude/rules/testing.md` for the case schema and naming conventions.
