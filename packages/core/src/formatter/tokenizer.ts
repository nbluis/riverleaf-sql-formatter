import { Token } from './types';
import { isKeyword } from './keywords';

// PostgreSQL operator characters. An operator token is the maximal contiguous
// run of these (maximal munch), so any multi-char operator — built-in or
// user-defined, JSONB (@>, <@, #>, #>>, ?, ?|, ?&, @@, @?), regex (~, ~*, !~,
// !~*), array (&&), bit-shift (<<, >>), and the classics (<=, >=, <>, !=, ||,
// ->, ->>, =>) — survives as one token instead of being sliced apart. ':' is
// deliberately excluded (it is not a PG operator char); the special ':'-led
// tokens :: and := are recognized explicitly before the munch.
const OPERATOR_CHARS = new Set([
  '+', '-', '*', '/', '<', '>', '=', '~', '!', '@', '#', '%', '^', '&', '|', '?',
]);

// Chars that make a trailing +/- part of a multi-char operator (PG lexical rule):
// an operator that ends in + or - is only valid as a unit if it contains one of
// these; otherwise the trailing +/- are separate tokens (so `x=-1` lexes as
// `= - 1`, not `=- 1`).
const OPERATOR_SPECIAL = /[~!@#%^&|?]/;

const PUNCT = new Set(['(', ')', ',', ';', '.', '[', ']']);

// '@' and '#' are PG operator characters, not identifier characters, so they are
// not part of a word (they were, which sliced @>/#> apart). '$' stays for
// positional params ($1) and dollar-suffixed identifiers.
function isWordStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isWordPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/** Splits SQL into tokens, discarding whitespace but preserving comments/strings. */
export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sql.length;

  // Whether a newline has been seen since the last emitted token. Starts true so
  // the first token counts as beginning a line.
  let newlineBefore = true;

  const push = (type: Token['type'], value: string, start: number): void => {
    tokens.push({ type, value, upper: value.toUpperCase(), start, end: start + value.length, newlineBefore });
    newlineBefore = false;
  };

  while (i < n) {
    const ch = sql[i];

    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') {
      if (ch === '\n' || ch === '\r' || ch === '\f') newlineBefore = true;
      i++;
      continue;
    }

    // line comment
    if (ch === '-' && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < n && sql[j] !== '\n') j++;
      push('lineComment', sql.slice(i, j).replace(/\s+$/, ''), i);
      i = j;
      continue;
    }

    // block comment
    if (ch === '/' && sql[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(sql[j] === '*' && sql[j + 1] === '/')) j++;
      j = Math.min(j + 2, n);
      push('blockComment', sql.slice(i, j), i);
      i = j;
      continue;
    }

    // single-quoted string (with '' escape); optional E/e/N/B/x prefix
    if (ch === "'" || ((ch === 'E' || ch === 'e' || ch === 'N' || ch === 'B' || ch === 'x') && sql[i + 1] === "'")) {
      const start = i;
      if (ch !== "'") i++; // skip prefix
      i++; // opening quote
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        if (sql[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      push('string', sql.slice(start, i), start);
      continue;
    }

    // double-quoted identifier
    if (ch === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
          continue;
        }
        if (sql[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      push('string', sql.slice(start, i), start);
      continue;
    }

    // backtick identifier (MySQL)
    if (ch === '`') {
      const start = i;
      i++;
      while (i < n && sql[i] !== '`') i++;
      i = Math.min(i + 1, n);
      push('string', sql.slice(start, i), start);
      continue;
    }

    // number
    if (isDigit(ch) || (ch === '.' && isDigit(sql[i + 1]))) {
      let j = i;
      while (j < n && (isDigit(sql[j]) || sql[j] === '.')) j++;
      if (sql[j] === 'e' || sql[j] === 'E') {
        j++;
        if (sql[j] === '+' || sql[j] === '-') j++;
        while (j < n && isDigit(sql[j])) j++;
      }
      push('number', sql.slice(i, j), i);
      i = j;
      continue;
    }

    // word / keyword
    if (isWordStart(ch)) {
      let j = i;
      while (j < n && isWordPart(sql[j])) j++;
      const value = sql.slice(i, j);
      const upper = value.toUpperCase();
      push(isKeyword(upper) ? 'keyword' : 'word', value, i);
      i = j;
      continue;
    }

    // ':'-led operators (':' is not a PG operator char, so handle :: and :=
    // explicitly; a lone ':' falls through to the fallback).
    if (ch === ':' && (sql[i + 1] === ':' || sql[i + 1] === '=')) {
      push('operator', sql.slice(i, i + 2), i);
      i += 2;
      continue;
    }

    // punctuation
    if (PUNCT.has(ch)) {
      push('punct', ch, i);
      i++;
      continue;
    }

    // operators: maximal munch over the PG operator-char set
    if (OPERATOR_CHARS.has(ch)) {
      let j = i + 1;
      while (j < n && OPERATOR_CHARS.has(sql[j])) j++;
      let op = sql.slice(i, j);
      // PG rule: a multi-char operator ending in +/- must contain a special
      // char; otherwise strip the trailing +/- (they lex as their own tokens).
      if (op.length > 1 && !OPERATOR_SPECIAL.test(op)) {
        let k = op.length;
        while (k > 1 && (op[k - 1] === '+' || op[k - 1] === '-')) k--;
        op = op.slice(0, k);
      }
      push('operator', op, i);
      i += op.length;
      continue;
    }

    // fallback: emit as-is so nothing is lost
    push('operator', ch, i);
    i++;
  }

  return tokens;
}
