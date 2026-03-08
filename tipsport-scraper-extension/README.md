## BetTracker – Tipsport scraper extension (návrh)

Tato složka obsahuje **jednoduché rozšíření pro prohlížeč** (Chrome / Chromium / Edge / Comet), které:

- na stránce s přehledem tiketů na Tipsportu vloží tlačítko **„Import do BetTrackeru“**,
- z HTML stránky vyčte údaje o jednotlivých tiketech,
- odešle je do BetTracker API na endpoint `/api/import/tipsport/scrape`,
- backend provede **deduplikaci** a uloží jen nové tikety.

> POZOR: Selektory v `content.js` jsou záměrně označené jako `data-bettracker-*` – je potřeba je přemapovat na skutečné CSS selektory Tipsportu podle DevTools.

---

### 1. Jak extension nainstalovat (Chrome / Edge / Comet)

1. Otevři `chrome://extensions` (nebo ekvivalent v prohlížeči).
2. Zapni **Developer mode** (Režim pro vývojáře).
3. Klikni na **Load unpacked** / **Načíst rozbalené**.
4. Vyber složku:

   - `tipsport-scraper-extension/` v rootu projektu.

5. Po instalaci otevři stránku s přehledem tiketů na `tipsport.cz` – v pravém dolním rohu by se mělo objevit tlačítko „Import do BetTrackeru“.

API URL je aktuálně nastavené přímo v `content.js`:

```js
const API_BASE = "http://127.0.0.1:15555/api";
```

Pokud běží backend na jiné adrese, uprav tuto hodnotu.

---

### 2. Jak přemapovat selektory na Tipsport DOM

V souboru `content.js` je funkce `scrapeTicketsFromPage()`. Uvnitř jsou **placeholder** selektory:

```js
const cards = document.querySelectorAll("[data-bettracker-tipsport-card]");
const matchEl = card.querySelector("[data-bettracker-match]");
const selectionEl = card.querySelector("[data-bettracker-selection]");
const stakeEl = card.querySelector("[data-bettracker-stake]");
// ...
```

Postup:

1. Na stránce s přehledem tiketů otevři **DevTools** (F12).
2. Pomocí inspektoru klikni na **celý horizontální pruh jednoho tiketu**.
3. Zkopíruj vhodný CSS selektor (např. `div.ticket-card`, `.ticket-list-item`, apod.).
4. V `content.js` nahraď placeholder:

   ```js
   const cards = document.querySelectorAll("[data-bettracker-tipsport-card]");
   ```

   za něco jako:

   ```js
   const cards = document.querySelectorAll("div.ticket-card");
   ```

5. Stejně najdi:

   - element s textem „Domácí - Hosté“ (např. `"Philadelphia - Georgia"`) → `matchEl`,
   - řádek s výběrem (např. „Vítěz zápasu: Team Voca“) → `selectionEl`,
   - čísla vpravo: Vklad / Skutečná výhra / Celkový kurz → `stakeEl`, `payoutEl`, `oddsEl`,
   - ikonku/label sportu → `sportEl`,
   - typ tiketu (AKU / SÓLO) → `typeEl`,
   - případně datum/čas podání tiketu → `placedAtEl`.

6. Po úpravě selektorů stránku obnov a zkus tlačítko „Import do BetTrackeru“ znovu.

---

### 3. Jaká data extension posílá do backendu

Struktura pole `tickets` v požadavku na `/api/import/tipsport/scrape` odpovídá schématu `TipsportScrapeTicketIn`:

```jsonc
{
  "tickets": [
    {
      "home_team": "Philadelphia",
      "away_team": "Georgia",
      "sport_label": "Tenis",
      "market_label_raw": null,
      "selection_raw": "Vítěz zápasu: Team Voca",
      "ticket_type_raw": "SÓLO",
      "status_raw": "Prohra",
      "stake": 75,
      "payout": 0,
      "odds": 2.35,
      "placed_at": "2024-02-27T22:13:00"
    }
  ]
}
```

Backend si tato pole přemapuje na interní `TicketCreate`:

- `sport_label` → `sport_id` (tabulka `sports`),
- `ticket_type_raw` („AKU“/„SÓLO“) → `ticket_type` (`aku`/`solo`),
- `status_raw` → `status` (`won`/`lost`/`open`/`void`),
- `selection_raw` + `market_label_raw` → `selection` a `market_label` (pokud `selection_raw` obsahuje `X: Y`, rozdělí se na `market_label="X"` a `selection="Y"`),
- `stake`, `payout`, `odds` → číselná pole tiketu,
- `placed_at` → `event_date`.

---

### 4. Dedup logika v backendu

Endpoint `/api/import/tipsport/scrape` (router `tipsport_import.py`) dělá pro každý tiket:

1. Najde `bookmaker_id` pro **Tipsport**.
2. Přemapuje vstup na `TicketCreate`.
3. Zkusí najít **duplicitní tiket**:

   - stejný `bookmaker_id`,
   - stejné `home_team` a `away_team`,
   - stejný `stake` a `odds`,
   - pokud je k dispozici `event_date`, tak v časovém okně ±10 minut.

4. Pokud takový tiket najde → výsledek `status="skipped"`, tiket se znovu nevytváří.
5. Pokud ne → zavolá standardní `create_ticket` logiku a tiket uloží.

Odpověď má tvar `TipsportScrapeResponse`:

```jsonc
{
  "created": 7,
  "skipped": 3,
  "errors": 0,
  "results": [
    { "index": 0, "status": "created", "ticket_id": 101 },
    { "index": 1, "status": "skipped", "ticket_id": 42, "message": "Tiket již v databázi existuje (duplicitní)." }
  ]
}
```

---

### 5. Co případně doladit dál

- Přidat **konfigurovatelné API URL** přes `chrome.storage` + jednoduchou options stránku.
- Vylepšit mapování sportů (např. přes pevnou mapu Tipsport → interní `Sport`).
- Přidat podporu pro rozpoznání AKU tiketu tak, aby se vytvořil nadřazený AKU tiket + subtikety (podobně jako u OCR).

