# Live panel v extension – analýza a návrh řešení

## 1. Cíl a požadavky

### MVP 0.1

| Požadavek | Popis |
|-----------|--------|
| **Druhé tlačítko „Live“** | V extension vedle Importu přidat tlačítko „Live“. |
| **Viditelnost tlačítka** | Nastavitelné v nastavení extension: zobrazovat **všude** (na jakémkoliv webu) **nebo jen** na tipsport.cz / betano.cz. |
| **Kompaktní tabulka** | Po kliknutí na Live se zobrazí malá kompaktní tabulka, **připnutá trvale** (dokud ji uživatel nezminimalizuje). |
| **Obsah tabulky** | Zápasy z Tipsportu, které mají tag **„LIVE“**. Pro každý řádek např.: **Zápas:** Brighton – Arsenal, **Sázka:** Handicap v zápasu: Arsenal -1.0. Vše vyčíst z Tipsportu. |
| **Kontrola stavu** | Při opětovném kliknutí na Live (nebo refresh v panelu) extension zjistí, zda je tiket stále LIVE, nebo už je vyhodnocen. |
| **Vyhodnocené tikety** | Pokud je tiket vyhodnocen, aktualizuje se jeho stav; uživatel vidí „Výhra“/„Prohra“ a může řádek **ručně odstranit ikonou křížku**. Ostatní řádky zůstávají. |

### Verze 1 (rozšíření MVP)

| Požadavek | Popis |
|-----------|--------|
| **Live skóre** | Zobrazit live skóre zápasu (např. přímo z Tipsportu). Příklad: **LIVE: 2:1 – čas: 83:32**. |
| **Auto‑aktualizace** | Aktualizovat údaje **automaticky každé 3 minuty**. |
| **Okamžitá aktualizace** | Ikona/tlačítko pro **okamžitý refresh** (pokud automatika nefunguje, musí jít aktualizace tlačítkem). |
| **Čas refreshu** | Zobrazit čas poslední aktualizace malým písmem, např.: *Refreshed: 00:35:21*. |

**Příklad výstupu (Verze 1):**

```
Brighton - Arsenal
Sázka: Handicap v zápasu: Arsenal -1.0
LIVE: 2:1 - čas: 83:32
Refreshed: 00:35:21
```

---

## 2. Aktuální stav v extension

- **Detekce LIVE tiketů:** V `content.js` se u karty tiketu detekuje LIVE přes `.inDuKt` a text „Live“ → `is_live`.
- **Scraper:** `scrapeTipsportTicketsFromPage()` vrací pro každý tiket mj. `home_team`, `away_team`, `market_label_raw`, `selection_raw`, `odds`, `stake`, `tipsport_key`, `ticket_href`, `is_live`.
- **Content script** je nyní vstřikován jen na `*://*.tipsport.cz/*` a `*://*.betano.cz/*` (v `manifest.json`).
- **Storage:** Extension má `"storage"` v permissions – lze použít `chrome.storage.sync` nebo `chrome.storage.local` pro nastavení „zobrazit Live tlačítko všude vs jen Tipsport/Betano“.
- **Žádná options stránka** zatím v manifestu není – pro přepínač viditelnosti bude potřeba buď options page, nebo jednoduché UI (např. pravý klik na tlačítko / ikona ozubeného kolečka vedle tlačítek).

---

## 3. Analýza

### 3.1 Zdroj dat pro LIVE tikety

- **Jediný reálný zdroj:** Stránka **Tipsport – Moje tikety** (`/muj-ucet/moje-tikety`). Z ní scraper přečte karty a u každé určí `is_live` (element s třídou `.inDuKt` a textem „Live“).
- Z jedné karty lze vyčíst: zápas (domácí – hosté), typ sázky (market + výběr), kurz, vklad, `tipsport_key`, `ticket_href`.
- **Omezení:** Seznam LIVE tiketů je dostupný pouze když je uživatel na Tipsportu na Moje tikety. Na jiném webu (nebo na jiné stránce Tipsportu) nelze tento seznam bez API Tipsportu získat.

**Doporučení:**

- Pokud je uživatel **na Tipsportu – Moje tikety:** po kliknutí na Live scrapovat stránku a zobrazit pouze tikety s `is_live === true`.
- Pokud je uživatel **jinde:** panel lze zobrazit prázdný nebo s textem typu: „Pro načtení LIVE tiketů otevřete Tipsport – Moje tikety a klikněte na Live znovu.“ Případně panel může držet **naposledy načtený seznam** (v paměti / storage) a zobrazit ho i na jiných webech, s upozorněním „Data z [datum/čas]. Pro aktuální stav otevřete Tipsport – Moje tikety.“

### 3.2 Kde zobrazovat tlačítko Live

