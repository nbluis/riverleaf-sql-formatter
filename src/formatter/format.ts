import { FormatOptions, DEFAULT_OPTIONS } from './types';
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
    } else {
      // join / generic / set ops: only a comment as the last body token is safe
      const b = clause.body;
      for (let i = 0; i < b.length - 1; i++) {
        if (b[i].type === 'lineComment') return false;
      }
    }
  }
  return true;
}

/** Original statement slice (for passthrough), unchanged. */
function originalSlice(sql: string, stmt: Statement): string {
  const t = stmt.tokens;
  const raw = sql.slice(t[0].start, t[t.length - 1].end);
  const text = raw.replace(/[ \t]+$/gm, '');
  return stmt.semicolon ? text + ';' : text;
}
