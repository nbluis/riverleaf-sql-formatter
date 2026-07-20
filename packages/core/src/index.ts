// Public API of the riverleaf-sql-formatter library.
//
// The whole surface is `format` plus its options type/defaults. Everything else
// under ./formatter is internal and may change without a semver bump.
export { format, FormatOptions, DEFAULT_OPTIONS } from './formatter/format';
