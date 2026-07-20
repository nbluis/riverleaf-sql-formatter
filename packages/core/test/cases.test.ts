import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import { format, FormatOptions } from '../src/formatter/format';

interface FormatCase {
  description?: string;
  options?: Partial<FormatOptions>;
  input: string;
  expected: string;
  /** Set to false to skip the "formatting twice is stable" assertion. */
  idempotent?: boolean;
}

const CASES_DIR = join(__dirname, 'cases');

function loadCases(file: string): FormatCase[] {
  const raw = load(readFileSync(join(CASES_DIR, file), 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${file}: expected a top-level list of cases`);
  }
  return raw as FormatCase[];
}

const yamlFiles = readdirSync(CASES_DIR)
  .filter((f) => /\.ya?ml$/i.test(f))
  .sort();

describe('yaml formatting cases', () => {
  if (yamlFiles.length === 0) {
    it('has at least one .yaml case file', () => {
      expect(yamlFiles.length).toBeGreaterThan(0);
    });
    return;
  }

  for (const file of yamlFiles) {
    describe(file, () => {
      const cases = loadCases(file);
      cases.forEach((c, i) => {
        const name = c.description ?? `case #${i + 1}`;

        it(name, () => {
          expect(typeof c.input).toBe('string');
          expect(typeof c.expected).toBe('string');
          expect(format(c.input, c.options ?? {})).toBe(c.expected);
        });

        if (c.idempotent !== false) {
          it(`${name} (idempotent)`, () => {
            expect(format(c.expected, c.options ?? {})).toBe(c.expected);
          });
        }
      });
    });
  }
});