- **Všude:** Vyžaduje vstřikování content scriptu na `<all_urls>` (nebo konkrétní seznam), pokud má být tlačítko opravdu na „jakémkoliv webu“. Tlačítko pak vždy zobrazí panel; načtení LIVE dat bude možné jen po přechodu na Tipsport – Moje tikety a refresh.
- **Jen Tipsport/Betano:** Současné chování; tlačítko Live se zobrazí pouze na těchto doménách. Nastavení v options by přepínalo mezi „všude“ a „jen Tipsport/Betano“.

Pro **nastavení v prohlížeči** je potřeba:

- **Options page** (doporučeno): `chrome.runtime.openOptionsPage()` nebo odkaz v manifestu `"options_page": "options.html"`. Na options stránce jeden přepínač: „Zobrazit tlačítko Live na všech webech“ vs „Jen na Tipsport a Betano“.
- Uložení do `chrome.storage.sync` (nebo `local`), klíč např. `liveButtonVisibility: "everywhere" | "tipsport_betano_only"`.

### 3.3 Stav „vyhodnocen“ a aktualizace

- Při opětovném scrapu stejné stránky (Moje tikety) už u dříve LIVE tiketu může být: jiná ikona stavu (#i170/#i173/#i243), nebo „Skutečná výhra“ místo „Možná výhra“ → `status_raw` = won/lost/void.
- **Logika v panelu:** Pro každý zobrazený tiket máme `tipsport_key`. Při refreshi:
  - Tiket ve scrapu už není LIVE a má nový stav → zobrazit „Výhra“/„Prohra“, umožnit odstranění z listu (křížek).
  - Tiket ve scrapu je stále LIVE → nechat v listu, případně aktualizovat skóre (Verze 1).
  - Tiket už ve scrapu není (odstraněn ze stránky) → lze považovat za vyhodnocený nebo ho po určité době z listu odstranit / označit jako „není v seznamu“.

Synchronizace stavu do **BetTracker DB** už dnes při importu probíhá (`_sync_duplicate_from_tipsport`). Pro MVP 0.1 stačí v panelu zobrazit Výhra/Prohra a umožnit odstranění řádku; volitelně při refreshi poslat do backendu aktualizaci (stejný payload jako při importu), aby se stav v aplikaci srovnal.

### 3.4 Verze 1 – live skóre

- **Zdroj skóre – pouze URL daného zápasu:** Skóre (a čas zápasu) lze zjistit **jen** z konkrétní stránky live zápasu na Tipsportu (`/live/zapas/...`). Žádný jiný zdroj (seznam tiketů, API) skóre neposkytuje. Pro každý LIVE tiket tedy musíme mít odkaz na live stránku toho zápasu a tu načíst (fetch v pozadí nebo otevřít záložku) a z DOM/textu vyparsovat skóre a čas.
- **Párování:** Z karty tiketu na Moje tikety vyčíst odkaz na zápas (odkaz na výsledky/live zápas). Extension už dnes ukládá `ticket_href`; u LIVE tiketů je potřeba mít navíc **URL live zápasu** (např. odkaz „Live“ u zápasu → `tipsport.cz/live/zapas/...`). Pro automatický refresh každé 3 min: pro každý zobrazený LIVE tiket načíst jeho live URL (fetch v extension) a z HTML vyparsovat skóre.
- **Čas posledního refreshu:** Ukládat lokálně (např. `lastRefreshAt`) a zobrazovat v panelu malým písmem.

### 3.5 Jak systém získá URL a data (bez „rozkliknutí“)

- **Najít URL live zápasu:** Při scrapování karty tiketu na **Moje tikety** (kde už máme `is_live` a obsah karty) prohledáme uvnitř karty odkaz na live zápas: např. `card.querySelector('a[href*="/live/zapas/"]')` a z něj vezmeme `href`. Tipsport u LIVE tiketů typicky zobrazuje odkaz „Live“ nebo název zápasu vedoucí na `tipsport.cz/live/zapas/...`. Tím získáme **live_match_url** bez toho, aby uživatel cokoli rozklikal. Pokud by odkaz na live nebyl přímo na kartě, lze jako záloha načíst stránku detailu tiketu (`ticket_href`) a na ní najít odkaz na zápas (extension už na detailu používá `matchReferenceLink`); z toho odkazů vybereme ten obsahující `/live/zapas/`.
- **Z URL čerpat data (skóre, čas):** Stránku live zápasu **nepotřebujeme otevírat v prohlížeči**. Extension má oprávnění k `*://*.tipsport.cz/*`, takže z **background scriptu** nebo z content scriptu můžeme volat **`fetch(live_match_url)`**, získat HTML odpověď a z ní (nebo z textu) vyparsovat skóre a čas zápasu. Uživatel tedy nic „nerozklikává“ – systém sám na pozadí načte URL a z odpovědi vytáhne data. Jediný předpoklad je, že Tipsport vrací při fetchu z extension plný HTML (bez nutnosti být přihlášený, pokud je stránka veřejná).
- **Shrnutí:** URL zjistíme automaticky ze scrapu karty (odkaz s `/live/zapas/`); data získáme voláním `fetch` na tuto URL a parsováním HTML. Žádné ruční rozkliknutí ani otevření záložky není potřeba.

---

## 4. Návrh řešení

### 4.1 Architektura (MVP 0.1)

```
[Manifest]
  - content_scripts: buď stávající (tipsport/betano), nebo rozšířené o "<all_urls>" 
                     podle nastavení (lze měnit až po přeloadu extension, nebo inject 
                     script dynamicky z background při navigaci).
  - options_ui / options_page: nová stránka options.html pro nastavení viditelnosti.

[Background]
  - Poslouchat pouze stávající message typy; případně nový typ pro „get live list“ 
    pokud by se data brala z background (např. cache).

[Content script]
  - Při startu načíst z chrome.storage, zda zobrazit Live tlačítko (všude vs jen tipsport/betano).
  - Zobrazit nebo skrýt tlačítko Live podle hostname a nastavení.
  - createLiveButton() – styl konzistentní s Import, umístění vedle (např. vlevo od Import).
  - Při kliknutí: toggle Live panelu.
  - Live panel: fixed pozice (např. pod tlačítky, nebo v rohu), kompaktní tabulka.
  - Zdroj dat: pouze když location = Tipsport Moje tikety → scrapeTipsportTicketsFromPage(), 
    filtr is_live === true. Jinak zobrazit prázdný stav / naposledy uložený seznam.
  - U každého řádku: zápas (home – away), sázka (market + selection). 
    Uložit tipsport_key pro pozdější refresh a párování.
  - Tlačítko/ikona refresh v panelu (nebo druhý klik na Live): znovu scrape; pro každý 
    dříve zobrazený LIVE tiket zkontrolovat, zda je ještě live, nebo už má status 
    won/lost/void → aktualizovat řádek (Výhra/Prohra) a zobrazit ikonu „odstranit“ (křížek).
  - Odstranění řádku: jen z UI (seznam v paměti); neposílat do backendu mazání.
  - Minimalizace panelu: např. sbalit na jeden řádek „Live (N)“ nebo ikonu; klik znovu rozbalí.
```

**Zobrazování tlačítka „všude“:**  
Nejelegantnější je mít v manifestu dva content scripty (nebo jeden s `matches: ["<all_urls>"]` a v kódu podle hostname + storage rozhodnout, zda kreslit tlačítko). Alternativa: inject script z background pouze na povolené URL. Doporučení: jeden content script na `<all_urls>`, v scriptu na začátku číst `chrome.storage.sync.get("liveButtonVisibility")` a pokud je `"tipsport_betano_only"`, na jiných webech Live tlačítko vůbec nevytvářet.

### 4.2 Datový model (v paměti v content scriptu)

- **livePanelItems: Array<{ tipsport_key, home_team, away_team, market_label_raw, selection_raw, status_raw?, ticket_href?, live_match_url?, isStillLive, scoreText? (Verze 1) }>**
- **live_match_url:** URL stránky live zápasu na Tipsportu – **jediný zdroj** pro skóre a čas v Verzi 1. Z karty tiketu (odkaz na zápas / „Live“) musíme vyčíst a uložit.
- Při každém otevření panelu / refresh: pokud jsme na Tipsport Moje tikety, scrape → filtr `is_live` → sloučit s existujícími položkami (podle `tipsport_key`): aktualizovat stav, přidat nové LIVE, u vyhodnocených nastavit `isStillLive: false` a zobrazit Výhra/Prohra + křížek.

### 4.3 UI komponenty (MVP 0.1)

| Komponenta | Popis |
|------------|--------|
| Tlačítko Live | Vedle Import (nebo pod), stejný styl. Badge s počtem LIVE tiketů volitelný. |
| Panel (tabulka) | Fixed, kompaktní. Záhlaví: „Live tikety“, tlačítko minimalizovat, tlačítko refresh. |
| Řádek tiketu | Zápas (řádek 1), Sázka (řádek 2). Po vyhodnocení: status Výhra/Prohra + ikona křížku. |
| Prázdný stav | „Žádné LIVE tikety“ nebo „Otevřete Tipsport – Moje tikety a obnovte.“ |

### 4.4 Verze 1 – rozšíření

- **Skóre jen z URL daného zápasu:** Pro každý LIVE tiket musíme znát **URL jeho live zápasu** (např. `https://www.tipsport.cz/live/zapas/...`). Skóre ani čas nelze zjistit jinde – pouze na této stránce. Implementace: pro každý řádek s touto URL v pozadí provést fetch (nebo využít otevřenou záložku), z HTML stránky vyparsovat skóre a čas a zobrazit např. „2:1 – 83:32“. Scraper na live stránce už v extension existuje (`runLiveZapasScrape`); je potřeba z něj (nebo z raw HTML) vyextrahovat strukturované skóre a čas.
- **Refresh každé 3 minuty:** Při ticku pro každý zobrazený LIVE tiket načíst jeho live URL (fetch), vyparsovat skóre a čas a aktualizovat řádek v panelu.
- **Tlačítko „Okamžitá aktualizace“:** Stejná logika – pro každý LIVE tiket fetch jeho live URL a update skóre v UI.
- **Refreshed 00:35:21:** Uložit `lastRefreshAt` (Date), v panelu zobrazit malým písmem „Refreshed: “ + formátovaný čas.

---

## 5. Technické detaily

### 5.1 Manifest

- **Options:** Přidat `"options_ui": { "page": "options.html" }` nebo `"options_page": "options.html"`.
- **Content script pro „všude“:** Přidat druhý blok content_scripts s `"matches": ["<all_urls>"]`, `"js": ["content.js"]` (nebo sdílený script), a v kódu na začátku rozhodnout podle `chrome.storage` a hostname, zda kreslit pouze Live tlačítko (na cizích webech nekreslit Import). Jednodušší varianta: jeden content script s `matches: ["<all_urls>"]`, Import tlačítko kreslit jen na tipsport/betano, Live tlačítko kreslit podle nastavení (všude nebo jen tipsport/betano).

### 5.2 Storage (nastavení)

- Klíč: `liveButtonVisibility`. Hodnoty: `"everywhere"` | `"tipsport_betano_only"`. Default: `"tipsport_betano_only"`.
- Při změně v options uložit; content script může poslouchat `chrome.storage.onChanged` a překreslit/skrýt tlačítko bez reloadu stránky.

### 5.3 Scraper – znovupoužití

- `scrapeTipsportTicketsFromPage()` už vrací `is_live`, `home_team`, `away_team`, `market_label_raw`, `selection_raw`, `tipsport_key`, `ticket_href`. Pro panel stačí volat tuto funkci a filtrovat `ticket.is_live === true`. Při refreshi volat znovu a podle `tipsport_key` aktualizovat stavy v `livePanelItems`.

---

## 6. Rizika a omezení

- **Závislost na DOM Tipsportu:** Změna tříd nebo struktury (např. `.inDuKt`) může rozbít detekci LIVE i scrapování; je vhodné mít fallback (např. text „Live“ v kartě).
- **Žádné oficiální API:** Vše je založené na scrapingu; při blokování nebo změně layoutu může funkce přestat fungovat.
- **Skóre jen z URL zápasu (Verze 1):** Skóre lze zjistit pouze na stránce daného live zápasu. Pro každý tiket tedy musíme mít `live_match_url`, tu v pozadí načíst (fetch) a z HTML vyparsovat skóre a čas. Riziko: fetch může být pomalý nebo blokovaný; změna layoutu live stránky rozbije parser.

---

## 7. Fáze implementace

| Fáze | Obsah |
|------|--------|
| **1. Nastavení a tlačítko** | Options stránka (přepínač viditelnosti Live). Uložení do storage. Content script: čtení nastavení, zobrazení/skrytí tlačítka Live podle hostname a nastavení. |
| **2. Panel a seznam (MVP 0.1)** | Vytvoření panelu (fixed, kompaktní tabulka). Na Tipsport Moje tikety: po kliknutí scrape, filtr LIVE, vykreslení řádků (zápas + sázka). Minimalizace panelu. |
| **3. Refresh a vyhodnocení** | Refresh (druhý klik / tlačítko v panelu): znovu scrape, sloučení podle tipsport_key, aktualizace stavu (Výhra/Prohra), ikona křížku pro odstranění řádku z listu. |
| **4. Verze 1 – skóre a auto‑refresh** | Získání live skóre (Tipsport live stránka), zobrazení v řádku. Interval 3 minuty + tlačítko okamžité aktualizace. Zobrazení času „Refreshed“. |

---

## 8. Shrnutí

- **MVP 0.1** řeší: druhé tlačítko Live (viditelnost nastavitelná v options), trvale připnutý kompaktní panel s LIVE tikety z Tipsportu (zápas + sázka), kontrolu stavu při refreshi a zobrazení Výhra/Prohra s možností řádek odstranit.
- **Verze 1** přidá: live skóre v panelu, auto‑aktualizaci každé 3 minuty, tlačítko okamžité aktualizace a zobrazení času posledního refreshu.
- Zdroj dat zůstává scraping stránky Tipsport – Moje tikety; stav vyhodnocení se odvozuje z opakovaného scrapu a případně synchronizuje s BetTracker backendem při dalším importu.
