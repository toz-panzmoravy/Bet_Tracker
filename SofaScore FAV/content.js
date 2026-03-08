/**
 * SofaScore FAV – content script běží jen na sofascore.com.
 * Načte zápasy z BetTracker API a přidá je do SofaScore Favourites.
 */
(function () {
  const API_URL_KEY = "sofascore_fav_api_url";
  const DEFAULT_API = "http://127.0.0.1:15555/api";
  const DELAY_BETWEEN_MATCHES_MS = 2000;
  const SYNC_STATE_KEY = "sofascore_fav_sync_state";
  const PAUSE_FLAG_KEY = "sofascore_fav_paused";
  const FAV_CLICK_DELAY_MS = 1000;

  function getApiBase(cb) {
    chrome.storage.local.get([API_URL_KEY], function (r) {
      const base = (r[API_URL_KEY] || DEFAULT_API).replace(/\/+$/, "");
      cb(base);
    });
  }

  function injectUI() {
    if (document.getElementById("sofascore-fav-root")) return;
    const root = document.createElement("div");
    root.id = "sofascore-fav-root";
    root.innerHTML = `
      <div id="sofascore-fav-missing-banner" class="sofascore-fav-missing-banner" hidden>
        <div class="sofascore-fav-missing-content">
          <strong>Zápasy nejsou v Oblíbených</strong>
          <p class="sofascore-fav-missing-hint">Následující zápasy z overlay nebyly přidány do SofaScore Oblíbených. Vyřešte to ručně a zavřete zprávu.</p>
          <ul id="sofascore-fav-missing-list"></ul>
        </div>
        <button type="button" id="sofascore-fav-missing-close" class="sofascore-fav-missing-close" title="Zavřít">×</button>
      </div>
      <div id="sofascore-fav-panel">
        <div class="sofascore-fav-header">BetTracker → Favourites</div>
        <div class="sofascore-fav-status" id="sofascore-fav-status">—</div>
        <div class="sofascore-fav-actions">
          <button type="button" id="sofascore-fav-btn" class="sofascore-fav-btn">Sync zápasů do Favourites</button>
          <button type="button" id="sofascore-fav-pause" class="sofascore-fav-pause" hidden title="Pozastavit sync">STOP</button>
          <button type="button" id="sofascore-fav-resume" class="sofascore-fav-resume" hidden title="Pokračovat">Pokračovat</button>
          <button type="button" id="sofascore-fav-test" class="sofascore-fav-test" title="Otevřete stránku zápasu a spusťte – vyzkouší různé způsoby kliknutí">Test Oblíbené</button>
        </div>
        <div class="sofascore-fav-log" id="sofascore-fav-log"></div>
      </div>
    `;
    const style = document.createElement("style");
    style.textContent = `
      #sofascore-fav-root { position: fixed; bottom: 16px; right: 16px; z-index: 999999; font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
      .sofascore-fav-missing-banner {
        display: flex; align-items: flex-start; gap: 8px; background: #3d1f1f; color: #f0c0c0; border: 1px solid #a55;
        border-radius: 10px; padding: 12px 14px; min-width: 260px; max-width: 360px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      }
      .sofascore-fav-missing-banner[hidden] { display: none !important; }
      .sofascore-fav-missing-content { flex: 1; }
      .sofascore-fav-missing-content strong { display: block; margin-bottom: 4px; }
      .sofascore-fav-missing-hint { font-size: 0.75rem; margin: 0 0 8px 0; opacity: 0.9; }
      .sofascore-fav-missing-content ul { margin: 0; padding-left: 18px; font-size: 0.8rem; max-height: 120px; overflow-y: auto; }
      .sofascore-fav-missing-close { background: transparent; border: none; color: #e6edf3; font-size: 1.4rem; line-height: 1; cursor: pointer; padding: 0 4px; }
      .sofascore-fav-missing-close:hover { color: #fff; }
      #sofascore-fav-panel {
        background: #1a1d21; color: #e6edf3; border-radius: 10px; padding: 12px 14px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4); min-width: 260px; max-width: 320px;
      }
      .sofascore-fav-header { font-weight: 700; font-size: 0.9rem; margin-bottom: 6px; }
      .sofascore-fav-status { font-size: 0.8rem; color: #8b949e; margin-bottom: 8px; min-height: 1.2em; }
      .sofascore-fav-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
      .sofascore-fav-btn { flex: 1; min-width: 120px; padding: 8px 12px; background: #238636; color: #fff; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 0.85rem; }
      .sofascore-fav-btn:hover { background: #2ea043; }
      .sofascore-fav-btn:disabled { background: #30363d; color: #8b949e; cursor: not-allowed; }
      .sofascore-fav-pause, .sofascore-fav-resume { padding: 6px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; border: 1px solid #484f58; }
      .sofascore-fav-pause { background: #da3636; color: #fff; }
      .sofascore-fav-pause:hover { background: #b62323; }
      .sofascore-fav-resume { background: #238636; color: #fff; }
      .sofascore-fav-resume:hover { background: #2ea043; }
      .sofascore-fav-test { padding: 6px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; cursor: pointer; border: 1px solid #484f58; background: #30363d; color: #8b949e; }
      .sofascore-fav-test:hover { background: #484f58; color: #e6edf3; }
      .sofascore-fav-log { font-size: 0.75rem; color: #8b949e; margin-top: 8px; max-height: 180px; overflow-y: auto; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(root);

    const btn = document.getElementById("sofascore-fav-btn");
    const pauseBtn = document.getElementById("sofascore-fav-pause");
    const resumeBtn = document.getElementById("sofascore-fav-resume");
    const testBtn = document.getElementById("sofascore-fav-test");
    const missingClose = document.getElementById("sofascore-fav-missing-close");
    if (btn) btn.addEventListener("click", onSyncClick);
    if (pauseBtn) pauseBtn.addEventListener("click", onPauseClick);
    if (resumeBtn) resumeBtn.addEventListener("click", onResumeClick);
    if (testBtn) testBtn.addEventListener("click", runClickTest);
    if (missingClose) missingClose.addEventListener("click", () => hideMissingBanner());
  }

  function setStatus(text) {
    const el = document.getElementById("sofascore-fav-status");
    if (el) el.textContent = text;
  }

  function log(text) {
    const el = document.getElementById("sofascore-fav-log");
    if (el) {
      const line = document.createElement("div");
      line.textContent = text;
      el.appendChild(line);
      el.scrollTop = el.scrollHeight;
    }
  }

  function setBusy(busy) {
    const btn = document.getElementById("sofascore-fav-btn");
    const pauseBtn = document.getElementById("sofascore-fav-pause");
    if (btn) btn.disabled = busy;
    if (pauseBtn) pauseBtn.hidden = !busy;
  }

  function onPauseClick() {
    chrome.storage.local.set({ [PAUSE_FLAG_KEY]: true });
  }

  function onResumeClick() {
    chrome.storage.local.get([SYNC_STATE_KEY], (r) => {
      const state = r[SYNC_STATE_KEY];
      if (!state || !state.events || state.events.length === 0) return;
      state.paused = false;
      chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
      document.getElementById("sofascore-fav-resume").hidden = true;
      setBusy(true);
      runResumeNext(state);
    });
  }

  function showResumeButton() {
    const el = document.getElementById("sofascore-fav-resume");
    if (el) el.hidden = false;
  }

  function hideResumeButton() {
    const el = document.getElementById("sofascore-fav-resume");
    if (el) el.hidden = true;
  }

  function showMissingBanner(missingEvents) {
    const banner = document.getElementById("sofascore-fav-missing-banner");
    const listEl = document.getElementById("sofascore-fav-missing-list");
    if (!banner || !listEl) return;
    listEl.innerHTML = "";
    (missingEvents || []).forEach((ev) => {
      const li = document.createElement("li");
      li.textContent = (ev.home_team || "") + " – " + (ev.away_team || "");
      listEl.appendChild(li);
    });
    banner.hidden = false;
  }

  function hideMissingBanner() {
    const banner = document.getElementById("sofascore-fav-missing-banner");
    if (banner) banner.hidden = true;
  }

  function runResumeNext(state) {
    if (!state.events || state.events.length === 0) {
      chrome.storage.local.remove(SYNC_STATE_KEY);
      setStatus("Hotovo.");
      setBusy(false);
      return;
    }
    const next = state.events[0];
    const input = findSearchBox();
    if (input) {
      const q = searchQuery(next);
      input.focus();
      input.value = q;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("keyup", { bubbles: true }));
      setTimeout(() => {
        const link = findFirstDropdownMatchLink();
        if (link) {
          const href = link.getAttribute("href") || "";
          const fullUrl = href.startsWith("http") ? href : "https://www.sofascore.com" + (href.startsWith("/") ? href : "/" + href);
          chrome.storage.local.set({ [SYNC_STATE_KEY]: { ...state, step: "match" } });
          window.location.href = fullUrl;
        } else {
          state.missingEvents = state.missingEvents || [];
          state.missingEvents.push(next);
          state.events = state.events.slice(1);
          if (state.events.length > 0) {
            chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
            window.location.href = "https://www.sofascore.com/search?q=" + encodeURIComponent(searchQuery(state.events[0]));
          } else {
            chrome.storage.local.remove(SYNC_STATE_KEY);
            setStatus("Hotovo. " + summaryText(state));
            setBusy(false);
            if (state.missingEvents.length > 0) showMissingBanner(state.missingEvents);
          }
        }
      }, 1800);
    } else {
      window.location.href = "https://www.sofascore.com/search?q=" + encodeURIComponent(searchQuery(next));
    }
  }

  /** Načte zápasy přes background script (obchází CORS z stránky SofaScore). */
  function fetchEvents(apiBase) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "fetchEvents", apiBase }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Extension error"));
          return;
        }
        if (response && response.ok) resolve(response.data);
        else reject(new Error((response && response.error) || "Failed to fetch"));
      });
    });
  }

  function onSyncClick() {
    getApiBase(async (apiBase) => {
      setBusy(true);
      const logEl = document.getElementById("sofascore-fav-log");
      if (logEl) logEl.innerHTML = "";
      setStatus("Načítám zápasy…");
      try {
        const events = await fetchEvents(apiBase);
        if (!events || events.length === 0) {
          setStatus("Žádné zápasy k synchronizaci.");
          log("Otevřete BetTracker a naimportujte tikety (live/upcoming).");
          setBusy(false);
          return;
        }
        setStatus(`Nalezeno ${events.length} zápasů. Spouštím sync…`);
        await runSync(events);
      } catch (e) {
        setStatus("Chyba");
        log("Chyba: " + (e.message || String(e)));
        log("1) Spusťte backend: run-backend.bat nebo BetTracker.bat");
        log("2) V nastavení extension zadejte: http://127.0.0.1:15555/api");
        log("3) Ověřte v prohlížeči: otevřete http://127.0.0.1:15555/api/sofascore-sync/events");
        setBusy(false);
      }
    });
  }

  /** Formát vyhledávacího dotazu: Domácí - Hosté */
  function searchQuery(ev) {
    return (ev.home_team || "").trim() + " - " + (ev.away_team || "").trim();
  }

  /** Najde searchbox na stránce (různé možné selektory SofaScore). */
  function findSearchBox() {
    const selectors = [
      'input[type="search"]',
      'input[placeholder*="Search" i]',
      'input[placeholder*="Hledat" i]',
      'input[placeholder*="Vyhledat" i]',
      'input[aria-label*="search" i]',
      'header input[type="text"]',
      'form[role="search"] input',
      'input.search-input',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  /** Normalizuje název pro porovnání (bez diakritiky, malá písmena, zkratky). */
  function norm(s) {
    return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  /** Vrátí true, pokud text obsahuje oba názvy (částečná shoda). */
  function textContainsBoth(text, home, away) {
    const t = norm(text);
    const h = norm(home);
    const a = norm(away);
    if (!h || !a) return false;
    return t.indexOf(h) !== -1 && t.indexOf(a) !== -1;
  }

  /**
   * Najde v dropdownu odkaz na zápas. Preferuje odkaz, jehož text obsahuje oba názvy týmů (sport + event).
   * Přijímá ev = { home_team, away_team } pro výběr správného výsledku (tenis, hokej atd.).
   */
  function findBestDropdownMatchLink(ev) {
    const linkSelectors = [
      'a[href*="/event/"]',
      'a[href*="/match/"]',
      'a[href*="/football/"]',
      'a[href*="/hockey/"]',
      'a[href*="/basketball/"]',
      'a[href*="/tennis/"]',
    ];
    const home = (ev && ev.home_team) || "";
    const away = (ev && ev.away_team) || "";
    let candidates = [];
    for (const sel of linkSelectors) {
      const links = document.querySelectorAll(sel);
      for (const a of links) {
        const href = (a.getAttribute("href") || "").trim();
        if (href.indexOf("/team/") !== -1 && href.split("/").length < 6) continue;
        if (a.offsetParent !== null && a.getBoundingClientRect().height > 0) candidates.push(a);
      }
    }
    for (const a of candidates) {
      const text = (a.textContent || a.innerText || "").trim();
      if (home && away && textContainsBoth(text, home, away)) return a;
    }
    return candidates[0] || null;
  }

  function findFirstDropdownMatchLink() {
    return findBestDropdownMatchLink(null);
  }

  /** Zkontroluje, zda stránka zobrazuje daný zápas (názvy týmů v titulku nebo v body). */
  function pageMatchesEvent(ev) {
    if (!ev || (!ev.home_team && !ev.away_team)) return true;
    const bodyText = (document.body && (document.body.innerText || document.body.textContent)) || "";
    const title = document.title || "";
    const combined = (bodyText + " " + title).toLowerCase();
    const h = (ev.home_team || "").toLowerCase().trim();
    const a = (ev.away_team || "").toLowerCase().trim();
    if (!h || !a) return true;
    return combined.indexOf(h) !== -1 && combined.indexOf(a) !== -1;
  }

  /** Na stránce zápasu: tlačítko „Oblíbené“ (Favourites). SofaScore: aria-label="Oblíbené", class obsahuje button--variant_filled (přidat) nebo button--variant_clear (již v obl.). */
  function findFavouriteButton() {
    const selectors = [
      'button[aria-label="Oblíbené"]',
      'button[aria-label="Favourites"]',
      'button[aria-label*="oblíbené" i]',
      'button[aria-label*="favourites" i]',
      'a[aria-label="Oblíbené"]',
      'a[aria-label="Favourites"]',
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return el;
      } catch (_) {}
    }
    const buttons = document.querySelectorAll('button[class*="button--"], button.button, a.button');
    for (const el of buttons) {
      const aria = (el.getAttribute("aria-label") || "").trim();
      const text = (el.textContent || "").trim();
      if (aria.indexOf("Oblíbené") !== -1 || aria.indexOf("Favourites") !== -1 || text.indexOf("Oblíbené") !== -1) return el;
    }
    return null;
  }

  /**
   * Zda je zápas již v Oblíbených.
   * SofaScore: před kliknutím = button--variant_filled, po přidání = button--variant_clear.
   */
  function isAlreadyInFavourites(btn) {
    if (!btn) return false;
    const cls = (btn.className || "") + " " + (btn.getAttribute("class") || "");
    if (/button--variant_clear/.test(cls)) return true;
    const text = (btn.textContent || "").trim();
    const aria = (btn.getAttribute("aria-label") || "").trim();
    const pressed = btn.getAttribute("aria-pressed");
    if (text.indexOf("Odebrat") !== -1 || aria.indexOf("Odebrat") !== -1) return true;
    if (text.indexOf("Remove") !== -1 || aria.indexOf("Remove") !== -1) return true;
    if (pressed === "true") return true;
    if (/active|selected|filled|is-active|is-selected/.test(cls)) return true;
    if (text.length <= 2 && btn.querySelector("svg")) return true;
    return false;
  }

  /**
   * TEST: Zkouší různé způsoby kliknutí na tlačítko Oblíbené a loguje, který změní stav (variant_clear).
   * Spusť na stránce zápasu, kde zápas NENÍ v oblíbených. Po každé metodě čeká 2 s a přečte stav.
   */
  function runClickTest() {
    const logEl = document.getElementById("sofascore-fav-log");
    if (logEl) logEl.innerHTML = "";
    function testLog(msg) {
      if (logEl) {
        const line = document.createElement("div");
        line.textContent = msg;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
      }
    }

    const btn = findFavouriteButton();
    if (!btn) {
      testLog("CHYBA: Tlačítko Oblíbené nenalezeno. Jste na stránce zápasu?");
      return;
    }
    const state = function () {
      const b = findFavouriteButton();
      return b ? (isAlreadyInFavourites(b) ? "V OBLÍBENÝCH" : "není v obl.") : "tlačítko zmizelo";
    };
    testLog("Stav na začátku: " + state());
    if (isAlreadyInFavourites(btn)) testLog("(Zápas už JE v obl. – test zkusí „odebrat“. Pro test přidání otevřete zápas, který v obl. není.)");
    testLog("Class: " + (btn.className || "").substring(0, 80) + "...");
    testLog("(Metody s „injected script“ vynechány – CSP stránky je blokuje.)");
    testLog("--- Zkouším metody (po každé 2 s) ---");

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    const methods = [
      {
        name: "1. Content script: scroll + native .click()",
        run: function () {
          btn.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
          btn.focus();
          btn.click();
        },
      },
      {
        name: "2. Content script: MouseEvent('click') s souřadnicemi",
        run: function () {
          btn.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
          const r = btn.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y }));
        },
      },
      {
        name: "3. Content script: klik na vnitřní div (child)",
        run: function () {
          const child = btn.querySelector("div") || btn.querySelector("span") || btn;
          child.click();
        },
      },
      {
        name: "4. Content script: focus + Enter",
        run: function () {
          btn.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
          btn.focus();
          btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
          btn.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
        },
      },
      {
        name: "5. Content script: focus + Space",
        run: function () {
          btn.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
          btn.focus();
          btn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", keyCode: 32, bubbles: true }));
          btn.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", keyCode: 32, bubbles: true }));
        },
      },
    ];

    (async function runAll() {
      for (let i = 0; i < methods.length; i++) {
        const m = methods[i];
        const before = state();
        testLog("");
        testLog(">>> " + m.name);
        try {
          m.run();
        } catch (e) {
          testLog("   Výjimka: " + (e.message || e));
        }
        await wait(2000);
        const after = state();
        testLog("   Před: " + before + " → Po: " + after);
        if (after === "V OBLÍBENÝCH" && before !== "V OBLÍBENÝCH") {
          testLog("   *** TATO METODA ZAFUNGOVALA ***");
        }
      }
      testLog("");
      testLog("--- Konec testu ---");
    })();
  }

  /**
   * SofaScore vyžaduje skutečné uživatelské kliknutí (programatické nefunguje).
   * Zobrazíme overlay s výzvou; vrací Promise<true> když uživatel klikl, <false> při timeoutu.
   */
  function triggerFavouriteClick(btn) {
    if (!btn) return Promise.resolve(false);
    return showWaitForFavouriteClick();
  }

  const FAV_CLICK_WAIT_TIMEOUT_MS = 45000;
  const FAV_CLICK_POLL_MS = 400;
  let favClickOverlayEl = null;

  function showWaitForFavouriteClick() {
    if (favClickOverlayEl && favClickOverlayEl.parentNode) {
      return new Promise(function (resolve) {
        const check = setInterval(function () {
          if (!favClickOverlayEl || !favClickOverlayEl.parentNode) {
            clearInterval(check);
            resolve(findFavouriteButton() && isAlreadyInFavourites(findFavouriteButton()));
          }
        }, 500);
      });
    }
    return new Promise(function (resolve) {
      const overlay = document.createElement("div");
      overlay.id = "sofascore-fav-wait-overlay";
      favClickOverlayEl = overlay;
      overlay.innerHTML = `
        <div class="sofascore-fav-wait-box">
          <p class="sofascore-fav-wait-title">Přidejte zápas do Oblíbených</p>
          <p class="sofascore-fav-wait-text">Klikněte na tlačítko <strong>Oblíbené</strong> (hvězdička) na této stránce.</p>
          <p class="sofascore-fav-wait-hint">SofaScore neumožňuje přidat programaticky – potřebujeme vaše kliknutí.</p>
          <p class="sofascore-fav-wait-timer" id="sofascore-fav-wait-timer">Čekám…</p>
        </div>
      `;
      const style = document.createElement("style");
      style.textContent = `
        #sofascore-fav-wait-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 999998;
          background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
          font-family: system-ui, sans-serif;
        }
        .sofascore-fav-wait-box {
          background: #1a1d21; color: #e6edf3; padding: 24px 28px; border-radius: 12px;
          max-width: 360px; box-shadow: 0 8px 32px rgba(0,0,0,0.5); text-align: center;
        }
        .sofascore-fav-wait-title { font-size: 1.1rem; font-weight: 700; margin: 0 0 12px 0; }
        .sofascore-fav-wait-text { font-size: 0.95rem; margin: 0 0 8px 0; }
        .sofascore-fav-wait-hint { font-size: 0.8rem; color: #8b949e; margin: 0 0 12px 0; }
        .sofascore-fav-wait-timer { font-size: 0.85rem; color: #58a6ff; margin: 0; }
      `;
      document.head.appendChild(style);
      document.body.appendChild(overlay);

      const timerEl = document.getElementById("sofascore-fav-wait-timer");
      const start = Date.now();
      const tick = function () {
        const b = findFavouriteButton();
        if (b && isAlreadyInFavourites(b)) {
          var timerEl2 = document.getElementById("sofascore-fav-wait-timer");
          if (timerEl2) timerEl2.textContent = "Přidáno! Za chvíli další zápas…";
          setTimeout(function () {
            if (overlay.parentNode) overlay.remove();
            favClickOverlayEl = null;
            resolve(true);
          }, 1000);
          return;
        }
        const elapsed = Math.round((Date.now() - start) / 1000);
        if (elapsed >= FAV_CLICK_WAIT_TIMEOUT_MS / 1000) {
          if (timerEl) timerEl.textContent = "Čas vypršel – přejdu dál.";
          setTimeout(function () {
            if (overlay.parentNode) overlay.remove();
            favClickOverlayEl = null;
            resolve(false);
          }, 2000);
          return;
        }
        if (timerEl) timerEl.textContent = "Čekám na vaše kliknutí… (" + elapsed + " s)";
        setTimeout(tick, FAV_CLICK_POLL_MS);
      };
      setTimeout(tick, FAV_CLICK_POLL_MS);
    });
  }

  function hideWaitForFavouriteClick() {
    if (favClickOverlayEl && favClickOverlayEl.parentNode) {
      favClickOverlayEl.remove();
      favClickOverlayEl = null;
    }
  }

  /**
   * Flow 1: Použít searchbox – zadat „Domácí - Hosté“, počkat na dropdown, kliknout na 1. položku.
   * remainingEvents = celý zbytek zápasů (včetně aktuálního ev); po přechodu na zápas se zpracují.
   * Vrací true, pokud se podařilo kliknout a proběhne navigace.
   */
  function runSearchBoxFlow(ev, remainingEvents, addedSoFar, alreadySoFar, totalCount) {
    const input = findSearchBox();
    if (!input) return Promise.resolve(false);
    const q = searchQuery(ev);
    input.focus();
    input.value = q;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("keyup", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return new Promise((resolve) => {
      setTimeout(() => {
        const link = findBestDropdownMatchLink(ev);
        if (link) {
          const href = link.getAttribute("href") || "";
          const fullUrl = href.startsWith("http") ? href : "https://www.sofascore.com" + (href.startsWith("/") ? href : "/" + href);
          chrome.storage.local.set({
            [SYNC_STATE_KEY]: { step: "match", events: remainingEvents, added: addedSoFar || 0, alreadyInFavourites: alreadySoFar || 0, total: totalCount || 0, missingEvents: [] },
          });
          window.location.href = fullUrl;
          resolve(true);
        } else resolve(false);
      }, 1800);
    });
  }

  /** Vrátí text shrnutí: přidáno, již v obl., celkem, chybí. */
  function summaryText(st) {
    const total = st.total || 0;
    const added = st.added || 0;
    const already = st.alreadyInFavourites || 0;
    const missing = Math.max(0, total - added - already);
    return "Přidáno: " + added + " | Již v obl.: " + already + " | Celkem: " + total + (missing > 0 ? " | Chybí: " + missing : "");
  }

  /**
   * Pro každý zápas: searchbox → „Domácí - Hosté“ → dropdown → 1. položka → stránka zápasu → tlačítko Oblíbené.
   * Žádné umělé omezení počtu – zpracují se všechny; pokud nějaké nedoběhnou, jde o vyhledávání/dropdown. Při opětovném Sync se zápasy již v Oblíbených přeskočí.
   */
  async function runSync(events) {
    const total = events.length;
    let added = 0;
    let alreadyInFavourites = 0;
    const url = window.location.href;
    const isMatchPage = /\/event\/|\/match\//i.test(url) || /\/[a-z]{2}\/[a-z]+\/[^/]+\/[^/]+/.test(url);

    if (isMatchPage && events.length > 0) {
      const ev = events[0];
      log(`[1/${total}] ${ev.home_team} – ${ev.away_team}`);
      const btn = findFavouriteButton();
      if (btn) {
        if (isAlreadyInFavourites(btn)) {
          alreadyInFavourites++;
          log("  → Již v Oblíbených (přeskočeno)");
        } else {
          const success = await triggerFavouriteClick(btn);
          if (success) {
            added++;
            log("  → Přidáno do Oblíbených");
          } else {
            log("  → Čas vypršel – klikněte příště na Oblíbené");
          }
        }
      } else {
        log("  → Tlačítko Oblíbené nenalezeno");
      }
      const state = { added, alreadyInFavourites, total };
      setStatus(summaryText(state));
      if (events.length === 1) {
        setStatus("Hotovo. " + summaryText(state));
        setBusy(false);
        return;
      }
      const nextEvents = events.slice(1);
      const didSearch = await runSearchBoxFlow(nextEvents[0], nextEvents, added, alreadyInFavourites, total);
      if (!didSearch) {
        chrome.storage.local.set({
          [SYNC_STATE_KEY]: { events: nextEvents, added, alreadyInFavourites, total, step: "search", missingEvents: [] },
        });
        window.location.href = "https://www.sofascore.com/search?q=" + encodeURIComponent(searchQuery(nextEvents[0]));
      }
      return;
    }

    if (events.length === 0) {
      setStatus("Žádné zápasy.");
      setBusy(false);
      return;
    }

    const ev = events[0];
    log(`[1/${total}] ${ev.home_team} – ${ev.away_team}`);
    const didSearch = await runSearchBoxFlow(ev, events, 0, 0, total);
    if (didSearch) return;
    chrome.storage.local.set({
      [SYNC_STATE_KEY]: { events, added: 0, alreadyInFavourites: 0, total, step: "search", missingEvents: [] },
    });
    window.location.href = "https://www.sofascore.com/search?q=" + encodeURIComponent(searchQuery(ev));
  }

  /**
   * Po úspěšném přidání se tlačítko změní na hvězdičku / "Odebrat". Klikneme, 1 s počkáme, ověříme; pokud ne, opakujeme (max 3×).
   * Vrací Promise<"added" | "already" | "not_found">.
   */
  function tryClickFavouriteOnThisPage() {
    const btn = findFavouriteButton();
    if (!btn) return Promise.resolve("not_found");
    if (isAlreadyInFavourites(btn)) return Promise.resolve("already");

    return triggerFavouriteClick(btn).then(function (success) {
      return success ? "added" : "not_found";
    });
  }

  function checkSyncState() {
    chrome.storage.local.get([SYNC_STATE_KEY], function (r) {
      const state = r[SYNC_STATE_KEY];
      if (!state || !state.events || state.events.length === 0) {
        if (state && (!state.events || state.events.length === 0)) {
          chrome.storage.local.remove(SYNC_STATE_KEY);
          setBusy(false);
        }
        return;
      }
      const url = window.location.href;
      const isSearchPage = /\/search/i.test(url);
      const isMatchPage = /\/event\/|\/match\//i.test(url) || /\/[a-z]{2}\/[a-z]+\/[^/]+\/[^/]+/.test(url);

      if (state.step === "search" && isSearchPage) {
        const linkSelectors = ['a[href*="/event/"]', 'a[href*="/match/"]', 'a[href*="/football/"]', 'a[href*="/hockey/"]'];
        let found = null;
        for (const sel of linkSelectors) {
          const a = document.querySelector(sel);
          if (a) {
            const href = a.getAttribute("href") || "";
            if (href.indexOf("/team/") !== -1 && href.split("/").length < 6) continue;
            found = href;
            break;
          }
        }
        if (found) {
          const fullUrl = found.startsWith("http") ? found : "https://www.sofascore.com" + (found.startsWith("/") ? found : "/" + found);
          chrome.storage.local.set({ [SYNC_STATE_KEY]: { ...state, step: "match" } });
          window.location.href = fullUrl;
        } else {
          state.missingEvents = state.missingEvents || [];
          if (state.events.length > 0) state.missingEvents.push(state.events[0]);
          state.events = state.events.slice(1);
          if (state.events.length > 0) {
            chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
            window.location.href = "https://www.sofascore.com/search?q=" + encodeURIComponent(searchQuery(state.events[0]));
          } else {
            chrome.storage.local.remove(SYNC_STATE_KEY);
            setStatus("Hotovo. " + summaryText(state));
            setBusy(false);
            if (state.missingEvents.length > 0) showMissingBanner(state.missingEvents);
          }
        }
      } else if ((state.step === "match" || isMatchPage) && state.events && state.events.length > 0) {
        setTimeout(function () {
          const currentEv = state.events[0];
          if (!pageMatchesEvent(currentEv)) {
            state.missingEvents = state.missingEvents || [];
            state.missingEvents.push(currentEv);
            state.events = state.events.slice(1);
            state.step = "search";
            if (!state.events || state.events.length === 0) {
              chrome.storage.local.remove(SYNC_STATE_KEY);
              setStatus("Hotovo. " + summaryText(state));
              setBusy(false);
              if (state.missingEvents && state.missingEvents.length > 0) showMissingBanner(state.missingEvents);
              return;
            }
            chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
            const next = state.events[0];
            const input = findSearchBox();
            if (input) {
              const q = searchQuery(next);
              input.focus();
              input.value = q;
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("keyup", { bubbles: true }));
              setTimeout(() => {
                const link = findBestDropdownMatchLink(next);
                if (link) {
                  const href = link.getAttribute("href") || "";
                  const fullUrl = href.startsWith("http") ? href : "https://www.sofascore.com" + (href.startsWith("/") ? href : "/" + href);
                  chrome.storage.local.set({ [SYNC_STATE_KEY]: { ...state, step: "match" } });
                  window.location.href = fullUrl;
                } else {
                  state.missingEvents = state.missingEvents || [];
                  state.missingEvents.push(next);
                  state.events = state.events.slice(1);
                  if (state.events.length > 0) {
                    chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
                    window.location.href = "https://www.sofascore.com/search?q=" + encodeURIComponent(searchQuery(state.events[0]));
                  } else {
                    chrome.storage.local.remove(SYNC_STATE_KEY);
                    setStatus("Hotovo. " + summaryText(state));
                    setBusy(false);
                    if (state.missingEvents.length > 0) showMissingBanner(state.missingEvents);
                  }
                }
              }, 1800);
            } else {
              window.location.href = "https://www.sofascore.com/search?q=" + encodeURIComponent(searchQuery(next));
            }
            return;
          }
          tryClickFavouriteOnThisPage().then(function (result) {
            if (result === "added") state.added = (state.added || 0) + 1;
            if (result === "already") state.alreadyInFavourites = (state.alreadyInFavourites || 0) + 1;
            if (result === "not_found") {
              state.missingEvents = state.missingEvents || [];
              state.missingEvents.push(state.events[0]);
            }
            state.events = state.events.slice(1);
            state.step = "search";

            if (!state.events || state.events.length === 0) {
              chrome.storage.local.remove(SYNC_STATE_KEY);
              setStatus("Hotovo. " + summaryText(state));
              setBusy(false);
              if (state.missingEvents && state.missingEvents.length > 0) showMissingBanner(state.missingEvents);
              return;
            }

            if (state.total == null) state.total = state.events.length + (state.added || 0) + (state.alreadyInFavourites || 0) + 1;
            setStatus(summaryText(state));

            chrome.storage.local.get([PAUSE_FLAG_KEY], function (r) {
              if (r[PAUSE_FLAG_KEY]) {
                chrome.storage.local.set({ [PAUSE_FLAG_KEY]: false, [SYNC_STATE_KEY]: { ...state, paused: true } });
                setStatus("Pozastaveno. " + summaryText(state) + " Klikněte Pokračovat.");
                setBusy(false);
                showResumeButton();
                return;
              }
              chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
              const next = state.events[0];
              const input = findSearchBox();
              if (input) {
                const q = searchQuery(next);
                input.focus();
                input.value = q;
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("keyup", { bubbles: true }));
                setTimeout(() => {
                  const link = findBestDropdownMatchLink(next);
                  if (link) {
                    const href = link.getAttribute("href") || "";
                    const fullUrl = href.startsWith("http") ? href : "https://www.sofascore.com" + (href.startsWith("/") ? href : "/" + href);
                    chrome.storage.local.set({ [SYNC_STATE_KEY]: { ...state, step: "match" } });
                    window.location.href = fullUrl;
                  } else {
                    state.missingEvents = state.missingEvents || [];
                    state.missingEvents.push(next);
                    state.events = state.events.slice(1);
                    if (state.events.length > 0) {
                      chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
                      window.location.href = "https://www.sofascore.com/search?q=" + encodeURIComponent(searchQuery(state.events[0]));
                    } else {
                      chrome.storage.local.remove(SYNC_STATE_KEY);
                      setStatus("Hotovo. " + summaryText(state));
                      setBusy(false);
                      if (state.missingEvents.length > 0) showMissingBanner(state.missingEvents);
                    }
                  }
                }, 1800);
              } else {
                window.location.href = "https://www.sofascore.com/search?q=" + encodeURIComponent(searchQuery(next));
              }
            });
          });
        }, FAV_CLICK_DELAY_MS);
      }
    });
  }

  function init() {
    injectUI();
    chrome.storage.local.get([SYNC_STATE_KEY], (r) => {
      const state = r[SYNC_STATE_KEY];
      if (state && state.events && state.events.length > 0) {
        if (state.paused) {
          showResumeButton();
          setStatus("Pozastaveno. " + summaryText(state) + " Klikněte Pokračovat.");
        } else {
          setBusy(true);
        }
      }
      if (!state || !state.events || state.events.length === 0) {
        getApiBase((apiBase) => {
          fetchEvents(apiBase)
            .then((events) => {
              setStatus(Array.isArray(events) ? `Načteno ${events.length} zápasů z BetTrackeru.` : "Žádné zápasy.");
            })
            .catch(() => setStatus("Backend nedostupný. Spusťte BetTracker."));
        });
      }
    });
    setTimeout(checkSyncState, 1500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
