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
  | 'cte' // WITH name AS ( ... )
  | 'insert' // INSERT INTO ... (col list)
  | 'set' // UPDATE ... SET (assignment list, one per line)
  | 'values' // VALUES (tuple list, one per line)
  | 'generic';

export interface Clause {
  kind: ClauseKind;
  /** Keyword-phrase tokens (e.g. [left, outer, join], [order, by]). */
  head: Token[];
  /** First keyword word (lowercase) — width used for the river. */
  firstWord: string;
  /** Remaining clause tokens. */
  body: Token[];
  /** Standalone line comments rendered on their own lines before this clause. */
  commentsBefore?: string[];
}

export interface Statement {
  clauses: Clause[];
  /** Raw statement tokens (for comment detection and source span). */
  tokens: Token[];
  /** Whether there was a ';' at the end of the statement in the source. */
  semicolon: boolean;
  /** Standalone line comments after the last clause (own lines). */
  trailingComments?: string[];
}

/** Index of the ')' matching the '(' at `open` (or -1). */
export function matchParen(tokens: Token[], open: number): number {
  let depth = 0;
  for (let j = open; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.type === 'punct' && t.value === '(') depth++;
    else if (t.type === 'punct' && t.value === ')') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/** First top-level '(' whose interior begins a subquery (SELECT / WITH). */
export function findSubquery(tokens: Token[]): { open: number; close: number } | null {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'punct' && t.value === '(') {
      if (depth === 0) {
        const next = tokens[i + 1];
        if (next?.type === 'keyword' && (next.upper === 'SELECT' || next.upper === 'WITH')) {
          const close = matchParen(tokens, i);
          if (close !== -1) return { open: i, close };
        }
      }
      depth++;
    } else if (t.type === 'punct' && t.value === ')') {
      depth = Math.max(0, depth - 1);
    }
  }
  return null;
}

/** Splits the token list into statements at top-level ';'. */
export function splitStatements(tokens: Token[]): Statement[] {
  const statements: Statement[] = [];
  let depth = 0;
  let current: Token[] = [];

  const flush = (semicolon: boolean): void => {
    if (current.length === 0) return;
    const { clauses, trailingComments } = segmentClauses(current);
    statements.push({
      clauses,
      tokens: current,
      semicolon,
      trailingComments: trailingComments.length ? trailingComments : undefined,
    });
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
    // A join keyword immediately followed by '(' is normally a function call
    // (e.g. LEFT(str, n)), not a join — unless the parenthesis opens a subquery
    // (`join ( select ... )`), a join whose table is itself a subquery.
    if (tokens[i + 1]?.type === 'punct' && tokens[i + 1]?.value === '(') {
      const inner = tokens[i + 2];
      const opensSubquery =
        inner?.type === 'keyword' && (inner.upper === 'SELECT' || inner.upper === 'WITH');
      if (!opensSubquery) return 0;
    }
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
    // DELETE FROM — keep the FROM in the head so it reads "delete from t"
    if (up === 'DELETE' && tokens[i + 1]?.upper === 'FROM') return 2;
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
  if (up === 'WITH') return 'cte';
  if (up === 'INSERT') return 'insert';
  if (up === 'SET') return 'set';
  if (up === 'VALUES') return 'values';
  return 'generic';
}

/** Removes trailing standalone line comments from `body`, returning their text in order. */
function takeTrailingStandaloneComments(body: Token[]): string[] {
  const out: string[] = [];
  while (body.length > 0) {
    const last = body[body.length - 1];
    if (last.type === 'lineComment' && last.newlineBefore) {
      out.unshift(body.pop()!.value);
    } else {
      break;
    }
  }
  return out;
}

/**
 * Groups a statement's tokens into clauses. Standalone line comments (alone on
 * their line) are lifted out of the token stream: leading ones and those between
 * clauses become the following clause's `commentsBefore`; any after the last
 * clause are returned as the statement's `trailingComments`. This keeps them on
 * their own line and stops them from polluting the river width.
 */
export function segmentClauses(tokens: Token[]): { clauses: Clause[]; trailingComments: string[] } {
  const clauses: Clause[] = [];
  let depth = 0;
  let i = 0;

  // walk tokens up to the first clause, attaching any preamble as generic
  let pending: { head: Token[]; body: Token[] } | null = null;
  // standalone comments waiting to attach to the next clause (or, at the end,
  // to be returned as the statement's trailing comments)
  let carry: string[] = [];

  const startClause = (headLen: number): void => {
    const head = tokens.slice(i, i + headLen);
    pending = { head, body: [] };
    i += headLen;
  };

  const commit = (): void => {
    if (!pending) return;
    const p = pending as { head: Token[]; body: Token[] };
    const trailing = takeTrailingStandaloneComments(p.body);
    clauses.push({
      kind: clauseKind(p.head),
      head: p.head,
      firstWord: p.head[0].value.toLowerCase(),
      body: p.body,
      commentsBefore: carry.length ? carry : undefined,
    });
    carry = trailing;
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
      // Before any clause: a standalone line comment is a leading comment of the
      // first clause (carried forward); anything else starts a preamble (e.g.
      // WITH ...) rendered as a generic clause.
      if (tok.type === 'lineComment' && tok.newlineBefore) {
        carry.push(tok.value);
        i++;
        continue;
      }
      pending = { head: [tok], body: [] };
      i++;
      continue;
    }
    (pending as { head: Token[]; body: Token[] }).body.push(tok);
    i++;
  }
  commit();
  return { clauses, trailingComments: carry };
}

