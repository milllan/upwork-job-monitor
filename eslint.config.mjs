// eslint.config.mjs

import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // 1. Global ignore patterns
  {
    ignores: [
      'node_modules/',
      'dist/',
      'docs/',
      '.github/',
      '.claude/',
      'llm_context/',
      'lib/',
      'api/', // This likely has no effect but is kept for safety
    ],
  },

  // 2. Base configurations (apply to all linted files)
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier, // Must be last to override other configs

  // 3. Configuration for Node.js files (like this one, .prettierrc.js, and jest.config.js)
  {
    files: ['eslint.config.mjs', '.prettierrc.js', 'jest.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        module: 'readonly', // Add 'module' as a readonly global
      },
    },
  },

  // 4. Configuration for your Web Extension source code
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          vars: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-redeclare': 'off', // Required for function overloads
      'no-var': 'warn',
      'prefer-const': ['warn', { destructuring: 'all' }],
      eqeqeq: ['warn', 'always'],
      curly: ['warn', 'all'],
      'no-prototype-builtins': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug', 'log'] }],
    },
  }
);
