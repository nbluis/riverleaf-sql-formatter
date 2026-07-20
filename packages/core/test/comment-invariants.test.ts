import { describe, it, expect } from 'vitest';
import { format } from '../src/formatter/format';
import { tokenize } from '../src/formatter/tokenizer';
import { Token, FormatOptions } from '../src/formatter/types';

/**
 * Comment-safety regression net.
 *
 * The formatter reflows line comments into the river layout, and a comment-safety
 * gate (`format.ts`) decides — mirroring the layout's expansion conditions — when
 * a statement can be reflowed vs. must pass through unchanged. Those two sides
 * must stay in agreement: if the gate lets a statement format but the layout then
 * can't place a comment, code gets commented out (a token is swallowed) or a
 * comment is dropped. This test locks that agreement with formatting-agnostic
 * invariants — it does NOT snapshot exact output, so it never needs updating when
 * formatting legitimately changes; it only fails on real corruption.
 *
 * The corpus injects a standalone line comment, an inline line comment, and a
 * block comment at every token boundary of a set of base queries (plus a few
 * hand-picked multi-comment / nested cases), under both keyword cases. Examples
 * use the astronomy dictionary.
 */

const BASE_QUERIES = [
  'select id, name, mass from planets',
  'select id from planets where mass > 10',
  'select id from planets where mass > 10 and radius < 5 or is_active = true',
  'select id from planets where mass > 10 and (radius < 5 or is_active = true)',
  'select p.id from planets p join stars s on s.id = p.star_id',
  'select p.id from planets p join stars s on s.id = p.star_id and s.type = p.type',
  'select id, mass from planets group by classification order by mass',
  'select id from planets where mass between 10 and 20',
  'select x.id from (select id, sum(mass) as total from planets group by id) x where x.total > 100',
  'select id from planets where star_id in (select star_id from nearby_stars where is_active = true)',
  'with bright as (select id from stars where mass > 10) select id from bright',
  'with a as (select id from planets), b as (select id from stars) select a.id from a join b on a.id = b.id',
  'select id, coalesce((select max(mass) from moons m where m.planet_id = planets.id), 0) as top from planets',
  "select id, coalesce(case when p.mass > 100 then 'big' else 'small' end, 'x') as label from planets p",
  "select case when mass > 100 then 'big' else 'small' end as seg from stars",
  'insert into planets (id, name, mass) values (1, 2, 3)',
  'update planets set mass = 10, radius = 5 where id = 1',
  'delete from planets where id = 1',
  'select id from planets limit 10',
  'select id from planets union all select id from stars',
  'select p.id from planets p join (select star_id from nearby_stars) ns on ns.star_id = p.star_id',
];

/** A handful of shapes the mechanical injection under-covers. */
const HAND_PICKED = [
  'select id, name -- a\n, mass -- b\nfrom planets',
  'select x.id from (\n  select id\n  -- inside\n  from planets\n) x',
  'select id from planets where a = 1 -- x\n  and b = 2 -- y\n  and c = 3',
  'select id, coalesce((\n  select max(mass)\n  -- careful\n  from moons\n), 0) as top from planets',
  'select id from planets where\n-- lead\nstatus = 1 and mass > 10',
  'select id from planets -- trailing after last clause',
  'select id from planets; -- after semicolon',
  'select id, /* block */ mass from planets where mass > /* b */ 10',
];

const OPTS: Partial<FormatOptions>[] = [{ keywordCase: 'lower' }, { keywordCase: 'upper' }];

/** Build the fuzz corpus: comment injected at every token gap, plus extras. */
function buildCorpus(): string[] {
  const out = new Set<string>();
  for (const base of BASE_QUERIES) {
    out.add(base);
    const parts = base.split(' ');
    for (let i = 1; i < parts.length; i++) {
      const head = parts.slice(0, i).join(' ');
      const tail = parts.slice(i).join(' ');
      out.add(head + '\n-- note\n' + tail); // standalone
      out.add(head + ' -- note\n' + tail); // inline trailing
      out.add(head + ' /* b */ ' + tail); // block
    }
    out.add('-- lead\n' + base);
    out.add(base + '\n-- trail');
    out.add(base + '; -- after semi');
  }
  for (const h of HAND_PICKED) out.add(h);
  return [...out];
}

const CORPUS = buildCorpus();

/** Code tokens (comments excluded), keywords compared case-insensitively so the
 * check is independent of `keywordCase`. */
function codeTokens(sql: string): string[] {
  return tokenize(sql)
    .filter((t: Token) => t.type !== 'lineComment' && t.type !== 'blockComment')
    .map((t: Token) => (t.type === 'keyword' ? t.upper : t.value));
}

/** All comment texts (line + block), verbatim, as a sorted multiset. */
function commentTexts(sql: string): string[] {
  return tokenize(sql)
    .filter((t: Token) => t.type === 'lineComment' || t.type === 'blockComment')
    .map((t: Token) => t.value)
    .sort();
}

describe('comment safety invariants', () => {
  it('never swallows or invents a code token (no code commented out)', () => {
    const failures: string[] = [];
    for (const input of CORPUS) {
      for (const opts of OPTS) {
        const out = format(input, opts);
        const before = codeTokens(input);
        const after = codeTokens(out);
        if (before.join('') !== after.join('')) {
          failures.push(
            `opts=${JSON.stringify(opts)}\ninput:\n${input}\noutput:\n${out}\n` +
              `code tokens before: ${before.length}, after: ${after.length}`,
          );
        }
      }
    }
    expect(failures, `\n\n${failures.slice(0, 5).join('\n---\n')}\n`).toEqual([]);
  });

  it('never drops a comment', () => {
    const failures: string[] = [];
    for (const input of CORPUS) {
      for (const opts of OPTS) {
        const out = format(input, opts);
        const before = commentTexts(input);
        const after = commentTexts(out);
        if (before.join('') !== after.join('')) {
          failures.push(`opts=${JSON.stringify(opts)}\ninput:\n${input}\noutput:\n${out}`);
        }
      }
    }
    expect(failures, `\n\n${failures.slice(0, 5).join('\n---\n')}\n`).toEqual([]);
  });

  it('is idempotent (formatting twice is stable)', () => {
    const failures: string[] = [];
    for (const input of CORPUS) {
      for (const opts of OPTS) {
        const once = format(input, opts);
        const twice = format(once, opts);
        if (once !== twice) {
          failures.push(`opts=${JSON.stringify(opts)}\nonce:\n${once}\ntwice:\n${twice}`);
        }
      }
    }
    expect(failures, `\n\n${failures.slice(0, 5).join('\n---\n')}\n`).toEqual([]);
  });
});
