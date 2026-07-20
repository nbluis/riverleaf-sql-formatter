export type TokenType =
  | 'keyword'
  | 'word' // identifier or unrecognized bareword
  | 'number'
  | 'string' // quoted literal or quoted identifier
  | 'operator'
  | 'punct' // ( ) , ; .
  | 'lineComment'
  | 'blockComment';

export interface Token {
  type: TokenType;
  /** Raw text as it should be emitted (keywords may be re-cased later). */
  value: string;
  /** Uppercased value for keyword matching (only meaningful for keyword/word). */
  upper: string;
  /** Start offset in the source text. */
  start: number;
  /** End offset (exclusive) in the source text. */
  end: number;
  /**
   * True when a newline separates this token from the previous one (or it is the
   * first token). Distinguishes a standalone line comment (alone on its line)
   * from an inline one that trails code on the same physical line.
   */
  newlineBefore: boolean;
}

export type KeywordCase = 'lower' | 'upper' | 'preserve';

export interface FormatOptions {
  keywordCase: KeywordCase;
  /** Spaces per nesting level (parentheses / subqueries). */
  indentSize: number;
}

export const DEFAULT_OPTIONS: FormatOptions = {
  keywordCase: 'lower',
  indentSize: 2,
};
