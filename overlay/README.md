# BetTracker Overlay

Malá desktopová aplikace (Windows) zobrazující vsazené zápasy a live tikety z BetTrackeru v jednom okně. Okno lze připnout „vždy navrch“, aby při práci v prohlížeči zůstalo viditelné.

## Odkud se berou data (Tipsport, Betano, Fortuna)

Overlay **nečte stránky sázkařů přímo**. Data mu dodává **BetTracker backend**:

1. **Prohlížečová extension** (v projektu `tipsport-scraper-extension`) na stránkách **Tipsport, Betano a Fortuna** zobrazuje dvě tlačítka:
   - **Import** — celý import tiketů do evidence (vyhodnocené i nevyhodnocené); slouží k záznamu do BetTrackeru.
   - **LIVE** — synchronizace jen **otevřených a live tiketů** na backend. Slouží právě pro overlay a stránku LIVE: data se hned zobrazí v overlay a na webu na `/live`.
2. **Backend** tikety ukládá a vystavuje přes **REST API** (`GET /api/tickets?active_or_live=1`).
3. **Overlay** v nastaveném intervalu volá toto API a zobrazuje „Brzy začíná“ a „Teď live“ včetně zdroje (Tipsport / Betano / Fortuna).

**Aby overlay něco ukazoval:** spusťte backend (např. `BetTracker.bat`), v prohlížeči otevřete přehled tiketů na Tipsport / Betano / Fortuna a klikněte na **LIVE**. Aktivní a live tikety se synchronizují do backendu a overlay je zobrazí. (Tlačítko Import použijte, až budete chtít do evidence naimportovat celou historii.)

## Požadavky

- **BetTracker backend** musí být spuštěný (výchozí adresa `http://127.0.0.1:8000`). Bez běžícího backendu overlay nemá data a zobrazí chybu.
- Pro **sestavení .exe** potřebujete:
  - [Node.js](https://nodejs.org/) (LTS)
  - [Rust](https://www.rust-lang.org/tools/install) (`rustup`)
  - [Tauri CLI](https://v2.tauri.app/start/prerequisites/): `cargo install tauri-cli` nebo `npm install -g @tauri-apps/cli`

## Sestavení .exe

1. Nainstalujte závislosti frontendu:
   ```bash
   cd overlay
   npm install
   ```

2. Sestavte frontend:
   ```bash
   npm run build
   ```

3. Sestavte Tauri aplikaci (vyžaduje Rust a Tauri CLI):
   ```bash
   npx tauri build
   ```
   **Pokud terminál hlásí „cargo: program not found“:** Rust je nainstalovaný, ale není v PATH. Buď otevřete nový terminál (po instalaci Rustu), nebo v adresáři `overlay` spusťte:
   ```powershell
   .\build.ps1
   ```
   Skript `build.ps1` před buildem přidá `%USERPROFILE%\.cargo\bin` do PATH.

4. Výstupní soubory:
   - **Spustitelný .exe:** `overlay/src-tauri/target/release/bettracker-overlay.exe`
   - **Instalátor (NSIS):** `overlay/src-tauri/target/release/bundle/nsis/BetTracker Overlay_0.1.0_x64-setup.exe`
   - **Instalátor (MSI):** `overlay/src-tauri/target/release/bundle/msi/BetTracker Overlay_0.1.0_x64_en-US.msi`

## Po instalaci MSI – kde aplikaci najít a spustit

**Instalátor MSI po dokončení aplikaci nespustí** – to je běžné. Aplikaci je potřeba spustit ručně:

1. **Z nabídky Start:** Klikněte na Start (nebo Windows) a napište **BetTracker Overlay**, pak zvolte „BetTracker Overlay“.
2. **Z průzkumníka:** Aplikace je nainstalovaná v jedné z těchto složek (podle toho, zda jste instalovali „pro mě“ nebo „pro všechny“):
   - `C:\Users\<vaše_jméno>\AppData\Local\Programs\BetTracker Overlay\BetTracker Overlay.exe`
   - nebo `C:\Program Files\BetTracker Overlay\BetTracker Overlay.exe`

Pokud po dvojkliku na .exe **nic neběží** (žádné okno, žádná chyba), pravděpodobně chybí **WebView2 Runtime**. Stáhněte a nainstalujte ho od Microsoftu: [WebView2 Runtime (Evergreen Standalone Installer)](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section). Po instalaci WebView2 aplikaci zkuste spustit znovu.

**Rychlý test bez instalace:** Zkopírujte soubor `overlay\src-tauri\target\release\bettracker-overlay.exe` kamkoliv a spusťte ho dvojklikem. Pokud funguje, overlay se zobrazí; pokud ne, nainstalujte WebView2.

**Proces běží, ale okno je prázdné / nic se nevykreslí:** Aplikace teď startuje se skrytým oknem a zobrazí ho až po načtení stránky (aby WebView2 stihl vykreslit obsah). **Přestavte a nainstalujte znovu:** v adresáři `overlay` spusťte `.\build.ps1` (nebo `npx tauri build`), pak znovu nainstalujte z nového MSI/NSIS. Pokud to nepomůže, nainstalujte nebo opravte **WebView2 Runtime**: [WebView2 (Evergreen Standalone)](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section). Po instalaci restartujte počítač a spusťte overlay znovu.

**Prázdné okno (staré buildy):** Dříve mohl být problém s načítáním assetů – ve Vite je nastaveno `base: "./"`. Vždy používejte nejnovější build (viz výše).

## Spuštění (vývoj)

- **Pouze frontend** (bez Tauri, v prohlížeči): `npm run dev` a otevřete `http://localhost:5173`. API volání půjdou na výchozí backend.
- **Celá aplikace (Tauri okno):** `npx tauri dev` – spustí se Vite a Tauri okno s overlayem.

## Použití

1. Spusťte BetTracker backend (např. `uv run uvicorn app.main:app --reload` v adresáři `backend`).
2. Spusťte overlay (.exe nebo `npx tauri dev`).
3. V nastavení (ikona ozubeného kolečka) můžete změnit:
   - **URL API** – výchozí `http://127.0.0.1:8000/api`
   - **Interval obnovení** (sekundy) – výchozí 60
   - **Okno „brzy začíná“** (hodiny) – výchozí 6
4. Zaškrtněte **„Vždy navrch“**, aby okno nepřekrýval prohlížeč.
5. Pozici a velikost okna lze měnit tažením; stav se ukládá a obnoví při příštím spuštění (díky pluginu window-state).

## Co overlay zobrazuje

- **Brzy začíná** – tikety s `event_date` v nastaveném časovém okně (výchozí 6 h), řazené podle data.
- **Teď live** – tikety s `is_live === true`; u každého lze zobrazit naposledy uložený stav z extension (`last_live_snapshot`).

Klik na řádek otevře stránku s tikety v BetTrackeru (výchozí `http://127.0.0.1:3000/tikety` – předpoklad, že frontend běží na portu 3000).

## Ikony

Pro vlastní ikonu aplikace použijte:

```bash
npx tauri icon path/to/obrazek.png
```

Vygenerují se potřebné rozměry do `src-tauri/icons/`.
