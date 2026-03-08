# BetTracker Backend

Backend API běží na portu **15555** (neobvyklý port, aby nedocházelo ke konfliktům s jinými systémy). Všechny batch skripty a klienti (frontend, overlay, extension) jsou na něj nastaveni. Pro manuální spuštění: `uvicorn app.main:app --reload --port 15555`.

## Fotbal: football-data.org API (volitelné)

Pro **fotbalové** tikety lze načítat live skóre přes **football-data.org** (jeden HTTP request).

1. Zaregistrujte se na [football-data.org](https://www.football-data.org/) a získejte bezplatný API token.
2. Do `.env` v backendu přidejte:
   ```
   FOOTBALL_DATA_ORG_API_KEY=váš_token
   ```
