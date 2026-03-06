# Future events panel v extension – analýza a návrh řešení

## 1. Cíl a požadavky

### MVP 0.1 (zadání)

| Požadavek | Popis |
|---|---|
| **Nové tlačítko (malé, jen ikonka)** | Vpravo od tlačítka **LIVE** přidat malé tlačítko jen s ikonou (ikonu dodá user). |
| **Viditelnost tlačítka** | Nastavitelné v nastavení extension: zobrazovat **všude** (na jakémkoliv webu) vs jen na **tipsport.cz / betano.cz**. |
| **Účel** | Zobrazit přehled **budoucích** (upcoming) nevyhodnocených událostí, abych viděl, kdy začínají a mohl začít sledovat včas. |
| **Časové okno** | Zobrazovat jen události od **teď** do cca **+6 hodin**. Nezobrazovat historické/vyhodnocené. Nezobrazovat události za 12/24h. |
| **Panel** | Po kliknutí na tlačítko se zobrazí kompaktní panel/tabulka, připnutá trvale (dokud ji nezminimalizuji). |

---

## 2. Klíčové rozhodnutí: odkud brát “start zápasu”

### Varianta A (doporučeno pro MVP): Tipsport “Moje tikety” – čas u položky tiketu

Na Tipsportu v seznamu tiketů (Moje tikety) jsou u každé položky často zobrazené informace typu:
- datum (např. “Dnes”, “Zítra”, “27. 2.”, “Včera”)
- čas (např. “19:00”)
- zápas (Domácí – Hosté)

To je pro MVP ideální, protože:
- už teď extension tuto stránku umí scrapovat
- máme “nevyhodnocené” stavy (open/unresolved)
- stačí přidat parsing **start času události** a filtrovat \(0–6h\)

**Riziko:** DOM Tipsportu se může změnit (classnames), je potřeba parsovat robustněji (ideálně přes `data-atid` nebo textové kotvy).

### Varianta B: BetTracker DB (naše aplikace)

Teoreticky lze brát event_date z DB a filtrovat \(0–6h\), ale:
- extension musí mít API endpoint pro “upcoming”, autentizaci apod.
- a stejně je třeba to “event_date” dostat do DB (importem)

To je vhodné až jako rozšíření, ne jako MVP.

**Závěr:** MVP stavět na Tipsport scrapu (Varianta A).

---

## 3. Definice “future event” a filtrování

### 3.1 Co je “nevyhodnocené”

V rámci Tipsport scrapu používat tyto stavy:
- **`status_raw === "unresolved"`**: nevyhodnoceno (ikonka `#i172` nebo “Možná výhra”)
- **`status_raw === "open"`**: čeká / otevřené

Co nezobrazovat:
- `won`, `lost`, `void`

### 3.2 Časové okno

- `now = Date.now()`
- `start_at` (čas události) musí splnit: `now <= start_at <= now + 6h`

**Poznámka:** “cca 6h” → doporučuji konfigurovat konstantou `UPCOMING_WINDOW_HOURS = 6` (pro budoucí změny).

### 3.3 Časová zóna

Tipsport i uživatel jsou typicky v CZ lokaci → počítat v lokálním čase prohlížeče.

---

## 4. Návrh UX/UI (MVP 0.1)

### Tlačítko (ikonka)

- Umístění: vpravo od tlačítka **LIVE**
- Styl: stejný “pill” styl jako ostatní tlačítka, ale menší, pouze ikonka
- Volitelně badge s počtem upcoming událostí (v okně \(0–6h\))

### Panel “Upcoming”

Kompaktní fixed panel, trvale připnutý, s možností:
- minimalizovat (collapse)
- refresh (znovu scrape a přepočítat okno)
- zavřít (skrýt)

### Řádek události

Zobrazit minimálně:
- **Čas startu** (např. “19:00” nebo “Dnes 19:00”)
- **Zápas** (Domácí – Hosté)
- **Sázka** (Market + Selection), ideálně menším písmem pod zápasem

Volitelné (užitečné):
- Klik na řádek otevře odkaz na zápas (nebo tiket detail) v nové záložce

---

## 5. Technický návrh (MVP 0.1)

### 5.1 Nastavení viditelnosti tlačítka

Stejný pattern jako u Live:
- `chrome.storage.sync` klíč např. `upcomingButtonVisibility: "everywhere" | "tipsport_betano_only"`
- Options page přidá přepínač

### 5.2 Získání dat (scrape)

Zdroj:
- Primárně: Tipsport “Moje tikety” (tam jsou “open/unresolved” tikety + časy)

