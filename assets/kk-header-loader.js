// /assets/kk-header-loader.js
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
    try {
      const v = localStorage.getItem("kleenkars.hero");
      if (v && v.startsWith("data:")) return v;
    } catch (e) {}
    return "/assets/hero.jpg";
  }

  /* ---------- CSS / HTML ---------- */
  const css = `
  .kk-header-root{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;margin:0;color:var(--kk-ink,#e9e9ef)}
  .kk-header-hero{
    display:flex;
    align-items:center;
    gap:16px;
    background-image: linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url("${getHeroUrl()}");
    background-position: top center;
    background-size: cover;
    background-repeat: no-repeat;
    padding:20px;
    border-radius:12px;
    margin:12px 18px 8px 18px;
    min-height:160px;
    box-shadow:0 6px 18px rgba(0,0,0,.4);
    color: #fff;
  }
  .kk-logo{ width:110px !important; height:auto; border-radius:50%; display:block; object-fit:contain; cursor:pointer }
  .kk-title{
    font-weight:800;
    font-size:1.6rem;        /* slightly larger */
    line-height:1.2;
    color:#fff;
    text-transform:uppercase;
  }
  .kk-sub{
    color:rgba(200,200,210,0.9); /* lighter gray tone */
    margin-top:6px;
    font-size:1rem;          /* slightly smaller */
    font-weight:400;
  }
  .kk-header-controls{margin-left:auto;display:flex;gap:10px;align-items:center}
  .kk-btn{padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#fff;font-weight:600;cursor:pointer}
  .kk-toolbar{display:flex;gap:10px;padding:8px 18px;margin-bottom:12px;flex-wrap:wrap}
  .kk-toolbar .kk-tab{background:rgba(255,255,255,0.04);padding:8px 12px;border-radius:10px;color:#fff;font-weight:700;cursor:pointer}
  .kk-toolbar .kk-tab.active{background:#e63946;color:white;box-shadow:0 4px 12px rgba(230,57,70,0.18)}

  @media (max-width:640px){
    .kk-title{font-size:1.2rem}
    .kk-header-hero{min-height:140px;padding:14px;gap:12px}
    .kk-logo{ width:110px !important; }
  }
  `;

  const headerHtml = `
  <div class="kk-header-root">
    <div class="kk-header-hero" role="banner" aria-label="Kleenkars hero">
      <a href="/index.html" title="Go to Home">
        <img class="kk-logo" src="/assets/logo.png" alt="Kleenkars logo" onerror="this.src='/logo.svg'">
      </a>
      <div style="display:flex;flex-direction:column;justify-content:center;">
        <div class="kk-title">KLEENKARS</div>
        <div class="kk-sub">Clean cars. Happy customers.</div>
      </div>
      <div class="kk-header-controls" style="margin-left:auto;">
        <button id="kk-theme-toggle" class="kk-btn" title="Toggle theme" aria-pressed="false">🌙</button>
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

  /* ---------- inject ---------- */
  const styleEl = el("style", { html: css });
  document.head.appendChild(styleEl);

  const prev = document.getElementById("kk-header-inject");
  if (prev) prev.remove();

  const container = el("div", { id: "kk-header-inject", html: headerHtml });
  document.body.insertBefore(container, document.body.firstChild);

  /* ---------- theme toggle ---------- */
  const THEME_KEY = "kleenkars.theme";

  (function applySavedThemeEarly() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light") {
        document.documentElement.classList.add("light");
        document.body && document.body.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
        document.body && document.body.classList.remove("light");
      }
    } catch (e) {}
  })();

  const themeToggle = document.getElementById("kk-theme-toggle");
  function setTheme(isLight) {
    if (isLight) {
      document.documentElement.classList.add("light");
      document.body && document.body.classList.add("light");
      localStorage.setItem(THEME_KEY, "light");
      themeToggle.textContent = "☀️";
    } else {
      document.documentElement.classList.remove("light");
      document.body && document.body.classList.remove("light");
      localStorage.setItem(THEME_KEY, "dark");
      themeToggle.textContent = "🌙";
    }
  }

  (function initThemeButton() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light") setTheme(true);
      else if (saved === "dark") setTheme(false);
      else setTheme(!(new Date().getHours() >= 7 && new Date().getHours() < 19));
    } catch (e) { setTheme(false); }
  })();

  themeToggle.addEventListener("click", () => {
    const isLight = document.body.classList.contains("light");
    setTheme(!isLight);
  });

  /* ---------- toolbar nav handlers ---------- */
  document.querySelectorAll(".kk-toolbar .kk-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      window.location.href = tab.dataset.target || "/";
    });
  });
})();
