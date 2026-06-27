/* Shared ESLint config for the whole monorepo (api + web + shared). */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  env: { node: true, es2022: true },
  ignorePatterns: [
    'dist',
    'node_modules',
    'coverage',
    '**/*.config.ts',
    '**/*.config.js',
    '**/*.cjs',
  ],
  rules: {
    // TypeScript handles undefined identifiers far better than the core rule.
    'no-undef': 'off',
    // The codebase intentionally uses `any` in test mocks and catch clauses.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['apps/web/**/*.{ts,tsx}', 'apps/swimmer/**/*.{ts,tsx}'],
      env: { browser: true },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    {
      files: ['**/*.spec.ts', '**/*.test.{ts,tsx}', '**/*.e2e-spec.ts', '**/test/**'],
      env: { jest: true, node: true },
    },
  ],
};
