import { FormatOptions, DEFAULT_OPTIONS, Token } from './types';
import { tokenize } from './tokenizer';
import {
  splitStatements,
  splitListItems,
  splitCommaList,
  boolCommentsReflowable,
  findSubquery,
  findDerivedSubquery,
  findAnyDepthSubquery,
  findWrappedSubquery,
  segmentClauses,
  Clause,
  Statement,
} from './segmenter';
import { Layout } from './layout';

export { FormatOptions, DEFAULT_OPTIONS } from './types';

/**
 * Formats a SQL script in the river alignment style.
 * Always uses spaces; never tabs.
 */
export function format(sql: string, options: Partial<FormatOptions> = {}): string {
  const opts: FormatOptions = { ...DEFAULT_OPTIONS, ...options };
  if (sql.trim() === '') return '';

  // The output always starts at column 0 (D2): the query is normalized to the
  // left margin regardless of where it sat in the source. The widest clause head
  // (the river's leftmost word) lands at column 0, so the result round trips
  // (reformatting a formatted query keeps it at column 0). Inner subquery blocks
  // are still indented one level in, recursively.
  const base = 0;
  const tokens = tokenize(sql);
  const statements = splitStatements(tokens);
  const layout = new Layout(opts);

  const blocks: string[] = [];
  for (const stmt of statements) {
    if (!isCommentSafe(stmt)) {
      // Line comment in a position we cannot reflow safely: reformatting could
      // comment out code when lines are joined. Keep the original slice intact.
      blocks.push(originalSlice(sql, stmt));
      continue;
    }
    const lines = layout.formatStatement(stmt, base);
    if (lines.length === 0) continue;
    const text = lines.join('\n');
    // A trailing comment-only unit (comments after the final ';') glues under the
    // previous statement instead of becoming its own blank-line-separated block.
    if (stmt.clauses.length === 0 && blocks.length > 0) {
      blocks[blocks.length - 1] += '\n' + text;
    } else {
      blocks.push(text);
    }
  }

  return blocks.join('\n\n') + '\n';
}

/**
 * Whether a statement's line comments can all be reflowed safely. A comment that
 * sits *inside a subquery we will expand* is checked recursively (the recursion
 * places it); a comment we cannot place cleanly makes the whole statement pass
 * through unchanged. Because this gate recurses into every subquery we expand, a
 * formatted inner block never carries an unsafe comment.
 */
function isCommentSafe(stmt: Statement): boolean {
  return clausesCommentsSafe(stmt.clauses);
}

function clausesCommentsSafe(clauses: Clause[]): boolean {
  return clauses.every(clauseCommentsSafe);
}

function clauseCommentsSafe(clause: Clause): boolean {
  switch (clause.kind) {
    case 'select':
    case 'list':
      return listCommentsSafe(clause.body);
    case 'from':
      return fromCommentsSafe(clause.body);
    case 'cte':
      return cteCommentsSafe(clause.body);
    case 'where':
    case 'having':
      return whereCommentsSafe(clause.body);
    case 'join':
      return joinCommentsSafe(clause.body);
    default:
      // generic / set ops: only a comment as the last body token is safe
      return lastTokenOnlyComment(clause.body);
  }
}

function hasLineComment(tokens: Token[]): boolean {
  return tokens.some((t) => t.type === 'lineComment');
}

function lastTokenOnlyComment(body: Token[]): boolean {
  for (let i = 0; i < body.length - 1; i++) {
    if (body[i].type === 'lineComment') return false;
  }
  return true;
}

/** Recurses into a subquery's interior tokens (formatted as its own statement). */
function innerCommentsSafe(inner: Token[]): boolean {
  return clausesCommentsSafe(segmentClauses(inner).clauses);
}

/** select / group by / order by list: a comment inside an expanded subquery item
 * — a bare/lateral derived subquery, or one wrapped in a function call
 * (`coalesce((select -- c ...), 0)`) — is checked recursively; the rest of the
 * item must be comment-free, and anything else must be at a boundary. */
function listCommentsSafe(body: Token[]): boolean {
  for (const item of splitListItems(body)) {
    if (!item.unsafe) continue;
    const sub = findDerivedSubquery(item.tokens) ?? findWrappedSubquery(item.tokens);
    if (
      sub &&
      !hasLineComment(item.tokens.slice(0, sub.open)) &&
      !hasLineComment(item.tokens.slice(sub.close + 1)) &&
      innerCommentsSafe(item.tokens.slice(sub.open + 1, sub.close))
    ) {
      continue;
    }
    return false;
  }
  return true;
}

