import { Token, FormatOptions } from './types';
import { renderTokens, caseKeyword } from './render';
import {
  Clause,
  Statement,
  BoolTerm,
  BoolNode,
  parseBoolExpr,
  splitListItems,
  splitCommaList,
  segmentClauses,
  findSubquery,
  matchParen,
} from './segmenter';

function pad(n: number): string {
  return ' '.repeat(Math.max(0, n));
}

function caseConnector(conn: 'and' | 'or', options: FormatOptions): string {
  return caseKeyword(conn, options);
}

/** Index of the first top-level ON in a JOIN body (or -1). */
function findOn(tokens: Token[]): number {
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'punct' && t.value === '(') depth++;
    else if (t.type === 'punct' && t.value === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && t.type === 'keyword' && t.upper === 'ON') return i;
  }
  return -1;
}

export class Layout {
  constructor(private options: FormatOptions, private maxWidth: number) {}

  private fits(line: string): boolean {
    return line.length <= this.maxWidth;
  }

  // --- boolean expression: inline rendering ------------------------------

  private renderNodeInline(node: BoolNode): string {
    if (node.kind === 'atom') return renderTokens(node.tokens, this.options);
    const pre = renderTokens(node.pre, this.options);
    return (pre ? pre + ' ' : '') + '(' + this.renderInlineBool(node.inner) + ')';
  }

  private renderInlineBool(terms: BoolTerm[]): string {
    let s = this.renderNodeInline(terms[0].node);
    for (let i = 1; i < terms.length; i++) {
      s += ' ' + caseConnector(terms[i].connector as 'and' | 'or', this.options) + ' ' + this.renderNodeInline(terms[i].node);
    }
    return s;
  }

  // --- boolean expression: RIVER mode (connectors right-aligned) ---------
  // connEnd = the (exclusive) column where connectors align to the right.
  // firstLinePrefix already positions the first operand at connEnd + 1.

  private renderBoolRiver(
    terms: BoolTerm[],
    connEnd: number,
    firstLinePrefix: string,
    expandCase = false,
    expandSubquery = false,
  ): string[] {
    const lines: string[] = [];
    // first term: normally inline within the prefix. But a standalone comment
    // before it forces the keyword onto its own line, dropping the comment and
    // the first operand to the operand column (connEnd + 1).
    if (terms[0].commentsBefore?.length) {
      lines.push(firstLinePrefix.replace(/ +$/, ''));
      const operandCol = connEnd + 1;
      for (const c of terms[0].commentsBefore) lines.push(pad(operandCol) + c);
      this.emitTerm(lines, terms[0], pad(operandCol), operandCol, operandCol, expandCase, expandSubquery);
    } else {
      this.emitTerm(lines, terms[0], firstLinePrefix, firstLinePrefix.length, connEnd, expandCase, expandSubquery);
    }
    this.renderRiverTail(lines, terms, connEnd, 1, expandCase, expandSubquery);
    return lines;
  }

  /**
   * Appends `terms[startIdx..]` to `lines` in RIVER mode: each connector
   * right-aligned so its right edge lands on `connEnd`, operands at `connEnd + 1`.
   */
  private renderRiverTail(
    lines: string[],
    terms: BoolTerm[],
    connEnd: number,
    startIdx: number,
    expandCase = false,
    expandSubquery = false,
  ): void {
    for (let i = startIdx; i < terms.length; i++) {
      // standalone comments sit on their own line at the operand column
      for (const c of terms[i].commentsBefore ?? []) lines.push(pad(connEnd + 1) + c);
      const conn = caseConnector(terms[i].connector as 'and' | 'or', this.options);
      const lineStart = connEnd - conn.length;
      const prefix = pad(lineStart) + conn + ' ';
      this.emitTerm(lines, terms[i], prefix, lineStart, connEnd + 1, expandCase, expandSubquery);
    }
  }

  // --- boolean expression: BLOCK mode (connectors right-aligned, RIVER) --
  // Used inside expanded parenthesized groups. Operands align at blockIndent;
  // connectors are right-aligned so their right edge lands at blockIndent - 1
  // (a secondary river inside the group, matching the top-level where/on style).

