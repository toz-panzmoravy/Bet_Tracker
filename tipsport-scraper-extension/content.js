(function () {
  function isTipsportPage() {
    return /tipsport\.cz$/i.test(location.hostname) || /tipsport\.cz/i.test(location.hostname);
  }

  function isBetanoPage() {
    return /betano\.cz$/i.test(location.hostname) || /betano\.cz/i.test(location.hostname);
  }

  function isBetanoBethistoryPage() {
    return isBetanoPage() && /\/myaccount\/bethistory/i.test(location.pathname || "");
  }

  function isBetanoBethistoryOpenPage() {
    return isBetanoPage() && /\/myaccount\/bethistory\/open/i.test(location.pathname || "");
  }

  function isFortunaPage() {
    return /ifortuna\.cz$/i.test(location.hostname) || /ifortuna\.cz/i.test(location.hostname);
  }

  function isTipsportMojeTikety() {
    return /tipsport\.cz/i.test(location.hostname) && /moje-tikety/i.test(location.pathname);
  }

  function isTipsportTicketDetail() {
    return /tipsport\.cz/i.test(location.hostname) && /\/tiket\?/i.test(location.search || "");
  }

  function isTipsportLiveZapas() {
    return /tipsport\.cz/i.test(location.hostname) && /\/live\/zapas\//i.test(location.pathname);
  }

  function parseNumber(str) {
    if (!str) return 0;
    return parseFloat(str.replace(/[^0-9,-]/g, "").replace(",", ".")) || 0;
  }

  const UPCOMING_WINDOW_HOURS = 6;

  function createImportButton() {
    const existing = document.getElementById("bettracker-import-btn");
    if (existing) return existing;

    const btn = document.createElement("button");
    btn.id = "bettracker-import-btn";

    // Minimalistický vzhled: proužek uprostřed pod panelem záložek
    btn.style.position = "fixed";
    btn.style.top = "10px";
    btn.style.left = "50%";
    btn.style.transform = "translateX(-50%)";
    btn.style.zIndex = "99999";
    btn.style.padding = "6px 14px";
    btn.style.borderRadius = "999px";
    // Světlé pozadí kvůli čitelnosti loga
    btn.style.border = "1px solid rgba(148,163,184,0.5)";
    btn.style.backgroundImage = "linear-gradient(135deg, #ffffff, #f3e8ff)";
    btn.style.color = "#4c1d95"; // tmavší fialová pro text
    btn.style.fontSize = "12px";
    btn.style.fontWeight = "600";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    btn.style.cursor = "pointer";
    btn.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.gap = "6px";
    btn.style.backdropFilter = "blur(10px)";

    // Ikona z rozšíření (logo BetTrackeru) – očekává se soubor logo-purple.png
    // ve stejné složce jako manifest.json. Pokud tam není, zobrazí se jen text.
    try {
      const icon = document.createElement("span");
      icon.style.display = "inline-block";
      icon.style.width = "20px";
      icon.style.height = "20px";
      icon.style.borderRadius = "4px";
      icon.style.backgroundImage = `url(${chrome.runtime.getURL("logo-purple.png")})`;
      icon.style.backgroundSize = "cover";
      icon.style.backgroundPosition = "center";
      icon.style.backgroundRepeat = "no-repeat";
      btn.appendChild(icon);
    } catch (_) {
      // ignore – fallback jen na text
    }

    const label = document.createElement("span");
    label.textContent = "IMPORT";
    label.style.letterSpacing = "0.08em";
    label.style.textTransform = "uppercase";
    btn.appendChild(label);

    // Badge s počtem nových tiketů (fialové číslo u pravého dolního rohu)
    const countBadge = document.createElement("span");
    countBadge.id = "bettracker-import-count";
    countBadge.textContent = "";
    countBadge.style.position = "absolute";
    countBadge.style.right = "-8px";
    countBadge.style.bottom = "-6px";
    countBadge.style.minWidth = "18px";
    countBadge.style.height = "18px";
    countBadge.style.borderRadius = "999px";
    countBadge.style.padding = "0 4px";
    countBadge.style.background = "#7c3aed";
    countBadge.style.color = "#f9fafb";
    countBadge.style.fontSize = "10px";
    countBadge.style.fontWeight = "700";
    countBadge.style.display = "none";
    countBadge.style.alignItems = "center";
    countBadge.style.justifyContent = "center";
    countBadge.style.boxShadow = "0 4px 10px rgba(124,58,237,0.6)";
    btn.appendChild(countBadge);

    btn.addEventListener("mouseenter", () => {
      btn.style.filter = "brightness(1.03)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.filter = "none";
    });

    document.body.appendChild(btn);
    return btn;
  }

  function createImportActiveButton() {
    const existing = document.getElementById("bettracker-import-active-btn");
    if (existing) return existing;
    const btn = document.createElement("button");
    btn.id = "bettracker-import-active-btn";

    // Umístění vedle tlačítka IMPORT (vpravo)
    btn.style.position = "fixed";
    btn.style.top = "10px";
    // ještě menší mezera vedle IMPORT tlačítka
    btn.style.left = "calc(50% + 80px)";
    btn.style.zIndex = "99999";
    btn.style.padding = "6px 14px";
    btn.style.borderRadius = "999px";
    // Světlé pozadí pro lepší čitelnost červeného loga
    btn.style.border = "1px solid rgba(248,113,113,0.6)";
    btn.style.backgroundImage = "linear-gradient(135deg, #ffffff, #fee2e2)";
    btn.style.color = "#b91c1c";
    btn.style.fontSize = "12px";
    btn.style.fontWeight = "700";
    btn.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    btn.style.cursor = "pointer";
    btn.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.gap = "6px";

    // Ikona (červené logo) – tlačítko pro sync do overlay
    try {
      const icon = document.createElement("span");
      icon.style.display = "inline-block";
      icon.style.width = "20px";
      icon.style.height = "20px";
      icon.style.borderRadius = "4px";
      icon.style.backgroundImage = `url(${chrome.runtime.getURL("redlive_v.png")})`;
      icon.style.backgroundSize = "cover";
      icon.style.backgroundPosition = "center";
      icon.style.backgroundRepeat = "no-repeat";
      btn.appendChild(icon);
    } catch (_) {
      // ignore – fallback jen na text
    }

    const label = document.createElement("span");
    label.textContent = "OVERLAY";
    label.style.letterSpacing = "0.12em";
    label.style.textTransform = "uppercase";
    btn.appendChild(label);

    btn.addEventListener("mouseenter", () => {
      btn.style.filter = "brightness(1.03)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.filter = "none";
    });

    document.body.appendChild(btn);
    return btn;
  }

  function createUpcomingButton() {
    const existing = document.getElementById("bettracker-upcoming-btn");
    if (existing) return existing;
    const btn = document.createElement("button");
    btn.id = "bettracker-upcoming-btn";
    btn.title = "Upcoming (0–6 h)";
    btn.style.position = "fixed";
    btn.style.top = "10px";
    btn.style.left = "calc(50% + 175px)";
    btn.style.zIndex = "99999";
    btn.style.padding = "6px 14px";
    btn.style.borderRadius = "999px";
    btn.style.border = "1px solid rgba(255,255,255,0.1)";
    btn.style.background = "rgba(15, 23, 42, 0.6)";
    btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
    btn.style.backdropFilter = "blur(8px)";
    btn.style.WebkitBackdropFilter = "blur(8px)";
    btn.style.cursor = "pointer";
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.gap = "6px";
    btn.style.transition = "all 0.2s ease";
    btn.textContent = "";

    try {
      var upUrl = chrome.runtime.getURL("future-match-icon.png");
      if (upUrl) {
        // Create an image element
        const img = document.createElement("img");
        img.src = upUrl;
        img.style.width = "20px";
        img.style.height = "20px";
        img.style.objectFit = "contain";
        // Invert for dark theme visibility
        img.style.filter = "invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.5))";
        btn.appendChild(img);

        // Add "SOON" text
        const textSpan = document.createElement("span");
        textSpan.textContent = "SOON";
        textSpan.style.color = "#f8fafc";
        textSpan.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        textSpan.style.fontSize = "12px";
        textSpan.style.fontWeight = "600";
        textSpan.style.letterSpacing = "0.08em";
        textSpan.style.textTransform = "uppercase";
        btn.appendChild(textSpan);
      } else {
        btn.textContent = "📅 SOON";
        btn.style.fontSize = "12px";
        btn.style.color = "#f8fafc";
        btn.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        btn.style.fontWeight = "600";
        btn.style.letterSpacing = "0.08em";
      }
    } catch (_) {
      btn.textContent = "📅 SOON";
    }

    btn.addEventListener("mouseenter", function () {
      btn.style.background = "rgba(15, 23, 42, 0.85)";
      btn.style.transform = "scale(1.05)";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.background = "rgba(15, 23, 42, 0.6)";
      btn.style.transform = "scale(1)";
    });

    document.body.appendChild(btn);
    return btn;
  }

  function parseNumber(raw) {
    if (!raw) return null;
    const cleaned = raw
      .toString()
      .replace(/\s+/g, " ")
      .replace(/[^\d,.\-]/g, "")
      .trim();
    if (!cleaned) return null;
    // Tipsport často používá čárku jako desetinnou tečku
    const normalized = cleaned.replace(",", ".");
    const num = Number(normalized);
    return isNaN(num) ? null : num;
  }

  function mapSportFromClass(className) {
    // Mapování podle tvého seznamu v Sports_div (může se časem změnit na Tipsportu)
    const map = {
      kVnpal: "Tenis",
      jllVcZ: "Basketbal",
      jnbgNp: "Fotbal",
      gKUVDg: "Darts",
      zxSYL: "Esport",
      dmDmCn: "Hokej",
      dmOtSE: "Rugby",
      jsqJWx: "Lacros",
      fZIZDk: "Handball"
    };
    return map[className] || null;
  }

  const SPORTS_FOR_STRIP = [
    "Fotbal", "Hokej", "Tenis", "Basketbal", "Esport", "Darts", "Rugby", "Lacros", "Handball", "Ostatní"
  ];

  function sendCreatePreviewRequest(tickets) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error("Extension runtime není k dispozici."));
        return;
      }
      chrome.runtime.sendMessage(
        { type: "bettracker-create-preview", tickets },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.ok) {
            reject(new Error(response && response.error ? response.error : "Chyba vytvoření náhledu."));
            return;
          }
          resolve(response.data);
        }
      );
    });
  }

  function mapStatusFromIconHref(href) {
    // Status ikony podle Sports_div: #i172 = nevyhodnoceno (unresolved), neimportovat dokud nemá jiný stav
    if (!href) return null;
    const val = href.toString().trim();
    if (val === "#i170") return "won";
    if (val === "#i243") return "void";
    if (val === "#i173") return "lost";
    if (val === "#i172") return "unresolved";
    return null;
  }

  function parsePlacedAt(dateText, timeText) {
    if (!timeText) return null;
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth();
    let day = now.getDate();

    const rawDate = (dateText || "").trim();

    // Explicitní datum ve formátu "27. 2." apod.
    const explicitMatch = rawDate.match(/(\d{1,2})\.\s*(\d{1,2})\./);
    if (explicitMatch) {
      day = parseInt(explicitMatch[1], 10);
      month = parseInt(explicitMatch[2], 10) - 1; // JS měsíce 0–11
    } else if (/včera/i.test(rawDate)) {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      year = d.getFullYear();
      month = d.getMonth();
      day = d.getDate();
    } else if (/dnes/i.test(rawDate)) {
      // necháme dnešní datum
    } else if (/zítra/i.test(rawDate)) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      year = d.getFullYear();
      month = d.getMonth();
      day = d.getDate();
    }

    const timeMatch = (timeText || "").trim().match(/(\d{1,2}):(\d{2})/);
    const hour = timeMatch ? parseInt(timeMatch[1], 10) : 0;
    const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0;

    const dt = new Date(year, month, day, hour, minute);
    return dt.toISOString();
  }

  /** Z HTML detailu tiketu vyparsuje časy výkopu (každý zápas) a vrátí nejdřívější ISO, nebo null. */
  function parseKickoffFromDetailHtml(htmlString) {
    if (!htmlString || typeof htmlString !== "string") return null;
    const times = [];
    function addTime(dateText, timeText) {
      const iso = parsePlacedAt(dateText, timeText);
      if (iso) times.push(iso);
    }
    let doc;
    try {
      doc = new DOMParser().parseFromString(htmlString, "text/html");
    } catch (e) {
      doc = null;
    }
    if (doc) {
      let blocks = doc.querySelectorAll('[data-atid="ticketDetailBet"]');
      if (blocks.length > 0) {
        blocks.forEach(function (block) {
          const container = block.querySelector("div.sc-38d1266e-1") || block.querySelector("[class*='38d1266e']");
          if (!container) return;
          const parts = container.querySelectorAll("div.whiteSpace-noWrap") || container.querySelectorAll("[class*='whiteSpace-noWrap']") || container.querySelectorAll("[class*='WhiteSpace']");
          if (parts.length >= 2) {
            addTime(parts[0].textContent.trim(), parts[1].textContent.trim());
          }
        });
      }
      if (times.length === 0) {
        const fallback = doc.querySelectorAll("div.sc-38d1266e-1");
        if (fallback.length === 0) fallback = doc.querySelectorAll("[class*='sc-38d1266e']");
        fallback.forEach(function (container) {
          const parts = container.querySelectorAll("div.whiteSpace-noWrap") || container.querySelectorAll("[class*='whiteSpace-noWrap']");
          if (parts.length >= 2) {
            addTime(parts[0].textContent.trim(), parts[1].textContent.trim());
          }
        });
      }
    }
    if (times.length === 0) {
      var regexDate = /<div[^>]*class="[^"]*[Ww]hite[Ss]pace[^"]*"[^>]*>\s*([^<]+?)\s*<\/div>/g;
      var match;
      var texts = [];
      while ((match = regexDate.exec(htmlString)) !== null) {
        texts.push(match[1].trim());
      }
      for (var i = 0; i + 1 < texts.length; i += 2) {
        var d = texts[i];
        var t = texts[i + 1];
        if (d && t && /(\d{1,2}):(\d{2})/.test(t)) addTime(d, t);
      }
    }
    var nowMs = Date.now();
    var futureTimes = times.filter(function (iso) {
      return new Date(iso).getTime() >= nowMs;
    });
    if (futureTimes.length === 0) return null;
    futureTimes.sort();
    return futureTimes[0];
  }

  /** Načte detail tiketu v iframe (SPA vykreslí obsah), přečte DOM a vrátí čas výkopu (ISO) nebo null. */
  function loadTicketDetailInIframe(fullUrl) {
    return new Promise(function (resolve) {
      if (!fullUrl || fullUrl.indexOf("tipsport") === -1) {
        resolve(null);
        return;
      }
      var iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;border:0;visibility:hidden;";
      iframe.src = fullUrl;
      var timeout = setTimeout(cleanup, 12000);
      function cleanup() {
        clearTimeout(timeout);
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch (e) { }
        resolve(null);
      }
      iframe.onload = function () {
        setTimeout(function () {
          clearTimeout(timeout);
          try {
            var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
            if (doc && doc.documentElement) {
              var html = doc.documentElement.outerHTML;
              var iso = parseKickoffFromDetailHtml(html);
              if (iso) {
                try { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); } catch (err) { }
                resolve(iso);
                return;
              }
            }
          } catch (e) { }
          cleanup();
        }, 3500);
      };
      iframe.onerror = function () { cleanup(); };
      document.body.appendChild(iframe);
    });
  }

  /** Zpoždění pro rate-limiting */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Cache pro výkopy (localStorage), aby se zamezilo neustálému dotazování Tipsportu */
  function getCachedKickoff(ticketHref) {
    try {
      const cache = JSON.parse(localStorage.getItem("bt_kickoff_cache") || "{}");
      const entry = cache[ticketHref];
      if (entry && entry.iso) {
        // Caching for 6 hours so it doesn't try repeatedly if it changes, keeps memory low
        if (Date.now() - entry.timestamp < 6 * 60 * 60 * 1000) {
          return entry.iso;
        }
      }
    } catch (e) { }
    return null;
  }

  function setCachedKickoff(ticketHref, iso) {
    if (!iso) return;
    try {
      const cache = JSON.parse(localStorage.getItem("bt_kickoff_cache") || "{}");
      cache[ticketHref] = { iso: iso, timestamp: Date.now() };

      // Cleanup stare cache entries (nad 24 hodst)
      const now = Date.now();
      for (const key in cache) {
        if (now - cache[key].timestamp > 24 * 60 * 60 * 1000) {
          delete cache[key];
        }
      }

      localStorage.setItem("bt_kickoff_cache", JSON.stringify(cache));
    } catch (e) { }
  }

  /** Načte detail tiketu a vrátí nejdřívější čas výkopu (ISO) nebo null. Nejdřív fetch; když z toho nelze přečíst čas (SPA), zkusí iframe. */
  function fetchTicketDetailKickoffTime(ticketHref) {
    var fullUrl =
      ticketHref && ticketHref.indexOf("http") === 0
        ? ticketHref
        : (location.origin || "") + (ticketHref || "");

    const cached = getCachedKickoff(fullUrl);
    if (cached) return Promise.resolve(cached);

    // Randomize slight delay to stagger requests naturally
    const staggerMs = Math.floor(Math.random() * 800) + 400;

    return delay(staggerMs)
      .then(() => fetch(fullUrl))
      .then(function (res) {
        if (!res.ok) throw new Error("Fetch failed");
        return res.text();
      })
      .then(function (html) {
        var iso = parseKickoffFromDetailHtml(html);
        if (iso) {
          setCachedKickoff(fullUrl, iso);
          return iso;
        }
        return loadTicketDetailInIframe(fullUrl).then(iframeIso => {
          if (iframeIso) setCachedKickoff(fullUrl, iframeIso);
          return iframeIso;
        });
      })
      .catch(function () {
        return loadTicketDetailInIframe(fullUrl).then(iframeIso => {
          if (iframeIso) setCachedKickoff(fullUrl, iframeIso);
          return iframeIso;
        });
      });
  }

  // ──────────────────────────────────────────────
  // Tipsport – scraping z HTML
  // ──────────────────────────────────────────────

  function scrapeTipsportTicketsFromPage() {
    const results = [];

    // Na Tipsportu je každý tiket jedna <a> s atributem data-atid="ticketListItem…"
    let cards = document.querySelectorAll('a[data-atid^="ticketListItem"]');
    if (cards.length === 0) {
      cards = document.querySelectorAll('a[href*="/tiket?"]');
    }

    cards.forEach((card) => {
      try {
        // Řádek „Domácí - Hosté“ (např. "HOTU - WHITEBIRD")
        const matchEl = card.querySelector(
          "span.sc-8da44c8-1.bYmSBn.overflowWrap-break"
        );
        const matchText = (matchEl && matchEl.textContent) || "";
        const [homeTeamRaw, awayTeamRaw] = matchText.split(" - ");
        const home_team = (homeTeamRaw || "").trim();
        const away_team = (awayTeamRaw || "").trim();

        // Stabilní klíč tiketu (idu:idb:hash) je v data-atid: ticketListItem--1269894614:-1:bac41032
        const atid = card.getAttribute("data-atid") || "";
        const tipsport_key = atid.includes("ticketListItem--")
          ? atid.split("ticketListItem--")[1]
          : null;

        // Výběr – v řádku "Vítěz zápasu: WHITEBIRD" je label + hodnota v samostatném <span>
        const selectionLabelEl = card.querySelector(
          "div.sc-29382da1-7 span.sc-8da44c8-1.eTFevi"
        );
        const selectionValueEl = card.querySelector(
          "div.sc-29382da1-7 span.sc-8da44c8-1.lbcpaC"
        );
        const market_label_raw = selectionLabelEl
          ? selectionLabelEl.textContent.trim()
          : null;
        const selection_raw = selectionValueEl
          ? selectionValueEl.textContent.trim()
          : null;

        // Typ tiketu (AKU / SÓLO) – třetí whiteSpace-noWrap v hlavičce; datum/čas z hlavičky
        let ticket_type_raw = null;
        let placed_at_iso = null;
        const headerRow = card.querySelector("div.sc-8da44c8-4.jRyrAE");
        if (headerRow) {
          const headerParts = headerRow.querySelectorAll("div.whiteSpace-noWrap");
          if (headerParts.length >= 3) {
            ticket_type_raw = headerParts[2].textContent.trim();
          }
          const dateText =
            headerParts.length >= 1
              ? headerParts[0].textContent.trim()
              : "";
          const timeText =
            headerParts.length >= 2
              ? headerParts[1].textContent.trim()
              : "";
          placed_at_iso = parsePlacedAt(dateText, timeText);
        }
        // Záložní parsování data/času – pokud hlavička má jinou strukturu (např. sc-38d1266e-1)
        let fallbackDateText = "";
        let fallbackTimeText = "";
        if (!placed_at_iso) {
          const dateTimeContainer = card.querySelector("div.sc-38d1266e-1");
          if (dateTimeContainer) {
            const parts = dateTimeContainer.querySelectorAll("div.whiteSpace-noWrap");
            fallbackDateText = parts.length >= 1 ? parts[0].textContent.trim() : "";
            fallbackTimeText = parts.length >= 2 ? parts[1].textContent.trim() : "";
            if (fallbackDateText || fallbackTimeText) placed_at_iso = parsePlacedAt(fallbackDateText, fallbackTimeText);
          }
        }
        if (!placed_at_iso) {
          const cardText = (card.textContent || "").trim();
          const timeMatch = cardText.match(/\b(\d{1,2}):(\d{2})\b/);
          const dateMatch = cardText.match(/(dnes|včera|\d{1,2}\.\s*\d{1,2}\.)/i);
          if (timeMatch) {
            fallbackDateText = dateMatch ? dateMatch[1] : "Dnes";
            fallbackTimeText = timeMatch[0];
            placed_at_iso = parsePlacedAt(fallbackDateText, fallbackTimeText);
          }
        }
        // Čas na kartě je čas sázky (kdy vsadil). Skutečný výkop je až v detailu tiketu – event_start_at bereme z karty.
        const event_start_at = placed_at_iso;

        // Sport jako div se dvěma třídami: "sc-9ef70957-1 zxSYL"
        // V původním HTML je to v headeru v: div.sc-8da44c8-4.bkKaPk ... > div.sc-9ef70957-1 XXX
        let sport_label = null;
        let sport_class = null;
        const sportDiv = card.querySelector("div.sc-8da44c8-4.bkKaPk div.sc-9ef70957-1");
        if (sportDiv) {
          const classes = (sportDiv.getAttribute("class") || "").split(/\s+/).filter(Boolean);
          sport_class = classes.find((c) => c !== "sc-9ef70957-1") || null;
          sport_label = mapSportFromClass(sport_class);
        }

        // Sport ikona – vyčteme ID z <use xlink:href="#i173">
        let sport_icon_id = null;
        const sportUseEl = card.querySelector("div.sc-29382da1-9 svg use");
        if (sportUseEl) {
          sport_icon_id =
            sportUseEl.getAttribute("xlink:href") ||
            sportUseEl.getAttribute("href") ||
            null;
        }

        // Řádky vpravo: Vklad, Skutečná výhra / Možná výhra, Celkový kurz
        const valueRows = card.querySelectorAll("div.sc-8da44c8-4.goKmrV");
        let stake = null;
        let payout = null;
        let odds = null;
        let hasMoznaVyhra = false;
        valueRows.forEach((row) => {
          const labelEl = row.querySelector("span.sc-8da44c8-1.eTFevi");
          const valueEl = row.querySelector("span.sc-8da44c8-1.bYmSBn");
          if (!labelEl || !valueEl) return;
          const label = labelEl.textContent.trim();
          const num = parseNumber(valueEl.textContent);
          if (label === "Vklad") stake = num;
          else if (label === "Skutečná výhra" || label === "Výhra") payout = num;
          else if (label === "Možná výhra") hasMoznaVyhra = true;
          else if (label === "Celkový kurz") odds = num;
        });

        // Live tiket: Tipsport zobrazuje <div class="sc-837f7f43-0 inDuKt">Live</div>
        let is_live = false;
        const liveEl = card.querySelector(".inDuKt");
        if (liveEl && liveEl.textContent.trim() === "Live") {
          is_live = true;
        }

        // Stav tiketu
        let status_raw = null;
        const htmlLower = card.innerHTML;
        if (htmlLower.includes('href="#i170"')) status_raw = "won";
        else if (htmlLower.includes('href="#i243"')) status_raw = "void";
        else if (htmlLower.includes('href="#i173"')) status_raw = "lost";

        if (!status_raw) {
          if (is_live) {
            status_raw = "open"; // Live tikety musí jít do overlay
          } else if (htmlLower.includes('href="#i172"')) {
            status_raw = "unresolved"; // Zápas nezačal
          } else {
            // Nemá ani LIVE příznak, ani i172 ikonku = nepatří do otevřených
            if (payout != null) status_raw = payout > 0 ? "won" : "lost";
            else status_raw = "ignored"; // Přesně podle domluvy "Jiné tikety se nezobrazují v Overlay"
          }
        }

        const isAku = ticket_type_raw && String(ticket_type_raw).toLowerCase().includes("aku");
        const finalHome = isAku ? "AKU" : home_team;
        const finalAway = isAku ? "Kombinace" : away_team;
        const first_match_line = isAku && (home_team || away_team)
          ? (home_team || "").trim() + " – " + (away_team || "").trim()
          : undefined;

        // AKU rozbalený: pokus o načtení noh (všechny řádky s zápasem X - Y v kartě)
        let legs = null;
        if (isAku) {
          const matchSpans = card.querySelectorAll("span.sc-8da44c8-1.bYmSBn.overflowWrap-break");
          const legRows = [];
          matchSpans.forEach((span) => {
            const text = (span.textContent || "").trim();
            const dashIdx = text.indexOf(" - ");
            if (dashIdx > 0 && dashIdx < text.length - 3) {
              const h = text.slice(0, dashIdx).trim();
              const a = text.slice(dashIdx + 3).trim();
              if (h && a && (h !== "AKU" || a !== "Kombinace")) legRows.push({ home_team: h, away_team: a });
            }
          });
          if (legRows.length >= 1) {
            const selectionLabels = card.querySelectorAll("div.sc-29382da1-7 span.sc-8da44c8-1.eTFevi");
            const selectionValues = card.querySelectorAll("div.sc-29382da1-7 span.sc-8da44c8-1.lbcpaC");
            const oddsEl = card.querySelectorAll("div.sc-8da44c8-4.goKmrV span.sc-8da44c8-1.bYmSBn");
            legs = legRows.map((row, i) => {
              const market = selectionLabels[i] ? selectionLabels[i].textContent.trim() : null;
              const sel = selectionValues[i] ? selectionValues[i].textContent.trim() : null;
              let legOdds = null;
              if (oddsEl.length > i + 1) legOdds = parseNumber(oddsEl[i + 1].textContent);
              else if (oddsEl.length > 0 && legRows.length === 1) legOdds = parseNumber(oddsEl[0].textContent);
              return {
                home_team: row.home_team,
                away_team: row.away_team,
                market_label_raw: market || undefined,
                selection_raw: sel || undefined,
                odds: legOdds ?? undefined
              };
            });
          }
        }

        const ticket = {
          home_team: finalHome,
          away_team: finalAway,
          sport_label,
          sport_icon_id,
          sport_class,
          tipsport_key,
          market_label_raw: isAku ? null : market_label_raw,
          selection_raw: isAku ? null : selection_raw,
          ticket_type_raw,
          status_raw,
          stake: stake ?? 0,
          payout: payout,
          odds: odds,
          placed_at: placed_at_iso,
          event_start_at: placed_at_iso,
          is_live,
          legs: legs || undefined,
          ticket_href: (function () {
            const href = card.getAttribute("href") || card.href;
            if (typeof href !== "string" || !href) return undefined;
            if (href.indexOf("http") === 0) return href;
            return href.charAt(0) === "/" ? href : "/" + href;
          })(),
          first_match_line: first_match_line || undefined
        };

        // Minimální validace – bez týmů tiket nebereme,
        // ale i když se nepodaří přečíst vklad (stake == 0),
        // tiket pošleme do backendu a v aplikaci se dá ručně dopočítat/uložit.
        if (ticket.home_team && ticket.away_team) {
          if (!ticket.stake || ticket.stake <= 0) {
            console.warn(
              "BetTracker Tipsport scraper – tiket bez rozpoznaného vkladu:",
              home_team,
              "-",
              away_team
            );
          }
          results.push(ticket);
        }
      } catch (e) {
        console.warn("BetTracker Tipsport scraper – chyba při čtení karty:", e);
      }
    });

    return results;
  }

  // ──────────────────────────────────────────────
  // Betano – scraping z HTML
  // ──────────────────────────────────────────────

  function parseBetanoDateTime(raw) {
    if (!raw) return null;
    // očekávaný formát: "01.03.2026 - 13:46"
    const m = raw.trim().match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);
    const hour = parseInt(m[4], 10);
    const minute = parseInt(m[5], 10);
    const dt = new Date(year, month, day, hour, minute);
    return dt.toISOString();
  }

  function parseBetanoRelativeTime(raw) {
    if (!raw) return null;
    const clean = raw.trim().toLowerCase();
    const timeMatch = clean.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) return null;

    let hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);

    // Občas Betano u "dnes večer" atd píše časy po půlnoci jako 04:00 (i když je to druhý den ráno)
    let d = new Date();
    d.setHours(hour, minute, 0, 0);

    if (clean.includes("zítra")) {
      d.setDate(d.getDate() + 1);
    } else if (clean.includes("dnes") || clean.includes("večer")) {
      // Pokud je teď 23:00 a zápas je "Dnes večer 04:00", je to ve skutečnosti zítřek brzy ráno.
      const nowHash = new Date().getHours();
      if (nowHash > 12 && hour < 12) {
        d.setDate(d.getDate() + 1);
      }
    } else {
      // Zkratky dnů (po, út, st, čt...) - prozatím zjednodušeně, pokud nepíšou "dnes/zítra" a čas je menší než teď, hádáme zítřek
      if (d.getTime() < Date.now()) {
        d.setDate(d.getDate() + 1);
      }
    }
    return d.toISOString();
  }

  /** Na stránce Betano bethistory zajistí filtr „Otevřeno“ (otevřené tikety). */
  async function ensureBetanoOpenFilter() {
    if (isBetanoBethistoryOpenPage()) return;
    const openBtn = document.querySelector('[data-qa="bethistory-open-button"]');
    if (!openBtn) return;
    openBtn.click();
    await new Promise((r) => setTimeout(r, 1200));
  }

  /** Na stránce Betano bethistory scrolluje seznam (infinite scroll), aby se načetly všechny karty. */
  async function scrollBetanoTicketList() {
    const drawer = document.querySelector('[data-qa="drawer-item"]');
    const scroller = document.querySelector(".vue-recycle-scroller");
    const el = drawer || scroller;
    if (!el) return;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    let prevCount = document.querySelectorAll('[data-qa="bethistory-content"]').length;
    for (let i = 0; i < 15; i++) {
      el.scrollTop = el.scrollHeight;
      await delay(400);
      const count = document.querySelectorAll('[data-qa="bethistory-content"]').length;
      if (count === prevCount) break;
      prevCount = count;
    }
    await delay(500);
  }

  /** Na stránce Betano (bethistory i jiné) rozbalí sbalené karty, aby scraper viděl Live/detail. */
  async function expandBetanoCardsBeforeScrape() {
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const contents = document.querySelectorAll('[data-qa="bethistory-content"]');
    if (!contents.length) return;
    for (let i = 0; i < contents.length; i++) {
      const content = contents[i];
      const cardRoot = content.closest('div[data-index]') || content.parentElement;
      if (!cardRoot) continue;
      const hasVisibleLive =
        cardRoot.querySelector('[data-qa*="live" i], .leg-scoreboard-container, [data-qa="leg-scoreboard-container"], [data-qa="thunder-icon"], path[fill="#F3D113"]') ||
        /\b(live|živě)\b/i.test((cardRoot.textContent || "").trim());
      if (hasVisibleLive) continue;
      let toggle =
        cardRoot.querySelector('[data-qa="action-toggle"]') ||
        cardRoot.querySelector('[data-qa="toggle-button"]') ||
        cardRoot.querySelector('button[aria-expanded]') ||
        cardRoot.querySelector('[aria-expanded]')?.closest('button') ||
        cardRoot.querySelector('button[class*="expand"], button[class*="collapse"]');
      if (!toggle) {
        const header = cardRoot.querySelector('[data-qa="bethistory-type"]')?.closest('section') ||
          cardRoot.querySelector('[data-qa="bethistory-stake"]')?.closest('div')?.parentElement ||
          cardRoot.firstElementChild;
        if (header && header.offsetParent !== null) toggle = header;
      }
      if (toggle && toggle.getAttribute?.("aria-expanded") !== "true") {
        toggle.click();
        await delay(400);
      }
    }
    await delay(600);
  }

  function scrapeBetanoTicketsFromPage() {
    const results = [];

    // Každý tiket je wrapper s data-qa="bethistory-content" + navazujícími sekcemi
    const contents = document.querySelectorAll('[data-qa="bethistory-content"]');
    contents.forEach((content) => {
      try {
        const cardRoot = content.closest('div[data-index]') || content.parentElement;
        if (!cardRoot) return;

        // Typ sázky + vklad z hlavičky
        const typeEl = cardRoot.querySelector('[data-qa="bethistory-type"]');
        const stakeEl = cardRoot.querySelector('[data-qa="bethistory-stake"]');
        const ticket_type_raw = typeEl ? typeEl.textContent.trim() : null;
        const stake = stakeEl ? parseNumber(stakeEl.textContent) || 0 : 0;

        // Výsledek (Výhry / Prohry / Cash out ...)
        // U nevyhodnocených tiketů tag často chybí úplně.
        const resultTagEl = cardRoot.querySelector('section [data-qa="bethistory-result-tag"] span');
        const status_raw = resultTagEl ? resultTagEl.textContent.trim().toLowerCase() : "open";

        // Datum/čas a ID tiketu – z dolní sekce s ID
        const idSpan = cardRoot.querySelector('[data-qa="bethistory-id"]');
        const idText = idSpan ? idSpan.textContent.replace("ID:", "").trim() : null;
        const betano_key = idText && idText.length ? idText : null;
        let placed_at = null;
        if (idSpan) {
          const siblingDate = idSpan.parentElement?.nextElementSibling;
          if (siblingDate) {
            placed_at = parseBetanoDateTime(siblingDate.textContent);
          }
        }

        // Sekce Výhry – skutečná výhra
        let payout = null;
        const winningsSection = cardRoot.querySelector('[data-qa="bethistory-winnings"] span.tw-font-bold.tw-text-m');
        if (winningsSection) {
          payout = parseNumber(winningsSection.textContent);
        }

        // Hlavní obsah tiketu – výběr, trh, soupeři, kurz, sport
        const firstContentBlock = content.querySelector('.tw-flex.tw-flex-col.tw-w-full.tw-gap-xs');
        if (!firstContentBlock) return;

        // selection_raw – tučný text nahoře (např. "Méně než 5.5", "Pittsburgh Penguins")
        const selectionSpan = firstContentBlock.querySelector('.tw-text-xs.tw-font-bold.tw-text-steel span.tw-text-steel');
        const selection_raw = selectionSpan ? selectionSpan.textContent.trim() : null;

        // odds – číslo vpravo v téže řádce
        let odds = null;
        const oddsSpan = firstContentBlock.querySelector('.tw-grow.tw-text-xs.tw-font-bold.tw-text-steel.tw-text-right span.tw-text-steel');
        if (oddsSpan) {
          odds = parseNumber(oddsSpan.textContent);
        }

        // market_label_raw – šedý text pod výběrem (např. "Počet gólů", "Celkový počet bodů", "Vítěz")
        const marketLabelEl = firstContentBlock.querySelector('.tw-text-xs.tw-text-slate');
        const market_label_raw = marketLabelEl ? marketLabelEl.textContent.trim() : null;

        // home/away – spodní řádek s týmy
        const matchEl = firstContentBlock.querySelector('.tw-text-xs.tw-text-licorice');
        let home_team = "";
        let away_team = "";
        if (matchEl) {
          const matchText = matchEl.textContent.replace(/\s+/g, " ").trim();
          const parts = matchText.split(" - ");
          home_team = (parts[0] || "").trim();
          away_team = (parts[1] || "").trim();
        }

        // sport – z <img alt="sport-icon" src=".../ICEH...svg"> (hledat v cele kartě, ne jen v firstContentBlock)
        const sportImg = cardRoot.querySelector('img[alt="sport-icon"]') || content.querySelector('img[alt="sport-icon"]');
        let sport_icon_id = null;
        let sport_label = null;
        if (sportImg) {
          const src = sportImg.getAttribute("src") || "";
          sport_icon_id = src;
          // mapování podle prefixu ve jménu souboru (Ticket_Mapping: BASK, ICEH, FOOT, HAND, TENN, ESPS)
          if (src.includes("BASK")) sport_label = "Basketbal";
          else if (src.includes("ICEH")) sport_label = "Hokej";
          else if (src.includes("FOOT")) sport_label = "Fotbal";
          else if (src.includes("HAND")) sport_label = "Házená";
          else if (src.includes("TENN")) sport_label = "Tenis";
          else if (src.includes("ESPS")) sport_label = "Esport";
        }

        // Live = „Právě se hraje“: žlutý blesk (path fill="#F3D113"), scoreboard nebo text Live/Živě
        let is_live = false;
        if (cardRoot.querySelector('path[fill="#F3D113"]')) is_live = true;
        if (!is_live && cardRoot.querySelector('.leg-scoreboard-container, [data-qa="leg-scoreboard-container"], [data-qa="thunder-icon"]')) is_live = true;
        const liveByQa = cardRoot.querySelector('[data-qa*="live" i]');
        if (!is_live && liveByQa && (liveByQa.textContent || "").trim() === "Live") is_live = true;
        if (!is_live) {
          const cardText = (cardRoot.textContent || "").trim();
          if (/^live$/i.test(cardText) || /\blive\b/i.test(cardText) || /\bživě\b/i.test(cardText)) is_live = true;
        }
        if (!is_live) {
          const nodes = cardRoot.querySelectorAll("div, span");
          for (let i = 0; i < nodes.length; i++) {
            const txt = (nodes[i].textContent || "").trim();
            if ((txt === "Live" || txt === "Živě") && nodes[i].children.length === 0) {
              is_live = true;
              break;
            }
          }
        }

        // Čas výkopu zápasu – na kartě (ne jen v sidebaru): .bet-event-date-time nebo [data-qa="bet-event-date-time"]
        let event_start_at = null;
        const eventTimeEl = cardRoot.querySelector(".bet-event-date-time, [data-qa='bet-event-date-time']");
        if (eventTimeEl) {
          const rawTime = (eventTimeEl.textContent || "").trim();
          if (rawTime) event_start_at = parseBetanoRelativeTime(rawTime);
        }
        if (!event_start_at && placed_at) event_start_at = placed_at;

        const ticket = {
          home_team,
          away_team,
          betano_key,
          sport_label,
          sport_icon_id,
          market_label_raw,
          selection_raw,
          ticket_type_raw,
          status_raw,
          stake,
          payout,
          odds,
          placed_at,
          event_start_at: event_start_at || undefined,
          is_live
        };

        if (ticket.home_team && ticket.away_team && ticket.stake > 0) {
          results.push(ticket);
        }
      } catch (e) {
        console.warn("BetTracker Betano scraper – chyba při čtení karty:", e);
      }
    });

    return results;
  }

  // ──────────────────────────────────────────────
  // Fortuna (ifortuna.cz) – scraping z betslip history
  // ──────────────────────────────────────────────

  function parseFortunaDateTime(datetimeAttr) {
    if (!datetimeAttr) return null;
    try {
      const d = new Date(datetimeAttr);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch (e) {
      return null;
    }
  }

  /** Parsuje relativní datum z popupu Fortuna např. "zítra 01:30", "dnes 18:45". */
  function parseFortunaRelativeDate(raw) {
    try {
      if (!raw || typeof raw !== "string") return null;
      const clean = raw.trim().toLowerCase();
      const timeMatch = clean.match(/(\d{1,2}):(\d{2})/);
      if (!timeMatch) return null;
      const hour = parseInt(timeMatch[1], 10);
      const minute = parseInt(timeMatch[2], 10);
      if (isNaN(hour) || isNaN(minute)) return null;
      const d = new Date();
      d.setHours(hour, minute, 0, 0);
      if (clean.includes("zítra") || clean.includes("zitra")) {
        d.setDate(d.getDate() + 1);
      } else if (clean.includes("pozítří") || clean.includes("pozitri")) {
        d.setDate(d.getDate() + 2);
      } else if (!clean.includes("dnes")) {
        if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      }
      return d.toISOString();
    } catch (e) {
      return null;
    }
  }

  function scrapeFortunaTicketsFromPage() {
    try {
      const results = [];
      const listEl = document.querySelector('[data-test="betslip-history-overview_list"]');
      if (!listEl) return results;

      const items = listEl.querySelectorAll("a.betslip-history-list__item");
      items.forEach((card) => {
        try {
          const row = card.querySelector(".betslip-history-overview-row");
          if (!row) return;

          const headingEl = row.querySelector(".betslip-history-overview-row__heading span");
          const matchText = (headingEl && headingEl.textContent) || "";
          const parts = matchText.split(" - ");
          const home_team = (parts[0] || "").trim();
          const away_team = (parts[1] || "").trim();
          if (!home_team && !away_team) return;

          const timeEl = row.querySelector(".betslip-history-overview-row__datetime time");
          const placed_at = timeEl ? parseFortunaDateTime(timeEl.getAttribute("datetime")) : null;
          // Typ tiketu (Solo / Ako) je ve stejném řádku jako <time>, ale mimo samotný <time>.
          let ticket_type_raw = "Solo";
          const dateContainer = row.querySelector(".betslip-history-overview-row__datetime .betslip-history-overview-row__sub-heading");
          const dateTimeText = (dateContainer && dateContainer.textContent) || "";
          if (/ako/i.test(dateTimeText)) ticket_type_raw = "Ako";
          else if (/solo/i.test(dateTimeText)) ticket_type_raw = "Solo";
          const isAku = ticket_type_raw && ticket_type_raw.toLowerCase().includes("ako");
          // Varianta A: AKO tikety z přehledu přeskočíme – uživatel je naimportuje z detailu.
          if (isAku) return;

          const ellipsisEl = row.querySelector(".betslip-history-overview-row__ellipsis span");
          let market_label_raw = null;
          let selection_raw = null;
          if (ellipsisEl) {
            const full = (ellipsisEl.textContent || "").trim();
            const colonIdx = full.indexOf(":");
            if (colonIdx > 0) {
              market_label_raw = full.slice(0, colonIdx).trim();
              selection_raw = full.slice(colonIdx + 1).trim();
            } else {
              selection_raw = full || null;
            }
          }

          let stake = null;
          let odds = null;
          let payout = null;
          const footer = row.querySelector(".betslip-history-overview-row__footer");
          if (footer) {
            footer.querySelectorAll(".betslip-history-overview-row__section").forEach((section) => {
              const subHeadings = section.querySelectorAll(".betslip-history-overview-row__sub-heading");
              const labelEl = subHeadings[0];
              const valueEl = section.querySelector(".betslip-history-overview-row__value");
              const label = labelEl ? (labelEl.textContent || "").trim() : "";
              const num = valueEl ? parseNumber(valueEl.textContent) : null;
              if (label === "Vklad") stake = num;
              else if (label === "Celkový kurz") odds = num;
              else if (label === "Skutečná výhra" || label === "Výhra") payout = num;
              else if (label === "Možná výhra" && payout == null) payout = num;
            });
          }

          let status_raw = "open";
          const statusEl = row.querySelector(".betslip-status");
          if (statusEl) {
            if (statusEl.classList.contains("cic_ticket-win")) status_raw = "won";
            else if (statusEl.classList.contains("cic_ticket-lost") || statusEl.classList.contains("cic_ticket-loss")) status_raw = "lost";
            else if (statusEl.classList.contains("cic_ticket-void")) status_raw = "void";
            else if (statusEl.classList.contains("cic_ticket-waiting")) status_raw = "waiting";
          }
          if (payout != null && payout > 0 && status_raw === "open") status_raw = "won";
          /* Nepřepisovat open na lost jen kvůli payout=0 – nevyhodnocené tikety mívají 0, backend to řeší. */

          const href = card.getAttribute("href") || card.href || "";
          const fortuna_key =
            (typeof href === "string" && href.length > 0)
              ? (href.indexOf("http") === 0 ? href : (location.origin || "") + (href.charAt(0) === "/" ? href : "/" + href))
              : (placed_at || "") + "|" + home_team + "|" + away_team + "|" + (stake || 0) + "|" + (odds || 0);

          const ticket = {
            home_team: home_team || "—",
            away_team: away_team || "—",
            fortuna_key,
            market_label_raw,
            selection_raw,
            ticket_type_raw,
            status_raw,
            stake: stake ?? 0,
            payout: payout,
            odds: odds,
            placed_at,
            event_start_at: placed_at || undefined,
            is_live: false
          };
          if (ticket.stake > 0) results.push(ticket);
        } catch (e) {
          console.warn("BetTracker Fortuna scraper – chyba při čtení položky:", e);
        }
      });
      return results;
    } catch (e) {
      console.warn("BetTracker Fortuna scraper – chyba:", e);
      return [];
    }
  }

  function scrapeFortunaDetailTicket() {
    try {
      const detailPanel = document.querySelector(".betslip-history-detail__left-panel");
      if (!detailPanel) return [];

      const legs = Array.from(detailPanel.querySelectorAll(".betslip-leg"));
      if (!legs.length) return [];

      // Z prvního zápasu vezmeme název pro ticket (AKO kombinace)
      let home_team = "";
      let away_team = "";
      const firstTitleEl =
        legs[0].querySelector("h3[title]") ||
        legs[0].querySelector("h3");
      if (firstTitleEl) {
        const matchText = (firstTitleEl.textContent || "").trim();
        const parts = matchText.split(" - ");
        home_team = (parts[0] || "").trim();
        away_team = (parts[1] || "").trim();
      }

      // Status kombinace podle jednotlivých příležitostí
      let anyLost = false;
      let anyWaiting = false;
      let allWon = true;

      legs.forEach((leg) => {
        let legStatus = "open";
        const actions = leg.querySelector(".betslip-leg__actions");
        if (actions) {
          const useEl =
            actions.querySelector('use[href="#cic_ticket-win"], use[xlink\\:href="#cic_ticket-win"]') ||
            actions.querySelector("use");
          const href =
            (useEl && (useEl.getAttribute("href") || useEl.getAttribute("xlink:href"))) ||
            "";
          const h = href.toLowerCase();
          if (h.includes("ticket-win")) legStatus = "won";
          else if (h.includes("ticket-lost") || h.includes("ticket-lose")) legStatus = "lost";
          else if (h.includes("ticket-waiting")) legStatus = "waiting";
        }

        if (legStatus === "lost") {
          anyLost = true;
          allWon = false;
        } else if (legStatus === "won") {
          // ok
        } else {
          anyWaiting = true;
          allWon = false;
        }
      });

      let status_raw = "open";
      if (anyLost) status_raw = "lost";
      else if (allWon) status_raw = "won";
      else if (anyWaiting) status_raw = "waiting";

      // Celkový kurz, vklad a výhra z pravého panelu
      let stake = null;
      let odds = null;
      let payout = null;
      const money = document.querySelector(".betslip-dates-money");
      if (money) {
        money.querySelectorAll(".waiting").forEach((row) => {
          const spans = row.querySelectorAll("span");
          if (spans.length < 2) return;
          const label = (spans[0].textContent || "").trim();
          const valueText = (spans[1].textContent || "").trim();
          const num = parseNumber(valueText);
          if (label.startsWith("Celkový kurz")) odds = num;
          else if (label.startsWith("Celková sázka")) stake = num;
          else if (label.startsWith("Skutečná výhra") || label.startsWith("Možná výhra")) {
            payout = num;
          }
        });
      }

      const fortuna_key = location.href;

      let sport_icon_id = null;
      const detailRoot = document.querySelector(".betslip-history-detail") || detailPanel;
      const sportImg = detailRoot.querySelector('img[alt*="ufo:sprt:"], img[src*="ufo-sprt-"], img[src*="ifortuna.cz/sports"]');
      if (sportImg) {
        if (sportImg.src) {
          const m = sportImg.src.match(/ufo-sprt-([a-z0-9]+)\.png/i);
          if (m) sport_icon_id = m[1];
        }
        if (!sport_icon_id && sportImg.getAttribute("alt")) {
          const altM = sportImg.getAttribute("alt").match(/ufo:sprt:([a-z0-9]+)\.png/i);
          if (altM) sport_icon_id = altM[1];
        }
      }

      const ticket = {
        home_team: home_team || "AKO",
        away_team: away_team || "Kombinace",
        fortuna_key,
        sport_icon_id: sport_icon_id || undefined,
        market_label_raw: null,
        selection_raw: null,
        ticket_type_raw: "Ako",
        status_raw,
        stake: stake ?? 0,
        payout,
        odds,
        placed_at: null,
        event_start_at: undefined,
        is_live: false
      };

      if (!ticket.stake || ticket.stake <= 0) {
        console.warn("BetTracker Fortuna detail scraper – AKO bez rozpoznaného vkladu, přeskakuji.");
        return [];
      }
      return [ticket];
    } catch (e) {
      console.warn("BetTracker Fortuna detail scraper – chyba:", e);
      return [];
    }
  }

  function scrapeBetanoSidebarTickets() {
    const results = [];
    // Hledáme tikety v bočním panelu nebo v modulu "Moje Sázky" na hlavní stránce
    const sideCards = document.querySelectorAll(
      '#my-bets-section [data-qa="bet-activity-card"], ' +
      'aside [data-qa="sidebar-mybets-list"] > div, ' +
      'aside [class*="sidebar"] > div'
    );

    sideCards.forEach((card) => {
      try {
        const timeEl = card.querySelector('.bet-event-date-time, [data-qa="bet-event-date-time"]');
        if (!timeEl) return;

        const rawTime = timeEl.textContent.trim();
        const event_start_at = parseBetanoRelativeTime(rawTime);
        if (!event_start_at) return;

        // Týmy
        const matchEl = card.querySelector('.event-name, [data-qa="event-info-link"], .tw-text-licorice, [class*="match"], .participants');
        let home_team = "";
        let away_team = "";
        if (matchEl) {
          const participantNames = matchEl.querySelectorAll('.participants__participant-name');
          if (participantNames && participantNames.length >= 2) {
            home_team = participantNames[0].textContent.trim();
            away_team = participantNames[1].textContent.trim();
          } else {
            const matchText = matchEl.textContent.replace(/\s+/g, " ").trim();
            const parts = matchText.split(" - ");
            if (parts.length > 1) {
              home_team = (parts[0] || "").trim();
              away_team = (parts[1] || "").trim();
            }
          }
        }

        let stake = 0;
        const stakeEl = card.querySelector('[data-qa="bet-label-amount"], [data-qa="total-amounts-item-value"]');
        if (stakeEl) {
          stake = parseNumber(stakeEl.textContent);
        } else {
          // Zkusíme najít částku vsazeno aspoň podle textu
          const allText = card.textContent;
          const stakeMatch = allText.match(/Vsazeno.*?(\d+,\d+)\s*Kč/i);
          if (stakeMatch) {
            stake = parseNumber(stakeMatch[1]);
          }
        }

        let selection_raw = "";
        const selectionEl = card.querySelector('.selection-label, [data-qa="selection-label"], [data-qa="bet-event-title"]');
        if (selectionEl) {
          selection_raw = selectionEl.textContent.trim();
        }

        let market_label_raw = "";
        const marketEl = card.querySelector('.market-label, [data-qa="market-label"]');
        if (marketEl) {
          market_label_raw = marketEl.textContent.trim();
        }

        let odds = null;
        let oddsEl = card.querySelector('[data-qa="bet-odds"], .odds-ticker');
        if (oddsEl) odds = parseNumber(oddsEl.textContent);

        let payout = null;
        const totalAmountValues = card.querySelectorAll('[data-qa="total-amounts-item-value"]');
        if (totalAmountValues.length > 0) {
          payout = parseNumber(totalAmountValues[totalAmountValues.length - 1].textContent);
        }

        let is_live = false;
        if (card.querySelector('path[fill="#F3D113"]') || card.querySelector('path[fill="var(--kds-sem-color-fg-primary-bold)"]')) {
          is_live = true;
        }
        if (!is_live && card.querySelector('.leg-scoreboard-container, [data-qa="leg-scoreboard-container"], [data-qa="thunder-icon"]')) is_live = true;
        if (!is_live && card.querySelector('.time-info')) is_live = true;

        if (home_team && away_team) {
          const fakeKey = "sidebar_" + home_team.replace(/\s/g, "") + "_" + away_team.replace(/\s/g, "");
          results.push({
            source: 'betano',
            betano_key: fakeKey,
            home_team,
            away_team,
            event_start_at,
            selection_raw,
            market_label_raw,
            status_raw: 'open', // je to panel Otevřeno
            stake: stake || 1, // Pokud nenašel sázku, dá 1 aby přežil filtr
            odds,
            payout,
            is_live
          });
        }
      } catch (e) { }
    });
    return results;
  }

  // ──────────────────────────────────────────────
  // Společná komunikace s backendem
  // ──────────────────────────────────────────────

  const API_BASE_DEFAULT = "http://127.0.0.1:15555/api";
  function normalizeApiBase(url) {
    if (!url || typeof url !== "string") return API_BASE_DEFAULT;
    const u = String(url).trim();
    if (!u) return API_BASE_DEFAULT;
    if (/:3000(\/|$)/.test(u) || /:3001(\/|$)/.test(u)) return API_BASE_DEFAULT;
    return u;
  }

  async function sendToApi(tickets, source, usePreview, overlaySync) {
    if (usePreview === undefined) usePreview = true;
    if (overlaySync === undefined) overlaySync = false;
    const hasRuntime =
      typeof chrome !== "undefined" &&
      chrome &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function";

    let API_BASE = API_BASE_DEFAULT;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      try {
        const r = await new Promise(function (resolve) {
          chrome.storage.local.get(["bettracker_api_url"], resolve);
        });
        API_BASE = normalizeApiBase((r && r.bettracker_api_url) || "") || API_BASE_DEFAULT;
      } catch (_) { }
    }
    const payload = { tickets: tickets || [] };
    if (overlaySync) payload.overlay_sync = true;
    let endpoint = `${API_BASE.replace(/\/$/, "")}/import/tipsport/scrape${usePreview ? "/preview" : ""}`;
    if (source === "betano") endpoint = `${API_BASE.replace(/\/$/, "")}/import/betano/scrape${usePreview ? "/preview" : ""}`;
    else if (source === "fortuna") endpoint = `${API_BASE.replace(/\/$/, "")}/import/fortuna/scrape${usePreview ? "/preview" : ""}`;

    async function directFetch() {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`API error ${res.status}: ${text}`);
      }
      return await res.json();
    }

    // Pokud není k dispozici chrome.runtime.sendMessage, zkusíme přímé volání API
    if (!hasRuntime) {
      try {
        return await directFetch();
      } catch (e) {
        throw new Error(
          `BetTracker rozšíření není plně aktivní (chrome.runtime.sendMessage není k dispozici) a přímé volání API selhalo: ${e && e.message ? e.message : String(e)}`
        );
      }
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: "bettracker-import-tickets",
            source: source || "tipsport",
            tickets,
            preview: usePreview !== false,
            overlay_sync: overlaySync === true
          },
          (response) => {
            if (chrome.runtime.lastError) {
              const msg = chrome.runtime.lastError.message || "";
              // Pokud se zrovna reloadnul service worker / rozšíření, spadne kontext.
              // V tom případě zkusíme přímé volání API, aby import nebyl blokovaný.
              const shouldFallback =
                /Extension context invalidated/i.test(msg) ||
                /The message port closed/i.test(msg) ||
                /Receiving end does not exist/i.test(msg);
              if (shouldFallback) {
                directFetch().then(resolve).catch((e) => {
                  reject(new Error(`Chyba komunikace s rozšířením (${msg}) a fallback API selhal: ${e && e.message ? e.message : String(e)}`));
                });
                return;
              }

              reject(new Error(`Chyba komunikace s BetTracker rozšířením: ${msg}`));
              return;
            }

            if (!response) {
              directFetch().then(resolve).catch(() => {
                reject(
                  new Error(
                    "Nebyla přijata odpověď z BetTracker rozšíření. Zkontroluj, že je background skript aktivní (Reload v chrome://extensions) a obnov stránku."
                  )
                );
              });
              return;
            }

            if (!response.ok) {
              reject(new Error(response.error || "Neznámá chyba při volání BetTracker API přes rozšíření."));
              return;
            }

            resolve(response.data);
          }
        );
      } catch (e) {
        directFetch().then(resolve).catch((err) => {
          reject(new Error(`Rozšíření selhalo (kontext) a fallback API selhal: ${err && err.message ? err.message : String(err)}`));
        });
      }
    });
  }

  function removeAkuStrip() {
    const wrap = document.getElementById("bettracker-aku-strip-wrap");
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    const strip = document.getElementById("bettracker-aku-strip");
    if (strip && strip.parentNode) strip.parentNode.removeChild(strip);
  }

  let lastUpcomingItems = [];
  let upcomingPanelCollapsed = false;

  function injectUpcomingStyles() {
    if (document.getElementById("bettracker-upcoming-styles")) return;
    const style = document.createElement("style");
    style.id = "bettracker-upcoming-styles";
    style.textContent = `
      #bettracker-upcoming-panel {
        position: fixed;
        top: 50px;
        left: 50%;
        transform: translateX(-50%);
        width: max-content;
        min-width: 320px;
        max-width: 90vw;
        max-height: 280px;
        z-index: 2147483645;
        background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        color: #f8fafc;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .bt-upcoming-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.03);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        cursor: pointer;
        user-select: none;
      }
      .bt-upcoming-title {
        font-weight: 600;
        font-size: 13px;
        background: linear-gradient(135deg, #38bdf8, #818cf8);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: 0.3px;
      }
      .bt-upcoming-actions {
        display: flex;
        gap: 6px;
      }
      .bt-upcoming-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        font-size: 14px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        cursor: pointer;
        transition: all 0.2s ease;
        padding: 0;
        line-height: 1;
      }
      .bt-upcoming-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        color: #f8fafc;
        border-color: rgba(255, 255, 255, 0.25);
      }
      .bt-upcoming-body {
        flex: 1;
        overflow-y: auto;
        min-height: 60px;
        max-height: calc(280px - 45px);
      }
      .bt-upcoming-body::-webkit-scrollbar {
        width: 6px;
      }
      .bt-upcoming-body::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
      }
      .bt-upcoming-body::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 10px;
      }
      .bt-upcoming-body::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      .bt-upcoming-empty {
        padding: 16px;
        color: #94a3b8;
        font-size: 12px;
        text-align: center;
        line-height: 1.5;
      }
      .bt-upcoming-empty span {
        font-size: 11px;
        opacity: 0.6;
        display: block;
        margin-top: 4px;
      }
      .bt-upcoming-row {
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 28px;
        white-space: nowrap;
        transition: background 0.2s ease;
      }
      .bt-upcoming-row:last-child {
        border-bottom: none;
      }
      .bt-upcoming-row:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      .bt-upcoming-time {
        flex-shrink: 0;
        font-weight: 600;
        color: #38bdf8;
        background: rgba(56, 189, 248, 0.1);
        padding: 3px 6px;
        border-radius: 4px;
        font-size: 11px;
        letter-spacing: 0.5px;
      }
      .bt-upcoming-match {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11.5px;
      }
      .bt-upcoming-match-link {
        color: #e2e8f0;
        text-decoration: none;
        transition: color 0.2s;
        font-weight: 500;
      }
      .bt-upcoming-match-link:hover {
        color: #38bdf8;
      }
      .bt-upcoming-match-text {
        color: #cbd5e1;
      }
      .bt-upcoming-bet {
        flex-shrink: 0;
        font-size: 10.5px;
        color: #94a3b8;
        background: rgba(255, 255, 255, 0.05);
        padding: 3px 8px;
        border-radius: 4px;
      }
      .bt-upcoming-loading {
        padding: 16px;
        color: #94a3b8;
        font-size: 12px;
        text-align: center;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .bt-upcoming-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-top-color: #38bdf8;
        border-radius: 50%;
        animation: bt-spin 0.8s linear infinite;
      }
      @keyframes bt-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  function removeUpcomingPanel() {
    const panel = document.getElementById("bettracker-upcoming-panel");
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
  }

  const UPCOMING_FETCH_MAX = 15;
  const UPCOMING_FETCH_CONCURRENCY = 1;

  function syncUnresolvedTicketsToStorage() {
    let tickets = [];
    if (isTipsportPage() && isTipsportMojeTikety()) {
      tickets = scrapeTipsportTicketsFromPage().map(t => { t.source = 'tipsport'; return t; });
    } else if (isBetanoPage()) {
      const pageTickets = scrapeBetanoTicketsFromPage().map(t => {
        t.source = 'betano';
        return t;
      });
      const sidebarTickets = scrapeBetanoSidebarTickets();

      // Merge sidebar event times with page tickets (based on teams)
      pageTickets.forEach(pt => {
        const sideT = sidebarTickets.find(st => st.home_team.includes(pt.home_team) || pt.home_team.includes(st.home_team));
        if (sideT && sideT.event_start_at) {
          pt.event_start_at = sideT.event_start_at;
        } else if (!pt.event_start_at && pt.placed_at) {
          pt.event_start_at = pt.placed_at; // Fallback k datu podání
        }
      });

      // Kombinace: hlavní Betano stránka + boční panel.
      // Nejdřív vezmeme všechny pageTickets, pak přidáme sidebarTickets, které tam ještě nejsou.
      tickets = pageTickets.slice();
      sidebarTickets.forEach(st => {
        const exists = tickets.find(t => {
          if (t.betano_key && st.betano_key) {
            return t.betano_key === st.betano_key;
          }
          return t.home_team === st.home_team && t.away_team === st.away_team;
        });
        if (!exists) {
          tickets.push(st);
        }
      });
    }

    if (tickets.length === 0 && (!isTipsportPage() || !isTipsportMojeTikety()) && !isBetanoPage()) return;

    const openOnly = tickets.filter(t => t.status_raw === "open" || t.status_raw === "unresolved");

    if (!chrome || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(["bettracker_unresolved_tickets"], function (result) {
      const existing = result.bettracker_unresolved_tickets || {};
      const now = Date.now();

      // Merge/update otevřených tiketů z aktuálního DOMu
      openOnly.forEach(t => {
        const key = t.source === 'tipsport' ? t.ticket_href : t.betano_key;
        if (!key) return;

        const prev = existing[key] || {};
        const merged = {
          ...prev,
          ...t,
          source: t.source || prev.source,
          // původ eventu (Tipsport / Betano), případně rozšířit o tab-id, pokud bude potřeba
          origin: t.source || prev.origin,
          // preferuj už známý event_start_at, pokud nový scrape nepřinesl lepší hodnotu
          event_start_at: t.event_start_at || prev.event_start_at || null,
          last_seen_at: now,
        };
        existing[key] = merged;
      });

      // Jednotná cleanup logika: smazat vyřešené nebo dlouho neviděné tikety
      const TTL_MS = 15 * 60 * 1000; // 15 minut
      Object.keys(existing).forEach(key => {
        const item = existing[key];
        const status = (item.status_raw || "").toString().toLowerCase();
        const isOpen = status === "open" || status === "unresolved";
        const lastSeen = typeof item.last_seen_at === "number" ? item.last_seen_at : null;

        if (!isOpen) {
          delete existing[key];
          return;
        }
        if (lastSeen && now - lastSeen > TTL_MS) {
          delete existing[key];
        }
      });

      chrome.storage.local.set({ bettracker_unresolved_tickets: existing });
    });
  }

  // Only async used now
  function getUpcomingItems() { return []; }

  function runInBatches(arr, batchSize, fn) {
    const results = [];
    let i = 0;
    function next() {
      if (i >= arr.length) return Promise.resolve(results);
      const batch = arr.slice(i, i + batchSize);
      i += batchSize;
      return Promise.all(batch.map(fn)).then(function (batchResults) {
        results.push.apply(results, batchResults);
        return next();
      });
    }
    return next();
  }

  function getUpcomingItemsAsync() {
    return new Promise((resolve) => {
      if (!chrome || !chrome.storage || !chrome.storage.local) return resolve([]);
      chrome.storage.local.get(["bettracker_unresolved_tickets"], function (result) {
        const existing = result.bettracker_unresolved_tickets || {};
        const now = Date.now();
        const TTL_MS = 15 * 60 * 1000; // 15 minut – musí být v souladu se syncUnresolvedTicketsToStorage

        // Vezmeme jen čerstvé otevřené tikety
        const candidates = Object.values(existing).filter(t => {
          const status = (t.status_raw || "").toString().toLowerCase();
          const isOpen = status === "open" || status === "unresolved";
          if (!isOpen) return false;
          const lastSeen = typeof t.last_seen_at === "number" ? t.last_seen_at : null;
          if (!lastSeen) return false;
          return now - lastSeen <= TTL_MS;
        });

        const toFetch = candidates
          .filter(t => t.source === 'tipsport' && t.ticket_href && !t.event_start_at)
          .slice(0, UPCOMING_FETCH_MAX);

        runInBatches(toFetch, UPCOMING_FETCH_CONCURRENCY, function (t) {
          return fetchTicketDetailKickoffTime(t.ticket_href).then(function (iso) {
            if (iso) t.event_start_at = iso;
            if (t.ticket_href) {
              existing[t.ticket_href] = t;
            }
            return t;
          }).catch(function () { return t; });
        }).then(function () {
          if (toFetch.length > 0) {
            chrome.storage.local.set({ bettracker_unresolved_tickets: existing });
          }

          const nowPlus6 = now + UPCOMING_WINDOW_HOURS * 60 * 60 * 1000;
          const nowPlus24 = now + 24 * 60 * 60 * 1000;

          let filtered = candidates.filter(function (t) {
            const at = t.event_start_at;
            if (!at) return true; // Zatím neznáme přesný čas výkopu, ale tiket je čerstvý a otevřený
            const ts = new Date(at).getTime();
            if (isNaN(ts)) return true;
            // Zahrň zápasy do 6 hodin odteď (včetně lehce minulých bez vyhodnocení)
            return ts <= nowPlus6;
          });

          if (filtered.length === 0 && candidates.length > 0) {
            filtered = candidates.filter(function (t) {
              const at = t.event_start_at;
              if (!at) return true;
              const ts = new Date(at).getTime();
              if (isNaN(ts)) return true;
              return ts <= nowPlus24;
            });
          }

          filtered.sort(function (a, b) {
            const ta = a.event_start_at ? new Date(a.event_start_at).getTime() : 0;
            const tb = b.event_start_at ? new Date(b.event_start_at).getTime() : 0;
            return ta - tb;
          });
          resolve(filtered);
        });
      });
    });
  }

  function formatEventTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const now = new Date();
    const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    const h = d.getHours();
    const m = d.getMinutes();
    const timeStr = (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
    if (isToday) return timeStr;
    return d.getDate() + "." + (d.getMonth() + 1) + ". " + timeStr;
  }

  function renderUpcomingPanelBody(container, items) {
    container.innerHTML = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "bt-upcoming-empty";
      if (isTipsportPage() && isTipsportMojeTikety()) {
        empty.innerHTML = "Žádné události v příštích 6 h. <span>Jen nevyhodnocené tikety.</span>";
      } else {
        empty.textContent = "Sázkovky – Moje tikety → Nenačteno.";
      }
      container.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      const row = document.createElement("div");
      row.className = "bt-upcoming-row";

      const timeWrap = document.createElement("div");
      timeWrap.style.display = "flex";
      timeWrap.style.alignItems = "center";
      timeWrap.style.gap = "6px";
      timeWrap.style.flexShrink = "0";

      try {
        let logoUrl = "";
        let logoTitle = "";
        if (item.source === "betano") {
          logoUrl = chrome.runtime.getURL("betano-logo.png");
          logoTitle = "Betano";
        } else {
          logoUrl = chrome.runtime.getURL("tipsport-logo.png");
          logoTitle = "Tipsport";
        }

        if (logoUrl) {
          const logoImg = document.createElement("img");
          logoImg.src = logoUrl;
          logoImg.style.width = "14px";
          logoImg.style.height = "14px";
          logoImg.style.borderRadius = "3px";
          logoImg.style.objectFit = "contain";
          logoImg.title = logoTitle;
          timeWrap.appendChild(logoImg);
        }
      } catch (_) { }

      const timeEl = document.createElement("span");
      timeEl.className = "bt-upcoming-time";
      timeEl.style.flexShrink = "unset";
      timeEl.textContent = formatEventTime(item.event_start_at);
      timeWrap.appendChild(timeEl);

      row.appendChild(timeWrap);

      var matchText = (item.home_team || "") + " – " + (item.away_team || "");
      var main;
      if (item.ticket_href) {
        main = document.createElement("a");
        main.href = item.ticket_href;
        main.target = "_blank";
        main.rel = "noopener";
        main.className = "bt-upcoming-match bt-upcoming-match-link";
        main.title = "Otevřít tiket";
      } else {
        main = document.createElement("span");
        main.className = "bt-upcoming-match bt-upcoming-match-text";
      }
      main.textContent = matchText;
      row.appendChild(main);

      const betEl = document.createElement("span");
      betEl.className = "bt-upcoming-bet";
      betEl.textContent = [item.market_label_raw, item.selection_raw].filter(Boolean).join(": ") || "—";
      row.appendChild(betEl);

      container.appendChild(row);
    });
  }

  function showUpcomingPanel() {
    injectUpcomingStyles();
    removeUpcomingPanel();

    const panel = document.createElement("div");
    panel.id = "bettracker-upcoming-panel";

    const header = document.createElement("div");
    header.className = "bt-upcoming-header";

    const title = document.createElement("span");
    title.className = "bt-upcoming-title";
    title.textContent = "Upcoming (0–6 h)";
    header.appendChild(title);

    const btnWrap = document.createElement("div");
    btnWrap.className = "bt-upcoming-actions";

    function smallBtn(html, id) {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = html;
      b.id = id || "";
      b.className = "bt-upcoming-btn";
      return b;
    }

    const refreshBtn = smallBtn("↻");
    refreshBtn.title = "Obnovit";
    const minBtn = smallBtn("−");
    const closeBtn = smallBtn("✕");

    btnWrap.appendChild(refreshBtn);
    btnWrap.appendChild(minBtn);
    btnWrap.appendChild(closeBtn);
    header.appendChild(btnWrap);
    panel.appendChild(header);

    const body = document.createElement("div");
    body.className = "bt-upcoming-body";
    panel.appendChild(body);
    document.body.appendChild(panel);

    function refreshListAsync() {
      body.innerHTML = "";
      const loading = document.createElement("div");
      loading.className = "bt-upcoming-loading";
      loading.innerHTML = '<div class="bt-upcoming-spinner"></div><span>Načítám časy výkopů…</span>';
      body.appendChild(loading);

      getUpcomingItemsAsync().then(function (items) {
        lastUpcomingItems = items || [];
        renderUpcomingPanelBody(body, lastUpcomingItems);
        title.textContent = "Upcoming (0–6 h)" + (lastUpcomingItems.length ? " (" + lastUpcomingItems.length + ")" : "");
      }).catch(function () {
        lastUpcomingItems = [];
        renderUpcomingPanelBody(body, lastUpcomingItems);
        title.textContent = "Upcoming (0–6 h)";
      });
    }

    if (lastUpcomingItems && lastUpcomingItems.length > 0) {
      // Použijeme data uložená v paměti z minula pro zamezení re-fetche, pokud panel jen zavřel a otevřel
      renderUpcomingPanelBody(body, lastUpcomingItems);
      title.textContent = "Upcoming (0–6 h)" + (lastUpcomingItems.length ? " (" + lastUpcomingItems.length + ")" : "");
    } else {
      refreshListAsync();
    }

    refreshBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      refreshListAsync();
    });
    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      removeUpcomingPanel();
    });
    minBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      upcomingPanelCollapsed = !upcomingPanelCollapsed;
      body.style.display = upcomingPanelCollapsed ? "none" : "block";
      minBtn.textContent = upcomingPanelCollapsed ? "+" : "−";
    });

    header.addEventListener("click", function (e) {
      if (upcomingPanelCollapsed) {
        upcomingPanelCollapsed = false;
        body.style.display = "block";
        minBtn.textContent = "−";
      }
    });
  }

  function buildAkuStripContent(doc, state) {
    const aku = state.akuPreview;
    const raw = state.rawTicket || {};
    const legs = aku.legs || [];
    const ticketHref = state.ticketHref || raw.ticket_href;

    const strip = doc.createElement("div");
    strip.id = "bettracker-aku-strip";
    strip.style.cssText =
      "width:100%;min-height:100%;box-sizing:border-box;" +
      "background:linear-gradient(135deg,#ffffff,#f3e8ff);border:1px solid rgba(148,163,184,0.5);" +
      "border-radius:8px;padding:6px 10px;box-shadow:0 6px 20px rgba(0,0,0,0.2);" +
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;";

    const headerRow = doc.createElement("div");
    headerRow.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin-bottom:4px;";
    const title = doc.createElement("span");
    title.textContent = "AKU (" + (state.indexText || "1") + ")";
    title.style.cssText = "font-weight:700;color:#4c1d95;font-size:11px;";
    headerRow.appendChild(title);
    const matchSummary = doc.createElement("span");
    const sourceLegs = legs.length > 0 ? legs : (raw.legs || []);
    const matchParts = sourceLegs
      .map(function (l) {
        const h = (l.home_team || "").trim();
        const a = (l.away_team || "").trim();
        return h || a ? h + " – " + a : "";
      })
      .filter(Boolean);
    let matchText = matchParts.length > 0 ? matchParts.join("  |  ") : "";
    if (!matchText && raw.first_match_line) matchText = raw.first_match_line;
    if (!matchText) matchText = "(doplňte v příležitostech)";
    matchSummary.textContent = "Zápasy: " + matchText;
    matchSummary.style.cssText = "font-size:10px;font-weight:600;color:#334155;";
    matchSummary.title = "Podle tohoto najdete tiket v seznamu na Tipsportu.";
    headerRow.appendChild(matchSummary);
    if (ticketHref) {
      const link = doc.createElement("a");
      link.href = ticketHref;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Otevřít na Tipsportu";
      link.style.cssText = "color:#6d28d9;font-size:10px;font-weight:600;margin-left:auto;";
      headerRow.appendChild(link);
    }
    strip.appendChild(headerRow);

    const row1 = doc.createElement("div");
    row1.style.cssText = "display:flex;flex-wrap:nowrap;gap:8px;align-items:flex-end;margin-bottom:4px;";
    const lbl = function (t, w) {
      const d = doc.createElement("div");
      d.style.cssText = (w ? "width:" + w + ";" : "min-width:70px;") + " flex-shrink:0;";
      const l = doc.createElement("label");
      l.textContent = t;
      l.style.cssText = "display:block;color:#64748b;font-size:9px;margin-bottom:1px;";
      d.appendChild(l);
      return d;
    };
    const inp = function (type, val, placeholder) {
      const i = doc.createElement("input");
      i.type = type || "text";
      i.value = val != null ? String(val) : "";
      if (placeholder) i.placeholder = placeholder;
      i.style.cssText = "width:100%;padding:3px 5px;border:1px solid #cbd5e1;border-radius:4px;font-size:11px;box-sizing:border-box;";
      i.setAttribute("tabindex", "0");
      return i;
    };
    const stakeInp = inp("number", aku.stake, "0");
    const oddsInp = inp("number", aku.odds, "1.00");
    stakeInp.step = "0.01";
    oddsInp.step = "0.01";
    const statusSel = doc.createElement("select");
    statusSel.style.cssText = "width:100%;padding:3px 5px;border:1px solid #cbd5e1;border-radius:4px;font-size:11px;";
    statusSel.setAttribute("tabindex", "0");
    ["open", "won", "lost", "void"].forEach(function (v) {
      const o = doc.createElement("option");
      o.value = v;
      o.textContent = { open: "Čeká", won: "Výhra", lost: "Prohra", void: "Vráceno" }[v];
      if (String(aku.status) === v) o.selected = true;
      statusSel.appendChild(o);
    });
    row1.appendChild(lbl("Vklad"));
    row1.lastChild.appendChild(stakeInp);
    row1.appendChild(lbl("Kurz"));
    row1.lastChild.appendChild(oddsInp);
    row1.appendChild(lbl("Stav"));
    row1.lastChild.appendChild(statusSel);
    strip.appendChild(row1);

    const legsTitle = doc.createElement("div");
    legsTitle.textContent = "Příležitosti:";
    legsTitle.style.cssText = "font-weight:600;color:#475569;margin-bottom:2px;font-size:10px;";
    strip.appendChild(legsTitle);

    const legsContainer = doc.createElement("div");
    legsContainer.style.cssText = "margin-bottom:4px;";
    strip.appendChild(legsContainer);

    const legRows = [];
    const legsToShow = legs.length > 0 ? legs : (raw.legs && raw.legs.length > 0 ? raw.legs.map(function (l) {
      return { home_team: l.home_team, away_team: l.away_team, market_label: l.market_label_raw || l.market_label, selection: l.selection_raw || l.selection, odds: l.odds, sport_name: raw.sport_label };
    }) : [{}]);

    const cellStyle = "padding:2px 4px;border:1px solid #cbd5e1;border-radius:3px;font-size:10px;min-width:0;box-sizing:border-box;width:100%;";
    const cellLabelStyle = "display:block;color:#64748b;font-size:8px;margin-bottom:0;white-space:nowrap;";
    function smallInp(type, val) {
      const i = doc.createElement("input");
      i.type = type || "text";
      i.value = val != null ? String(val) : "";
      i.style.cssText = cellStyle;
      if (type === "number") i.step = "0.01";
      return i;
    }
    function smallSel() {
      const s = doc.createElement("select");
      s.style.cssText = cellStyle + " flex-shrink:0;";
      s.setAttribute("tabindex", "0");
      return s;
    }
    function addLegRow(leg, idx) {
      const row = doc.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:nowrap;gap:4px;align-items:flex-end;margin-bottom:3px;padding:3px 5px;background:rgba(255,255,255,0.6);border-radius:4px;";
      const sportSel = doc.createElement("select");
      sportSel.style.cssText = cellStyle + " width:72px; flex-shrink:0;";
      SPORTS_FOR_STRIP.forEach(function (sportName) {
        const o = doc.createElement("option");
        o.setAttribute("value", sportName != null ? String(sportName) : "");
        o.textContent = sportName != null ? String(sportName) : "";
        if ((leg && leg.sport_name === sportName) || (idx === 0 && aku.sport_name === sportName)) o.selected = true;
        sportSel.appendChild(o);
      });
      function legCell(label, el, maxW) {
        const wrap = doc.createElement("div");
        wrap.style.cssText = "flex:1; min-width:0; max-width:" + (maxW || 90) + "px;";
        const lab = doc.createElement("label");
        lab.textContent = label;
        lab.style.cssText = cellLabelStyle;
        wrap.appendChild(lab);
        if (el) wrap.appendChild(el);
        return wrap;
      }
      const legStatusSel = smallSel();
      ["open", "won", "lost", "void"].forEach(function (v) {
        const o = doc.createElement("option");
        o.value = v;
        o.textContent = { open: "Čeká", won: "Výhra", lost: "Prohra", void: "Vrác." }[v];
        if (String(aku.status) === v) o.selected = true;
        legStatusSel.appendChild(o);
      });
      const oddsInput = smallInp("number", leg && leg.odds != null ? leg.odds : "");
      row.appendChild(legCell("Sport", sportSel, 72));
      row.appendChild(legCell("Domácí", smallInp("text", leg && leg.home_team), 85));
      row.appendChild(legCell("Hosté", smallInp("text", leg && leg.away_team), 85));
      row.appendChild(legCell("Typ", smallInp("text", leg && leg.market_label), 75));
      row.appendChild(legCell("Výběr", smallInp("text", leg && leg.selection), 75));
      row.appendChild(legCell("Kurz", oddsInput, 52));
      row.appendChild(legCell("Stav", legStatusSel, 58));
      const removeWrap = doc.createElement("div");
      removeWrap.style.flexShrink = "0";
      const removeBtn = doc.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "✕";
      removeBtn.style.cssText = "padding:2px 6px;font-size:10px;background:#f1f5f9;color:#475569;border:none;border-radius:3px;cursor:pointer;line-height:1;";
      removeBtn.setAttribute("tabindex", "0");
      removeBtn.title = "Odebrat příležitost";
      removeWrap.appendChild(removeBtn);
      row.appendChild(removeWrap);
      legsContainer.appendChild(row);
      legRows.push({ row: row, sportSel: sportSel, legStatusSel: legStatusSel, legIndex: idx });
      removeBtn.addEventListener("click", function () {
        if (legRows.length <= 1) return;
        row.remove();
        legRows.splice(legRows.indexOf(legRows.find(function (r) { return r.row === row; })), 1);
      });
    }

    legsToShow.forEach(addLegRow);

    const addLegBtn = doc.createElement("button");
    addLegBtn.type = "button";
    addLegBtn.textContent = "+ Přidat příležitost";
    addLegBtn.style.cssText = "padding:2px 8px;font-size:9px;background:#e9d5ff;color:#4c1d95;border:none;border-radius:4px;cursor:pointer;margin-top:1px;font-weight:600;";
    addLegBtn.setAttribute("tabindex", "0");
    addLegBtn.addEventListener("click", function () { addLegRow({}, legRows.length); });
    legsContainer.appendChild(addLegBtn);

    const btnRow = doc.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;margin-top:4px;";
    const saveBtn = doc.createElement("button");
    saveBtn.textContent = "Uložit";
    saveBtn.style.cssText = "padding:4px 12px;background:#7c3aed;color:#fff;border:none;border-radius:5px;font-weight:600;cursor:pointer;font-size:11px;";
    saveBtn.setAttribute("tabindex", "0");
    const cancelBtn = doc.createElement("button");
    cancelBtn.textContent = "Zrušit";
    cancelBtn.style.cssText = "padding:4px 12px;background:#e2e8f0;color:#475569;border:none;border-radius:5px;font-weight:600;cursor:pointer;font-size:11px;";
    cancelBtn.setAttribute("tabindex", "0");

    saveBtn.addEventListener("click", function () {
      const stake = parseNumber(stakeInp.value);
      const odds = parseNumber(oddsInp.value);
      const statusRaw = statusSel.value;
      const formLegs = legRows.map(function (lr) {
        const inpList = lr.row.querySelectorAll("input");
        const home = (inpList[0] && inpList[0].value || "").trim();
        const away = (inpList[1] && inpList[1].value || "").trim();
        const oddsVal = parseNumber(inpList[4] && inpList[4].value);
        return {
          home_team: home,
          away_team: away,
          market_label_raw: (inpList[2] && inpList[2].value || "").trim(),
          selection_raw: (inpList[3] && inpList[3].value || "").trim(),
          odds: oddsVal != null ? oddsVal : 1
        };
      }).filter(function (leg) { return leg.home_team || leg.away_team; });
      if (formLegs.length === 0) {
        alert("Doplňte alespoň jednu příležitost (zápas) – Domácí nebo Hosté.");
        return;
      }
      const sportLabel = legRows[0] && legRows[0].sportSel ? legRows[0].sportSel.value : (aku.sport_name || raw.sport_label || "Ostatní");
      state.onSave({
        stake: stake != null ? stake : 0,
        odds: odds != null ? odds : 1,
        status_raw: statusRaw,
        legs: formLegs,
        sport_label: sportLabel,
        raw: raw
      });
    });
    cancelBtn.addEventListener("click", function () {
      state.onCancel();
    });
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    strip.appendChild(btnRow);

    doc.body.style.margin = "0";
    doc.body.style.background = "transparent";
    doc.body.appendChild(strip);
  }

  function showAkuStrip(state) {
    removeAkuStrip();
    const wrap = document.createElement("div");
    wrap.id = "bettracker-aku-strip-wrap";
    wrap.style.cssText =
      "position:fixed;top:44px;left:50%;transform:translateX(-50%);width:98%;max-width:1200px;height:420px;z-index:2147483646;" +
      "pointer-events:auto;border:none;box-shadow:0 6px 20px rgba(0,0,0,0.25);border-radius:8px;overflow:hidden;";
    const iframe = document.createElement("iframe");
    iframe.setAttribute("srcdoc", "<!DOCTYPE html><html><head></head><body style='margin:0;background:transparent'></body></html>");
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;background:transparent;";
    wrap.appendChild(iframe);
    document.documentElement.appendChild(wrap);
    iframe.onload = function () {
      try {
        var doc = iframe.contentDocument;
        if (doc && doc.body) buildAkuStripContent(doc, state);
      } catch (e) {
        console.warn("BetTracker AKU strip iframe error:", e);
      }
    };
  }

  let akuImportState = null;

  /**
   * Na stránce Moje tikety (Tipsport) najde záložky Otevřeno, Výhry, Prohry, Vráceno.
   * Vrací pole { element, label } pro každou nalezenou záložku (bez duplicit).
   */
  function getTipsportTabButtons() {
    const tabLabels = ["Otevřeno", "Výhry", "Prohry", "Vráceno"];
    const candidates = document.querySelectorAll('button, a, [role="tab"]');
    let tabBar = null;
    for (const el of candidates) {
      const text = (el.textContent || "").trim();
      if (tabLabels.includes(text)) {
        tabBar = el.parentElement;
        break;
      }
    }
    if (!tabBar) return [];
    const seen = new Set();
    const out = [];
    tabBar.querySelectorAll("button, a, [role=tab]").forEach((el) => {
      const text = (el.textContent || "").trim();
      if (tabLabels.includes(text) && !seen.has(text)) {
        seen.add(text);
        out.push({ element: el, label: text });
      }
    });
    return out;
  }

  /**
   * Scrapuje tikety ze všech záložek (Otevřeno, Výhry, Prohry, Vráceno).
   * U duplicit (stejný tipsport_key) preferuje vyhodnocený stav (won/lost/void) před open/unresolved,
   * aby backend mohl aktualizovat tikety se stavem "čeká" na výhra/prohra/vráceno.
   */
  async function scrapeTipsportTicketsFromAllTabs() {
    const tabButtons = getTipsportTabButtons();
    const byKey = new Map();

    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    const processTab = async (tabInfo) => {
      if (tabInfo && tabInfo.element) {
        tabInfo.element.click();
        await delay(1800);
        await scrollTipsportListToLoadAll();
        const list = scrapeTipsportTicketsFromPage();
        list.forEach((t) => {
          const key = t.tipsport_key || t.ticket_href || `${t.home_team}|${t.away_team}|${t.stake}|${t.placed_at}`;
          const existing = byKey.get(key);
          const newStatus = (t.status_raw || "").toString().toLowerCase();
          const isResolved = ["won", "lost", "void"].includes(newStatus);
          const existingResolved = existing && ["won", "lost", "void"].includes((existing.status_raw || "").toString().toLowerCase());
          if (!existing) {
            byKey.set(key, t);
          } else if (isResolved && !existingResolved) {
            byKey.set(key, t);
          } else if (isResolved || !existingResolved) {
            byKey.set(key, t);
          }
        });
      }
    };

    if (tabButtons.length >= 2) {
      for (const tab of tabButtons) {
        await processTab(tab);
      }
      return Array.from(byKey.values());
    }

    await scrollTipsportListToLoadAll();
    return scrapeTipsportTicketsFromPage();
  }

  /** Na Tipsportu posune stránku / seznam dolů, aby se načetly lazy-loadované tikety. */
  async function scrollTipsportListToLoadAll() {
    const scrollStep = 800;
    const pauseMs = 400;
    const maxSteps = 30;
    let lastCount = 0;
    let sameCount = 0;
    for (let step = 0; step < maxSteps; step++) {
      const cards = document.querySelectorAll('a[data-atid^="ticketListItem"]');
      if (cards.length > 0 && cards.length === lastCount) {
        sameCount++;
        if (sameCount >= 3) break;
      } else {
        sameCount = 0;
      }
      lastCount = cards.length;
      window.scrollBy(0, scrollStep);
      document.documentElement.scrollTop += scrollStep;
      const scrollables = document.querySelectorAll('[style*="overflow"], [class*="scroll"]');
      scrollables.forEach((el) => {
        if (el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight;
        }
      });
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  }

  async function handleImportClick() {
    try {
      let source = null;
      let tickets = [];
      if (isTipsportPage()) {
        source = "tipsport";
        if (isTipsportMojeTikety()) {
          // Scrapujeme všechny záložky (Otevřeno, Výhry, Prohry, Vráceno), aby backend
          // mohl aktualizovat tikety se stavem "čeká" na výhra/prohra/vráceno.
          tickets = await scrapeTipsportTicketsFromAllTabs();
        } else {
          await scrollTipsportListToLoadAll();
          tickets = scrapeTipsportTicketsFromPage();
        }
      } else if (isBetanoPage()) {
        source = "betano";
        const hasHomepageMyBets = document.querySelector('#my-bets-section [data-qa="bet-list"]');
        if (hasHomepageMyBets) {
          tickets = await scrapeBetanoFromHomepageWithExpand();
        } else {
          if (isBetanoBethistoryPage()) {
            await ensureBetanoOpenFilter();
            await scrollBetanoTicketList();
          }
          await expandBetanoCardsBeforeScrape();
          tickets = scrapeBetanoTicketsFromPage();
          enrichBetanoTicketsWithSidebarEventTime(tickets);
        }
      } else if (isFortunaPage()) {
        source = "fortuna";
        const hasOverview = document.querySelector('[data-test="betslip-history-overview_list"]');
        const hasDetail = document.querySelector(".betslip-history-detail__left-panel");
        if (hasDetail && !hasOverview) {
          tickets = scrapeFortunaDetailTicket();
        } else {
          tickets = scrapeFortunaTicketsFromPage();
          if (tickets.length > 0) {
            await enrichFortunaTicketsWithDetailDate(tickets);
          }
        }
      } else {
        alert("BetTracker: Tato stránka není podporovaná pro import tiketů.");
        return;
      }
      if (!tickets.length) {
        alert(
          "BetTracker: Na stránce se nepodařilo najít žádné tikety k importu.\n\n" +
          "Ujistěte se, že jste na Moje tikety a že se seznam načetl (příp. posuňte stránku dolů, aby se načetly další tikety)."
        );
        return;
      }

      // Plně automatický import bez náhledu – backend /scrape endpoint:
      // - zkontroluje duplicity,
      // - nové tikety vytvoří,
      // - existující aktualizuje / přeskočí.
      const result = await sendToApi(tickets, source, false);

      const APP_BASE = "http://localhost:3001";
      const created = result.created ?? 0;
      const updated = result.updated ?? 0;
      const skipped = result.skipped ?? 0;
      const errors = result.errors ?? 0;

      let msg =
        "BetTracker – import dokončen.\n\n" +
        "Vytvořeno nových tiketů: " + created +
        "\nAktualizováno existujících: " + updated +
        (skipped ? "\nPřeskočeno duplicit: " + skipped : "");
      if (errors) {
        msg += "\nChyby při importu: " + errors;
      }
      alert(msg);

      // Po importu otevřít BetTracker s přehledem tiketů.
      window.open(APP_BASE + "/tikety", "_blank");
    } catch (e) {
      console.error("BetTracker Tipsport import – chyba:", e);
      alert("BetTracker – import selhal: " + e.message);
    }
  }

  /** Najde v DOM řádek (kartu) tiketu Fortuna podle týmu a vkladu. */
  function findFortunaCardForTicket(ticket) {
    try {
      if (!ticket || typeof ticket !== "object") return null;
      const listEl = document.querySelector('[data-test="betslip-history-overview_list"]');
      if (!listEl) return null;
      const cards = listEl.querySelectorAll("a.betslip-history-list__item");
      const wantHeading = ((ticket.home_team || "") + " - " + (ticket.away_team || "")).trim();
      const wantStake = ticket.stake;
      for (let i = 0; i < cards.length; i++) {
        const row = cards[i].querySelector(".betslip-history-overview-row");
        if (!row) continue;
        const headingEl = row.querySelector(".betslip-history-overview-row__heading span");
        const heading = (headingEl && headingEl.textContent || "").trim();
        if (heading !== wantHeading) continue;
        let stake = null;
        const footer = row.querySelector(".betslip-history-overview-row__footer");
        if (footer) {
          footer.querySelectorAll(".betslip-history-overview-row__section").forEach((section) => {
            const subHeadings = section.querySelectorAll(".betslip-history-overview-row__sub-heading");
            const labelEl = subHeadings[0];
            const valueEl = section.querySelector(".betslip-history-overview-row__value");
            const label = labelEl ? (labelEl.textContent || "").trim() : "";
            if (label === "Vklad" && valueEl) stake = parseNumber(valueEl.textContent);
          });
        }
        if (wantStake != null && stake != null && Math.abs(Number(wantStake) - Number(stake)) > 0.01) continue;
        return cards[i];
      }
      return null;
    } catch (e) {
      console.warn("BetTracker findFortunaCardForTicket – chyba:", e);
      return null;
    }
  }

  /** Pro Fortunu: rozklikne každý tiket v přehledu, z popupu přečte datum výkopu (.betslip-leg-date), zavře a doplní event_start_at. */
  async function enrichFortunaTicketsWithDetailDate(tickets) {
    const FORTUNA_DETAIL_WAIT_MS = 3500;
    const FORTUNA_AFTER_CLOSE_MS = 600;
    const FORTUNA_MAX_TICKETS = 12;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    if (!Array.isArray(tickets) || tickets.length === 0) return;

    for (let i = 0; i < Math.min(tickets.length, FORTUNA_MAX_TICKETS); i++) {
      const ticket = tickets[i];
      try {
        const card = findFortunaCardForTicket(ticket);
        if (!card) continue;

        card.click();
        await delay(400);

        let eventStartIso = null;
        let sportIconId = null;
        for (let w = 0; w < 35; w++) {
          await delay(100);
          try {
            const legDateEls = document.querySelectorAll(".betslip-leg-date span");
            if (legDateEls.length > 0) {
              const times = [];
              legDateEls.forEach((el) => {
                const text = (el.textContent || "").trim();
                if (text) {
                  const iso = parseFortunaRelativeDate(text);
                  if (iso) times.push(iso);
                }
              });
              if (times.length > 0) {
                times.sort();
                eventStartIso = times[0];
              }
            }
            const detailRoot = document.querySelector(".betslip-history-detail") || document;
            const sportImg = detailRoot.querySelector('img[alt*="ufo:sprt:"], img[src*="ufo-sprt-"], img[src*="ifortuna.cz/sports"]');
            if (sportImg) {
              if (sportImg.src) {
                const m = sportImg.src.match(/ufo-sprt-([a-z0-9]+)\.png/i);
                if (m) sportIconId = m[1];
              }
              if (!sportIconId && sportImg.getAttribute("alt")) {
                const altM = sportImg.getAttribute("alt").match(/ufo:sprt:([a-z0-9]+)\.png/i);
                if (altM) sportIconId = altM[1];
              }
            }
          } catch (_) { /* ignorovat chyby v jednom průchodu */ }
          if (eventStartIso || w > 3) break;
        }

        if (eventStartIso) ticket.event_start_at = eventStartIso;
        else if (ticket.placed_at) ticket.event_start_at = ticket.placed_at;
        if (sportIconId) ticket.sport_icon_id = sportIconId;
      } catch (e) {
        console.warn("BetTracker Fortuna enrich – chyba u tiketu:", ticket && (ticket.home_team || ticket.away_team), e);
      } finally {
        try {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
          await delay(FORTUNA_AFTER_CLOSE_MS);
        } catch (_) { }
      }
    }
  }

  async function scrollBetanoMyBetsToLoadAll() {
    const scrollStep = 800;
    const pauseMs = 400;
    const maxSteps = 30;
    let lastCount = 0;
    let sameCount = 0;

    const scrollables = document.querySelectorAll('#my-bets-section .my-bets__category__body, #my-bets-section [class*="overflow-auto"], aside [class*="overflow-auto"]');
    if (!scrollables.length) return;

    for (let step = 0; step < maxSteps; step++) {
      const cards = document.querySelectorAll('#my-bets-section [data-qa="bet-activity-card"], aside [data-qa="bet-activity-card"]');
      if (cards.length > 0 && cards.length === lastCount) {
        sameCount++;
        if (sameCount >= 3) break;
      } else {
        sameCount = 0;
      }
      lastCount = cards.length;

      scrollables.forEach((el) => {
        el.scrollTop += scrollStep;
      });
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  }

  /**
   * Betano homepage „Moje sázky“ (#my-bets-section): stejný princip jako Fortuna –
   * pro každou kartu rozklikneme toggle, přečteme event_start_at a is_live, pak jdeme dál.
   * Vrací tikety kompletní včetně času zápasu a live stavu.
   */
  async function scrapeBetanoFromHomepageWithExpand() {
    const BETANO_EXPAND_WAIT_MS = 450;
    const BETANO_MAX_CARDS = 50;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    await scrollBetanoMyBetsToLoadAll();

    const listEl = document.querySelector('#my-bets-section [data-qa="bet-list"]') || document.querySelector('aside [data-qa="bet-list"]');
    if (!listEl) return [];

    const cards = Array.from(listEl.querySelectorAll('.bet-activity-card[data-qa="bet-activity-card"]'));
    const results = [];

    for (let i = 0; i < Math.min(cards.length, BETANO_MAX_CARDS); i++) {
      const card = cards[i];
      const toggleBtn = card.querySelector('[data-qa="toggle-button"]');
      if (!toggleBtn) continue;

      const alreadyExpanded = card.querySelector('.bet-event-date-time, [data-qa="bet-event-date-time"]');
      if (!alreadyExpanded) {
        toggleBtn.click();
        await delay(BETANO_EXPAND_WAIT_MS);
      }

      try {
        const stakeEl = card.querySelector('[data-qa="bet-label-amount"]');
        const stake = stakeEl ? parseNumber(stakeEl.textContent) : 0;
        if (!stake || stake <= 0) continue;

        const oddsEl = card.querySelector('.card-header [data-qa="bet-odds"], [data-qa="bet-odds"]');
        const odds = oddsEl ? parseNumber(oddsEl.textContent) : null;

        const selectionEl = card.querySelector('[data-qa="selection-label"], .selection-label');
        const selection_raw = selectionEl ? selectionEl.textContent.trim() : null;
        const marketEl = card.querySelector('[data-qa="market-label"], .market-label');
        const market_label_raw = marketEl ? marketEl.textContent.trim() : null;
        const ticketTypeEl = card.querySelector('[data-qa="bet-label-title"], .bet-label__title');
        const ticket_type_raw = ticketTypeEl ? ticketTypeEl.textContent.trim() : "SOLO sázka";

        let home_team = "";
        let away_team = "";
        const eventNameEl = card.querySelector('.event-name, [data-qa="event-info-link"], .tw-text-licorice, [class*="match"], .participants, .event-info__link');
        const participantsEl = card.querySelector('.participants');
        if (participantsEl) {
          const names = participantsEl.querySelectorAll('.participants__participant-name');
          if (names.length >= 2) {
            home_team = (names[0].textContent || "").trim();
            away_team = (names[1].textContent || "").trim();
          }
        } else if (eventNameEl) {
          const text = (eventNameEl.textContent || "").replace(/\s+/g, " ").trim();
          const parts = text.split(" - ");
          if (parts.length >= 2) {
            home_team = (parts[0] || "").trim();
            away_team = (parts[1] || "").trim();
          } else {
            home_team = text;
            away_team = "?";
          }
        }

        if (!home_team && !away_team) {
          if (market_label_raw || selection_raw) {
            home_team = market_label_raw || "Speciální sázka / Outright";
            away_team = selection_raw || "?";
          } else {
            console.log("BetTracker: Dropped card missing teams:", card.innerText);
            continue;
          }
        }

        const timeEl = card.querySelector('.bet-event-date-time, [data-qa="bet-event-date-time"]');
        let event_start_at = null;
        if (timeEl) {
          const rawTime = (timeEl.textContent || "").trim();
          if (rawTime) event_start_at = parseBetanoRelativeTime(rawTime);
        }

        let is_live = !!card.querySelector('.leg-scoreboard-container, [data-qa="leg-scoreboard-container"], [data-qa="thunder-icon"]');
        if (!is_live) {
          const cardText = (card.textContent || "").trim();
          if (/\blive\b/i.test(cardText) || /\bživě\b/i.test(cardText)) is_live = true;
        }
        if (!is_live) {
          const liveEl = card.querySelector('[data-qa*="live" i]');
          if (liveEl && (liveEl.textContent || "").trim().toLowerCase() === "live") is_live = true;
        }

        const betano_key = (home_team + "|" + away_team + "|" + stake + "|" + (odds || "")).trim() || String(i);

        // sport – z ikony v kartě (BASK, ICEH, FOOT, HAND, TENN, ESPS)
        let sport_label = null;
        let sport_icon_id = null;
        const sportImg = card.querySelector('img[alt="sport-icon"]');
        if (sportImg) {
          const src = sportImg.getAttribute("src") || "";
          sport_icon_id = src;
          if (src.includes("BASK")) sport_label = "Basketbal";
          else if (src.includes("ICEH")) sport_label = "Hokej";
          else if (src.includes("FOOT")) sport_label = "Fotbal";
          else if (src.includes("HAND")) sport_label = "Házená";
          else if (src.includes("TENN")) sport_label = "Tenis";
          else if (src.includes("ESPS")) sport_label = "Esport";
        }

        results.push({
          home_team,
          away_team,
          betano_key,
          sport_label: sport_label || null,
          sport_icon_id: sport_icon_id || null,
          market_label_raw,
          selection_raw,
          ticket_type_raw,
          status_raw: "open",
          stake,
          payout: null,
          odds: odds || 1,
          placed_at: event_start_at || null,
          event_start_at: event_start_at || undefined,
          is_live
        });
      } catch (e) {
        console.warn("BetTracker Betano homepage – chyba u karty:", e);
      }

      if (!alreadyExpanded && toggleBtn) {
        toggleBtn.click();
        await delay(200);
      }
    }
    return results;
  }

  /** Pro Betano: doplní event_start_at (čas výkopu) ze sidebaru „Moje sázky“ nebo z karty; fallback placed_at. */
  function enrichBetanoTicketsWithSidebarEventTime(tickets) {
    const sidebarTickets = scrapeBetanoSidebarTickets();
    function norm(s) { return (s || "").trim().toLowerCase(); }
    function teamsMatch(st, pt) {
      const h1 = norm(st.home_team);
      const h2 = norm(pt.home_team);
      const a1 = norm(st.away_team);
      const a2 = norm(pt.away_team);
      if (!h1 && !a1) return false;
      const homeOk = !h1 || !h2 || h1 === h2 || h1.includes(h2) || h2.includes(h1);
      const awayOk = !a1 || !a2 || a1 === a2 || a1.includes(a2) || a2.includes(a1);
      return homeOk && awayOk;
    }
    tickets.forEach(function (pt) {
      const sideT = sidebarTickets.find(function (st) { return teamsMatch(st, pt); });
      if (sideT && sideT.event_start_at) {
        pt.event_start_at = sideT.event_start_at;
      }
      if (!pt.event_start_at && pt.placed_at) {
        pt.event_start_at = pt.placed_at;
      }
    });
  }

  /** Pro Tipsport: před odesláním do API doplní event_start_at (čas výkopu) z detailu tiketu, aby aplikace zobrazovala jen zápasy které ještě nezačaly. */
  async function enrichTipsportTicketsWithKickoff(tickets) {
    const withHref = tickets.filter(function (t) { return t.ticket_href; });
    if (withHref.length === 0) return;
    const LIVE_KICKOFF_BATCH = 8;
    const LIVE_KICKOFF_CONCURRENCY = 2;
    await runInBatches(withHref.slice(0, LIVE_KICKOFF_BATCH), LIVE_KICKOFF_CONCURRENCY, function (t) {
      return fetchTicketDetailKickoffTime(t.ticket_href).then(function (iso) {
        if (iso) t.event_start_at = iso;
        return t;
      }).catch(function () { return t; });
    });
  }

  /** LIVE = synchronizace jen otevřených a live tiketů do backendu (pro overlay a stránku /live). */
  async function handleImportActiveClick() {
    let source = null;
    let all = [];
    if (isTipsportPage() && isTipsportMojeTikety()) {
      source = "tipsport";
      all = scrapeTipsportTicketsFromPage();
    } else if (isBetanoPage()) {
      source = "betano";
      const hasHomepageMyBets = document.querySelector('#my-bets-section [data-qa="bet-list"]');
      if (hasHomepageMyBets) {
        all = await scrapeBetanoFromHomepageWithExpand();
      } else {
        if (isBetanoBethistoryPage()) {
          await ensureBetanoOpenFilter();
          await scrollBetanoTicketList();
        }
        await expandBetanoCardsBeforeScrape();
        all = scrapeBetanoTicketsFromPage();
        enrichBetanoTicketsWithSidebarEventTime(all);
      }
    } else if (isFortunaPage()) {
      try {
        const hasOverview = document.querySelector('[data-test="betslip-history-overview_list"]');
        const hasDetail = document.querySelector(".betslip-history-detail__left-panel");
        if (hasDetail && !hasOverview) {
          all = scrapeFortunaDetailTicket();
        } else {
          all = scrapeFortunaTicketsFromPage();
        }
        source = "fortuna";
      } catch (e) {
        console.warn("BetTracker Fortuna – chyba při načítání tiketů:", e);
        all = [];
      }
    }
    if (!source || !all.length) {
      alert("BetTracker: Na stránce nebyly nalezeny žádné tikety, nebo stránka není podporovaná pro LIVE. Otevřete přehled tiketů (Tipsport Moje tikety, Betano, Fortuna).");
      return;
    }
    const status = (t) => (t.status_raw && String(t.status_raw).toLowerCase()) || "";
    const openOnly = all.filter(function (t) {
      const s = status(t);
      const isOpen = s === "open";
      const isUnresolved = s === "unresolved";
      const isWaiting = s === "waiting";
      const isPending = ["čeká", "ceka", "nevyhodnoceno", "pending", "otevřená", "otevrena"].includes(s);
      const hasLiveTag = t.is_live === true;
      const unknown = t.status_raw == null || t.status_raw === "";
      return isOpen || isUnresolved || isWaiting || isPending || hasLiveTag || unknown;
    });
    if (!openOnly.length) {
      alert("BetTracker – LIVE: Na stránce nebyly nalezeny žádné tikety k synchronizaci (otevřené, nevyhodnocené ani live).\n\nUjistěte se, že jste na přehledu „Moje tikety“ a že stránka zobrazuje seznam tiketů.");
      return;
    }
    const liveCount = openOnly.filter(function (t) { return t.is_live === true; }).length;
    console.log("BetTracker OVERLAY sync (" + source + "): " + openOnly.length + " tiketů, z toho is_live=true: " + liveCount + (liveCount === 0 && source === "betano" ? " – pokud máte live zápasy, rozbalte karty a zkuste znovu." : ""));
    if (source === "tipsport") {
      await enrichTipsportTicketsWithKickoff(openOnly);
    }
    if (source === "betano") {
      enrichBetanoTicketsWithSidebarEventTime(openOnly);
    }
    if (source === "fortuna") {
      try {
        await enrichFortunaTicketsWithDetailDate(openOnly);
      } catch (e) {
        console.warn("BetTracker Fortuna – obohacení o datum zápasu selhalo, pokračuji bez něj:", e);
      }
    }
    try {
      const result = await sendToApi(openOnly, source, false, true);
      const created = result.created ?? 0;
      const updated = result.updated ?? 0;
      const errors = result.errors ?? 0;
      const APP_BASE = "http://localhost:3001";
      if (errors > 0) {
        alert("BetTracker – LIVE sync: " + created + " nových, " + updated + " aktualizováno, " + errors + " chyb.");
      } else {
        alert("BetTracker – aktivní tikety synchronizovány (" + source + "). Zobrazíte je v overlay nebo na stránce LIVE.");
      }
      window.open(APP_BASE + "/live", "_blank");
    } catch (e) {
      console.error("BetTracker LIVE sync – chyba:", e);
      const msg = (e && e.message) ? e.message : String(e);
      let hint = "";
      if (/failed to fetch|networkerror|load failed|connection refused|není dostupný|fallback API selhal/i.test(msg)) {
        hint = "\n\n• Spusťte backend na portu 15555 (např. BetTracker.bat nebo: uvicorn app.main:app --port 15555).\n• V Nastavení rozšíření (pravý klik na ikonu → Možnosti) zkuste URL: http://localhost:15555/api";
      } else if (/kontext|context invalidated|message port closed/i.test(msg)) {
        hint = "\n\nObnovte stránku (F5) a zkuste znovu. Pokud problém trvá, spusťte backend na portu 15555.";
      }
      alert("BetTracker – LIVE sync selhal: " + msg + hint);
    }
  }

  function runTicketDetailLiveLink() {
    if (!isTipsportTicketDetail()) return;
    const params = new URLSearchParams(location.search);
    const idu = params.get("idu");
    const idb = params.get("idb");
    const hash = params.get("hash");
    const tipsportKey = [idu, idb, hash].filter(Boolean).join(":") || null;
    setTimeout(function () {
      const link = document.querySelector('a[data-atid="matchReferenceLink"]');
      if (!link) return;
      let href = link.getAttribute("href") || link.href || "";
      if (href && !href.startsWith("http")) {
        href = location.origin + (href.startsWith("/") ? href : "/" + href);
      }
      if (!href) return;
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: "bettracker-live-link",
          tipsportKey: tipsportKey,
          liveMatchUrl: href
        });
      }
    }, 1500);
  }

  function sendLiveStateToBackend(tipsportMatchId, scrapedPayload) {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: "bettracker-live-state",
        tipsportMatchId: tipsportMatchId,
        liveMatchUrl: location.href,
        scraped: scrapedPayload
      });
    }
  }

  function runLiveZapasScrape() {
    if (!isTipsportLiveZapas()) return;
    const match = location.pathname.match(/\/live\/zapas\/[^/]+\/(\d+)\/?$/);
    const tipsportMatchId = match ? match[1] : null;
    setTimeout(function () {
      const useEl = document.querySelector('use[xlink\\:href="#i212"]') || document.querySelector('use[href="#i212"]');
      if (useEl) {
        const tab = useEl.closest("button") || useEl.closest("a") || useEl.closest("div");
        if (tab) tab.click();
      }
    }, 800);
    setTimeout(function () {
      const scoreText = document.body ? document.body.innerText : "";
      const fullText = scoreText.slice(0, 4000);
      sendLiveStateToBackend(tipsportMatchId, { scoreText: scoreText.slice(0, 2000), fullText: fullText });
    }, 2500);
  }

  function runLiveZapasScrapePeriodic() {
    if (!isTipsportLiveZapas()) return;
    const match = location.pathname.match(/\/live\/zapas\/[^/]+\/(\d+)\/?$/);
    const tipsportMatchId = match ? match[1] : null;
    const scoreText = document.body ? document.body.innerText : "";
    const fullText = scoreText.slice(0, 4000);
    sendLiveStateToBackend(tipsportMatchId, { scoreText: scoreText.slice(0, 2000), fullText: fullText });
  }

  function init() {
    chrome.storage.sync.get(["upcomingButtonVisibility"], function (result) {
      const isTipsport = isTipsportPage();
      const isBetano = isBetanoPage();
      const isFortuna = isFortunaPage();

      // SOON (Upcoming) tlačítko zatím skryto – vždy zobrazit jen Import a Live
      var upcomingBtnEl = document.getElementById("bettracker-upcoming-btn");
      if (upcomingBtnEl) {
        upcomingBtnEl.remove();
        removeUpcomingPanel();
      }

      if (isTipsport || isBetano || isFortuna) {
        const btn = createImportButton();
        btn.addEventListener("click", handleImportClick);
        const showLiveBtn = (isTipsport && isTipsportMojeTikety()) || isBetano || isFortuna;
        if (showLiveBtn) {
          const activeBtn = createImportActiveButton();
          activeBtn.addEventListener("click", handleImportActiveClick);
        }
      }
      if (isTipsportTicketDetail()) runTicketDetailLiveLink();
      if (isTipsportLiveZapas()) runLiveZapasScrape();
    });
  }

  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === "sync" && changes.upcomingButtonVisibility) init();
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === "bettracker-live-tick") {
      runLiveZapasScrapePeriodic();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init();
      setInterval(syncUnresolvedTicketsToStorage, 5000);
      syncUnresolvedTicketsToStorage();
    });
  } else {
    init();
    setInterval(syncUnresolvedTicketsToStorage, 5000);
    syncUnresolvedTicketsToStorage();
  }
})();

