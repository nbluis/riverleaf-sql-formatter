import { Token } from './types';
import { CLAUSE_STARTERS, JOIN_STARTERS, BOOL_CONNECTORS } from './keywords';

export type ClauseKind =
  | 'select'
  | 'from'
  | 'where'
  | 'having'
  | 'list' // group by / order by
  | 'join'
  | 'setop'
  | 'generic';

export interface Clause {
  kind: ClauseKind;
  /** Keyword-phrase tokens (e.g. [left, outer, join], [order, by]). */
  head: Token[];
  /** First keyword word (lowercase) — width used for the river. */
  firstWord: string;
  /** Remaining clause tokens. */
  body: Token[];
}

export interface Statement {
  clauses: Clause[];
  /** Raw statement tokens (for comment detection and source span). */
  tokens: Token[];
  /** Whether there was a ';' at the end of the statement in the source. */
  semicolon: boolean;
}

/** Splits the token list into statements at top-level ';'. */
export function splitStatements(tokens: Token[]): Statement[] {
  const statements: Statement[] = [];
  let depth = 0;
  let current: Token[] = [];

  const flush = (semicolon: boolean): void => {
    if (current.length === 0) return;
    statements.push({ clauses: segmentClauses(current), tokens: current, semicolon });
    current = [];
  };

  for (const tok of tokens) {
    if (tok.type === 'punct' && tok.value === '(') depth++;
    else if (tok.type === 'punct' && tok.value === ')') depth = Math.max(0, depth - 1);

    if (tok.type === 'punct' && tok.value === ';' && depth === 0) {
      flush(true);
      continue;
    }
    current.push(tok);
  }
  flush(false);
  return statements;
}

function isClauseBoundary(tokens: Token[], i: number): number {
  // Returns the number of keyword-phrase tokens if `i` starts a clause; else 0.
  const tok = tokens[i];
  if (tok.type !== 'keyword') return 0;
  const up = tok.upper;

  // GROUP / ORDER only start a clause when followed by BY
  if (up === 'GROUP' || up === 'ORDER') {
    if (tokens[i + 1]?.upper === 'BY') return 2;
    return 0;
  }

  // JOIN starters — avoid confusing the LEFT(...) function
  if (JOIN_STARTERS.has(up)) {
    if (tokens[i + 1]?.type === 'punct' && tokens[i + 1]?.value === '(') return 0;
    // consume the join phrase up to (and including) JOIN
    let j = i;
    let sawJoin = up === 'JOIN' || up === 'STRAIGHT_JOIN';
    while (
      j + 1 < tokens.length &&
      tokens[j + 1].type === 'keyword' &&
      (JOIN_STARTERS.has(tokens[j + 1].upper) || tokens[j + 1].upper === 'OUTER')
    ) {
      j++;
      if (tokens[j].upper === 'JOIN' || tokens[j].upper === 'STRAIGHT_JOIN') sawJoin = true;
    }
    if (!sawJoin) return 0; // e.g. NATURAL without JOIN (unlikely) — ignore
    return j - i + 1;
  }

  if (CLAUSE_STARTERS.has(up)) {
    // UNION ALL
    if (up === 'UNION' && tokens[i + 1]?.upper === 'ALL') return 2;
    return 1;
  }

  return 0;
}

function clauseKind(head: Token[]): ClauseKind {
  const up = head[0].upper;
  if (up === 'SELECT') return 'select';
  if (up === 'FROM') return 'from';
  if (up === 'WHERE') return 'where';
  if (up === 'HAVING') return 'having';
  if (up === 'GROUP' || up === 'ORDER') return 'list';
  if (JOIN_STARTERS.has(up)) return 'join';
  if (up === 'UNION' || up === 'INTERSECT' || up === 'EXCEPT') return 'setop';
  return 'generic';
}