  private renderBoolBlock(terms: BoolTerm[], blockIndent: number): string[] {
    const lines: string[] = [];
    const connEnd = blockIndent - 1; // connectors' right edge; operands at blockIndent
    for (const term of terms) {
      // standalone comments sit on their own line, aligned with the operands
      for (const c of term.commentsBefore ?? []) lines.push(pad(blockIndent) + c);
      if (term.connector) {
        const conn = caseConnector(term.connector, this.options);
        const lineStart = connEnd - conn.length;
        const prefix = pad(lineStart) + conn + ' ';
        this.emitTerm(lines, term, prefix, lineStart, blockIndent);
      } else {
        this.emitTerm(lines, term, pad(blockIndent), blockIndent, blockIndent);
      }
    }
    return lines;
  }

  /** Whether a node (only groups can) carries any line comment in its interior. */
  private nodeHasComments(node: BoolNode): boolean {
    if (node.kind === 'atom') return false;
    return node.inner.some(
      (t) => t.comment || t.commentsBefore?.length || this.nodeHasComments(t.node),
    );
  }

  /**
   * Emits the lines of a term. `prefix` positions the operand; `lineStart` is the
   * column where the line begins (used to align the ')' and indent the group
   * body); `_childCol` is the operand column for a nested group in RIVER mode
   * (unused in BLOCK mode).
   */
  private emitTerm(
    lines: string[],
    term: BoolTerm,
    prefix: string,
    lineStart: number,
    _childCol: number,
    expandCase = false,
    expandSubquery = false,
  ): void {
    const node = term.node;
    const suffix = term.comment ? ' ' + term.comment : '';
    if (node.kind === 'atom') {
      // a `case ... end` condition (where/having/join ON) expands at the operand
      // column; anything after the `end` (e.g. `> 100`) rides the `end` line.
      const c = expandCase ? this.parseCase(node.tokens) : null;
      if (c) {
        const caseLines = this.renderCase(c, prefix.length);
        caseLines[caseLines.length - 1] += suffix;
        lines.push(prefix + caseLines[0]);
        for (let i = 1; i < caseLines.length; i++) lines.push(caseLines[i]);
        return;
      }
      // a subquery inside a condition (`... in ( select ... )`) expands with the
      // closing ')' under the line's first word (the connector, via lineStart)
      // and the inner block one level in from it.
      const sub = expandSubquery ? findSubquery(node.tokens) : null;
      if (sub) {
        const before = renderTokens(node.tokens.slice(0, sub.open), this.options);
        const inner = node.tokens.slice(sub.open + 1, sub.close);
        const after = node.tokens.slice(sub.close + 1);
        const afterStr = after.length ? ' ' + renderTokens(after, this.options) : '';
        const blockPrefix = prefix + (before ? before + ' ' : '');
        const blockLines = this.renderSubqueryBlock(blockPrefix, inner, lineStart, afterStr);
        blockLines[blockLines.length - 1] += suffix;
        lines.push(...blockLines);
        return;
      }
      lines.push(prefix + renderTokens(node.tokens, this.options) + suffix);
      return;
    }
    // group — a group only exists when its interior has more than one term
    // (parseBoolExpr), so by the count rule it always expands (never inline).
    const preStr = renderTokens(node.pre, this.options);
    lines.push(prefix + (preStr ? preStr + ' ' : '') + '(');
    const blockIndent = lineStart + this.options.indentSize;
    lines.push(...this.renderBoolBlock(node.inner, blockIndent));
    lines.push(pad(lineStart) + ')' + suffix);
  }

  // --- clauses -----------------------------------------------------------

