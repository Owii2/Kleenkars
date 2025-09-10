// /assets/kk-header-loader.js
// Shared header loader for Kleenkars with two options to control vertical placement:
//  - BG_OFFSET_PX: shifts the background image inside the hero tile (photo moves)
//  - TILE_OFFSET_PX: shifts the hero tile itself (tile moves on page)
// Use runtime helpers __kk_set_bg_offset(px) and __kk_move_tile(px) to test quickly.
(function () {
  if (window.__kk_header_loaded) return;
  window.__kk_header_loaded = true;

  /* ---------- CONFIG: tweak these defaults ---------- */
  // Move photo inside tile (px). Positive -> photo moves down (shows more top).
  let BG_OFFSET_PX = 0;
  // Move the whole tile (px). Positive -> tile moves down on the page.
  let TILE_OFFSET_PX = 20;

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

    /* background image (cover). we'll set vertical position at runtime */
    background-image: linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url("${getHeroUrl()}");
    background-position: center 0px;
    background-size: cover;
    background-repeat: no-repeat;

    /* original padding restored so logo/title don't move */
    padding:20px;
    border-radius:12px;
    margin:18px 18px 12px 18px;
    min-height:160px;
    box-shadow:0 6px 18px rgba(0,0,0,.4);
    color: #fff;

    /* allow tile movement via transform (set at runtime) */
    transform: translateY(0);
    transition: transform 220ms ease, box-shadow 180ms ease;
  }

  .kk-logo{
    width:110px !important;
    height:auto;
    border-radius:50%;
    border:0;
    padding:0;
    background:transparent;
    box-shadow:none;
    display:block;
    object-fit:contain;
    cursor:pointer;
  }

  .kk-title{
    font-weight:800;
    font-size: clamp(1.2rem, 3.5vw, 2.0rem);
    line-height:1;
    color:#ffffff;
    text-transform:uppercase;
    margin-left:6px;
  }

  .kk-sub{
    color: rgba(255,255,255,0.9);
    margin-top:6px;
    font-size:.95rem;
    font-weight:400;
  }

  .kk-header-controls{ margin-left:auto; display:flex;gap:10px;align-items:center; }

  .kk-btn{
    padding:8px 12px;
    border-radius:10px;
    border:1px solid rgba(255,255,255,0.06);
    background:transparent;
    color:#fff;
    font-weight:600;
    cursor:pointer;
  }

  #kk-theme-toggle{ background:transparent;border:0;color:inherit;font-size:1.1rem;cursor:pointer;padding:6px 8px;border-radius:8px }

  @media (max-width:640px){
    .kk-title{font-size:1.1rem}
    .kk-header-hero{min-height:140px;padding:20px 14px 14px 14px}
    .kk-logo{ width:110px !important; }
  }
  `;

  const headerHtml = `
  <div class="kk-header-root">
    <div class="kk-header-hero" role="banner" aria-label="Kleenkars hero">
      <a href="/index.html" title="Home" aria-label="Go to home">
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
  </div>
  `;

  /* ---------- inject ---------- */
  const styleEl = el("style", { html: css });
  document.head.appendChild(styleEl);

  const prev = document.getElementById("kk-header-inject");
  if (prev) prev.remove();

  const container = el("div", { id: "kk-header-inject", html: headerHtml });
  document.body.insertBefore(container, document.body.firstChild);

  /* ---------- runtime setters ---------- */
  function applyBgOffset(px) {
    try {
      const hero = document.querySelector(".kk-header-hero");
      if (!hero) return;
      // set background vertical position to center + px
      hero.style.backgroundPosition = `center ${px}px`;
    } catch (e) { console.warn(e); }
  }

  function applyTileOffset(px) {
    try {
      const hero = document.querySelector(".kk-header-hero");
      if (!hero) return;
      hero.style.transform = `translateY(${px}px)`;
    } catch (e) { console.warn(e); }
  }

  // apply initial configured offsets
  applyBgOffset(BG_OFFSET_PX);
  applyTileOffset(TILE_OFFSET_PX);

  // helpers available in console for quick tuning
  window.__kk_set_bg_offset = function (px) {
    const n = Number(px) || 0;
    BG_OFFSET_PX = n;
    applyBgOffset(n);
    console.log("kk-header: background offset set to", n);
  };
  window.__kk_move_tile = function (px) {
    const n = Number(px) || 0;
    TILE_OFFSET_PX = n;
    applyTileOffset(n);
    console.log("kk-header: tile translateY set to", n);
  };

  /* ---------- theme toggle (robust) ---------- */
  const THEME_KEY = "kleenkars.theme";
  (function applySavedThemeEarly() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light") {
        document.documentElement.classList.add("light");
        document.body && document.body.classList.add("light");
      } else if (saved === "dark") {
        document.documentElement.classList.remove("light");
        document.body && document.body.classList.remove("light");
      }
    } catch (e) {}
  })();

  const themeToggle = document.getElementById("kk-theme-toggle");

  function setTheme(isLight) {
    try {
      if (isLight) {
        document.documentElement.classList.add("light");
        if (document.body) document.body.classList.add("light");
        localStorage.setItem(THEME_KEY, "light");
        themeToggle.textContent = "☀️";
        themeToggle.setAttribute("aria-pressed", "true");
      } else {
        document.documentElement.classList.remove("light");
        if (document.body) document.body.classList.remove("light");
        localStorage.setItem(THEME_KEY, "dark");
        themeToggle.textContent = "🌙";
        themeToggle.setAttribute("aria-pressed", "false");
      }
    } catch (e) { console.warn(e); }
  }

  (function initThemeButton() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light") setTheme(true);
      else if (saved === "dark") setTheme(false);
      else {
        const hr = new Date().getHours();
        setTheme(hr >= 7 && hr < 19);
      }
    } catch (e) { setTheme(false); }
  })();

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isLight = document.body ? document.body.classList.contains("light") : document.documentElement.classList.contains("light");
      setTheme(!isLight);
    });
  }

  /* ---------- hide old headers (conservative) ---------- */
  try {
    const selectorsToHide = ["header", ".header", "#header", ".site-header", ".site-hero"];
    selectorsToHide.forEach(sel => {
      document.querySelectorAll(sel).forEach(n => {
        if (n.id === "kk-header-inject") return;
        const maybeLogo = n.querySelector && n.querySelector("img[src*='logo']");
        if (maybeLogo || n.classList.contains("site-header") || n.tagName.toLowerCase() === "header") {
          try { n.style.display = "none"; } catch (e) {}
        }
      });
    });
  } catch (e) {}

  /* ---------- reload hero helper ---------- */
  window.__kk_reload_hero = function () {
    try {
      const hero = getHeroUrl();
      const heroEl = document.querySelector(".kk-header-hero");
      if (heroEl) heroEl.style.backgroundImage = `linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url("${hero}")`;
    } catch (e) {}
  };

})();
