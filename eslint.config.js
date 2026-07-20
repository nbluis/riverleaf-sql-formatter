// Flat config (ESLint 9+). Mirrors the old .eslintrc.json: eslint:recommended
// plus @typescript-eslint's recommended, with a lenient unused-vars rule.
const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    ignores: [
      'packages/*/out/**',
      'packages/*/dist/**',
      'node_modules/**',
      '**/esbuild.js',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs['flat/recommended'],
  {
    files: ['packages/*/src/**/*.ts', 'packages/*/test/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
