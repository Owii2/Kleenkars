// /assets/kk-header-loader.js
// Shared header loader for Kleenkars — replaceable single-file header.
// Changes included:
// - Top padding increased so hero image starts at the top and doesn't get cut off.
// - Removed "Open site" and toolbar tabs (Book / Pricing / Contact / Admin) per request.
// - Logo is clickable and links to /index.html.
// - Title & subtitle styling matched to the bottom header example (large bold title, subtle muted subtitle).
// - Background shows top of photo (background-position: top center).
// - Theme toggle retained (persists to localStorage under key "kleenkars.theme").
//
// Drop this file into /assets/kk-header-loader.js and include <script src="/assets/kk-header-loader.js" defer></script>
// in pages you want the shared header on.

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
    // prefer uploaded hero from localStorage (data:) else fallback to site hero
    try {
      const v = localStorage.getItem("kleenkars.hero");
      if (v && v.startsWith("data:")) return v;
    } catch (e) {}
    return "/assets/hero.jpg";
  }

  /* ---------- CSS / HTML ---------- */
  const css = `
  /* kk-header-loader styles */
  .kk-header-root{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;margin:0;color:var(--kk-ink,#e9e9ef)}
  .kk-header-hero{
    display:flex;
    align-items:center;
    gap:16px;

    /* background: show top of photo so subject won't be cut off */
    background-image: linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url("${getHeroUrl()}");
    background-position: top center;   /* show top of photo */
    background-size: cover;
    background-repeat: no-repeat;

    /* Increased top padding only (desktop) */
    padding:60px 30px 20px 30px; /* top right bottom left */
    border-radius:12px;
    margin:18px 18px 12px 18px;
    min-height:200px;
    box-shadow:0 6px 18px rgba(0,0,0,.4);
    color: #fff;
  }

  /* Logo: 110px requested size */
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

  /* Title & subtitle - use same look as the bottom header sample */
  .kk-title{
    font-weight:800;
    font-size: clamp(1.2rem, 3.5vw, 2.0rem); /* matches index sizing */
    line-height:1;
    color:#ffffff;
    text-transform:uppercase;
    margin-left:6px;
  }
  .kk-sub{
    color: rgba(255,255,255,0.9); /* subtle, slightly desaturated white like the bottom header */
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

  /* Theme toggle */
  #kk-theme-toggle{ background:transparent;border:0;color:inherit;font-size:1.1rem;cursor:pointer;padding:6px 8px;border-radius:8px }

  /* small screens - increase top padding a bit less on mobile */
  @media (max-width:640px){
    .kk-title{font-size:1.1rem}
    .kk-header-hero{min-height:170px;padding:50px 20px 14px 20px} /* mobile top padding slightly smaller */
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
        <!-- Open site removed as requested -->
      </div>
    </div>

    <!-- toolbar intentionally removed (Book / Pricing / Contact / Admin) -->
  </div>
  `;

  /* ---------- inject ---------- */
  const styleEl = el("style", { html: css });
  document.head.appendChild(styleEl);

  // remove any prior injected container (safe reload)
  const prev = document.getElementById("kk-header-inject");
  if (prev) prev.remove();

  const container = el("div", { id: "kk-header-inject", html: headerHtml });
  document.body.insertBefore(container, document.body.firstChild);

  /* ---------- theme toggle (robust) ---------- */
  // Shared localStorage key (used across pages)
  const THEME_KEY = "kleenkars.theme"; // value: "light" or "dark"

  // Apply saved theme early if possible (this runs after DOM created but before user sees header)
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
    } catch (e) { /* ignore */ }
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
    } catch (e) {
      console.warn("kk-theme: failed to set theme", e);
    }
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
    } catch (e) {
      setTheme(false);
    }
  })();

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isLight = document.body ? document.body.classList.contains("light") : document.documentElement.classList.contains("light");
      setTheme(!isLight);
    });
  }

  /* ---------- hide old headers to avoid duplicates (conservative) ---------- */
  try {
    const selectorsToHide = ["header", ".header", "#header", ".site-header", ".site-hero"];
    selectorsToHide.forEach(sel => {
      document.querySelectorAll(sel).forEach(n => {
        if (n.id === "kk-header-inject") return;
        // avoid hiding non-header elements — only hide ones that look like headers
        const maybeLogo = n.querySelector && n.querySelector("img[src*='logo']");
        if (maybeLogo || n.classList.contains("site-header") || n.tagName.toLowerCase() === "header") {
          try { n.style.display = "none"; } catch (e) {}
        }
      });
    });
  } catch (e) {}

  /* ---------- allow reload after hero changed (admin hero uploader) ---------- */
  window.__kk_reload_hero = function () {
    try {
      const hero = getHeroUrl();
      const heroEl = document.querySelector(".kk-header-hero");
      if (heroEl) heroEl.style.backgroundImage = `linear-gradient(0deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25)), url("${hero}")`;
    } catch (e) {}
  };

})();
