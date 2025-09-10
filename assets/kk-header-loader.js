// /assets/kk-header-loader.js
// Shared header loader that mirrors index.html hero sizing & placement exactly.
// - Uses ::before background with cover/center and brightness(.35)
// - logo sizing and padding match index.html
// - theme toggle uses the same "theme" localStorage key as index.html
(function () {
  if (window.__kk_header_loaded) return;
  window.__kk_header_loaded = true;

  /* ---------- helpers ---------- */
  function el(tag, attr = {}, children = []) {
    const e = document.createElement(tag);
    for (const k in attr) {
      if (k === "html") e.innerHTML = attr[k];
      else if (k === "on" && Array.isArray(attr[k])) attr[k].forEach(([ev, fn]) => e.addEventListener(ev, fn));
      else e.setAttribute(k, attr[k]);
    }
    (children || []).forEach(c => e.appendChild(c));
    return e;
  }

  function getHeroUrl() {
    // prefer uploaded hero from localStorage (data:), else use the site hero path with same query param
    try {
      const v = localStorage.getItem("kleenkars.hero");
      if (v && v.startsWith("data:")) return v;
    } catch (e) {}
    // use same hero filename + version param as index.html
    return "/assets/hero.jpg?v=1";
  }

  /* ---------- CSS / HTML (copied style rules from index.html) ---------- */
  const css = `
  /* keep font family consistent */
  .kk-header-root{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;margin:0;color:var(--kk-ink,#e9e9ef)}

  /* container behaves like .site-header from index.html */
  .kk-site-header {
    border-radius:12px;
    overflow:hidden;
    position:relative;
    margin-bottom:20px;
  }

  /* hero background implemented via ::before (same pattern as index) */
  .kk-site-header::before{
    content:"";
    position:absolute;
    inset:0;
    background-image: url("${getHeroUrl()}");
    background-size: cover;
    background-position: center;
    filter: brightness(.35);
    z-index:0;
  }

  /* inner content sits above the background (same as .header-inner) */
  .kk-site-header .kk-header-inner{
    position:relative; /* above background */
    z-index:1;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:16px;
    padding:20px;
    background: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.12));
  }

  /* brand & logo sizing copied from index */
  .kk-brand {
    display:flex; align-items:center; gap:14px;
    min-width:0;
  }
  .kk-brand img {
    width: clamp(120px, 14vw, 160px);
    height:auto; object-fit:contain; border-radius:10px;
    border:1px solid rgba(255,255,255,0.08);
    background: rgba(0,0,0,0.25);
    box-shadow: 0 6px 20px rgba(0,0,0,.4);
  }
  .kk-brand-text { display:flex; flex-direction:column }
  .kk-brand-text .kk-title {
    font-weight:800; letter-spacing:.3px;
    font-size: clamp(1.2rem, 3.5vw, 2.0rem);
    color: #fff;
  }
  .kk-brand-text .kk-tagline {
    color: rgba(255,255,255,0.9);
    font-size: .95rem;
    margin-top:4px;
  }

  .kk-header-actions { display:flex; align-items:center; gap:10px; z-index:2; }

  .kk-pill {
    display:inline-block;
    padding:8px 12px; border-radius:999px;
    background: rgba(255,255,255,0.06); color:#fff;
    border:1px solid rgba(255,255,255,0.08);
    font-weight:600;
  }

  .kk-mode-toggle {
    cursor:pointer; font-size:1.1rem; background:transparent; border:none; color:#fff;
    padding:6px 8px; display:inline-flex; align-items:center; gap:8px;
  }

  /* toolbar (keeps a small nav under header, optional) */
  .kk-toolbar{display:flex;gap:10px;padding:8px 18px;margin-bottom:12px;flex-wrap:wrap; z-index:2}
  .kk-toolbar .kk-tab{background:rgba(255,255,255,0.04);padding:8px 12px;border-radius:10px;color:#fff;font-weight:700;cursor:pointer}
  .kk-toolbar .kk-tab.active{background:#e63946;color:white;box-shadow:0 4px 12px rgba(230,57,70,0.18)}

  /* mobile tweaks copied from index.html */
  @media (max-width:600px){
    .kk-brand img { width: 110px; } /* mobile requested */
    .kk-brand-text .kk-title { font-size: 1.0rem; }
    /* index moved background-position on mobile to keep subject visible */
    .kk-site-header::before { filter: brightness(.4); background-position: center 30%; }
    .kk-header-inner { padding:14px; gap:10px; }
  }
  `;

  // build header html that mirrors index structure (brand, header-inner etc.)
  const headerHtml = `
  <div class="kk-header-root">
    <header class="kk-site-header" role="banner">
      <div class="kk-header-inner">
        <div class="kk-brand" role="img" aria-label="Kleenkars Car Wash logo">
          <a href="/index.html" title="Go to Home">
            <img src="/assets/logo.png" alt="Kleenkars logo" onerror="this.src='/logo.svg'">
          </a>
          <div class="kk-brand-text">
            <div class="kk-title">KLEENKARS CARWASH</div>
            <div class="kk-tagline" aria-hidden="true">Clean cars. Happy customers.</div>
          </div>
        </div>

        <div class="kk-header-actions" role="navigation" aria-label="Top actions">
          <button id="kk-theme-toggle" class="kk-mode-toggle" aria-label="Toggle theme">🌙</button>
        </div>
      </div>
    </header>

    <nav class="kk-toolbar" aria-label="site toolbar">
      <div class="kk-tab" data-target="/booking">Book</div>
      <div class="kk-tab" data-target="/pricing">Pricing</div>
      <div class="kk-tab" data-target="/contact">Contact</div>
      <div class="kk-tab" data-target="/admin">Admin</div>
    </nav>
  </div>
  `;

  /* ---------- inject ---------- */
  const styleEl = el("style", { html: css });
  document.head.appendChild(styleEl);

  // remove previous injection if exists (safe reload)
  const prev = document.getElementById("kk-header-inject");
  if (prev) prev.remove();

  const container = el("div", { id: "kk-header-inject", html: headerHtml });
  // insert just after <body> open so it appears like your index header
  document.body.insertBefore(container, document.body.firstChild);

  /* ---------- Theme handling (matches index.html) ---------- */
  // Use the same storage key 'theme' as index.html so both scripts stay in sync
  const THEME_KEY = "theme"; // index.html uses localStorage key 'theme'

  // apply saved theme early (so CSS pick it up)
  (function applySavedThemeEarly() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light') {
        document.body.classList.add('light');
      } else if (saved === 'dark') {
        document.body.classList.remove('light');
      }
    } catch (e) { /* ignore */ }
  })();

  const themeToggle = document.getElementById("kk-theme-toggle");

  function applyThemeFromIndexStyle(isDark) {
    // index.html stores 'theme' where value 'light' means light; their applyTheme used saved !== 'light'
    try {
      if (isDark) {
        // dark: remove light class
        document.body.classList.remove('light');
        themeToggle.textContent = '🌙';
        localStorage.setItem(THEME_KEY, 'dark');
      } else {
        // light
        document.body.classList.add('light');
        themeToggle.textContent = '☀️';
        localStorage.setItem(THEME_KEY, 'light');
      }
    } catch (e) {}
  }

  // initialize using the same heuristics as index.html
  (function initTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved) {
        // index logic: saved !== 'light' => dark; saved === 'light' => light
        applyThemeFromIndexStyle(saved !== 'light');
      } else {
        const h = new Date().getHours();
        // index used: applyTheme(!(h >= 7 && h < 19));  // day=light
        applyThemeFromIndexStyle(!(h >= 7 && h < 19));
      }
    } catch (e) {
      applyThemeFromIndexStyle(true); // default dark if anything fails
    }
  })();

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const isLightNow = document.body.classList.contains('light');
      // index's handler toggled with applyTheme(document.body.classList.contains('light'))
      // that function sets light when called with false; to mirror that behavior:
      applyThemeFromIndexStyle(isLightNow); // flips to opposite
    });
  }

  /* ---------- toolbar nav handlers ---------- */
  document.querySelectorAll(".kk-toolbar .kk-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const url = tab.dataset.target || "/";
      try { window.location.href = url; } catch (e) {}
    });
  });

  /* ---------- hide older duplicate headers (conservative) ---------- */
  try {
    const selectorsToHide = ["header:not(#kk-header-inject header)", ".site-header", ".header"];
    selectorsToHide.forEach(sel => {
      document.querySelectorAll(sel).forEach(n => {
        if (n.id === "kk-header-inject") return;
        try { n.style.display = "none"; } catch (e) {}
      });
    });
  } catch (e) {}

  /* ---------- allow reload after hero changed (admin hero uploader) ---------- */
  window.__kk_reload_hero = function () {
    try {
      const hero = getHeroUrl();
      const root = document.getElementById('kk-header-inject');
      if (!root) return;
      // update the ::before background by creating/removing a style rule override
      // easiest approach: set inline style on a dynamically created <style> that overrides the selector
      const id = "kk-hero-override";
      let s = document.getElementById(id);
      if (!s) {
        s = document.createElement('style'); s.id = id; document.head.appendChild(s);
      }
      s.textContent = `
        .kk-site-header::before{ background-image: url("${hero}") !important; }
      `;
    } catch (e) { console.warn(e); }
  };

})();
