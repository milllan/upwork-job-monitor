// theme-loader.js

/**
 * This script is intended to be loaded in the <head> of the document
 * to prevent a "flash of unstyled content" (FOUC) when a non-default
 * theme is active. It synchronously checks storage and applies the
 * correct theme stylesheet before the body is rendered.
 */
(function() {
  browser.storage.local.get('uiTheme').then(result => {
    const theme = result.uiTheme || 'light'; // Default to light
    if (theme === 'dark') {
      document.getElementById('theme-stylesheet').href = 'popup-dark.css';
    }
  });
})();