/** from ( subquery ) alias (or from lateral ( ... ) alias): recurse into the
 * subquery; else treat as a list. */
function fromCommentsSafe(body: Token[]): boolean {
  const sub = findDerivedSubquery(body);
  if (sub) {
    if (hasLineComment(body.slice(sub.close + 1))) return false; // alias part
    return innerCommentsSafe(body.slice(sub.open + 1, sub.close));
  }
  return listCommentsSafe(body);
}

/** with a as ( ... ), b as ( ... ): every CTE that expands is recursed into
 * (the "name as" and any trailing part must be comment-free); if any CTE is not
 * an expandable subquery, fall back to the last-token rule. Mirrors the layout's
 * expansion condition (renderCteClause) exactly. */
function cteCommentsSafe(body: Token[]): boolean {
  const items = splitCommaList(body);
  const subs = items.map((toks) => findSubquery(toks));
  if (items.length > 0 && subs.every((s) => s !== null)) {
    for (let k = 0; k < items.length; k++) {
      const toks = items[k];
      const sub = subs[k]!;
      if (hasLineComment(toks.slice(0, sub.open))) return false; // "name as"
      if (hasLineComment(toks.slice(sub.close + 1))) return false; // after ')'
      if (!innerCommentsSafe(toks.slice(sub.open + 1, sub.close))) return false;
    }
    return true;
  }
  return lastTokenOnlyComment(body);
}

/**
 * A boolean expression body (where / having / join ON) is comment-safe when
 * every comment is either at a top-level term boundary (`boolCommentsReflowable`
 * once each expandable subquery's interior is blanked out) or inside one of those
 * subqueries — which the layout expands in any condition (first or not), so its
 * interior is checked recursively. Mirrors `emitTerm`'s subquery expansion.
 */
function boolExprCommentsSafe(body: Token[]): boolean {
  return boolCommentsReflowable(blankAllSubqueries(body)) && subqueryInteriorsSafe(body);
}

/** Blanks the interior of every subquery in `body` (at any depth, so a
 * function-wrapped one — which the layout also expands — is blanked too). */
function blankAllSubqueries(body: Token[]): Token[] {
  let toks = body;
  for (let sub = findAnyDepthSubquery(toks); sub; sub = findAnyDepthSubquery(toks)) {
    toks = [...toks.slice(0, sub.open + 1), ...toks.slice(sub.close)];
  }
  return toks;
}

/** Every subquery interior in `body` (at any depth) is itself comment-safe. */
function subqueryInteriorsSafe(body: Token[]): boolean {
  let toks = body;
  for (let sub = findAnyDepthSubquery(toks); sub; sub = findAnyDepthSubquery(toks)) {
    if (!innerCommentsSafe(toks.slice(sub.open + 1, sub.close))) return false;
    toks = [...toks.slice(0, sub.open + 1), ...toks.slice(sub.close)];
  }
  return true;
}

/** where / having: reflowable boundaries, plus comments inside any expanded
 * condition-subquery (checked recursively). */
function whereCommentsSafe(body: Token[]): boolean {
  return boolExprCommentsSafe(body);
}

/** join: a subquery table (recurse) plus a reflowable ON (ON subqueries expand);
 * else the old rule (table-ref comment-free, ON reflowable). */
function joinCommentsSafe(body: Token[]): boolean {
  const onIdx = findTopLevelOn(body);
  const tableRef = onIdx === -1 ? body : body.slice(0, onIdx);
  const onPart = onIdx === -1 ? [] : body.slice(onIdx + 1);
  const sub = findDerivedSubquery(tableRef);
  if (sub) {
    if (hasLineComment(tableRef.slice(sub.close + 1))) return false; // alias
    if (!innerCommentsSafe(tableRef.slice(sub.open + 1, sub.close))) return false;
    return onIdx === -1 || boolExprCommentsSafe(onPart);
  }
  if (onIdx === -1) return lastTokenOnlyComment(body);
  if (hasLineComment(tableRef)) return false;
  return boolExprCommentsSafe(onPart);
}

/** Index of the first top-level ON in a JOIN body (or -1). */
function findTopLevelOn(tokens: Token[]): number {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'punct' && t.value === '(') depth++;
    else if (t.type === 'punct' && t.value === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && t.type === 'keyword' && t.upper === 'ON') return i;
  }
  return -1;
}

/** Original statement slice (for passthrough), unchanged. */
function originalSlice(sql: string, stmt: Statement): string {
  const t = stmt.tokens;
  const raw = sql.slice(t[0].start, t[t.length - 1].end);
  const text = raw.replace(/[ \t]+$/gm, '');
  return stmt.semicolon ? text + ';' : text;
}
