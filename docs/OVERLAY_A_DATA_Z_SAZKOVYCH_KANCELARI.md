# Jak systém čte a aktualizuje informace o zápasech a zobrazuje je v overlay

## Přehled toku dat

```
[Sázková kancelář]  →  [Extension]  →  [Backend API]  →  [Overlay]
   (Tipsport/Betano/Fortuna)   scrapuje + posílá    ukládá do DB    periodicky čte
```

Overlay **nečte přímo** ze stránek sázkových kanceláří. Čte jen z **našeho backendu**. Data do backendu se dostanou **pouze přes extension**, když na stránce SK uživatel něco udělá (Import nebo LIVE).

---

## 1. Kde se data berou (zdroj)

- **Tipsport** – stránka „Moje tikety“ (tipsport.cz/moje-tikety)
- **Betano** – stránka s přehledem sázek / Moje sázky
- **Fortuna** – historie sázek / přehled tiketů

Data z těchto stránek může načíst **jen extension** (content script), protože běží v prohlížeči na dané doméně. Uživatel musí mít otevřenou příslušnou stránku a v extension kliknout na **Import** nebo **LIVE**.

---

## 2. Jak extension data získá a pošle do backendu

### 2.1 Tlačítko **Import**

- Extension **scrapuje** z aktuální stránky seznam tiketů (DOM, text, atributy).
- Pro každý tiket získá: týmy, typ sázky, výběr, kurz, vklad, datum zápasu, stav (otevřený/vyhodnocený), u Tipsportu/Fortuny i „live“ příznak.
- Data pošle na backend:
  - **Tipsport:** `POST /api/import/tipsport/scrape`
  - **Betano:** `POST /api/import/betano/scrape`
  - **Fortuna:** `POST /api/import/fortuna/scrape`
- Backend tiket buď **vytvoří**, nebo **aktualizuje** (podle unikátního klíče: např. tipsport_key, betano_key, fortuna_key).
- Uloží se: `home_team`, `away_team`, `event_date`, `is_live`, `status`, `odds`, `stake`, `market_label`, `selection`, `bookmaker_id`, atd.

### 2.2 Tlačítko **LIVE**

- Stejný princip jako Import, ale:
  - Berou se **jen otevřené / nevyhodnocené / live** tikety (bez vyhraných/prohraných).
  - Cíl: mít v systému aktuální stav „aktivních“ tiketů pro overlay a stránku /live.
- Extension znovu scrapuje stránku a posílá data na **stejné import endpointy** (bez preview).
- Po synchronizaci může (hlavně u Tipsportu):
  - **Propojit tiket s live zápasem:** při zobrazení detailu tiketu extension pošle `POST /api/live/link` (tipsport_key + URL live zápasu). Backend uloží `live_match_url` a `tipsport_match_id`.
  - **Posílat stav zápasu (skóre):** když uživatel má otevřenou stránku s live zápasem, extension může posílat scraped text (skóre, stav) na `POST /api/live/state`. Backend vyhodnotí stav (AI), uloží snapshot a může poslat webhook.

Důležité: **bez kliknutí na Import nebo LIVE** se data ze sázkovky do backendu nedostanou. Backend sám od sebe stránky SK neprohlíží.

---

## 3. Co dělá backend

- **Ukládá tikety** do databáze (tabulka `tickets`): týmy, `event_date`, `is_live`, status, kurz, vklad, bookmaker, atd.
- **Vystavuje REST API:**
  - `GET /api/tickets?active_or_live=1&limit=200` – vrátí tikety, které jsou **otevřené** (`status=open`) **nebo** mají `is_live=true`. Toto volá overlay.
- Pro Tipsport live může ukládat i `live_match_url`, `tipsport_match_id`, `last_live_snapshot` (vyhodnocení stavu zápasu). Tyto údaje slouží hlavně pro webhook a vyhodnocení; overlay z nich přímo nečte skóre, jen zobrazuje to, co je v tiketu (týmy, sázka, datum).

---

## 4. Jak overlay získá data a co zobrazuje

- Overlay **periodicky** (interval v nastavení, výchozí 60 s) volá:
  - `GET /api/tickets?active_or_live=1&limit=200`
- Backend vrátí `{ "items": [ ... ], "total": N }`. Každý prvek má např. `id`, `home_team`, `away_team`, `event_date`, `is_live`, `status`, `bookmaker` (název SK), `market_label`, `selection`, `odds`, `stake`, `bookmaker_ticket_url`, atd.

Overlay pak:

1. **Aplikuje filtr sázkových kanceláří** (Tipsport / Betano / Fortuna – podle zaškrtnutí v overlay).
2. **Rozdělí tikety do tří skupin:**
   - **Právě hraje (live):** `is_live === true` NEBO zápas už „začal“ (`event_date` v minulosti) a neuplynulo víc než 120 minut.
   - **Vsazené – zápas nezačal:** `event_date` v budoucnu, v časovém okně (např. příštích 24 h – nastavení „Zobrazit zápasy X h dopředu“).
   - **Ostatní aktivní:** zbytek otevřených tiketů (AKU bez data zápasu, nebo mimo časové okno), aby nezmizely např. Betano tikety.
3. **Vyrenderuje** tři sekce: dvě kolony (Live + Ostatní | Vsazené), v každé karty tiketů. Klik na tiket otevře buď `bookmaker_ticket_url` (pokud je), nebo odkaz na BetTracker /tikety.

Overlay **nečte** přímo skóre ani stav zápasu ze sázkovky – zobrazuje jen to, co už je v DB (základní údaje tiketu). Aktualizace = buď **nový polling** (overlay znovu zavolá API a uvidí změny, které mezitím přišly z extension), nebo **uživatel znovu klikne LIVE/Import** v extension a tím obnoví data v DB.

---

## 5. Shrnutí – kdo co aktualizuje

| Kdo | Co dělá |
|-----|--------|
| **Uživatel** | Otevře stránku sázkové kanceláře (Moje tikety) a v extension klikne **Import** nebo **LIVE**. |
| **Extension** | Scrapuje tikety z DOM stránky a posílá je na backend (import endpointy). Případně posílá live link a live state na `/api/live/link` a `/api/live/state`. |
| **Backend** | Ukládá/aktualizuje tikety v DB, vystavuje `GET /api/tickets?active_or_live=1`. |
| **Overlay** | Každých N sekund volá `GET /api/tickets?active_or_live=1`, rozdělí tikety na live / vsazené / ostatní a vykreslí je. |

Bez opakovaného **Importu/LIVE** v extension (nebo bez toho, že by něco jiného zapisovalo do DB) se data v overlayu nemění – overlay jen opakovaně čte to, co už v backendu je.