/** Groups a statement's tokens into clauses. */
export function segmentClauses(tokens: Token[]): Clause[] {
  const clauses: Clause[] = [];
  let depth = 0;
  let i = 0;

  // walk tokens up to the first clause, attaching any preamble as generic
  let pending: { head: Token[]; body: Token[] } | null = null;

  const startClause = (headLen: number): void => {
    const head = tokens.slice(i, i + headLen);
    pending = { head, body: [] };
    i += headLen;
  };

  const commit = (): void => {
    if (!pending) return;
    const p = pending as { head: Token[]; body: Token[] };
    clauses.push({
      kind: clauseKind(p.head),
      head: p.head,
      firstWord: p.head[0].value.toLowerCase(),
      body: p.body,
    });
    pending = null;
  };

  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type === 'punct' && tok.value === '(') depth++;
    else if (tok.type === 'punct' && tok.value === ')') depth = Math.max(0, depth - 1);

    const boundary = depth === 0 ? isClauseBoundary(tokens, i) : 0;
    if (boundary > 0) {
      commit();
      startClause(boundary);
      continue;
    }

    if (!pending) {
      // preamble before any recognized clause (e.g. WITH ...):
      // create a generic clause with head = first token.
      pending = { head: [tok], body: [] };
      i++;
      continue;
    }
    (pending as { head: Token[]; body: Token[] }).body.push(tok);
    i++;
  }
  commit();
  return clauses;
}

// ---------------------------------------------------------------------------
// Boolean expressions (WHERE / HAVING / ON)
// ---------------------------------------------------------------------------

export interface BoolTerm {
  /** Connector preceding the term ('and' | 'or'), or null for the first one. */
  connector: 'and' | 'or' | null;
  node: BoolNode;
}

export type BoolNode =
  | { kind: 'atom'; tokens: Token[] }
  | { kind: 'group'; pre: Token[]; inner: BoolTerm[]; post: Token[] };

/** Splits tokens into boolean terms at top-level AND/OR (depth 0). */
function splitTerms(tokens: Token[]): { connector: 'and' | 'or' | null; tokens: Token[] }[] {
  const terms: { connector: 'and' | 'or' | null; tokens: Token[] }[] = [];
  let depth = 0;
  let cur: Token[] = [];
  let connector: 'and' | 'or' | null = null;
  // the AND in BETWEEN ... AND ... is not a boolean connector
  let pendingBetween = 0;

  for (const tok of tokens) {
    if (tok.type === 'punct' && tok.value === '(') depth++;
    else if (tok.type === 'punct' && tok.value === ')') depth = Math.max(0, depth - 1);

    if (depth === 0 && tok.type === 'keyword' && tok.upper === 'BETWEEN') {
      pendingBetween++;
    }

    if (depth === 0 && tok.type === 'keyword' && BOOL_CONNECTORS.has(tok.upper)) {
      if (tok.upper === 'AND' && pendingBetween > 0) {
        pendingBetween--;
        cur.push(tok);
        continue;
      }
      terms.push({ connector, tokens: cur });
      cur = [];
      connector = tok.upper === 'AND' ? 'and' : 'or';
      continue;
    }
    cur.push(tok);
  }
  terms.push({ connector, tokens: cur });
  return terms.filter((t) => t.tokens.length > 0 || t.connector !== null);
}

/** Checks whether the tokens are exactly [NOT?] ( ... ) wrapping everything. */
function asWrappedGroup(tokens: Token[]): { pre: Token[]; inner: Token[]; post: Token[] } | null {
  let start = 0;
  const pre: Token[] = [];
  // allowed prefixes: NOT, EXISTS
  while (
    start < tokens.length &&
    tokens[start].type === 'keyword' &&
    (tokens[start].upper === 'NOT' || tokens[start].upper === 'EXISTS')
  ) {
    pre.push(tokens[start]);
    start++;
  }
  if (tokens[start]?.type !== 'punct' || tokens[start]?.value !== '(') return null;

  // find the ')' matching the '(' at `start`
  let depth = 0;
  let close = -1;
  for (let k = start; k < tokens.length; k++) {
    if (tokens[k].type === 'punct' && tokens[k].value === '(') depth++;
    else if (tokens[k].type === 'punct' && tokens[k].value === ')') {
      depth--;
      if (depth === 0) {
        close = k;
        break;
      }
    }
  }
  if (close === -1) return null;
  const post = tokens.slice(close + 1);
  // it is only a "wrapping" group if there is nothing relevant after the ')'
  if (post.length > 0) return null;
  return { pre, inner: tokens.slice(start + 1, close), post };
}

