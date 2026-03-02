(function () {
  function isTipsportPage() {
    return /tipsport\.cz$/i.test(location.hostname) || /tipsport\.cz/i.test(location.hostname);
  }

  function isBetanoPage() {
    return /betano\.cz$/i.test(location.hostname) || /betano\.cz/i.test(location.hostname);
  }

  function createImportButton() {
    const existing = document.getElementById("bettracker-import-btn");
    if (existing) return existing;

    const btn = document.createElement("button");
    btn.id = "bettracker-import-btn";
    btn.textContent = "Import do BetTrackeru";
    btn.style.position = "fixed";
    btn.style.right = "16px";
    btn.style.bottom = "16px";
    btn.style.zIndex = "99999";
    btn.style.padding = "10px 16px";
    btn.style.borderRadius = "8px";
    btn.style.border = "none";
    btn.style.background = "#2563eb";
    btn.style.color = "#ffffff";
    btn.style.fontSize = "14px";
    btn.style.fontWeight = "600";
    btn.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";
    btn.style.cursor = "pointer";
    btn.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#1d4ed8";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "#2563eb";
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

  function mapStatusFromIconHref(href) {
    // Status ikony podle Sports_div
    if (!href) return null;
    const val = href.toString().trim();
    if (val === "#i170") return "won";
    if (val === "#i243") return "void";
    if (val === "#i173") return "lost";
    if (val === "#i172") return "open";
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
    }

    const timeMatch = (timeText || "").trim().match(/(\d{1,2}):(\d{2})/);
    const hour = timeMatch ? parseInt(timeMatch[1], 10) : 0;
    const minute = timeMatch ? parseInt(timeMatch[2], 10) : 0;

    const dt = new Date(year, month, day, hour, minute);
    return dt.toISOString();
  }

  // ──────────────────────────────────────────────
  // Tipsport – scraping z HTML
  // ──────────────────────────────────────────────

  function scrapeTipsportTicketsFromPage() {
    const results = [];

    // Na Tipsportu je každý tiket jedna <a> s atributem data-atid="ticketListItem…"
    const cards = document.querySelectorAll('a[data-atid^="ticketListItem"]');

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

        // Typ tiketu (AKU / SÓLO) – třetí whiteSpace-noWrap v hlavičce
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

        // Řádky vpravo: Vklad, Skutečná výhra, Celkový kurz
        const valueRows = card.querySelectorAll("div.sc-8da44c8-4.goKmrV");
        let stake = null;
        let payout = null;
        let odds = null;
        valueRows.forEach((row) => {
          const labelEl = row.querySelector("span.sc-8da44c8-1.eTFevi");
          const valueEl = row.querySelector("span.sc-8da44c8-1.bYmSBn");
          if (!labelEl || !valueEl) return;
          const label = labelEl.textContent.trim();
          const num = parseNumber(valueEl.textContent);
          if (label === "Vklad") stake = num;
          else if (label === "Skutečná výhra" || label === "Možná výhra" || label === "Výhra") payout = num;
          else if (label === "Celkový kurz") odds = num;
        });

        // Stav tiketu – základní heuristika:
        // - pokud payout > 0 => won
        // - pokud payout == 0 => lost
        // - pokud nelze payout určit => open
        let status_raw = null;
        // Preferovat ikonu stavu z DOM (výhra/prohra/vráceno/čeká)
        const statusUseEl = card.querySelector("svg use[xlink\\:href=\"#i170\"], svg use[xlink\\:href=\"#i243\"], svg use[xlink\\:href=\"#i173\"], svg use[xlink\\:href=\"#i172\"]");
        const statusHref = statusUseEl
          ? (statusUseEl.getAttribute("xlink:href") || statusUseEl.getAttribute("href"))
          : null;
        status_raw = mapStatusFromIconHref(statusHref);
        if (!status_raw) {
          if (payout != null) status_raw = payout > 0 ? "won" : "lost";
          else status_raw = "open";
        }

        const ticket = {
          home_team,
          away_team,
          sport_label,
          sport_icon_id,
          sport_class,
          tipsport_key,
          market_label_raw,
          selection_raw,
          ticket_type_raw,
          status_raw,
          stake: stake ?? 0,
          payout: payout,
          odds: odds,
          placed_at: placed_at_iso
        };

        // Minimální validace – bez týmu a vkladu nemá smysl
        if (ticket.home_team && ticket.away_team && ticket.stake > 0) {
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
        const resultTagEl = cardRoot.querySelector('section [data-qa="bethistory-result-tag"] span');
        const status_raw = resultTagEl ? resultTagEl.textContent.trim() : null;

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

        // sport – z <img alt=\"sport-icon\" src=\".../ICEH...svg\">
        const sportImg = firstContentBlock.querySelector('img[alt="sport-icon"]');
        let sport_icon_id = null;
        let sport_label = null;
        if (sportImg) {
          const src = sportImg.getAttribute("src") || "";
          sport_icon_id = src;
          // hrubé mapování podle prefixu ve jménu souboru
          if (src.includes("BASK")) sport_label = "Basketbal";
          else if (src.includes("ICEH")) sport_label = "Hokej";
          else if (src.includes("FOOT")) sport_label = "Fotbal";
          else if (src.includes("TENN")) sport_label = "Tenis";
        }

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
          placed_at
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
  // Společná komunikace s backendem
  // ──────────────────────────────────────────────

  async function sendToApi(tickets, source) {
    const hasRuntime =
      typeof chrome !== "undefined" &&
      chrome &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === "function";

    // Pokud není k dispozici chrome.runtime.sendMessage, zkusíme přímé volání API
    if (!hasRuntime) {
      const API_BASE = "http://127.0.0.1:8000/api";
      const payload = { tickets: tickets || [] };
      const endpoint =
        source === "betano"
          ? `${API_BASE}/import/betano/scrape`
          : `${API_BASE}/import/tipsport/scrape`;

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API error ${res.status}: ${text}`);
        }

        return await res.json();
      } catch (e) {
        throw new Error(
          `BetTracker rozšíření není plně aktivní (chrome.runtime.sendMessage není k dispozici) a přímé volání API selhalo: ${
            e && e.message ? e.message : String(e)
          }`
        );
      }
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "bettracker-import-tickets",
          source,
          tickets
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `Chyba komunikace s BetTracker rozšířením: ${chrome.runtime.lastError.message}`
              )
            );
            return;
          }

          if (!response) {
            reject(
              new Error(
                "Nebyla přijata odpověď z BetTracker rozšíření. Zkontroluj, že je background skript aktivní a že prohlížeč rozšíření neuspává."
              )
            );
            return;
          }

          if (!response.ok) {
            reject(
              new Error(
                response.error ||
                  "Neznámá chyba při volání BetTracker API přes rozšíření."
              )
            );
            return;
          }

          resolve(response.data);
        }
      );
    });
  }

  async function handleImportClick() {
    try {
      let source = null;
      let tickets = [];
      if (isTipsportPage()) {
        source = "tipsport";
        tickets = scrapeTipsportTicketsFromPage();
      } else if (isBetanoPage()) {
        source = "betano";
        tickets = scrapeBetanoTicketsFromPage();
      } else {
        alert("BetTracker: Tato stránka není podporovaná pro import tiketů.");
        return;
      }
      if (!tickets.length) {
        alert(
          "BetTracker: Na stránce se nepodařilo najít žádné tikety.\n" +
            "Zkontroluj prosím selektory v content.js (atributy data-bettracker-*)."
        );
        return;
      }

      const result = await sendToApi(tickets, source);

      const msgLines = [
        `Nalezeno tiketů: ${tickets.length}`,
        `Uloženo nových: ${result.created ?? 0}`,
        `Aktualizováno existujících: ${result.updated ?? 0}`,
        `Přeskočeno (duplicitní): ${result.skipped ?? 0}`,
        `Chyby: ${result.errors ?? 0}`
      ];
      alert("BetTracker – import z BetTracker extension\n\n" + msgLines.join("\n"));
    } catch (e) {
      console.error("BetTracker Tipsport import – chyba:", e);
      alert("BetTracker – import selhal: " + e.message);
    }
  }

  function init() {
    if (!isTipsportPage() && !isBetanoPage()) return;
    const btn = createImportButton();
    btn.addEventListener("click", handleImportClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

