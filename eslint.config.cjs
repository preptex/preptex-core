// Flat ESLint config for ESLint v9+ to satisfy CI.
// Aligns with TypeScript project setup; keeps rules minimal.

const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const js = require('@eslint/js');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  // Global ignores
  {
    ignores: [
      'node_modules',
      'dist',
      'coverage',
      'examples/**/build',
      'vitest.config.ts.timestamp-*',
      'vite.config.ts.timestamp-*',
    ],
  },
  // JavaScript defaults
  js.configs.recommended,
  // TypeScript configuration
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
    },
  },
];
