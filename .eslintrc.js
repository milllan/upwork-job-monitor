// .eslintrc.js
module.exports = {
  env: {
    browser: true, // For browser globals like window, document
    es2021: true,  // Enables ES2021 globals and syntax
    webextensions: true, // For browser extension APIs like chrome.*
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
  globals: {
    // If you have other specific globals, add them here
    // e.g. Parser: 'readonly', // if rss-parser was a global (it's not used that way here)
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

    // --- Unused Variables ---
    'no-unused-vars': [
      'warn',
      {
        args: 'after-used', // Don't warn for unused args unless all following args are also unused
        argsIgnorePattern: '^_', // Ignore unused args starting with an underscore
        varsIgnorePattern: '^_', // Ignore unused variables starting with an underscore
      },
    ],

    // --- Specific to Extension Development (Optional, adjust as needed) ---
    // 'no-undef': 'error', // Handled by eslint:recommended, ensures `chrome` isn't mistyped

    // --- Async/Await ---
    'no-async-promise-executor': 'warn', // Disallow using an async function as a Promise executor
    'require-await': 'off', // Sometimes async functions are used for consistent API even without await
                            // e.g., message listeners. Turn 'warn' or 'error' if you want to enforce await usage.

    // --- Other potentially useful rules (uncomment and configure if needed) ---
    // 'no-alert': 'warn', // Discourage use of alert, confirm, prompt
    // 'no-debugger': 'warn', // Disallow debugger statements (usually 'error' for production)
    // 'no-empty': ['warn', { 'allowEmptyCatch': true }], // Allow empty catch blocks
  },
  overrides: [
    {
      // If you decide to use ES modules in some files (e.g., for utility libraries)
      // you can specify 'module' sourceType for them.
      files: ['src/utils/**/*.js'], // Example path
      parserOptions: {
        sourceType: 'module',
      },
    },
    {
      // Rules specific to test files if you add them later
      files: ['**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true, // or mocha, etc.
      },
      rules: {
        // Test-specific rule adjustments
      }
    }
  ],
};