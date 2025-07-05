(function (): void {
  browser.storage.local.get('uiTheme').then((result: { uiTheme?: string }) => {
    const theme = result.uiTheme || 'light';
    if (theme === 'dark') {
      const themeStylesheet = document.getElementById('theme-stylesheet') as HTMLLinkElement;
      if (themeStylesheet) {
        themeStylesheet.href = 'popup-dark.css';
      }
    }
  });
})();
