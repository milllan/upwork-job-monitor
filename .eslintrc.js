// .eslintrc.js
module.exports = {
  // This tells ESLint to stop looking for config files in parent directories
  root: true,

  // Use the 'ignores' property for modern ESLint (replaces .eslintignore)
  ignores: [
    'node_modules/',
    'lib/', // Ignore all third-party libraries
    'llm_context/', // Ignore non-source code context files
    // Add any other directories/files to ignore here, e.g., 'dist/', 'build/'
  ],

  env: {
    browser: true,
    es2021: true,
    webextensions: true, // Defines 'chrome.*' but we need to add 'browser.*' manually
    jquery: true, // To recognize $ and jQuery globals
  },
  extends: [
    'eslint:recommended', // Basic ESLint recommended rules
    'plugin:prettier/recommended', // Integrates Prettier with ESLint
  ],
  parserOptions: {
    ecmaVersion: 'latest', // Use the latest ECMAScript features
    sourceType: 'script', // 'script' for global scope, 'module' if you use ES modules
                          // Most extension scripts are treated as 'script'
  },

  // *** THE KEY FIX IS HERE ***
  // Define all the variables that are shared across your script files.
  globals: {
    // WebExtension Polyfill
    browser: 'readonly',

    // Your custom objects/classes
    config: 'readonly',
    UpworkAPI: 'readonly',
    AppState: 'readonly',
    StorageManager: 'readonly',
    ApiService: 'readonly',

    // Your UI Components from popup/components/
    JobDetails: 'readonly',
    JobItem: 'readonly',
    StatusHeader: 'readonly',
    SearchForm: 'readonly', // Assuming you have this component

    // Utility functions from utils.js
    constructUpworkSearchURL: 'readonly',
    timeAgo: 'readonly',
    formatClientInfo: 'readonly',
    formatSkills: 'readonly',
    formatBudget: 'readonly',
    initializeScrollHints: 'readonly',

    // Other globals from your error log
    fetchJobsWithTokenRotation: 'readonly', // From 5_core_logic_token_rotation.js
    getAllPotentialApiTokens: 'readonly',
    fetchUpworkJobsDirectly: 'readonly',
    sendNotification: 'readonly',
  },

  rules: {
    // --- Prettier Integration ---
    'prettier/prettier': 'warn', // Show Prettier issues as warnings

    // --- General JavaScript Best Practices ---
    'no-var': 'warn', // Encourage let/const over var
    'prefer-const': ['warn', { destructuring: 'all' }], // Suggest const if a variable is never reassigned
    'eqeqeq': ['warn', 'always'], // Require === and !==
    'curly': ['warn', 'all'], // Require curly braces for all blocks (if, for, while)
    'no-prototype-builtins': 'warn', // Disallow direct use of Object.prototype builtins

    // --- Console Logging ---
    // Allow console.log/warn/error during development, but you might want to restrict for production
    'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],

    // Modify the 'no-unused-vars' rule to be more flexible.
    // It will ignore variables/args starting with an underscore.
    // This is useful for function signatures where an argument is required but not used.
    // e.g., chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { ... })
    // you can write it as (message, _sender, sendResponse) if sender isn't used.
    'no-unused-vars': [
      'warn',
      {
        args: 'after-used', // Don't warn for unused args unless all following args are also unused
        vars: 'all',
        argsIgnorePattern: '^_', // Ignore unused args starting with an underscore
        varsIgnorePattern: '^_', // Ignore unused variables starting with an underscore
      },
    ],
    'require-await': 'off',
    'no-undef': 'error', // Keep this on to catch legitimate typos
  },
};