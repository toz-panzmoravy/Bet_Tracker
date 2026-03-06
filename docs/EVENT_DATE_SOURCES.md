# Zdroje event_date (čas začátku události)

## Backend

- Pole **`event_date`** v modelu [Ticket](backend/app/models/models.py) ukládá datum/čas události (ideálně výkop / začátek zápasu).
- Endpoint `GET /api/tickets` nevrací filtry podle `event_date`; filtrování „brzy začíná“ (např. od teď do +6 h) se provádí na straně klienta (overlay, frontend).

## Tipsport (extension)

- **Zdroj:** `item.placed_at` / `event_start_at` z karty tiketu na stránce Moje tikety.
- V [content.js](tipsport-scraper-extension/content.js) se čas parsuje z hlavičky karty (datum + čas, např. „Dnes“, „19:00“) a ukládá jako `placed_at_iso`; stejná hodnota jde do backendu jako `event_date` (viz [tipsport_import.py](backend/app/routers/tipsport_import.py) – `event_date=item.placed_at`).
- **Poznámka:** Na kartě může být zobrazen čas sázky nebo čas zápasu podle toho, co Tipsport zobrazí. Skutečný výkop může být v detailu tiketu; pokud je detail vykreslen jako SPA, je potřeba fallback přes iframe (viz [TIPSPORT_EXTENSION_PROBLEM_ANALYSIS.md](TIPSPORT_EXTENSION_PROBLEM_ANALYSIS.md)).

## Betano (extension)

- **Zdroj:** `placed_at` z funkce `parseBetanoDateTime(siblingDate.textContent)` – datum/čas z dolní sekce karty (vedle ID tiketu).
- V [betano_import.py](backend/app/routers/betano_import.py) se používá `event_date=item.placed_at`.
- Stejně jako u Tipsportu může jít o čas podání sázky; pokud Betano na kartě zobrazuje výkop, bude to odpovídat.

## Overlay / „Brzy začíná“

- Overlay bere tikety z `GET /api/tickets?active_or_live=1&limit=200` a na klientovi filtruje:
  - **Brzy začíná:** `event_date` v rozsahu od teď do +N hodin (např. 6), řazeno podle `event_date`.
  - **Teď live:** `is_live === true`.
- Pokud potřebujete přesnější výkop (např. z detailu tiketu), je třeba rozšířit scraper o načtení času z detailu a předání do payloadu jako `event_date` / `placed_at`.
