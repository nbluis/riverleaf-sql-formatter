import { FormatOptions, DEFAULT_OPTIONS, Token } from './types';
import { tokenize } from './tokenizer';
import { splitStatements, splitListItems, boolCommentsReflowable, Statement } from './segmenter';
import { Layout } from './layout';

export { FormatOptions, DEFAULT_OPTIONS } from './types';

/** Indentation (in spaces) of the first non-empty line, expanding tabs. */
function detectBaseIndent(sql: string, indentSize: number): number {
  const lines = sql.split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    let width = 0;
    for (const ch of line) {
      if (ch === ' ') width++;
      else if (ch === '\t') width += indentSize;
      else break;
    }
    return width;
  }
  return 0;
}

/**
 * Formats a SQL script in the river alignment style.
 * Always uses spaces; never tabs.
 */
export function format(sql: string, options: Partial<FormatOptions> = {}): string {
  const opts: FormatOptions = { ...DEFAULT_OPTIONS, ...options };
  if (sql.trim() === '') return '';

  const base = detectBaseIndent(sql, opts.indentSize);
  const tokens = tokenize(sql);
  const statements = splitStatements(tokens);
  const layout = new Layout(opts, opts.maxLineLength);

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
 * A line comment is safe to reformat only when it is a trailing comment of a
 * comma-list item (select/from/group by/order by) or the last token of any
 * other clause. Anything else falls back to passthrough.
 */
function isCommentSafe(stmt: Statement): boolean {
  for (const clause of stmt.clauses) {
    if (clause.kind === 'select' || clause.kind === 'from' || clause.kind === 'list') {
      if (splitListItems(clause.body).some((it) => it.unsafe)) return false;
    } else if (clause.kind === 'where' || clause.kind === 'having') {
      // reflowable when every comment inline-trails a top-level boolean term
      if (!boolCommentsReflowable(clause.body)) return false;
    } else if (clause.kind === 'join') {
      // reflowable when the ON expression's comments sit at term boundaries and
      // the table-ref part (before ON) carries no comment.
      const onIdx = findTopLevelOn(clause.body);
      if (onIdx === -1) {
        if (clause.body.slice(0, -1).some((t) => t.type === 'lineComment')) return false;
      } else {
        if (clause.body.slice(0, onIdx).some((t) => t.type === 'lineComment')) return false;
        if (!boolCommentsReflowable(clause.body.slice(onIdx + 1))) return false;
      }
    } else {
      // generic / set ops: only a comment as the last body token is safe
      const b = clause.body;
      for (let i = 0; i < b.length - 1; i++) {
        if (b[i].type === 'lineComment') return false;
      }
    }
  }
  return true;
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
