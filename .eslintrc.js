module.exports = {
  env: {
    browser: true, // Enables browser global variables (e.g., window, document)
    es2021: true, // Enables ES2021 global variables and parsing.
    // 'webextensions: true' is automatically handled by the mozilla plugin.
  },
  extends: [
    'eslint:recommended', // Uses the recommended rules from ESLint
    'plugin:mozilla/recommended-webext', // Uses the recommended rules for web extensions from Mozilla.
  ],
  parserOptions: {
    ecmaVersion: 2021, // Allows parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports (even if not strictly used everywhere yet)
  },
  rules: {
    // --- Custom rules or overrides ---
    'indent': ['error', 2, { 'SwitchCase': 1 }], // Enforce 2-space indentation, 1 for switch cases
    'linebreak-style': ['error', 'windows'], // Enforce Windows-style line endings (CRLF). Change to 'unix' if on Linux/macOS.
    'quotes': ['error', 'single'], // Enforce single quotes
    'semi': ['error', 'always'], // Enforce semicolons at the end of statements
    'no-console': 'off', // In browser extensions, console.log is often used for debugging, so we can relax this rule.
  },
};