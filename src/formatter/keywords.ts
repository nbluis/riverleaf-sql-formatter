// SQL keyword set and clause-anchor classification.

/** Words that start a top-level clause (main river anchors). */
export const CLAUSE_STARTERS: ReadonlySet<string> = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP', // GROUP BY
  'HAVING',
  'ORDER', // ORDER BY
  'LIMIT',
  'OFFSET',
  'FETCH',
  'WINDOW',
  'UNION',
  'INTERSECT',
  'EXCEPT',
  'WITH',
  'VALUES',
  'RETURNING',
  // DML anchors
  'INSERT',
  'UPDATE',
  'DELETE',
  'SET',
]);

/** Words that start a JOIN clause. */
export const JOIN_STARTERS: ReadonlySet<string> = new Set([
  'JOIN',
  'INNER',
  'LEFT',
  'RIGHT',
  'FULL',
  'CROSS',
  'NATURAL',
  'STRAIGHT_JOIN',
]);

/** Boolean connectors that start continuation lines in WHERE/ON. */
export const BOOL_CONNECTORS: ReadonlySet<string> = new Set(['AND', 'OR']);

/**
 * Words that, when following an anchor, complete a multi-word keyword
 * (e.g. ORDER BY, GROUP BY, UNION ALL, LEFT OUTER JOIN).
 */
export const KEYWORD_FOLLOWERS: ReadonlySet<string> = new Set([
  'BY',
  'ALL',
  'OUTER',
  'JOIN',
  'DISTINCT',
]);

/** Broad set of reserved words (for casing and classification). */
export const KEYWORDS: ReadonlySet<string> = new Set([
  ...CLAUSE_STARTERS,
  ...JOIN_STARTERS,
  ...BOOL_CONNECTORS,
  ...KEYWORD_FOLLOWERS,
  'ON',
  'AS',
  'IN',
  'IS',
  'NOT',
  'NULL',
  'LIKE',
  'ILIKE',
  'BETWEEN',
  'EXISTS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'ASC',
  'DESC',
  'USING',
  'LATERAL',
  'DISTINCT',
  'INTO',
  'INSERT',
  'UPDATE',
  'DELETE',
  'SET',
  'CREATE',
  'TABLE',
  'VIEW',
  'INDEX',
  'AND',
  'OR',
  'TRUE',
  'FALSE',
  'CAST',
  'OVER',
  'PARTITION',
  'NULLS',
  'FIRST',
  'LAST',
  'COALESCE',
  'FILTER',
  'WITHIN',
  'GROUPING',
  'ROLLUP',
  'CUBE',
  // Row-locking clause (FOR UPDATE / FOR SHARE / ...) and the WITH ORDINALITY
  // from-item modifier. Kept as keywords for casing; FOR anchors the clause.
  'FOR',
  'OF',
  'NO',
  'KEY',
  'SHARE',
  'NOWAIT',
  'SKIP',
  'LOCKED',
  'ORDINALITY',
  // INSERT ... ON CONFLICT (upsert). CONFLICT is a keyword (not a function) so the
  // conflict target keeps a space before its '('; DO must be a keyword so the
  // segmenter can find the action terminal. EXCLUDED stays an identifier (it reads
  // as a table reference, `excluded.col`, and identifiers are preserved as written).
  'CONFLICT',
  'DO',
  'NOTHING',
  'CONSTRAINT',
]);

/**
 * Keywords that, when followed by '(', are function calls and take no space
 * before the parenthesis (e.g. coalesce(a,b), cast(x as int)).
 */
export const FUNCTION_KEYWORDS: ReadonlySet<string> = new Set([
  'COALESCE',
  'CAST',
  'GROUPING',
  'NULLIF',
]);

export function isKeyword(upper: string): boolean {
  return KEYWORDS.has(upper);
}
