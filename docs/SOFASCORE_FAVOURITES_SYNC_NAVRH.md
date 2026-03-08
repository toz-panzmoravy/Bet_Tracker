# SofaScore – automatické přidávání zápasů do Favourites (návrh systému)

## Cíl

Systém navázaný na BetTracker, který:

1. Bere ze stávajícího systému **zápasy**, u kterých:
   - zápas **právě běží** (live), nebo
   - zápas **ještě nezačal** (upcoming).
2. **Přihlásí se na SofaScore** (do tvého účtu).
3. **Na SofaScore tyto zápasy najde** (podle názvů týmů, data, příp. ligy/sportu).
4. **Přidá je do Favourites** na SofaScore, aby sis je mohl otevřít a sledovat.

---

## Co máme k dispozici (BetTracker)

Z modelu `Ticket` a API máme pro každý tiket / zápas:

| Údaj        | Popis                          | Použití pro SofaScore     |
|------------|---------------------------------|----------------------------|
| `home_team` | Název domácího týmu            | Hledání zápasu             |
| `away_team` | Název hostujícího týmu        | Hledání zápasu             |
| `event_date`| Začátek zápasu (datum + čas)  | Omezit jen live/upcoming   |
| `sport`     | Sport (Fotbal, Hokej, …)      | Filtrování, správná sekce  |
| `league`    | Liga (název)                   | Lepší matching zápasu      |
| `is_live`   | Zda je tiket označen jako live| Prioritizace               |

Z toho lze sestavit seznam **unikátních zápasů** (např. dle `home_team` + `away_team` + datum dne) a ty předat do modulu „SofaScore sync“.

---

## Jak to technicky udělat

### 1) Kde systém poběží

Možnosti:

- **A) Rozšíření prohlížeče (Chrome extension)**  
  - Běží na **sofascore.com**.  
  - Uživatel se na SofaScore přihlásí sám v prohlížeči; extension používá **stávající session (cookies)**.  
  - Extension:  
    1. Zavolá naše API (BetTracker backend) → seznam zápasů (live + upcoming).  
    2. Na stránce SofaScore hledá zápas (vyhledávání / výsledky) a klikne „Add to favourites“.  
  - **Výhody:** Žádné ukládání hesel, vše v prohlížeči, kde je uživatel přihlášen.  
  - **Nevýhody:** Uživatel musí mít otevřený SofaScore (nebo ho extension otevře); nutné rozumět HTML/JS SofaScore a jejich změnám.

- **B) Backend + automatizace prohlížeče (Puppeteer/Playwright)**  
  - Na serveru (nebo na tvém PC) běží skript, který ovládá **headless browser**.  
  - Ten přejde na SofaScore, přihlásí se (údaje z konfigurace/env), vyhledá zápasy a přidá je do favourites.  
  - **Výhody:** Může běžet na pozadí (cron), bez otevřené záložky.  
  - **Nevýhody:** Ukládání přihlašovacích údajů, složitější provoz, SofaScore může blokovat headless prohlížeče (detekce botů).

- **C) Samostatná malá desktopová aplikace (např. Tauri/Electron)**  
  - Aplikace zobrazí seznam zápasů z BetTracker API a tlačítko typu „Sync do SofaScore“.  
  - Při kliknutí otevře **embedovaný prohlížeč** (nebo systémový) na SofaScore; uživatel se přihlásí ručně jednou, aplikace si může pamatovat session (pokud to SofaScore a technická stránka umožní).  
  - **Výhody:** Oddělené od hlavní extension, přehledné UI.  
  - **Nevýhody:** Nutnost udržovat další aplikaci a případně řešit session/cookies.

**Doporučení pro start:** varianta **A (extension na sofascore.com)** – žádné heslo v kódu, uživatel je na SofaScore přihlášen v prohlížeči, extension jen „doplní“ akci „přidat do favourites“ na základě dat z BetTrackeru.

---

## Kroky, které systém musí zvládnout

1. **Získat seznam zápasů**  
   - Z BetTracker API endpointu (např. aktivní tikety s `event_date` v budoucnosti nebo v „live“ okně).  
   - Agregace na úroveň zápasu: jeden záznam = jeden zápas (home, away, datum, sport, příp. liga).

2. **Přihlášení na SofaScore**  
   - **Extension:** Přihlášení řeší uživatel sám; extension jen kontroluje, že na stránce je přihlášený uživatel (např. existence „Favourites“ / profilu v UI).  
   - **Backend/Playwright:** Nutnost mít uložené přihlašovací údaje a simulovat přihlášení; riziko captcha / 2FA / blokace.

3. **Najít zápas na SofaScore**  
   - SofaScore má **vyhledávání** (search).  
   - Vstup: název týmu nebo „home vs away“, příp. datum.  
   - Výstup: odkaz na stránku zápasu (URL) nebo přímo ID zápasu, pokud je v API.  
   - **Problém:** Různé zápisy názvů – „Real Madrid“ vs „Real Madrid CF“, „Colorado“ vs „Colorado Avalanche“. Možné řešení: normalizace názvů, fuzzy matching, nebo vyhledat oba týmy a vybrat zápas se shodným datem.

