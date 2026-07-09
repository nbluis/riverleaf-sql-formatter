import { Token, FormatOptions } from './types';
import { FUNCTION_KEYWORDS } from './keywords';

/** Applies the configured case to a keyword token. */
export function caseKeyword(value: string, options: FormatOptions): string {
  switch (options.keywordCase) {
    case 'lower':
      return value.toLowerCase();
    case 'upper':
      return value.toUpperCase();
    default:
      return value;
  }
}

/** Output text of a single token (applies case to keywords). */
export function tokenText(tok: Token, options: FormatOptions): string {
  if (tok.type === 'keyword') return caseKeyword(tok.value, options);
  return tok.value;
}

/**
 * Decides whether there should be a space between `prev` and `cur`.
 * Canonical spacing rules for SQL on a single line.
 */
function needsSpace(prev: Token, cur: Token): boolean {
  // no space before , ; ) ] .
  if (cur.type === 'punct' && (cur.value === ',' || cur.value === ';' || cur.value === ')' || cur.value === ']' || cur.value === '.')) {
    return false;
  }
  // no space after ( [ .
  if (prev.type === 'punct' && (prev.value === '(' || prev.value === '[' || prev.value === '.')) {
    return false;
  }
  // no space before ( when it is a function call or subscript: ident( / )( / ](
  if (cur.type === 'punct' && cur.value === '(') {
    if (prev.type === 'word' || prev.type === 'string' || prev.type === 'number') return false;
    if (prev.type === 'punct' && (prev.value === ')' || prev.value === ']')) return false;
    // functions whose name is a keyword (coalesce, cast, ...) also take no space
    if (prev.type === 'keyword' && FUNCTION_KEYWORDS.has(prev.upper)) return false;
    // keywords like IN, VALUES, ON, EXISTS, SELECT keep a space before (
    return true;
  }
  // subscript [
  if (cur.type === 'punct' && cur.value === '[') {
    if (prev.type === 'word' || prev.type === 'string' || (prev.type === 'punct' && (prev.value === ')' || prev.value === ']'))) {
      return false;
    }
  }
  // :: cast — no space on either side
  if (cur.type === 'operator' && cur.value === '::') return false;
  if (prev.type === 'operator' && prev.value === '::') return false;
  // -> ->> (json) — no space on either side
  if (cur.type === 'operator' && (cur.value === '->' || cur.value === '->>')) return false;
  if (prev.type === 'operator' && (prev.value === '->' || prev.value === '->>')) return false;
  return true;
}

/** Renders a token sequence on a single line with canonical spacing. */
export function renderTokens(tokens: Token[], options: FormatOptions): string {
  let out = '';
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (k > 0 && needsSpace(tokens[k - 1], tok)) out += ' ';
    out += tokenText(tok, options);
  }
  return out;
}
