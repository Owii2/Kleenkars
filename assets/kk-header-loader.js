// /assets/kk-header-loader.js
(function(){
  const SNIPPET = '/shared/header-snippet.html';
  const CSS = '/assets/kk-header.css';

  function ensureCss() {
    if (document.querySelector('link[data-kk-header]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = CSS;
    l.setAttribute('data-kk-header', '1');
    document.head.appendChild(l);
  }

  async function inject() {
    try {
      ensureCss();
      const r = await fetch(SNIPPET, { cache: 'no-store' }); // during dev use no-store
      if (!r.ok) throw new Error('Header snippet not found: ' + r.status);
      const html = await r.text();

      const container = document.createElement('div');
      container.innerHTML = html;

      // if a kk-header already exists we replace it to avoid duplicates on reload
      const newHeader = container.firstElementChild;
      const existing = document.querySelector('.kk-header');
      if (existing) existing.replaceWith(newHeader);
      else document.body.insertBefore(newHeader, document.body.firstChild);

      wireTheme();
      syncTitle();
    } catch (e) {
      console.warn('kk-header-loader:', e.message);
    }
  }

  function wireTheme(){
    const btn = document.getElementById('kkThemeToggle');
    if (!btn) return;
    function applyTheme(isLight){
      document.body.classList.toggle('light', !!isLight);
      try { localStorage.setItem('kleenkars.theme', isLight ? 'light' : 'dark'); } catch(e){}
      btn.textContent = isLight ? '☀️' : '🌙';
    }
    try {
      const saved = localStorage.getItem('kleenkars.theme');
      if (saved) applyTheme(saved === 'light');
      else {
        const hour = new Date().getHours();
        applyTheme(hour >= 7 && hour < 19);
      }
    } catch(e){ applyTheme(false); }
    btn.addEventListener('click', ()=> applyTheme(!document.body.classList.contains('light')));
  }

  // If page wants a custom header title, set <body data-kk-title="Admin">
  function syncTitle(){
    const headerTitle = document.querySelector('.kk-title');
    if (!headerTitle) return;
    const custom = document.body.getAttribute('data-kk-title');
    if (custom) headerTitle.textContent = custom;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();
})();
