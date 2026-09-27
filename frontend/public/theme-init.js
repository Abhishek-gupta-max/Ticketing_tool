// Apply the saved theme before the app renders to avoid a flash.
try {
  var t = localStorage.getItem('vlx-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
} catch (e) { /* storage blocked: default theme */ }
