// /assets/kk-header-loader.js
// Shared header loader for Kleenkars — robust insertion + fallback background
(function () {
  if (window.__kk_header_loaded) return;
  window.__kk_header_loaded = true;

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
    try {
      const v = localStorage.getItem("kleenkars.hero");
      if (v && v.startsWith("data:")) return v;
    } catch (e) {}
    return "/assets/hero.jpg";
  }

  const css = `
/* ---- kk header injected ---- */
.kk-header-root{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;margin:0;color:var(--kk-ink,#e9e9ef)}
.kk-header-hero{position:relative;border-radius:12px;overflow:hidden;margin:12px 18px 12px 18px;min-height:140px;box-shadow:0 6px 18px rgba(0,0,0,.32);background-color:#0c0c0f;}
.kk-header-hero::before{content:"";position:absolute;inset:0;background-image: url("${getHeroUrl()}"); background-position: center top; background-size: cover; background-repeat:no-repeat; filter:brightness(.36); z-index:0;}
.kk-header-inner{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;background: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.12));color:#fff;}
.kk-brand{display:flex;align-items:center;gap:14px;min-width:0}
.kk-brand a{display:flex;align-items:center;gap:14px;text-decoration:none;color:inherit}
.kk-logo{width:clamp(110px,14vw,160px);height:auto;object-fit:contain;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.22);box-shadow:0 6px 20px rgba(0,0,0,.36);display:block}
.kk-title-wrap{display:flex;flex-direction:column;min-width:0}
.kk-title{font-weight:800;letter-spacing:.3px;font-size:clamp(1.2rem,3.5vw,2.0rem);color:#fff;line-height:1;text-transform:uppercase}
.kk-sub{color:rgba(255,255,255,0.9);font-size:.95rem;margin-top:6px}
.kk-header-controls{display:flex;align-items:center;gap:10px}
.kk-btn{padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#fff;font-weight:600;cursor:pointer;text-decoration:none}
.kk-primary{background:linear-gradient(90deg,#e63946,#c42b36);border-color:transparent;color:#fff}
.kk-toolbar{display:flex;gap:10px;padding:8px 18px;margin-top:12px;margin-left:18px;margin-right:18px;flex-wrap:wrap}
.kk-toolbar .kk-tab{background:rgba(255,255,255,0.04);padding:8px 12px;border-radius:10px;color:#fff;font-weight:700;cursor:pointer}
.kk-toolbar .kk-tab.active{background:#e63946;color:#fff;box-shadow:0 4px 12px rgba(230,57,70,0.18)}
@media (max-width:600px){
  .kk-logo{width:110px !important}
  .kk-header-hero::before{background-position:center 18%;filter:brightness(.42)}
  .kk-header-inner{padding:14px;gap:10px}
  .kk-title{font-size:1.0rem}
}
`;

  const headerHtml = `
  <div class="kk-header-root">
    <header class="kk-header-hero" role="banner" aria-label="Kleenkars hero">
      <div class="kk-header-inner">
        <div class="kk-brand">
          <a href="/" title="Kleenkars — Home" aria-label="Go to Kleenkars home">
            <img class="kk-logo" src="/assets/logo.png" alt="Kleenkars logo" onerror="this.src='/logo.svg'">
            <div class="kk-title-wrap">
              <div class="kk-title">KLEENKARS CARWASH</div>
              <div class="kk-sub">Clean cars. Happy customers.</div>
            </div>
          </a>
        </div>
        <div class="kk-header-controls" role="navigation" aria-label="Header controls">
          <button id="kk-theme-toggle" class="kk-btn" title="Toggle theme" aria-pressed="false">🌙</button>
          <a class="kk-btn" href="/" title="Open site">Open site</a>
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

  // insert style
  const styleEl = el("style", { html: css });
  document.head.appendChild(styleEl);

  // remove previous injection safely
  const prev = document.getElementById("kk-header-inject");
  if (prev) prev.remove();

  // create container and insert BEFORE the main .wrap if present (so spacing matches homepage)
  const container = el("div", { id: "kk-header-inject", html: headerHtml });
  const wrap = document.querySelector(".wrap");
  if (wrap && wrap.parentNode) wrap.parentNode.insertBefore(container, wrap);
  else if (document.body && document.body.firstChild) document.body.insertBefore(container, document.body.firstChild);
  else document.body && document.body.appendChild(container);

  // THEME: reuse 'theme' localStorage key used on homepage
  const THEME_KEY = "theme";
  function applyTheme(isLight) {
    if (isLight) {
      document.body.classList.add("light");
      localStorage.setItem(THEME_KEY, "light");
      const b = document.getElementById("kk-theme-toggle"); if (b) { b.textContent = "☀️"; b.setAttribute("aria-pressed", "true"); }
    } else {
      document.body.classList.remove("light");
      localStorage.setItem(THEME_KEY, "dark");
      const b = document.getElementById("kk-theme-toggle"); if (b) { b.textContent = "🌙"; b.setAttribute("aria-pressed", "false"); }
    }
  }

  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light") document.body.classList.add("light");
    else if (saved === "dark") document.body.classList.remove("light");
  } catch (e) {}

  const themeToggle = document.getElementById("kk-theme-toggle");
  (function initTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light") applyTheme(true);
      else if (saved === "dark") applyTheme(false);
      else {
        const hr = new Date().getHours();
        applyTheme(hr >= 7 && hr < 19);
      }
    } catch (e) { applyTheme(false); }
  })();

  if (themeToggle) themeToggle.addEventListener("click", () => applyTheme(!document.body.classList.contains("light")));

  // toolbar nav
  document.querySelectorAll(".kk-toolbar .kk-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const url = tab.dataset.target || "/";
      try { window.location.href = url; } catch (e) {}
    });
  });

  // hide obvious previous headers conservatively
  try {
    const selectorsToHide = ["header", ".header", "#header", ".site-header", ".site-hero"];
    selectorsToHide.forEach(sel => {
      document.querySelectorAll(sel).forEach(n => {
        if (!n || n.id === "kk-header-inject") return;
        try {
          const maybeLogo = n.querySelector && (n.querySelector("img[src*='logo']") || n.querySelector("img[src*='favicon']"));
          if (maybeLogo || n.classList.contains("site-header") || n.tagName.toLowerCase() === "header") n.style.display = "none";
        } catch (e) {}
      });
    });
  } catch (e) {}

  // reliable hero reload: replace background-image inside the style tag created above
  window.__kk_reload_hero = function () {
    try {
      const hero = getHeroUrl();
      const style = Array.from(document.head.querySelectorAll("style")).find(s => s.innerHTML && s.innerHTML.indexOf(".kk-header-hero::before") !== -1);
      if (style) {
        // replace any url("...") in the ::before rule
        style.innerHTML = style.innerHTML.replace(/\.kk-header-hero::before\{[^}]*\}/, function (match) {
          return match.replace(/background-image:\s*url\([^)]*\)/, `background-image: url("${hero}")`);
        });
      } else {
        const heroEl = document.querySelector(".kk-header-hero");
        if (heroEl) heroEl.style.backgroundImage = `url("${hero}")`;
      }
    } catch (e) {}
  };

})();
