import { Token } from './types';
import { isKeyword } from './keywords';

const MULTI_CHAR_OPERATORS = [
  '->>',
  '->',
  '<=',
  '>=',
  '<>',
  '!=',
  '||',
  '::',
  ':=',
  '=>',
];

const SINGLE_CHAR_OPERATORS = new Set([
  '=',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '~',
  '&',
  '|',
  '@',
  '#',
  '!',
]);

const PUNCT = new Set(['(', ')', ',', ';', '.', '[', ']']);

function isWordStart(ch: string): boolean {
  return /[A-Za-z_@#$]/.test(ch);
}

function isWordPart(ch: string): boolean {
  return /[A-Za-z0-9_@#$]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/** Splits SQL into tokens, discarding whitespace but preserving comments/strings. */
export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = sql.length;

  const push = (type: Token['type'], value: string, start: number): void => {
    tokens.push({ type, value, upper: value.toUpperCase(), start, end: start + value.length });
  };

  while (i < n) {
    const ch = sql[i];

    // whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f') {
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

    // multi-char operators
    let matchedOp = '';
    for (const op of MULTI_CHAR_OPERATORS) {
      if (sql.startsWith(op, i)) {
        matchedOp = op;
        break;
      }
    }
    if (matchedOp) {
      push('operator', matchedOp, i);
      i += matchedOp.length;
      continue;
    }

    // punctuation
    if (PUNCT.has(ch)) {
      push('punct', ch, i);
      i++;
      continue;
    }

    // single-char operators
    if (SINGLE_CHAR_OPERATORS.has(ch)) {
      push('operator', ch, i);
      i++;
      continue;
    }

    // fallback: emit as-is so nothing is lost
    push('operator', ch, i);
    i++;
  }

  return tokens;
}
