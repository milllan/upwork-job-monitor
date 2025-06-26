// eslint.config.mjs

import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default [
  // 1. Global ignore patterns
  {
    ignores: [
      'node_modules/',
      'lib/',
      'llm_context/',
    ],
  },

  // 2. Base configurations (apply to all linted files)
  js.configs.recommended,
  eslintConfigPrettier, // Must be last to override other configs

  // 3. Configuration for Node.js files (like this one and .prettierrc.js)
  {
    files: ["eslint.config.mjs", ".prettierrc.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // 4. Configuration for your Web Extension source code
  {
    files: ["api/**/*.js", "background/**/*.js", "popup/**/*.js", "storage/**/*.js", "utils.js"],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        // Your custom globals
        config: 'readonly',
        UpworkAPI: 'readonly',
        StorageManager: 'readonly',
        AppState: 'readonly',
        ApiService: 'readonly',
        JobDetails: 'readonly',
        JobItem: 'readonly',
        StatusHeader: 'readonly',
        SearchForm: 'readonly',
        constructUpworkSearchURL: 'readonly',
        timeAgo: 'readonly',
        formatClientInfo: 'readonly',
        formatSkills: 'readonly',
        formatBudget: 'readonly',
        initializeScrollHints: 'readonly',
        sendNotification: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      // Required for MV2 global script architecture
      'no-redeclare': 'off',
      
      'no-var': 'warn',
      'prefer-const': ['warn', { destructuring: 'all' }],
      eqeqeq: ['warn', 'always'],
      curly: ['warn', 'all'],
      'no-prototype-builtins': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug', 'log'] }],
      
      'no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          vars: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // Add this line to handle unused catch variables like _err
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];