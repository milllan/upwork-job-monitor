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
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      sourceType: 'module',
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
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
      'no-redeclare': 'off',
      'no-var': 'warn',
      'prefer-const': ['warn', { destructuring: 'all' }],
      eqeqeq: ['warn', 'always'],
      curly: ['warn', 'all'],
      'no-prototype-builtins': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug', 'log'] }],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      '@typescript-eslint/await-thenable': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
    },
  },
  // 5. Configuration for test files
  {
    files: ['src/**/*.test.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      sourceType: 'module',
      parserOptions: {
        project: 'tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
    },
  },
  // 6. Disable type-aware linting for JS files
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  }
);
