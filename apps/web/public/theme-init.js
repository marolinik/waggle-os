(function () {
  try {
    var value = localStorage.getItem('waggle-theme');
    var useLightTheme = value === 'light' ||
      (value === 'system' && window.matchMedia &&
        !window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (useLightTheme) document.documentElement.setAttribute('data-theme', 'light');
  } catch (_error) {
    // Storage can be unavailable in hardened webviews; dark is the default.
  }
})();
