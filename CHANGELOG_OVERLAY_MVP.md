# Changelog – Overlay MVP 0.1

## Overlay MVP 0.1

Přidána desktopová aplikace **BetTracker Overlay** (Windows) – MVP verze.

### Nové

- **Overlay aplikace** (`overlay/`) – Tauri 2 + Vite, zobrazuje vsazené zápasy (ještě nezačaly) a live tikety z Tipsport, Betano a Fortuna.
- **Synchronizace LIVE** – v extension tlačítko LIVE na stránkách Tipsport, Betano, Fortuna posílá otevřené/live tikety do backendu; overlay je zobrazuje v reálném čase.
- **Čas výkopu** – Tipsport: načtení z detailu tiketu; Betano: z karty a sidebaru; Fortuna: automatické rozkliknutí tiketu a načtení data z popupu.
- **Sekce v overlay** – „Vsazené – zápas nezačal“, „Právě hraje (live)“, „Ostatní aktivní“ (tikety bez data nebo s datem v minulosti).
- **Batch skripty** – `Restart-a-spust-vse.bat` (restart backendu, frontendu, overlay pro test), `Instalator-BetTracker-Overlay.bat` (spuštění instalátoru).

### Úpravy backendu

- `event_start_at` u Tipsport, Betano a Fortuna – použití pro `event_date` při importu (zápasy které ještě nezačaly).
- Oprava mapování statusu u Betana a Fortuny – otevřené tikety se neukládají jako „lost“ kvůli `payout = 0`.
- LIVE endpoint vrací 200 i při „tiket nenalezen“ (místo 404).

### Úpravy extension

- LIVE filtr rozšířen o stavy: waiting, čeká, nevyhodnoceno, pending (Betano, Fortuna).
- Fortuna: obohacení o datum výkopu – programové rozkliknutí tiketu v přehledu, načtení data z popupu (`.betslip-leg-date`), zavření Escape.

---

Tag: **overlay-mvp-0.1**