  private renderListClause(clause: Clause, leading: number): string[] {
    const headStr = renderTokens(clause.head, this.options);
    const items = splitListItems(clause.body);
    if (items.length === 0) {
      return [pad(leading) + headStr];
    }
    const operandCol = leading + headStr.length + 1;
    const rendered = items.map((it) => renderTokens(it.tokens, this.options));
    const hasComment = items.some((it) => it.comment);
    const hasStandalone = items.some((it) => it.commentsBefore?.length);
    // a `case ... end` or a scalar subquery item always expands, so it forces
    // the list to break
    const hasCase = items.some((it) => this.parseCase(it.tokens) !== null);
    const hasSubquery = items.some((it) => this.itemSubquery(it.tokens) !== null);
    // a parenthesized tuple (a VALUES row) that overflows wraps internally, so it
    // forces the list to break even when it is the only item (B2, removed in R3)
    const hasWideTuple = items.some((it) => this.tupleNeedsWrap(it.tokens, operandCol));
    const inlineBody = rendered.join(', ');
    const full = pad(leading) + headStr + ' ' + inlineBody;
    // Break by rule, not by width: a list with more than one item always breaks
    // (one item per line). A single item stays inline (it just grows) unless it
    // owns a comment or expands a `case`/subquery/wide tuple.
    if (
      !hasComment &&
      !hasStandalone &&
      !hasCase &&
      !hasSubquery &&
      !hasWideTuple &&
      items.length === 1
    ) {
      return [full];
    }

    // break: first item on the keyword line, rest aligned, trailing comma,
    // each item's trailing comment after its comma, standalone comments on their
    // own line before the item they precede. An item may span several lines (a
    // `case`): its comma and trailing comment attach to its last line.
    const n = items.length;
    const suffixOf = (i: number): string =>
      (i < n - 1 ? ',' : '') + (items[i].comment ? ' ' + items[i].comment : '');
    const lines: string[] = [];
    const pushItem = (idx: number, firstLinePrefix: string): void => {
      const itemLines = this.renderItemLines(items[idx].tokens, operandCol);
      lines.push(firstLinePrefix + itemLines[0]);
      for (let j = 1; j < itemLines.length; j++) lines.push(itemLines[j]);
      lines[lines.length - 1] += suffixOf(idx);
    };
    // first item: a standalone comment before it forces the head onto its own line
    if (items[0].commentsBefore?.length) {
      lines.push(pad(leading) + headStr);
      for (const c of items[0].commentsBefore) lines.push(pad(operandCol) + c);
      pushItem(0, pad(operandCol));
    } else {
      pushItem(0, pad(leading) + headStr + ' ');
    }
    for (let k = 1; k < n; k++) {
      for (const c of items[k].commentsBefore ?? []) lines.push(pad(operandCol) + c);
      pushItem(k, pad(operandCol));
    }
    return lines;
  }

  // --- case expressions --------------------------------------------------

  /**
   * Renders one list item as lines: a `case ... end` expands; a scalar subquery
   * (the item is `( select ... ) [alias]`) expands at the item column; else one
   * line.
   */
  private renderItemLines(tokens: Token[], caseCol: number): string[] {
    const c = this.parseCase(tokens);
    if (c) return this.renderCase(c, caseCol);
    const sub = this.itemSubquery(tokens);
    if (sub) {
      const inner = tokens.slice(sub.open + 1, sub.close);
      const after = tokens.slice(sub.close + 1);
      const afterStr = after.length ? ' ' + renderTokens(after, this.options) : '';
      return this.renderSubqueryBlock('', inner, caseCol, afterStr);
    }
    // a wide VALUES tuple wraps: values aligned one column past the '(' (the item
    // is placed at caseCol by the caller, so the values land at caseCol + 1).
    if (this.tupleNeedsWrap(tokens, caseCol)) {
      return this.renderTupleBroken(tokens, caseCol + 1);
    }
    return [renderTokens(tokens, this.options)];
  }

  /** A list item that is a parenthesized tuple `( ... )` (a VALUES row). */
  private isTuple(tokens: Token[]): boolean {
    return (
      tokens.length >= 2 &&
      tokens[0].type === 'punct' &&
      tokens[0].value === '(' &&
      matchParen(tokens, 0) === tokens.length - 1
    );
  }

