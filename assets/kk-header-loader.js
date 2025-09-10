// /assets/kk-header-loader.js
// Shared header loader for Kleenkars
// - injects header HTML + scoped CSS
// - reads hero image from localStorage 'kleenkars.hero' (data URL) otherwise uses /assets/hero.jpg
// - theme toggle persisted in localStorage 'kleenkars.adminTheme'
// - safe: minimal global pollution, deferable

(function () {
  // don't run twice
  if (window.__kk_header_loaded) return;
  window.__kk_header_loaded = true;

  // Minimal helper
  function el(tag, attr = {}, children = []) {
    const e = document.createElement(tag);
    for (const k in attr) {
      if (k === "html") e.innerHTML = attr[k];
      else if (k === "on") attr[k].forEach(([ev,fn]) => e.addEventListener(ev, fn));
      else e.setAttribute(k, attr[k]);
    }
    (children || []).forEach(c => e.appendChild(c));
    return e;
  }

  // get hero: try localStorage first (data url), fallback to static image
  function getHeroUrl() {
    try {
      const v = localStorage.getItem("kleenkars.hero");
      if (v && v.startsWith("data:")) return v;
    } catch (e) { /* ignore */ }
    return "/assets/hero.jpg"; // add your default hero image at that path
  }

  // Create styles (scoped-ish)
  const css = `
  /* kk-header-loader styles */
  .kk-header-root{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;margin:0;color:var(--kk-ink,#e9e9ef)}
  .kk-header-top{display:flex;align-items:center;gap:14px;padding:16px 18px;background:transparent}
  .kk-header-hero{
    display:flex;align-items:center;gap:16px;
    background:linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url("${getHeroUrl()}") center/cover no-repeat;
    padding:18px;border-radius:12px;margin:12px 18px 8px 18px;min-height:120px;box-shadow:0 6px 18px rgba(0,0,0,.4);
  }
  .kk-logo{width: clamp(80px, 18vw, 110px); height:auto; border-radius:12px; border:1px solid rgba(255,255,255,0.04); background:#0f0f12; padding:10px; box-sizing:content-box}
  .kk-title{font-weight:800;font-size:1.5rem;line-height:1; color:#fff; text-transform:uppercase}
  .kk-sub{color:rgba(255,255,255,0.72); margin-top:6px; font-size:.95rem}
  .kk-header-controls{margin-left:auto;display:flex;gap:10px;align-items:center}
  .kk-btn{padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#fff;font-weight:600;cursor:pointer}
  .kk-primary{background:linear-gradient(90deg,#e63946,#c42b36);border-color:transparent;color:#fff}
  .kk-toolbar{display:flex;gap:10px;padding:8px 18px;margin-bottom:12px}
  .kk-toolbar .kk-tab{background:rgba(255,255,255,0.04);padding:8px 12px;border-radius:10px;color:#fff;font-weight:700}
  .kk-toolbar .kk-tab.active{background:#e63946;color:white;box-shadow:0 4px 12px rgba(230,57,70,0.18)}
  /* responsive */
  @media (max-width:640px){
    .kk-title{font-size:1.15rem}
    .kk-header-hero{min-height:160px;padding:12px}
  }
  `;

  // HTML template
  const headerHtml = `
  <div class="kk-header-root">
    <div class="kk-header-hero" role="banner" aria-label="Kleenkars hero">
      <img class="kk-logo" src="/assets/logo.png" alt="Kleenkars logo" onerror="this.src='/logo.svg'">
      <div style="display:flex;flex-direction:column;justify-content:center;">
        <div class="kk-title">KLEENKARS</div>
        <div class="kk-sub">Clean cars. Happy customers.</div>
      </div>
      <div class="kk-header-controls" style="margin-left:auto;">
        <button id="kk-theme-toggle" class="kk-btn" title="Toggle theme">🌙</button>
        <a class="kk-btn" href="/" style="text-decoration:none;color:inherit;" title="Open site">Open site</a>
      </div>
    </div>
    <nav class="kk-toolbar" aria-label="site toolbar">
      <div class="kk-tab" data-target="/booking">Book</div>
      <div class="kk-tab" data-target="/pricing">Pricing</div>
      <div class="kk-tab" data-target="/contact">Contact</div>
      <div class="kk-tab" data-target="/admin">Admin</div>
    </nav>
  </div>
  `;

  // inject style
  const styleEl = el("style", { html: css });
  document.head.appendChild(styleEl);

  // inject header root at top of body (before existing content)
  const container = el("div", { id: "kk-header-inject", html: headerHtml });
  document.body.insertBefore(container, document.body.firstChild);

  // Wire up theme toggle (persisted)
  const themeToggle = document.getElementById("kk-theme-toggle");
  function applyTheme(isLight) {
    document.documentElement.classList.toggle("light", !!isLight);
    try { localStorage.setItem("kleenkars.adminTheme", isLight ? "light" : "dark"); } catch (e) {}
    themeToggle.textContent = isLight ? "☀️" : "🌙";
  }
  // init
  try {
    const saved = localStorage.getItem("kleenkars.adminTheme");
    if (saved) applyTheme(saved === "light");
    else {
      const hr = new Date().getHours();
      applyTheme(hr >= 7 && hr < 19);
    }
  } catch (e) { applyTheme(false); }

  themeToggle.addEventListener("click", () => {
    applyTheme(!document.documentElement.classList.contains("light"));
  });

  // toolbar nav clicks: go to path (safe navigation)
  document.querySelectorAll(".kk-toolbar .kk-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const url = tab.dataset.target || "/";
      try { window.location.href = url; } catch (e) { /* ignore */ }
    });
  });

  // Improve: if a page already has a header element with same purpose, hide it.
  // We remove common header selectors (best-effort).
  try {
    const selectorsToHide = ["header", ".header", "#header", ".site-header", ".site-hero"];
    selectorsToHide.forEach(sel => {
      document.querySelectorAll(sel).forEach(n => {
        // If the found node is the same as our injected header, don't hide
        if (n.id === "kk-header-inject") return;
        // don't hide body>header that contains admin UI tables with filters (rare)
        // Instead, only hide simple header nodes (heuristic): if header has logo img or nav
        const logo = n.querySelector && n.querySelector("img[src*='logo']");
        if (logo || n.classList.contains("site-header") || n.tagName.toLowerCase() === "header") {
          try { n.style.display = "none"; } catch (e) { /* ignore */ }
        }
      });
    });
  } catch (e) { /* ignore */ }

  // allow dynamic refresh of hero image by calling window.__kk_reload_hero()
  window.__kk_reload_hero = function () {
    try {
      const hero = getHeroUrl();
      const heroEl = document.querySelector(".kk-header-hero");
      if (heroEl) heroEl.style.backgroundImage = `linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url("${hero}")`;
    } catch (e) {}
  };

})();