Postup:
1. `scrapeTipsportTicketsFromPage()` rozšířit tak, aby vracel `event_start_at` (Date ISO nebo timestamp) **pro každý tiket**.
2. Upcoming panel klik/refresh:
   - pokud jsme na správné stránce (Tipsport Moje tikety): scrape → filtrovat `status_raw in ("open","unresolved")` → filtrovat čas oknem \(0–6h\)
   - pokud nejsme na správné stránce: zobrazit cached data (poslední známý seznam) a hlášku “Otevřete Tipsport – Moje tikety a klikněte na refresh”

### 5.3 Jak najít čas startu v DOM

Pravděpodobný zdroj je hlavička karty (u tiketů se zobrazuje datum + čas + liga).

Implementační přístup:
- najít v kartě elementy obsahující:
  - datum token (Dnes/Zítra/Včera/`dd. m.`)
  - čas token (`HH:MM`)
- použít existující helper `parsePlacedAt(dateText, timeText)` jako základ, ale vytvořit nový helper:
  - `parseEventStartAt(dateText, timeText)` – stejné mapování slov “Dnes/Zítra/Včera”, explicitní datum `dd. m.`

**Pozor:** `placed_at` (čas podání) není vždy start zápasu. V UI karty ale často je “čas zápasu” – je nutné ověřit, že parsujeme správný blok. MVP: vyjít z toho, co Tipsport v seznamu u daného zápasu zobrazuje jako čas.

### 5.4 Perzistence a “připnutí”

- Stav panelu (otevřený/minimalizovaný/pozice) uložit do `chrome.storage.local`:
  - `upcomingPanelOpen: boolean`
  - `upcomingPanelCollapsed: boolean`
  - `upcomingPanelLastItems: [...]`
  - `upcomingPanelLastRefreshAt: number`

---

## 6. Rizika a omezení

- **Nejistota, zda “čas na kartě” = start zápasu:** Může to být čas podání tiketu. Nutné ověřit na Tipsport “Moje tikety”, že u open/unresolved tiketů je zobrazen čas zápasu. Pokud ne, bude potřeba fallback: otevřít detail tiketu (`ticket_href`) a tam najít čas zápasu.
- **DOM se mění:** classnames jsou generované; preferovat selektory přes `data-atid` pokud existují.
- **Viditelnost všude:** Pokud tlačítko má být na všech webech, content script musí běžet na `<all_urls>` a UI se musí řídit storage nastavením.

---

## 7. Fáze implementace (doporučení)

| Fáze | Obsah |
|---|---|
| 1 | Přidat tlačítko Upcoming (ikonka) + options přepínač viditelnosti |
| 2 | Přidat panel UI (sticky), minimalizace, refresh |
| 3 | Doplnit scraping `event_start_at` a filtrování \(0–6h\) |
| 4 | Persistovat stav panelu + cached items pro zobrazení i mimo Tipsport |

---

## 8. Otevřené otázky (na ověření při implementaci)

1. Kde přesně v DOM Tipsport “Moje tikety” je “čas zápasu” pro open/unresolved tikety?
2. Má karta vždy jednoznačný odkaz na zápas (pro otevření klikem)?
3. Má být okno vždy přesně 6h, nebo zaokrouhlovat (např. do konce dne)?

---

## 9. Fáze 2: Čas výkopu z detailu tiketu

**Cíl:** V panelu Upcoming používat skutečný čas výkopu z detailu tiketu místo času z karty (čas sázky). Vyhodnocené tikety se nenačítají – berou se jen open/unresolved ze seznamu a jen u nich se fetchuje detail.

**Zdroj:** Každý nevyhodnocený tiket má `ticket_href` (např. `/tiket?idu=...`). Z content scriptu na tipsport.cz lze volat `fetch(plná URL)` (same-origin) a parsovat HTML. Na detailu jsou u každého zápasu bloky `[data-atid="ticketDetailBet"]`, uvnitř kontejner `div.sc-38d1266e-1` se dvěma `div.whiteSpace-noWrap` (datum a čas výkopu). U AKU je více bloků; pro jeden tiket se bere nejdřívější čas výkopu.

**Implementace:** Funkce `parseKickoffFromDetailHtml(html)` parsuje HTML a vrací nejdřívější ISO čas; `fetchTicketDetailKickoffTime(href)` načte detail a zavolá parser. Při kliku na Refresh v panelu se volá `getUpcomingItemsAsync()`: scrape seznamu → filtr open/unresolved → pro každý tiket s `ticket_href` (max 15) načtení detailu (max 3 souběžné requesty) → doplnění `event_start_at` → filtr 0–6 h a seřazení. Během načítání se zobrazí text „Načítám časy výkopů…“. Při chybě fetchu zůstane čas z karty. Fallback: pokud `data-atid="ticketDetailBet"` na detailu neexistuje, hledají se všechny `div.sc-38d1266e-1` a z každého první dva `whiteSpace-noWrap` (datum, čas).

