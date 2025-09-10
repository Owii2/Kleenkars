// /assets/kk-header-loader.js
// Shared header loader for Kleenkars — makes the injected hero tile match the homepage header tile
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
    // fallback to site asset (no cache-busting here; if you version hero update, add ?v=)
    return "/assets/hero.jpg";
  }

  /* ---------- CSS / HTML (copied behavior from index header) ---------- */
  const css = `
/* ---------- injected shared header (homepage-matching) ---------- */
.kk-header-root{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,"Helvetica Neue",Arial;margin:0;color:var(--kk-ink,#e9e9ef)}
.kk-header-hero {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  margin-bottom: 20px;
  /* spacing inside tile - matches site header */
}
.kk-header-hero::before{
  content:"";
  position:absolute;
  inset:0;
  background-image: url("${getHeroUrl()}");
  background-size: cover;
  background-position: center;
  filter: brightness(.35);
  z-index:0;
}
.kk-header-inner{
  position:relative; /* content sits above the ::before */
  z-index:1;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  padding:20px;
  background: linear-gradient(180deg, rgba(0,0,0,0.12), rgba(0,0,0,0.12));
  color: #fff;
}

/* brand block */
.kk-brand{ display:flex; align-items:center; gap:14px; min-width:0; }
.kk-brand a{ display:flex; align-items:center; gap:14px; text-decoration:none; color:inherit; }
.kk-logo {
  width: clamp(110px, 14vw, 160px); /* desktop scales, mobile forced below */
  height: auto;
  object-fit:contain;
  border-radius:10px;
  border:1px solid rgba(255,255,255,0.08);
  background: rgba(0,0,0,0.25);
  box-shadow: 0 6px 20px rgba(0,0,0,.4);
  display:block;
}
.kk-title-wrap { display:flex; flex-direction:column; min-width:0; }
.kk-title { font-weight:800; letter-spacing:.3px; font-size: clamp(1.2rem, 3.5vw, 2.0rem); color:#fff; line-height:1; }
.kk-sub { color: rgba(255,255,255,0.9); font-size:.95rem; margin-top:4px; }

/* header actions (right) */
.kk-header-controls{ display:flex; align-items:center; gap:10px; }
.kk-btn{ padding:8px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.06); background:transparent; color:#fff; font-weight:600; cursor:pointer; text-decoration:none; }
.kk-primary{ background:linear-gradient(90deg,#e63946,#c42b36); border-color:transparent; color:#fff; }

/* toolbar below hero (tabs) */
.kk-toolbar{ display:flex; gap:10px; padding:8px 18px; margin:12px 0 0 0; flex-wrap:wrap; }
.kk-toolbar .kk-tab{ background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:10px; color:#fff; font-weight:700; cursor:pointer; text-transform:none; }
.kk-toolbar .kk-tab.active{ background:#e63946; color:#fff; box-shadow:0 4px 12px rgba(230,57,70,0.18); }

/* mobile tweaks: keep same small-screen choices as index */
@media (max-width:600px){
  .kk-logo { width: 110px !important; } /* requested mobile logo size */
  .kk-header-hero::before { background-position: center 30%; filter: brightness(.4); } /* match homepage mobile shift */
  .kk-header-inner { padding:14px; gap:10px; }
  .kk-title { font-size: 1.0rem; }
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

  /* ---------- inject ---------- */
  const styleEl = el("style", { html: css });
  document.head.appendChild(styleEl);

  // remove previous injection (safe reload)
  const prev = document.getElementById("kk-header-inject");
  if (prev) prev.remove();

  const container = el("div", { id: "kk-header-inject", html: headerHtml });
  // insert at top of body so it visually matches homepage placement
  if (document.body && document.body.firstChild) document.body.insertBefore(container, document.body.firstChild);
  else document.body && document.body.appendChild(container);

  /* ---------- theme toggle (use same key as homepage 'theme') ---------- */
  const THEME_KEY = "theme"; // homepage uses localStorage 'theme'
  function applyTheme(isLight) {
    if (isLight) {
      document.body.classList.add("light");
      localStorage.setItem(THEME_KEY, "light");
      const btn = document.getElementById("kk-theme-toggle");
      if (btn) { btn.textContent = "☀️"; btn.setAttribute("aria-pressed", "true"); }
    } else {
      document.body.classList.remove("light");
      localStorage.setItem(THEME_KEY, "dark");
      const btn = document.getElementById("kk-theme-toggle");
      if (btn) { btn.textContent = "🌙"; btn.setAttribute("aria-pressed", "false"); }
    }
  }

  // apply saved early (if page already loaded quickly)
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light") document.body.classList.add("light");
    else if (saved === "dark") document.body.classList.remove("light");
  } catch (e) {}

  // initialize toggle button state and behavior
  const themeToggle = document.getElementById("kk-theme-toggle");
  (function initTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light") applyTheme(true);
      else if (saved === "dark") applyTheme(false);
      else {
        // default by current local time (same logic used on homepage)
        const hr = new Date().getHours();
        applyTheme(hr >= 7 && hr < 19); // day => light
      }
    } catch (e) {
      applyTheme(false);
    }
  })();

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const isLight = document.body.classList.contains("light");
      applyTheme(!isLight);
    });
  }

  /* ---------- toolbar nav handlers ---------- */
  document.querySelectorAll(".kk-toolbar .kk-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const url = tab.dataset.target || "/";
      try { window.location.href = url; } catch (e) {}
    });
  });

  /* ---------- best-effort: hide old headers to avoid duplicates ---------- */
  try {
    const selectorsToHide = ["header", ".header", "#header", ".site-header", ".site-hero"];
    selectorsToHide.forEach(sel => {
      document.querySelectorAll(sel).forEach(n => {
        if (!n || n.id === "kk-header-inject") return;
        // avoid hiding our injected header or nodes that definitely are not site headers
        try {
          // If element contains a site logo image, treat it as old header and hide it.
          const maybeLogo = n.querySelector && (n.querySelector("img[src*='logo']") || n.querySelector("img[src*='favicon']"));
          if (maybeLogo || n.classList.contains("site-header") || n.tagName.toLowerCase() === "header") {
            n.style.display = "none";
          }
        } catch (e) {}
      });
    });
  } catch (e) {}

  /* ---------- allow reload after hero changed (e.g. localStorage hero updated) ---------- */
  window.__kk_reload_hero = function () {
    try {
      const hero = getHeroUrl();
      const styleSheets = document.head.querySelectorAll("style");
      // update the injected style (simple approach: update background via inline style on element)
      const heroEl = document.querySelector(".kk-header-hero");
      if (heroEl) {
        heroEl.style.setProperty("background-image", `url("${hero}")`); // not used (we rely on ::before) but keep safe
        // update ::before by changing element's style attribute for background-image through a data attr trick
        heroEl.dataset.hero = hero;
        // update rule by setting inline --kk-hero-url (fallback)
        heroEl.style.setProperty("--kk-hero-url", `url("${hero}")`);
        // directly update its ::before via style element replacement: find our injected <style> and update the URL string
        // (the initial CSS used getHeroUrl() so easiest is reapply background-image on ::before by swapping style block)
        const newCss = \`${css.replace(/url\$begin:math:text$".*"\\$end:math:text$/, \`url("${hero}")\`)}\`;
        // replace our injected style element content
        const s = Array.from(document.head.querySelectorAll("style")).find(st => st.innerHTML && st.innerHTML.indexOf(".kk-header-hero::before") !== -1);
        if (s) s.innerHTML = newCss;
      }
    } catch (e) { /* ignore */ }
  };

})();