  /** A tuple placed at `col` overflows and has more than one element to wrap. */
  private tupleNeedsWrap(tokens: Token[], col: number): boolean {
    if (!this.isTuple(tokens)) return false;
    if (this.fits(pad(col) + renderTokens(tokens, this.options))) return false;
    return splitCommaList(tokens.slice(1, tokens.length - 1)).length > 1;
  }

  /**
   * Renders a parenthesized comma list broken one element per line, each aligned
   * at `valueCol` (just past the '('), trailing commas, ')' on the last element.
   * Line 0 is `(first,` with no leading pad — the caller positions it.
   */
  private renderTupleBroken(tokens: Token[], valueCol: number): string[] {
    const cols = splitCommaList(tokens.slice(1, tokens.length - 1)).map((c) =>
      renderTokens(c, this.options),
    );
    const lines = ['(' + cols[0] + (cols.length > 1 ? ',' : ')')];
    for (let i = 1; i < cols.length; i++) {
      lines.push(pad(valueCol) + cols[i] + (i === cols.length - 1 ? ')' : ','));
    }
    return lines;
  }

  /**
   * A list item that IS a scalar subquery — `( select|with ... ) [alias]` — so it
   * expands. A subquery merely wrapped in a function (`coalesce((select ...), 0)`)
   * is not: findSubquery only returns a top-level '(' and open !== 0 there.
   */
  private itemSubquery(tokens: Token[]): { open: number; close: number } | null {
    const sub = findSubquery(tokens);
    return sub && sub.open === 0 ? sub : null;
  }