// ---------------------------------------------------------------------------
// Boolean expressions (WHERE / HAVING / ON)
// ---------------------------------------------------------------------------

export interface BoolTerm {
  /** Connector preceding the term ('and' | 'or'), or null for the first one. */
  connector: 'and' | 'or' | null;
  node: BoolNode;
  /** Inline trailing line comment for this term's line, if any. */
  comment?: string;
  /** Standalone comments rendered on their own lines above this term. */
  commentsBefore?: string[];
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

interface ProcessedTerm {
  connector: 'and' | 'or' | null;
  /** Term tokens with boundary comments removed. */
  tokens: Token[];
  /** Inline comment trailing this term's line. */
  comment?: string;
  /** Standalone comments to render on their own lines above this term. */
  commentsBefore?: string[];
}

/**
 * Splits a boolean body into top-level terms and lifts out their line comments.
 * An inline comment trailing a term stays as that term's `comment`; a standalone
 * comment (alone on its line) between two terms becomes the following term's
 * `commentsBefore`. `safe` is false for any comment we cannot place cleanly —
 * mid-term, inside a group, a standalone before the first (inline) term, or an
 * inline comment right after a connector — in which case the caller passes the
 * statement through unchanged.
 */
function processRawTerms(tokens: Token[]): { terms: ProcessedTerm[]; safe: boolean } {
  const terms: ProcessedTerm[] = splitTerms(tokens).map((r) => ({
    connector: r.connector,
    tokens: r.tokens.slice(),
  }));
  let safe = true;

  for (let k = 0; k < terms.length; k++) {
    const term = terms[k];
    const tk = term.tokens;

    // leading comments (a comment that followed the connector, or a standalone
    // comment before the very first term — placed above the term on its own line)
    while (tk.length > 0 && tk[0].type === 'lineComment') {
      const c = tk.shift()!;
      if (c.newlineBefore) {
        (term.commentsBefore ??= []).push(c.value);
      } else {
        safe = false; // inline after a connector (or after the where/having keyword)
      }
    }

    // trailing comments: inline stays on this line, standalone floats above the next term
    const inline: string[] = [];
    const standalone: string[] = [];
    while (tk.length > 0 && tk[tk.length - 1].type === 'lineComment') {
      const c = tk.pop()!;
      if (c.newlineBefore) standalone.unshift(c.value);
      else inline.unshift(c.value);
    }
    if (inline.length > 0) term.comment = [term.comment, ...inline].filter(Boolean).join(' ');
    if (standalone.length > 0) {
      if (k + 1 < terms.length) {
        const next = terms[k + 1];
        next.commentsBefore = [...standalone, ...(next.commentsBefore ?? [])];
      } else {
        safe = false; // trailing standalone on the last term (should have been lifted out)
      }
    }

    // A comment left in the middle of the term cannot be reflowed — unless the
    // term is a wrapped parenthesized group whose interior comments are
    // themselves reflowable. In that case parseBoolExpr recurses into the group
    // and renderBoolBlock places the comments, so it is safe.
    if (tk.some((x) => x.type === 'lineComment')) {
      const wrapped = asWrappedGroup(tk);
      const innerReflowable =
        wrapped !== null &&
        splitTerms(wrapped.inner).length > 1 &&
        processRawTerms(wrapped.inner).safe;
      if (!innerReflowable) safe = false;
    }
  }

  return { terms, safe };
}

/** Parses a boolean expression into a list of terms (with nested groups). */
export function parseBoolExpr(tokens: Token[]): BoolTerm[] {
  const { terms } = processRawTerms(tokens);
  return terms.map(({ connector, tokens: t, comment, commentsBefore }) => {
    const wrapped = asWrappedGroup(t);
    if (wrapped) {
      const innerTerms = parseBoolExpr(wrapped.inner);
      // only treat as a breakable group if the interior has >1 term (has AND/OR)
      if (innerTerms.length > 1) {
        return {
          connector,
          node: { kind: 'group', pre: wrapped.pre, inner: innerTerms, post: wrapped.post },
          comment,
          commentsBefore,
        } as BoolTerm;
      }
    }
    return { connector, node: { kind: 'atom', tokens: t }, comment, commentsBefore } as BoolTerm;
  });
}

/**
 * Whether every line comment in a boolean body (WHERE / HAVING) sits at a
 * top-level term boundary (inline-trailing or standalone-between-terms). Mid-term
 * or in-group comments return false (the statement is passed through).
 */
export function boolCommentsReflowable(tokens: Token[]): boolean {
  return processRawTerms(tokens).safe;
}

export interface ListItem {
  /** Item tokens (line comments already extracted). */
  tokens: Token[];
  /** Inline trailing line comment(s) for this item's line, if any. */
  comment?: string;
  /** Standalone line comment(s) rendered on their own lines before this item. */
  commentsBefore?: string[];
  /** True if a line comment sits in a position we cannot format safely. */
  unsafe?: boolean;
}

/**
 * Splits a comma-list body into items, extracting line comments. A comment on
 * its own line (standalone) becomes the following item's `commentsBefore` (kept
 * on its own line). An inline comment after `X,` or at the end of an item stays
 * as that item's trailing `comment`. A line comment in the middle of an item
 * marks it `unsafe` (cannot be reflowed without risk).
 */
export function splitListItems(body: Token[]): ListItem[] {
  const items: ListItem[] = splitCommaList(body).map((tokens) => ({ tokens }));
  for (let k = 0; k < items.length; k++) {
    const item = items[k];

    // leading line comments precede this item in the source
    while (item.tokens.length > 0 && item.tokens[0].type === 'lineComment') {
      const c = item.tokens.shift()!;
      if (c.newlineBefore) {
        // standalone: keep it on its own line before this item
        (item.commentsBefore ??= []).push(c.value);
      } else if (k > 0) {
        // inline: it trailed the previous item's comma on the same line
        items[k - 1].comment = [items[k - 1].comment, c.value].filter(Boolean).join(' ');
      } else {
        item.unsafe = true; // inline comment before the very first item
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