/** Parses a boolean expression into a list of terms (with nested groups). */
export function parseBoolExpr(tokens: Token[]): BoolTerm[] {
  const rawTerms = splitTerms(tokens);
  return rawTerms.map(({ connector, tokens: t }) => {
    const wrapped = asWrappedGroup(t);
    if (wrapped) {
      const innerTerms = parseBoolExpr(wrapped.inner);
      // only treat as a breakable group if the interior has >1 term (has AND/OR)
      if (innerTerms.length > 1) {
        return {
          connector,
          node: { kind: 'group', pre: wrapped.pre, inner: innerTerms, post: wrapped.post },
        } as BoolTerm;
      }
    }
    return { connector, node: { kind: 'atom', tokens: t } } as BoolTerm;
  });
}

export interface ListItem {
  /** Item tokens (line comments already extracted). */
  tokens: Token[];
  /** Trailing line comment(s) for this item's line, if any. */
  comment?: string;
  /** True if a line comment sits in a position we cannot format safely. */
  unsafe?: boolean;
}

/**
 * Splits a comma-list body into items, extracting line comments as trailing
 * comments. A comment after `X,` belongs to X's line; a comment at the end of
 * an item belongs to that item's line. A line comment in the middle of an item
 * marks it `unsafe` (cannot be reflowed without risk).
 */
export function splitListItems(body: Token[]): ListItem[] {
  const items: ListItem[] = splitCommaList(body).map((tokens) => ({ tokens }));
  for (let k = 0; k < items.length; k++) {
    const item = items[k];

    // leading line comments: they followed the previous item's comma
    const lead: string[] = [];
    while (item.tokens.length > 0 && item.tokens[0].type === 'lineComment') {
      lead.push(item.tokens.shift()!.value);
    }
    if (lead.length > 0) {
      if (k > 0) {
        items[k - 1].comment = [items[k - 1].comment, ...lead].filter(Boolean).join(' ');
      } else {
        item.unsafe = true; // comment before the first item — leave to passthrough
      }
    }

    // trailing line comments belong to this item's line
    const trail: string[] = [];
    while (item.tokens.length > 0 && item.tokens[item.tokens.length - 1].type === 'lineComment') {
      trail.unshift(item.tokens.pop()!.value);
    }
    if (trail.length > 0) {
      item.comment = [item.comment, ...trail].filter(Boolean).join(' ');
    }

    // any remaining line comment is mid-item — not safely reflowable
    if (item.tokens.some((t) => t.type === 'lineComment')) item.unsafe = true;
  }
  return items;
}

/** Splits tokens into a top-level comma-separated list. */
export function splitCommaList(tokens: Token[]): Token[][] {
  const items: Token[][] = [];
  let depth = 0;
  let cur: Token[] = [];
  for (const tok of tokens) {
    if (tok.type === 'punct' && (tok.value === '(' || tok.value === '[')) depth++;
    else if (tok.type === 'punct' && (tok.value === ')' || tok.value === ']')) depth = Math.max(0, depth - 1);
    if (depth === 0 && tok.type === 'punct' && tok.value === ',') {
      items.push(cur);
      cur = [];
      continue;
    }
    cur.push(tok);
  }
  if (cur.length > 0) items.push(cur);
  return items;
}