  /**
   * Parses an item that is exactly `case [selector] when ... [else ...] end
   * [alias]`. Returns null if the item does not start with CASE or has no
   * matching END / no branches (then it renders inline).
   */
  private parseCase(
    tokens: Token[],
  ): { selector: Token[]; segments: Token[][]; after: Token[] } | null {
    if (tokens[0]?.type !== 'keyword' || tokens[0].upper !== 'CASE') return null;
    // matching END (case/end nest)
    let depth = 0;
    let endIdx = -1;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'keyword' && t.upper === 'CASE') depth++;
      else if (t.type === 'keyword' && t.upper === 'END') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx === -1) return null;
    const body = tokens.slice(1, endIdx);
    const after = tokens.slice(endIdx + 1);
    // split body into a leading selector + WHEN/ELSE segments, skipping nested
    // case/paren depth so only this case's branches split.
    const selector: Token[] = [];
    const segments: Token[][] = [];
    let cur: Token[] | null = null;
    let cDepth = 0;
    let pDepth = 0;
    for (const t of body) {
      if (t.type === 'punct' && t.value === '(') pDepth++;
      else if (t.type === 'punct' && t.value === ')') pDepth = Math.max(0, pDepth - 1);
      else if (t.type === 'keyword' && t.upper === 'CASE') cDepth++;
      else if (t.type === 'keyword' && t.upper === 'END') cDepth = Math.max(0, cDepth - 1);
      const top = cDepth === 0 && pDepth === 0;
      if (top && t.type === 'keyword' && (t.upper === 'WHEN' || t.upper === 'ELSE')) {
        cur = [t];
        segments.push(cur);
        continue;
      }
      if (cur === null) selector.push(t);
      else cur.push(t);
    }
    if (segments.length === 0) return null;
    return { selector, segments, after };
  }

  /**
   * Renders a parsed case with `case` / each `when`/`else` segment / `end` all
   * aligned at `caseCol`. The first line (`case [selector]`) has no leading pad —
   * the caller positions it.
   */
  private renderCase(
    c: { selector: Token[]; segments: Token[][]; after: Token[] },
    caseCol: number,
  ): string[] {
    const head =
      caseKeyword('case', this.options) +
      (c.selector.length ? ' ' + renderTokens(c.selector, this.options) : '');
    const lines = [head];
    for (const seg of c.segments) lines.push(...this.renderCaseSegment(seg, caseCol));
    const afterStr = c.after.length ? ' ' + renderTokens(c.after, this.options) : '';
    lines.push(pad(caseCol) + caseKeyword('end', this.options) + afterStr);
    return lines;
  }

  /**
   * Renders one `when`/`else` segment at `caseCol`. If the segment's result is
   * itself a `case ... end` (a nested case at paren depth 0, e.g.
   * `when x then case ... end`), it expands recursively at the column where that
   * inner `case` begins on the line; otherwise the segment is one line.
   */
  private renderCaseSegment(seg: Token[], caseCol: number): string[] {
    const nested = this.findNestedCase(seg);
    if (nested) {
      const before = renderTokens(seg.slice(0, nested.index), this.options);
      const prefix = pad(caseCol) + before + ' ';
      const innerLines = this.renderCase(nested.parsed, prefix.length);
      return [prefix + innerLines[0], ...innerLines.slice(1)];
    }
    const single = pad(caseCol) + renderTokens(seg, this.options);
    // A long `when <cond> then <result>` breaks before THEN: `when <cond>` and
    // `then <result>` land on separate lines, both at the case column. (An ELSE
    // segment has no THEN, so it stays inline.)
    if (!this.fits(single) && seg[0]?.type === 'keyword' && seg[0].upper === 'WHEN') {
      const thenIdx = this.findThen(seg);
      if (thenIdx !== -1) {
        return [
          pad(caseCol) + renderTokens(seg.slice(0, thenIdx), this.options),
          pad(caseCol) + renderTokens(seg.slice(thenIdx), this.options),
        ];
      }
    }
    return [single];
  }

  /** Index of the top-level THEN in a WHEN segment (paren/case depth 0), or -1. */
  private findThen(seg: Token[]): number {
    let pDepth = 0;
    let cDepth = 0;
    for (let i = 1; i < seg.length; i++) {
      const t = seg[i];
      if (t.type === 'punct' && t.value === '(') pDepth++;
      else if (t.type === 'punct' && t.value === ')') pDepth = Math.max(0, pDepth - 1);
      else if (t.type === 'keyword' && t.upper === 'CASE') cDepth++;
      else if (t.type === 'keyword' && t.upper === 'END') cDepth = Math.max(0, cDepth - 1);
      else if (pDepth === 0 && cDepth === 0 && t.type === 'keyword' && t.upper === 'THEN') return i;
    }
    return -1;
  }

  /**
   * Finds a nested `case ... end` inside a segment: the first `CASE` keyword at
   * paren depth 0 (skipping the segment's leading WHEN/ELSE) whose slice parses
   * as a complete case. A `case` inside parens (a function) is left inline.
   */
  private findNestedCase(
    seg: Token[],
  ): { index: number; parsed: { selector: Token[]; segments: Token[][]; after: Token[] } } | null {
    let pDepth = 0;
    for (let i = 1; i < seg.length; i++) {
      const t = seg[i];
      if (t.type === 'punct' && t.value === '(') pDepth++;
      else if (t.type === 'punct' && t.value === ')') pDepth = Math.max(0, pDepth - 1);
      else if (pDepth === 0 && t.type === 'keyword' && t.upper === 'CASE') {
        const parsed = this.parseCase(seg.slice(i));
        if (parsed) return { index: i, parsed };
      }
    }
    return null;
  }

  private renderBoolClause(clause: Clause, leading: number, riverEnd: number): string[] {
    const headStr = renderTokens(clause.head, this.options);
    const terms = parseBoolExpr(clause.body);

    // The first condition's atom contains a subquery (`where x in ( select ...
    // )`): expand it, with the ')' aligned under the clause keyword. Any further
    // conditions (and/or) render below the ')'; a subquery in one of those
    // expands too, but with its ')' under its own connector (expandSubquery).
    const first = terms[0];
    if (first.node.kind === 'atom' && !first.comment && !first.commentsBefore?.length) {
      const toks = first.node.tokens;
      const sub = findSubquery(toks);
      if (sub) {
        const before = renderTokens(toks.slice(0, sub.open), this.options);
        const inner = toks.slice(sub.open + 1, sub.close);
        const after = toks.slice(sub.close + 1);
        const afterStr = after.length ? ' ' + renderTokens(after, this.options) : '';
        const prefix = pad(leading) + headStr + ' ' + (before ? before + ' ' : '');
        const lines = this.renderSubqueryBlock(prefix, inner, leading, afterStr);
        this.renderRiverTail(lines, terms, riverEnd, 1, true, true);
        return lines;
      }
    }

    // Break by rule, not by width: more than one condition always breaks (RIVER).
    // A single condition stays inline (a trailing comment rides its line) unless
    // it is a group (always expands, since a group has >1 inner term), or an atom
    // that expands a `case`/subquery.
    const hasGroup = terms.some((t) => t.node.kind === 'group');
    const hasCase = terms.some((t) => t.node.kind === 'atom' && this.parseCase(t.node.tokens) !== null);
    const hasSubquery = terms.some((t) => t.node.kind === 'atom' && findSubquery(t.node.tokens) !== null);
    if (terms.length === 1 && !hasGroup && !hasCase && !hasSubquery) {
      const lastComment = terms[0].comment ? ' ' + terms[0].comment : '';
      return [pad(leading) + headStr + ' ' + this.renderInlineBool(terms) + lastComment];
    }

    const firstLinePrefix = pad(leading) + headStr + ' ';
    return this.renderBoolRiver(terms, riverEnd, firstLinePrefix, true, true);
  }

  private renderJoinClause(clause: Clause, leading: number): string[] {
    const headStr = renderTokens(clause.head, this.options);
    const onIdx = findOn(clause.body);
    const tableRef = onIdx === -1 ? clause.body : clause.body.slice(0, onIdx);
    const onTokens = onIdx === -1 ? [] : clause.body.slice(onIdx + 1);

    // The join table is itself a subquery (`join ( select ... ) alias on ...`):
    // expand it, and put the alias + ON on the closing ')' line.
    const sub = findSubquery(tableRef);
    if (sub && sub.open === 0) {
      const inner = tableRef.slice(sub.open + 1, sub.close);
      const aliasToks = tableRef.slice(sub.close + 1);
      const aliasStr = renderTokens(aliasToks, this.options);
      const aliasPart = aliasStr ? ' ' + aliasStr : '';
      const lines = [
        pad(leading) + headStr + ' (',
        ...this.renderInner(inner, leading + this.options.indentSize),
      ];
      if (onIdx === -1) {
        lines.push(pad(leading) + ')' + aliasPart);
        return lines;
      }
      lines.push(...this.renderOn(onTokens, leading, ')' + aliasPart));
      return lines;
    }

    if (onIdx === -1) {
      // no ON (cross join / using / natural): single line
      return [pad(leading) + headStr + (clause.body.length ? ' ' + renderTokens(clause.body, this.options) : '')];
    }
    const tableStr = renderTokens(tableRef, this.options);
    return this.renderOn(onTokens, leading, headStr + (tableStr ? ' ' + tableStr : ''));
  }

  /**
   * Renders an ON expression after a join head prefix that already sits at
   * `leading` (`beforeOn` is the text before " on", e.g. "join customers c" or
   * ") v"). A single condition stays inline; two or more break with the and/or
   * connectors aligned under a secondary river right after "on".
   */
  private renderOn(onTokens: Token[], leading: number, beforeOn: string): string[] {
    const onKw = caseKeyword('on', this.options);
    const headPart = beforeOn + ' ' + onKw;
    const terms = parseBoolExpr(onTokens);
    // A group / subquery / `case` in an ON condition always expands (forces a break).
    const hasGroup = terms.some((t) => t.node.kind === 'group');
    const hasSubquery = terms.some((t) => t.node.kind === 'atom' && findSubquery(t.node.tokens) !== null);
    const hasCase = terms.some((t) => t.node.kind === 'atom' && this.parseCase(t.node.tokens) !== null);
    // A single ON condition has nothing to align, so it stays inline — unless it
    // is a group or contains a subquery or `case` to expand. Any join with two or
    // more ON conditions always breaks (regardless of width) so the and/or
    // connectors align under the "on".
    if (terms.length === 1 && !hasGroup && !this.nodeHasComments(terms[0].node) && !hasSubquery && !hasCase) {
      const comment = terms[0].comment ? ' ' + terms[0].comment : '';
      return [pad(leading) + headPart + ' ' + this.renderInlineBool(terms) + comment];
    }
    const onRiverEnd = leading + headPart.length; // column right after "on"
    const firstLinePrefix = pad(leading) + headPart + ' ';
    return this.renderBoolRiver(terms, onRiverEnd, firstLinePrefix, true, true);
  }

  private renderGenericClause(clause: Clause, leading: number): string[] {
    const all = clause.body.length ? [...clause.head, ...clause.body] : clause.head;
    return [pad(leading) + renderTokens(all, this.options)];
  }

  /**
   * INSERT INTO ... (col, ...). Unlike a generic clause, the column list keeps a
   * space before its '(' (renderTokens would glue it to the table name as if it
   * were a function call). When the list has more than one column, it breaks by
   * rule (the columns are a list, like a select): each column aligned one past
   * the '(', trailing commas, ')' on the last column.
   */
  private renderInsertClause(clause: Clause, leading: number): string[] {
    const all = clause.body.length ? [...clause.head, ...clause.body] : clause.head;
    const parenIdx = all.findIndex((t) => t.type === 'punct' && t.value === '(');
    if (parenIdx === -1) return [pad(leading) + renderTokens(all, this.options)];
    const before = renderTokens(all.slice(0, parenIdx), this.options);
    const single = pad(leading) + before + ' ' + renderTokens(all.slice(parenIdx), this.options);
    const close = matchParen(all, parenIdx);
    // break a plain column list (nothing after the ')') with more than one column
    if (close === all.length - 1) {
      const cols = splitCommaList(all.slice(parenIdx + 1, close));
      if (cols.length > 1) {
        const prefix = pad(leading) + before + ' ';
        const valueCol = (prefix + '(').length;
        const tupleLines = this.renderTupleBroken(all.slice(parenIdx, close + 1), valueCol);
        tupleLines[0] = prefix + tupleLines[0];
        return tupleLines;
      }
    }
    return [single];
  }

  // --- subqueries / CTEs (recursive) -------------------------------------

  /** Recursively formats subquery tokens as a statement at `innerBase`. */
  private renderInner(innerTokens: Token[], innerBase: number): string[] {
    const { clauses, trailingComments } = segmentClauses(innerTokens);
    const stmt: Statement = {
      clauses,
      tokens: innerTokens,
      semicolon: false,
      trailingComments: trailingComments.length ? trailingComments : undefined,
    };
    return this.formatStatement(stmt, innerBase);
  }

  /**
   * Emits an expanded subquery block:
   *   <prefix>(
   *     <inner formatted at ownerLeading + indentSize>
   *   )<afterStr>
   * The closing ')' aligns under the owner clause keyword (`ownerLeading`).
   */
  private renderSubqueryBlock(
    prefix: string,
    innerTokens: Token[],
    ownerLeading: number,
    afterStr: string,
  ): string[] {
    const innerBase = ownerLeading + this.options.indentSize;
    return [
      prefix + '(',
      ...this.renderInner(innerTokens, innerBase),
      pad(ownerLeading) + ')' + afterStr,
    ];
  }

  private renderFromClause(clause: Clause, leading: number): string[] {
    const sub = findSubquery(clause.body);
    // only expand when the whole from body is a single parenthesized subquery
    // (`from ( select ... ) alias`); anything else stays a list.
    if (sub && sub.open === 0) {
      const headStr = renderTokens(clause.head, this.options);
      const inner = clause.body.slice(sub.open + 1, sub.close);
      const after = clause.body.slice(sub.close + 1);
      const afterStr = after.length ? ' ' + renderTokens(after, this.options) : '';
      return this.renderSubqueryBlock(pad(leading) + headStr + ' ', inner, leading, afterStr);
    }
    return this.renderListClause(clause, leading);
  }

  private renderCteClause(clause: Clause, leading: number): string[] {
    // Split the WITH body into comma-separated CTEs. Each must be
    // `name as ( select|with ... )` to expand; otherwise fall back to the
    // generic one-liner (e.g. a VALUES-based CTE, or an unparenthesized body).
    const items = splitCommaList(clause.body);
    const parsed = items.map((toks) => {
      const sub = findSubquery(toks);
      return sub ? { toks, sub } : null;
    });
    if (items.length === 0 || parsed.some((p) => p === null)) {
      return this.renderGenericClause(clause, leading);
    }
    const headStr = renderTokens(clause.head, this.options);
    const lines: string[] = [];
    for (let k = 0; k < parsed.length; k++) {
      const { toks, sub } = parsed[k]!;
      const before = renderTokens(toks.slice(0, sub.open), this.options);
      const inner = toks.slice(sub.open + 1, sub.close);
      const rest = toks.slice(sub.close + 1);
      const restStr = rest.length ? ' ' + renderTokens(rest, this.options) : '';
      // trailing comma after every CTE except the last, right after its ')'
      const afterStr = restStr + (k < parsed.length - 1 ? ',' : '');
      // The first CTE carries the `with` head; every subsequent CTE recedes to
      // the `with` column (leading) with just `name as`. Each ')' aligns under
      // the `with` (ownerLeading = leading).
      const prefix =
        k === 0
          ? pad(leading) + headStr + (before ? ' ' + before : '') + ' '
          : pad(leading) + before + ' ';
      lines.push(...this.renderSubqueryBlock(prefix, inner, leading, afterStr));
    }
    return lines;
  }

  // --- statement ---------------------------------------------------------

  formatStatement(stmt: Statement, base: number): string[] {
    const clauses = stmt.clauses;
    const lines: string[] = [];

    if (clauses.length === 0) {
      // statement with no clauses (e.g. only comments) — render at the base column
      for (const c of stmt.trailingComments ?? []) lines.push(pad(base) + c);
      return lines;
    }

    const K = clauses.reduce((m, c) => Math.max(m, c.firstWord.length), 0);
    const riverEnd = base + K;
    // clause-level standalone comments sit at the content column (just past the
    // river, where clause arguments and list items start); leading comments
    // (before the first clause) sit at the base margin.
    const commentCol = riverEnd + 1;

    for (let idx = 0; idx < clauses.length; idx++) {
      const clause = clauses[idx];
      const leading = riverEnd - clause.firstWord.length;
      const col = idx === 0 ? base : commentCol;
      // standalone comments preceding this clause
      for (const c of clause.commentsBefore ?? []) lines.push(pad(col) + c);
      let clauseLines: string[];
      switch (clause.kind) {
        case 'select':
        case 'list':
          clauseLines = this.renderListClause(clause, leading);
          break;
        case 'from':
          clauseLines = this.renderFromClause(clause, leading);
          break;
        case 'cte':
          clauseLines = this.renderCteClause(clause, leading);
          break;
        case 'set':
        case 'values':
          // DML lists behave like any other list now: one item per line when
          // there is more than one (a single assignment / tuple stays inline).
          clauseLines = this.renderListClause(clause, leading);
          break;
        case 'insert':
          clauseLines = this.renderInsertClause(clause, leading);
          break;
        case 'where':
        case 'having':
          clauseLines = this.renderBoolClause(clause, leading, riverEnd);
          break;
        case 'join':
          clauseLines = this.renderJoinClause(clause, leading);
          break;
        default:
          clauseLines = this.renderGenericClause(clause, leading);
          break;
      }
      lines.push(...clauseLines);
    }

    // ';' goes on the last code line, before any trailing comments
    if (stmt.semicolon && lines.length > 0) {
      lines[lines.length - 1] += ';';
    }
    // statement-trailing standalone comments sit at the content column
    for (const c of stmt.trailingComments ?? []) lines.push(pad(commentCol) + c);
    return lines;
  }
}
