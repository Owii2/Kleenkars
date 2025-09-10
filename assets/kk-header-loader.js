// /assets/kk-header-loader.js
// Shared header loader for Kleenkars — background-size: cover so image fills tile
(function () {
  if (window.__kk_header_loaded) return;
  window.__kk_header_loaded = true;

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

  function getHeroUrl() {
    try {
      const v = localStorage.getItem("kleenkars.hero");
      if (v && v.startsWith("data:")) return v;
    } catch (e) {}
    return "/assets/hero.jpg";
  }

  const css = `
  /* kk-header-loader styles (cover background: fills tile, centered-right) */
  .kk-header-root{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;margin:0;color:var(--kk-ink,#e9e9ef)}
  .kk-header-hero{
    display:flex;
    align-items:center;
    gap:16px;

    /* COVER mode: fill the tile */
    background-image: linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url("${getHeroUrl()}");
    background-position: center right; /* bias to right where car usually sits; change to 'center' if needed */
    background-size: cover;            /* fill tile */
    background-repeat: no-repeat;

    padding:20px;
    border-radius:12px;
    margin:12px 18px 8px 18px;
    min-height:160px; /* taller so less vertical crop on mobile */
    box-shadow:0 6px 18px rgba(0,0,0,.4);
    color: #fff;
  }

  /* Logo: removed background square, fixed width to 110px */
  .kk-logo{ width:110px !important; height:auto; border-radius:50%; border:0; padding:0; background:transparent; box-shadow:none; display:block; object-fit:contain; }

  .kk-title{font-weight:800;font-size:1.4rem;line-height:1;color:#fff; text-transform:uppercase; margin-left:6px}
  .kk-sub{color:rgba(255,255,255,0.88); margin-top:6px; font-size:.95rem}
  .kk-header-controls{margin-left:auto;display:flex;gap:10px;align-items:center}
  .kk-btn{padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#fff;font-weight:600;cursor:pointer}
  .kk-primary{background:linear-gradient(90deg,#e63946,#c42b36);border-color:transparent;color:#fff}
  .kk-toolbar{display:flex;gap:10px;padding:8px 18px;margin-bottom:12px;flex-wrap:wrap}
  .kk-toolbar .kk-tab{background:rgba(255,255,255,0.04);padding:8px 12px;border-radius:10px;color:#fff;font-weight:700;cursor:pointer}
  .kk-toolbar .kk-tab.active{background:#e63946;color:white;box-shadow:0 4px 12px rgba(230,57,70,0.18)}

  @media (max-width:640px){
    .kk-title{font-size:1.1rem}
    .kk-header-hero{min-height:140px;padding:14px;gap:12px}
    .kk-logo{ width:110px !important; }
  }
  `;

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

  const styleEl = el("style", { html: css });
  document.head.appendChild(styleEl);

  // remove any prior injected container (safe reload)
  const prev = document.getElementById("kk-header-inject");
  if (prev) prev.remove();

  const container = el("div", { id: "kk-header-inject", html: headerHtml });
  document.body.insertBefore(container, document.body.firstChild);

  const themeToggle = document.getElementById("kk-theme-toggle");
  function applyTheme(isLight) {
    document.documentElement.classList.toggle("light", !!isLight);
    try { localStorage.setItem("kleenkars.adminTheme", isLight ? "light" : "dark"); } catch (e) {}
    themeToggle.textContent = isLight ? "☀️" : "🌙";
  }
  try {
    const saved = localStorage.getItem("kleenkars.adminTheme");
    if (saved) applyTheme(saved === "light");
    else { const hr = new Date().getHours(); applyTheme(hr >= 7 && hr < 19); }
  } catch (e) { applyTheme(false); }
  themeToggle.addEventListener("click", () => applyTheme(!document.documentElement.classList.contains("light")));

  document.querySelectorAll(".kk-toolbar .kk-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const url = tab.dataset.target || "/";
      try { window.location.href = url; } catch (e) {}
    });
  });

  // Best-effort: hide old header elements to avoid duplicates
  try {
    const selectorsToHide = ["header", ".header", "#header", ".site-header", ".site-hero"];
    selectorsToHide.forEach(sel => {
      document.querySelectorAll(sel).forEach(n => {
        if (n.id === "kk-header-inject") return;
        const logo = n.querySelector && n.querySelector("img[src*='logo']");
        if (logo || n.classList.contains("site-header") || n.tagName.toLowerCase() === "header") {
          try { n.style.display = "none"; } catch (e) {}
        }
      });
    });
  } catch (e) {}

  // allow reload after hero is changed
  window.__kk_reload_hero = function () {
    try {
      const hero = getHeroUrl();
      const heroEl = document.querySelector(".kk-header-hero");
      if (heroEl) heroEl.style.backgroundImage = `linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url("${hero}")`;
    } catch (e) {}
  };

})();
