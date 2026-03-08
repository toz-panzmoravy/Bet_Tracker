# SofaScore FAV – sync zápasů z BetTrackeru do Favourites

Chrome extension, která na stránkách **SofaScore** načte zápasy z BetTrackeru (live a upcoming) a přidá je do **Favourites** na SofaScore. Slouží k tomu, abyste si mohli snadno otevřít a sledovat zápasy, na které máte vsazené tikety.

---

## Jak spustit a zprovoznit (krok za krokem)

1. **Spusťte BetTracker backend**  
   V kořeni projektu spusťte např. `BetTracker.bat` nebo jen `run-backend.bat`. Backend musí běžet na **http://127.0.0.1:15555** (nebo localhost:15555). Ověřte v prohlížeči: otevřete `http://127.0.0.1:15555/` – měla by se zobrazit odpověď typu `{"app":"BetTracker","status":"running"}`.

2. **Nainstalujte extension SofaScore FAV**  
   - Otevřete Chrome a zadejte do adresního řádku: `chrome://extensions/`  
   - Vpravo nahoře zapněte **Režim vývojáře** (Developer mode)  
   - Klikněte **Načíst rozbalené** (Load unpacked)  
   - Vyberte složku **SofaScore FAV** v tomto repozitáři (cesta např. `C:\...\BetTracker\SofaScore FAV`)

3. **Nastavte URL API (jednorázově)**  
   - Na stránce `chrome://extensions/` najděte „SofaScore FAV – sync z BetTrackeru“ a klikněte na **Podrobnosti** (Details)  
   - V sekci rozšíření klikněte na **Možnosti rozšíření** (Extension options)  
   - Do pole **URL BetTracker API** zadejte: `http://127.0.0.1:15555/api` (nebo `http://localhost:15555/api`) a stránku zavřete – hodnota se uloží

4. **Přihlaste se na SofaScore**  
   Otevřete **https://www.sofascore.com** a přihlaste se do svého účtu (extension nepoužívá heslo, jen vaši přihlášenou session).

5. **Spusťte sync**  
   Na libovolné stránce SofaScore se dole vpravo zobrazí panel **BetTracker → Favourites**. Klikněte na **Sync zápasů do Favourites**. Extension načte zápasy z BetTrackeru a postupně je na SofaScore vyhledá a přidá do Favourites (mezi zápasy je cca 2 s pauza). **Žádné umělé omezení** – zpracují se všechny zápasy; pokud některé nedoběhnou, jde o vyhledávání nebo nenačtení dropdownu. Při **opětovném kliknutí na Sync** extension u každého zápasu zkontroluje, zda už není v Oblíbených – pokud ano, přeskočí ho. V panelu se zobrazuje **počet přidaných, již v oblíbených, celkem a chybí**.

**Důležité:** Do SofaScore Favourites se přidají **stejné zápasy, které vidíte v overlay** – extension i overlay berou data ze stejného backendu (otevřené / live tikety). Stačí mít v BetTrackeru naimportované tikety a v overlay zobrazené zápasy; pak na SofaScore klikněte na Sync.

**Poznámka:** Pokud chcete syncovat konkrétní zápasy, nejdřív je naimportujte v hlavní extension (Tipsport/Betano/Fortuna) a případně klikněte na **OVERLAY**, aby se stav poslal do backendu. Pak na SofaScore spusťte Sync.

---

## Požadavky

- **BetTracker backend** musí běžet (např. `run-backend.bat` nebo `BetTracker.bat`), port 15555.
- V prohlížeči musíte být **přihlášeni na SofaScore** (extension nepoužívá heslo, jen vaši session).

## Instalace

1. Otevřete Chrome a přejděte na `chrome://extensions/`.
2. Zapněte **Režim vývojáře** (Developer mode).
3. Klikněte **Načíst rozbalené** (Load unpacked).
4. Vyberte složku **SofaScore FAV** (tato složka v repozitáři BetTracker).

## Nastavení

- Klikněte pravým tlačítkem na ikonu extension → **Možnosti** (Options).
- Zadejte **URL BetTracker API**: výchozí je `http://127.0.0.1:15555/api`. Při problémech zkuste `http://localhost:15555/api`.

## Použití

1. Otevřete **SofaScore** (www.sofascore.com) a přihlaste se.
2. Na stránce se dole vpravo zobrazí panel **BetTracker → Favourites** s tlačítkem **Sync zápasů do Favourites**.
3. Klikněte na tlačítko. Extension načte zápasy z BetTracker API a postupně pro každý zápas:
   - otevře vyhledávání na SofaScore,
   - přejde na stránku zápasu,
   - klikne na přidání do Favourites (hvězda / Add to favourites).
4. Mezi zápasy je cca 2 s pauza (rate limiting).

## Kde extension bere zápasy

Backend endpoint `GET /api/sofascore-sync/events` vrací unikátní zápasy z tiketů, které jsou:

- otevřené (`status = open`) nebo označené jako live (`is_live = true`),
- a nejsou dávno dohrané (`event_date` chybí nebo je v „aktivním“ okně – zápas ještě nezačal nebo skončil před méně než 120 minutami).

## Problémy

- **„Failed to fetch“ / „Backend nedostupný“**
  1. Spusťte backend: v kořeni projektu `run-backend.bat` nebo `BetTracker.bat` (port 15555).
  2. V nastavení extension (Podrobnosti → Možnosti rozšíření) zadejte přesně: `http://127.0.0.1:15555/api` (nebo `http://localhost:15555/api`). Žádné lomítko na konci.
  3. Ověřte v prohlížeči: otevřete nový tab a zadejte `http://127.0.0.1:15555/api/sofascore-sync/events` – mělo by se zobrazit JSON (pole zápasů nebo `[]`). Pokud stránka neotevře, backend neběží nebo blokuje firewall.
  4. Po změně nastavení znovu načtěte extension: `chrome://extensions/` → u SofaScore FAV klikněte na ikonu obnovit.
- **Zápas se nepřidal** – SofaScore mohla změnit strukturu stránky (tlačítko Favourites / vyhledávání). V takovém případě je potřeba upravit selektory v `content.js`.
- **Různé názvy týmů** – Pokud BetTracker a SofaScore používají jiné názvy, vyhledávání nemusí zápas najít; takový zápas extension přeskočí.

## Související

- Návrh a kontext systému: [docs/SOFASCORE_FAVOURITES_SYNC_NAVRH.md](../docs/SOFASCORE_FAVOURITES_SYNC_NAVRH.md) v repozitáři BetTracker.