4. **Přidat zápas do Favourites**  
   - Na stránce zápasu je tlačítko/ikona „Add to favourites“ (nebo „Star“).  
   - Extension: najde tento element a programově na něj klikne (nebo zavolá stejný request jako web při kliknutí, pokud je to API volání).  
   - Pokud SofaScore používá pouze vlastní API (ne klasické formuláře), bude potřeba zjistit z DevTools síťové požadavky a napodobit je (v extension s cookies z domény).

5. **Opakování / aktualizace**  
   - Nové tikety v BetTrackeru → nové zápasy → znovu sync (např. po každém importu nebo tlačítkem „Sync do SofaScore“ v extension).

---

## Hlavní problémy a rizika

| Problém | Popis | Možné řešení |
|--------|--------|----------------|
| **Přihlášení** | Automatické přihlášení může být blokované (captcha, 2FA). | Extension: uživatel přihlášen ručně; backend varianta je křehčí. |
| **Match matching** | Různé názvy týmů (BetTracker vs SofaScore). | Normalizace názvů, vyhledávání obou týmů, filtrování podle data; příp. slovník aliasů. |
| **SofaScore API / HTML** | Změny layoutu nebo API na straně SofaScore. | Scraping/klikací logika může přestat fungovat; nutná údržba. |
| **Ochrana proti botům** | SofaScore může omezit četné požadavky nebo neobvyklé chování. | Omezení frekvence (např. max X zápasů za minutu), jednat jako „jeden uživatel“. |
| **Právní / ToS** | Automatizace může být v rozporu s podmínkami užití SofaScore. | Pouze pro osobní použití; ne šířit jako veřejný produkt bez právní revize. |
| **Duplicity** | Tentýž zápas více tiketů → jeden zápas přidat jen jednou. | Agregace na úrovni (home, away, datum) před syncem. |

---

## Návrh integrace do stávajícího systému

- **BetTracker backend**  
  - Nový endpoint, např. `GET /api/tickets/events-for-sofascore` (nebo `/api/sofascore-sync/events`), který vrací seznam zápasů:
    - pouze tikety se stavem „open“ (nebo i live),
    - `event_date` v budoucnosti NEBO v „live“ okně (např. posledních 120 minut),
    - výstup: unikátní události (např. `home_team`, `away_team`, `event_date`, `sport`, `league`).

- **Extension (nový modul nebo součást tipsport-scraper-extension)**  
  - Působí **jen na sofascore.com** (manifest `content_scripts` pro `*://*.sofascore.com/*`).  
  - UI: tlačítko „Sync zápasů do Favourites“ (v popupu nebo na stránce).  
  - Po kliknutí:  
    1. Zavolá BetTracker API → seznam zápasů.  
    2. Pro každý zápas (nebo dávkami): na SofaScore vyhledá (search), otevře stránku zápasu, přidá do favourites (klik nebo API).  
  - Případně: zobrazí seznam a uživatel zaškrtne, které zápasy syncovat.

- **Přihlášení**  
  - Neřešíme v kódu – uživatel je na SofaScore přihlášen v prohlížeči. Extension pouze využívá stávající session.

---

## Shrnutí – co by bylo potřeba udělat

1. **Backend:** Endpoint vrací seznam „events“ (live + upcoming) z otevřených tiketů, agregovaných na úroveň zápasu.  
2. **SofaScore stránka:** Zjistit (ručně v prohlížeči):  
   - jak vypadá vyhledávání (URL, parametry),  
   - jak vypadá tlačítko „Add to favourites“ a zda jde volat stejný request jako při kliknutí.  
3. **Extension pro sofascore.com:**  
   - content script jen na SofaScore,  
   - volání našeho API,  
   - pro každý zápas: vyhledat → otevřít zápas → přidat do favourites (podle zjištěného chování webu).  
4. **Ošetření chyb:** Když zápas na SofaScore nenajdeme (název, liga), logovat / zobrazit uživateli a nepřerušovat zbytek.  
5. **Rate limiting:** Neposílat desítky požadavků za sekundu, aby SofaScore neblokoval.

Tím budeš mít systém, který zápasy z BetTrackeru (hraje se / nezačal) přenese do SofaScore Favourites a bude navázaný na celý tvůj stávající systém bez ukládání hesla do SofaScore v aplikaci.

---

## Implementace

Implementace tohoto systému je ve složce **SofaScore FAV** v kořeni repozitáře:

- **Backend:** endpoint `GET /api/sofascore-sync/events` v `backend/app/routers/sofascore_sync.py`
- **Extension:** Chrome extension ve složce `SofaScore FAV/` (manifest.json, content.js, options) – běží jen na sofascore.com, načítá zápasy z API a přidává je do Favourites přes vyhledávání a klik na stránce zápasu.
- Návod k instalaci a použití: [SofaScore FAV/README.md](../SofaScore%20FAV/README.md).
