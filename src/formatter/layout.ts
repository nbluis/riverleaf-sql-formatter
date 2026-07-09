import { Token, FormatOptions } from './types';
import { renderTokens, caseKeyword } from './render';
import {
  Clause,
  Statement,
  BoolTerm,
  BoolNode,
  parseBoolExpr,
  splitListItems,
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

  private renderBoolRiver(terms: BoolTerm[], connEnd: number, firstLinePrefix: string): string[] {
    const lines: string[] = [];
    // first term (inline within the prefix)
    this.emitTerm(lines, terms[0], firstLinePrefix, firstLinePrefix.length, connEnd);
    // remaining terms: connector right-aligned at connEnd
    for (let i = 1; i < terms.length; i++) {
      const conn = caseConnector(terms[i].connector as 'and' | 'or', this.options);
      const lineStart = connEnd - conn.length;
      const prefix = pad(lineStart) + conn + ' ';
      this.emitTerm(lines, terms[i], prefix, lineStart, connEnd + 1);
    }
    return lines;
  }

  // --- boolean expression: BLOCK mode (connectors left-aligned) ----------
  // Used inside expanded parenthesized groups.

  private renderBoolBlock(terms: BoolTerm[], blockIndent: number): string[] {
    const lines: string[] = [];
    for (const term of terms) {
      const conn = term.connector ? caseConnector(term.connector, this.options) + ' ' : '';
      const prefix = pad(blockIndent) + conn;
      this.emitTerm(lines, term, prefix, blockIndent, blockIndent);
    }
    return lines;
  }

  /**
   * Emits the lines of a term. `prefix` positions the operand; `lineStart` is the
   * column where the line begins (used to align the ')' and indent the group
   * body); `_childCol` is the operand column for a nested group in RIVER mode
   * (unused in BLOCK mode).
   */
  private emitTerm(lines: string[], term: BoolTerm, prefix: string, lineStart: number, _childCol: number): void {
    const node = term.node;
    if (node.kind === 'atom') {
      lines.push(prefix + renderTokens(node.tokens, this.options));
      return;
    }
    // group
    const inline = prefix + this.renderNodeInline(node);
    if (this.fits(inline)) {
      lines.push(inline);
      return;
    }
    // expand group
    const preStr = renderTokens(node.pre, this.options);
    lines.push(prefix + (preStr ? preStr + ' ' : '') + '(');
    const blockIndent = lineStart + this.options.indentSize;
    lines.push(...this.renderBoolBlock(node.inner, blockIndent));
    lines.push(pad(lineStart) + ')');
  }

  // --- clauses -----------------------------------------------------------

  private renderListClause(clause: Clause, leading: number): string[] {
    const headStr = renderTokens(clause.head, this.options);
    const items = splitListItems(clause.body);
    if (items.length === 0) {
      return [pad(leading) + headStr];
    }
    const rendered = items.map((it) => renderTokens(it.tokens, this.options));
    const hasComment = items.some((it) => it.comment);
    const inlineBody = rendered.join(', ');
    const full = pad(leading) + headStr + ' ' + inlineBody;
    // a trailing comment forces a break (it must end its own line)
    if (!hasComment && (items.length === 1 || this.fits(full))) return [full];

    // break: first item on the keyword line, rest aligned, trailing comma,
    // each item's line comment appended after its comma
    const operandCol = leading + headStr.length + 1;
    const n = items.length;
    const commentOf = (i: number): string => (items[i].comment ? ' ' + items[i].comment : '');
    const lines: string[] = [];
    lines.push(pad(leading) + headStr + ' ' + rendered[0] + (n > 1 ? ',' : '') + commentOf(0));
    for (let k = 1; k < n; k++) {
      const suffix = k < n - 1 ? ',' : '';
      lines.push(pad(operandCol) + rendered[k] + suffix + commentOf(k));
    }
    return lines;
  }

  private renderBoolClause(clause: Clause, leading: number, riverEnd: number): string[] {
    const headStr = renderTokens(clause.head, this.options);
    const terms = parseBoolExpr(clause.body);
    const inlineBody = this.renderInlineBool(terms);
    const full = pad(leading) + headStr + ' ' + inlineBody;
    if (terms.length === 1 || this.fits(full)) return [full];

    const firstLinePrefix = pad(leading) + headStr + ' ';
    return this.renderBoolRiver(terms, riverEnd, firstLinePrefix);
  }

  private renderJoinClause(clause: Clause, leading: number): string[] {
    const headStr = renderTokens(clause.head, this.options);
    const onIdx = findOn(clause.body);
    if (onIdx === -1) {
      // no ON (cross join / using / natural): single line
      return [pad(leading) + headStr + (clause.body.length ? ' ' + renderTokens(clause.body, this.options) : '')];
    }
    const tableRef = clause.body.slice(0, onIdx);
    const onTokens = clause.body.slice(onIdx + 1);
    const tableStr = renderTokens(tableRef, this.options);
    const onKw = caseKeyword('on', this.options);
    const headPart = headStr + (tableStr ? ' ' + tableStr : '') + ' ' + onKw;

    const terms = parseBoolExpr(onTokens);
    const inline = pad(leading) + headPart + ' ' + this.renderInlineBool(terms);
    if (terms.length === 1 || this.fits(inline)) return [inline];

    const onRiverEnd = leading + headPart.length; // column right after "on"
    const firstLinePrefix = pad(leading) + headPart + ' ';
    return this.renderBoolRiver(terms, onRiverEnd, firstLinePrefix);
  }

  private renderGenericClause(clause: Clause, leading: number): string[] {
    const all = clause.body.length ? [...clause.head, ...clause.body] : clause.head;
    return [pad(leading) + renderTokens(all, this.options)];
  }

  // --- statement ---------------------------------------------------------

  formatStatement(stmt: Statement, base: number): string[] {
    const clauses = stmt.clauses;
    if (clauses.length === 0) return [];
    const K = clauses.reduce((m, c) => Math.max(m, c.firstWord.length), 0);
    const riverEnd = base + K;

    const lines: string[] = [];
    for (const clause of clauses) {
      const leading = riverEnd - clause.firstWord.length;
      let clauseLines: string[];
      switch (clause.kind) {
        case 'select':
        case 'from':
        case 'list':
          clauseLines = this.renderListClause(clause, leading);
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

    if (stmt.semicolon && lines.length > 0) {
      lines[lines.length - 1] += ';';
    }
    return lines;
  }
}
