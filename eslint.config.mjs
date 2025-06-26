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
        
        // Add 'module' as a global for the UMD pattern in your components
        module: 'readonly', 
      },
    },
    rules: {
      // For MV2, scripts are loaded into a shared global scope.
      // We declare globals that are defined in one file and used in another.
      // This rule must be turned off to allow, for example, 'const config = {}' in config.js
      // without ESLint thinking we are redeclaring the 'config' global.
      'no-redeclare': 'off',
      
      'no-var': 'warn',
      'prefer-const': ['warn', { destructuring: 'all' }],
      eqeqeq: ['warn', 'always'],
      curly: ['warn', 'all'],
      'no-prototype-builtins': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug', 'log'] }],
      'no-unused-vars': ['warn', { args: 'after-used', vars: 'all', argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];