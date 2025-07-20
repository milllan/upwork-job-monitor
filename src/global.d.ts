/**
 * Declares the 'browser' global variable provided by the webextension-polyfill,
 * making it available in the global scope for all TypeScript files.
 */
declare const browser: typeof import('webextension-polyfill');

export {};