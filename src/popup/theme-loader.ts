
/**
 * Theme loader script that applies the user's preferred theme early to prevent FOUC.
 * Loads asynchronously from browser storage and updates the theme stylesheet accordingly.
 */
(function (): void {
  browser.storage.local.get('uiTheme')
    .then((result: { uiTheme?: 'light' | 'dark' }) => {
      const theme = result.uiTheme || 'light';
      if (theme === 'dark') {
        const themeStylesheet = document.getElementById('theme-stylesheet');
        if (themeStylesheet instanceof HTMLLinkElement) {
          themeStylesheet.href = '/popup/popup-dark.css';
        }
      }
    })
    .catch((error) => {
      console.warn('Failed to load theme preference:', error);
      // Gracefully fall back to light theme (default)
    });
})();
