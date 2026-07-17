#!/usr/bin/env node
// Generates exact YAML test cases for the Riverleaf formatter.
//
// Input: a JSON file holding an array of { description, options?, input }.
// Output: the same entries with `expected` filled in by running format(),
//         dumped as YAML (js-yaml auto-adds a |N indicator to preserve leading
//         indentation). Prints to stdout, or appends to a yaml with --append.
//
// Usage (from project root):
//   npx tsx .claude/skills/regen-format-cases/regen.mjs cases.json
//   npx tsx .claude/skills/regen-format-cases/regen.mjs cases.json --append test/cases/postgres.yaml
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..'); // .claude/skills/<name> -> project root

const specPath = process.argv[2];
if (!specPath) {
  console.error('usage: npx tsx .claude/skills/regen-format-cases/regen.mjs <cases.json> [--append <file.yaml>]');
  process.exit(1);
}

const { format } = await import(pathToFileURL(path.join(root, 'src/formatter/format.ts')).href);
// js-yaml is on 5.x here, which uses named exports (no default export).
const yaml = await import('js-yaml');

const spec = JSON.parse(readFileSync(specPath, 'utf8'));
if (!Array.isArray(spec)) {
  console.error('spec must be a JSON array of { description, options?, input }');
  process.exit(1);
}

const cases = spec.map((c) => {
  const entry = { description: c.description };
  if (c.options) entry.options = c.options;
  entry.input = c.input;
  entry.expected = format(c.input, c.options ?? {});
  return entry;
});

const out = yaml.dump(cases, { lineWidth: -1, noRefs: true, quotingType: '"' });

const appendIdx = process.argv.indexOf('--append');
if (appendIdx !== -1 && process.argv[appendIdx + 1]) {
  const target = path.resolve(root, process.argv[appendIdx + 1]);
  appendFileSync(target, out);
  console.error(`appended ${cases.length} case(s) to ${target}`);
} else {
  process.stdout.write(out);
}
